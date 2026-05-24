"""
Routes de sécurité — Community Edition.

Community (disponible) :
  GET  /security/clamav/status  → version DB ClamAV, date, statut
  POST /security/clamav/update  → mise à jour manuelle (SSE)

Enterprise (retourne HTTP 402) :
  GET  /security/vulnerabilities                      → CVE consolidées
  GET  /security/packages-posture                     → posture CVE par paquet
  GET  /security/packages/{name}/{version}/cve        → CVE détaillées
  GET  /security/review-queue                         → file d'approbation CISO
  POST /security/check-sla                            → vérification SLA
  GET  /security/report                               → rapport global
  GET  /security/packages/{name}/{version}/decision   → décision CISO
  POST /security/packages/{name}/{version}/decide     → approuver/rejeter
  POST /security/packages/{name}/{version}/rescan     → re-scanner
  POST /security/packages/{name}/{version}/quarantine → mise en quarantaine
"""
import os
import subprocess
from pathlib import Path

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from auth.dependencies import get_admin_user, get_current_user
from edition import require_enterprise
from services.audit import log as audit_log
from services.health_checks import get_clamav_status

router = APIRouter(prefix="/security", tags=["Security"])

CLAMAV_DB_DIR = Path(os.getenv("CLAMAV_DB_DIR", "/var/lib/clamav"))


# ─── ClamAV (Community) ───────────────────────────────────────────────────────

@router.get("/clamav/status")
def clamav_status(current_user: str = Depends(get_current_user)):
    """Retourne le statut de ClamAV et de sa base de signatures."""
    return get_clamav_status()


@router.post("/clamav/update")
def clamav_update(current_user: str = Depends(get_admin_user)):
    """
    Lance une mise à jour manuelle de la base ClamAV.
    Stream SSE en temps réel.
    """
    def event_stream():
        def emit(msg: str, level: str = "info") -> str:
            return f"data: {level}|{msg}\n\n"

        yield emit("Lancement de la mise à jour ClamAV...")
        yield emit(f"Répertoire DB : {CLAMAV_DB_DIR}")

        try:
            process = subprocess.Popen(
                ["freshclam",
                 "--datadir", str(CLAMAV_DB_DIR),
                 "--log=/dev/null",
                 "--stdout"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )

            for line in iter(process.stdout.readline, ""):
                line = line.strip()
                if not line:
                    continue
                line_lower = line.lower()
                if "up to date" in line_lower or "already up" in line_lower:
                    yield emit(line, "success")
                elif "updated" in line_lower or "downloading" in line_lower:
                    yield emit(line, "info")
                elif "rate limit" in line_lower or "cool-down" in line_lower or "429" in line or "403" in line:
                    yield emit(line, "warning")
                elif "error" in line_lower or "failed" in line_lower:
                    yield emit(line, "error")
                elif "warning" in line_lower:
                    yield emit(line, "warning")
                else:
                    yield emit(line, "info")

            process.wait()

            if process.returncode == 0:
                status = get_clamav_status()
                yield emit(
                    f"Mise à jour terminée — DB version {status.get('db_version', '?')} "
                    f"({status.get('db_date', '?')})",
                    "success",
                )
                audit_log("CLAMAV_UPDATE", current_user, "SUCCESS",
                          detail=f"DB mise à jour : version {status.get('db_version')}")
            else:
                yield emit("Mise à jour terminée avec des avertissements", "warning")
                audit_log("CLAMAV_UPDATE", current_user, "WARNING",
                          detail="freshclam terminé avec code non-zéro")

        except FileNotFoundError:
            yield emit("freshclam introuvable — ClamAV n'est pas installé", "error")
        except Exception as e:
            yield emit(f"Erreur inattendue : {e}", "error")

        yield "data: done|DONE\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── CVE / Vulnerability scanning — Enterprise only ──────────────────────────

@router.get("/vulnerabilities")
def get_vulnerabilities(
    severity: str = Query(None),
    fix_state: str = Query(None),
    distribution: str = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    _: None = Depends(require_enterprise),
):
    """CVE vulnerability view — Enterprise Edition only."""
    # Enterprise: return paginate(cve_list, page=page, per_page=per_page)


@router.get("/packages-posture")
def get_packages_posture(_: None = Depends(require_enterprise)):
    """CVE posture per package — Enterprise Edition only."""


@router.get("/packages/{name}/{version}/cve")
def get_package_cve(name: str, version: str, _: None = Depends(require_enterprise)):
    """Package CVE details — Enterprise Edition only."""


@router.get("/review-queue")
def get_review_queue(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    _: None = Depends(require_enterprise),
):
    """CISO review queue — Enterprise Edition only."""
    # Enterprise: return paginate(packages, page=page, per_page=per_page)


@router.post("/check-sla")
def check_sla(_: None = Depends(require_enterprise)):
    """SLA check — Enterprise Edition only."""


@router.get("/report")
def get_security_report(_: None = Depends(require_enterprise)):
    """Security report — Enterprise Edition only."""


@router.get("/packages/{name}/{version}/decision")
def get_package_decision(name: str, version: str, _: None = Depends(require_enterprise)):
    """CISO decision — Enterprise Edition only."""


@router.post("/packages/{name}/{version}/decide")
def decide_package(name: str, version: str, _: None = Depends(require_enterprise)):
    """CISO approve/reject — Enterprise Edition only."""


@router.post("/packages/{name}/{version}/rescan")
def rescan_package(name: str, version: str, _: None = Depends(require_enterprise)):
    """Re-scan package — Enterprise Edition only."""


@router.post("/packages/{name}/{version}/quarantine")
def quarantine_package(name: str, version: str, _: None = Depends(require_enterprise)):
    """Quarantine package — Enterprise Edition only."""
