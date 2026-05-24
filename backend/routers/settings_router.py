"""
Routes pour les paramètres de l'application (admin uniquement).
Community Edition.

Community (disponible) :
  GET  /settings/           → lire tous les paramètres
  PATCH /settings/          → mettre à jour (partiel, deep-merge)
  GET  /settings/gpg        → infos clé GPG
  POST /settings/gpg/generate → générer nouvelle clé GPG
  GET  /settings/next-sync  → prochaine exécution du cron
  POST /settings/run-retention → déclencher la rétention maintenant

Enterprise (retourne HTTP 402) :
  POST /settings/test-webhook → tester le webhook Slack/Teams
  POST /settings/test-ldap    → tester la connexion LDAP
  POST /settings/test-email   → tester la configuration SMTP
"""
import copy
import logging
import os
import subprocess
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth.dependencies import get_admin_user
from edition import require_enterprise
from services import scheduler_state
from services.audit import log as audit_log
from services.settings import get_settings, update_settings

logger = logging.getLogger("settings_router")

GNUPG_HOME = os.getenv("GNUPG_HOME", "/repos/gnupg")

_SENSITIVE_KEYS = {"smtp_password", "bind_password"}
_MASK = "••••••••"


def _mask_secrets(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {
            k: _MASK if k in _SENSITIVE_KEYS and obj[k] else _mask_secrets(v)
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [_mask_secrets(i) for i in obj]
    return obj


def _strip_masked_secrets(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {
            k: _strip_masked_secrets(v)
            for k, v in obj.items()
            if not (k in _SENSITIVE_KEYS and v == _MASK)
        }
    if isinstance(obj, list):
        return [_strip_masked_secrets(i) for i in obj]
    return obj


router = APIRouter(prefix="/settings", tags=["Settings"])


# ─── Lecture ──────────────────────────────────────────────────────────────────

@router.get("/")
def read_settings(current_user: str = Depends(get_admin_user)):
    """Retourne tous les paramètres courants (mots de passe masqués)."""
    return _mask_secrets(get_settings())


# ─── Mise à jour ──────────────────────────────────────────────────────────────

class SettingsPatch(BaseModel):
    app_url:       str | None = None
    sync:          dict[str, Any] | None = None
    sources:       dict[str, Any] | None = None
    notifications: dict[str, Any] | None = None
    retention:     dict[str, Any] | None = None
    validation:    dict[str, Any] | None = None


@router.patch("/")
def patch_settings(
    body: SettingsPatch,
    current_user: str = Depends(get_admin_user),
):
    """Met à jour les paramètres par fusion profonde."""
    partial = {k: v for k, v in body.model_dump().items() if v is not None}
    partial = _strip_masked_secrets(partial)
    updated = update_settings(partial)
    audit_log("SETTINGS_CHANGE", current_user, "SUCCESS",
              detail=f"Sections modifiées : {', '.join(partial.keys())}")

    if "sync" in partial and scheduler_state.scheduler is not None:
        sync = updated.get("sync", {})
        try:
            if sync.get("enabled", True):
                scheduler_state.scheduler.reschedule_job(
                    "retention_daily",
                    trigger="cron",
                    hour=2,
                    minute=0,
                )
                logger.info("[settings] Scheduler retention mis à jour")
            else:
                scheduler_state.scheduler.pause_job("retention_daily")
                logger.info("[settings] Scheduler rétention mis en pause.")
        except Exception as e:
            logger.warning(f"[settings] Impossible de mettre à jour le scheduler : {e}")

    return _mask_secrets(updated)


# ─── GPG ──────────────────────────────────────────────────────────────────────

def _gpg_cmd(args: list[str]) -> list[str]:
    return [
        "gpg",
        "--homedir", GNUPG_HOME,
        "--no-default-keyring",
        "--keyring", f"{GNUPG_HOME}/pubring.kbx",
        "--pinentry-mode", "loopback",
    ] + args


def _ensure_gnupg_permissions() -> None:
    import stat
    path = Path(GNUPG_HOME)
    path.mkdir(parents=True, exist_ok=True)
    path.chmod(stat.S_IRWXU)


@router.get("/gpg")
def get_gpg_info(current_user: str = Depends(get_admin_user)):
    """Retourne les infos de la clé GPG du dépôt."""
    try:
        result = subprocess.run(
            _gpg_cmd(["--list-keys", "--with-colons", "--fingerprint"]),
            capture_output=True, text=True, timeout=10,
        )
        keys = []
        current_key: dict = {}
        for line in result.stdout.splitlines():
            parts = line.split(":")
            if parts[0] == "pub":
                if current_key:
                    keys.append(current_key)
                current_key = {
                    "type":        "pub",
                    "algo":        parts[3] if len(parts) > 3 else "",
                    "key_id":      parts[4] if len(parts) > 4 else "",
                    "created":     parts[5] if len(parts) > 5 else "",
                    "expires":     parts[6] if len(parts) > 6 else "",
                    "uids":        [],
                    "fingerprint": "",
                }
            elif parts[0] == "fpr" and current_key:
                current_key["fingerprint"] = parts[9] if len(parts) > 9 else ""
            elif parts[0] == "uid" and current_key:
                uid_str = parts[9] if len(parts) > 9 else ""
                if uid_str:
                    current_key["uids"].append(uid_str)
        if current_key:
            keys.append(current_key)

        export = subprocess.run(
            _gpg_cmd(["--armor", "--export"]),
            capture_output=True, text=True, timeout=10,
        )
        return {
            "keys": keys,
            "public_key_armored": export.stdout.strip() if export.returncode == 0 else None,
        }
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="GPG timeout")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/gpg/generate")
def generate_gpg_key(current_user: str = Depends(get_admin_user)):
    """Génère une nouvelle paire de clés GPG dans le trousseau partagé."""
    _ensure_gnupg_permissions()
    batch = (
        "%no-protection\n"
        "Key-Type: RSA\n"
        "Key-Length: 4096\n"
        "Subkey-Type: RSA\n"
        "Subkey-Length: 4096\n"
        "Name-Real: Repod RPM Repository\n"
        "Name-Email: repod@localhost\n"
        "Expire-Date: 2y\n"
        "%commit\n"
    )
    try:
        env = {**os.environ, "GNUPGHOME": GNUPG_HOME}
        result = subprocess.run(
            _gpg_cmd(["--batch", "--gen-key"]),
            input=batch, capture_output=True, text=True, timeout=120, env=env,
        )
        if result.returncode != 0:
            detail = result.stderr.strip() or result.stdout.strip() or "Erreur GPG inconnue"
            raise HTTPException(status_code=500, detail=detail)
        audit_log("GPG_GENERATE", current_user, "SUCCESS", detail="Nouvelle clé GPG générée")
        return {"status": "ok", "message": "Clé GPG générée avec succès."}
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Génération GPG timeout (>120s)")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Scheduler ────────────────────────────────────────────────────────────────

@router.get("/next-sync")
def get_next_sync(current_user: str = Depends(get_admin_user)):
    """Retourne la date/heure de la prochaine tâche planifiée."""
    if scheduler_state.scheduler is None:
        return {"next_run": None, "status": "scheduler_not_started"}
    try:
        job = scheduler_state.scheduler.get_job("retention_daily")
        if job is None:
            return {"next_run": None, "status": "job_not_found"}
        if job.next_run_time is None:
            return {"next_run": None, "status": "paused"}
        return {"next_run": job.next_run_time.isoformat(), "status": "scheduled"}
    except Exception as e:
        return {"next_run": None, "status": f"error: {e}"}


# ─── Rétention manuelle ───────────────────────────────────────────────────────

@router.post("/run-retention")
def run_retention_now(current_user: str = Depends(get_admin_user)):
    """Déclenche immédiatement la politique de rétention."""
    from services.retention import run_retention
    try:
        result = run_retention()
        return {"status": "ok", "result": result}
    except Exception as e:
        logger.error(f"[retention] Erreur déclenchement manuel : {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Enterprise only ──────────────────────────────────────────────────────────

@router.post("/test-webhook")
def test_webhook(_: None = Depends(require_enterprise)):
    """Webhook test — Enterprise Edition only."""


@router.post("/test-ldap")
def test_ldap(_: None = Depends(require_enterprise)):
    """LDAP connection test — Enterprise Edition only."""


@router.post("/test-email")
def test_email(_: None = Depends(require_enterprise)):
    """SMTP email test — Enterprise Edition only."""
