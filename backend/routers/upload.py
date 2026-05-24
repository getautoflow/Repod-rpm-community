"""
Pipeline d'upload complet pour paquets RPM :
1. Réception du fichier → staging/incoming/
2. Validation (format, checksum, GPG, dépendances)
3. Si OK → déplacement vers pool/, génération manifest, mise à jour index
4. Si KO → déplacement vers staging/quarantine/
5. Audit log dans tous les cas

POST /upload/        → réponse JSON
POST /upload/stream  → réponse SSE workflow en temps réel
"""
import asyncio
import json
import os
import shutil
import subprocess
import uuid
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth.dependencies import get_uploader_user
from limiter import limiter
from services.distributions import VALID_CODENAMES
from services.validator import (
    run_validation_pipeline,
    validate_format,
    validate_provenance_sha256,
    validate_clamav,
    validate_cve_grype,
    validate_gpg,
    validate_dependencies,
    ValidationResult,
)
from services.manifest import generate_manifest, save_manifest
from services.indexer import add_to_index
from services.audit import log as audit_log
# Enterprise imports removed — notifications and CVE utils are Enterprise features

router = APIRouter(prefix="/upload", tags=["Upload"])

STAGING_INCOMING   = Path(os.getenv("STAGING_INCOMING", "/repos/staging/incoming"))
STAGING_QUARANTINE = Path(os.getenv("STAGING_QUARANTINE", "/repos/staging/quarantine"))
POOL_DIR           = Path(os.getenv("POOL_DIR", "/repos/pool"))
ADD_RPM_SCRIPT     = os.getenv("ADD_RPM_SCRIPT", "/scripts/add-rpm.sh")

for d in [STAGING_INCOMING, STAGING_QUARANTINE, POOL_DIR]:
    d.mkdir(parents=True, exist_ok=True)


@router.post("/")
@limiter.limit("20/minute")
async def upload_package(
    request: Request,
    file: UploadFile = File(...),
    distribution: str = Form("almalinux8"),
    current_user: str = Depends(get_uploader_user),
):
    """
    Pipeline complet d'import d'un paquet .rpm :
    - Validation format, checksum, GPG, dépendances
    - Génération du manifest
    - Mise à jour de l'index
    - Ajout au dépôt RPM via createrepo_c
    """
    if distribution not in VALID_CODENAMES:
        raise HTTPException(
            status_code=400,
            detail=f"Distribution invalide. Valeurs acceptées : {', '.join(sorted(VALID_CODENAMES))}",
        )

    filename = file.filename
    if not filename:
        raise HTTPException(status_code=400, detail="Nom de fichier manquant")

    if not filename.endswith(".rpm"):
        raise HTTPException(status_code=400, detail="Seuls les fichiers .rpm sont acceptés")

    safe_filename = Path(filename).name
    staging_path = STAGING_INCOMING / safe_filename

    try:
        with open(staging_path, "wb") as buf:
            shutil.copyfileobj(file.file, buf)
    except Exception as e:
        audit_log("UPLOAD", current_user, "FAILURE", package=safe_filename,
                  detail=f"Erreur écriture staging: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de la sauvegarde du fichier")

    # Pipeline de validation (Grype ≤ 300 s) — exécuté dans le thread pool
    validation = await asyncio.to_thread(
        run_validation_pipeline, str(staging_path), strict_deps=False, distro=distribution
    )

    if not validation.passed:
        quarantine_path = STAGING_QUARANTINE / safe_filename
        shutil.move(str(staging_path), str(quarantine_path))
        audit_log("VALIDATE", current_user, "FAILURE", package=safe_filename,
                  detail="Validation échouée — déplacé en quarantaine",
                  extra={"validation_steps": validation.steps})
        return {
            "status": "rejected",
            "filename": safe_filename,
            "message": "Le paquet a été rejeté et mis en quarantaine",
            "validation": validation.to_dict(),
        }

    pool_path = POOL_DIR / safe_filename
    shutil.move(str(staging_path), str(pool_path))

    cve_status = validation.cve_status
    manifest_status = "pending_review" if cve_status == "pending_review" else "validated"

    manifest = generate_manifest(
        str(pool_path),
        imported_by=current_user,
        validated_deps=validation.deps if validation.deps else None,
        validation_steps=validation.steps,
        cve_results=validation.cve_results if validation.cve_results else None,
        distribution=distribution,
    )
    manifest["status"] = manifest_status
    save_manifest(manifest)
    add_to_index(manifest)

    # Ajout au dépôt RPM via add-rpm.sh (createrepo_c) — thread pool
    if cve_status != "pending_review":
        await asyncio.to_thread(
            subprocess.run,
            ["sh", ADD_RPM_SCRIPT, distribution, pool_path.name],
            capture_output=True, text=True,
            env={**os.environ,
                 "GNUPG_HOME": os.getenv("GNUPG_HOME", "/repos/gnupg"),
                 "REPO_BASE": os.getenv("REPO_BASE", "/repos")},
        )

    audit_log(
        "UPLOAD", current_user,
        "PENDING_REVIEW" if cve_status == "pending_review" else "SUCCESS",
        package=manifest["name"],
        version=manifest["version"],
        detail=(
            "En attente de révision RSSI — CVE politique déclenchée"
            if cve_status == "pending_review"
            else f"sha256={manifest['integrity']['sha256']}"
        ),
        extra={"validation_steps": validation.steps, "cve_status": cve_status},
    )

    warnings = [s for s in validation.steps if s.get("warning") and not s["passed"]]

    # Community Edition: CVE notifications are an Enterprise feature

    if cve_status == "pending_review":
        return {
            "status":    "pending_review",
            "filename":  safe_filename,
            "package":   manifest["name"],
            "version":   manifest["version"],
            "arch":      manifest["arch"],
            "sha256":    manifest["integrity"]["sha256"],
            "validation": validation.to_dict(),
            "warnings":  warnings,
            "message": (
                f"{manifest['name']} {manifest['version']} importé mais "
                "en attente de révision RSSI — non publié dans le dépôt RPM"
            ),
        }

    return {
        "status":    "accepted",
        "filename":  safe_filename,
        "package":   manifest["name"],
        "version":   manifest["version"],
        "arch":      manifest["arch"],
        "sha256":    manifest["integrity"]["sha256"],
        "validation": validation.to_dict(),
        "warnings":  warnings,
        "message":   f"{manifest['name']} {manifest['version']} ajouté au dépôt {distribution}",
    }


# ─── Upload streaming SSE ──────────────────────────────────────────────────────

def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _upload_stream_generator(safe_filename: str, staging_path: Path, distribution: str, current_user: str):
    """
    Générateur SSE progressif : chaque étape de validation émet "running" au début
    puis "done/error/warn" à la fin, afin que l'utilisateur voie la progression en temps réel.
    """
    from services.settings import get_settings

    def step(name: str, label: str, status: str, message: str = "", detail: str = ""):
        return _sse("step", {"name": name, "label": label, "status": status,
                             "message": message, "detail": detail})

    def _vs_status(vs: dict) -> str:
        return "done" if (vs.get("passed") or vs.get("warning")) else "error"

    def _last_vs(result: ValidationResult, name: str) -> dict:
        """Retourne le dernier step portant ce nom dans result.steps."""
        for vs in reversed(result.steps):
            if vs.get("name") == name:
                return vs
        return result.steps[-1] if result.steps else {}

    try:
        yield step("reception", "Réception du fichier", "done",
                   f"{safe_filename} — {staging_path.stat().st_size // 1024} Ko")
        yield step("validation", "Pipeline de validation", "running",
                   "Vérification format, intégrité, antivirus, CVE, dépendances…")

        cfg = get_settings().get("validation", {})
        result = ValidationResult()

        # ── 1. Format .rpm ──────────────────────────────────────────────────────
        yield step("sub_format", "Format .rpm", "running")
        await asyncio.to_thread(validate_format, str(staging_path), result)
        vs = _last_vs(result, "format")
        yield step("sub_format", "Format .rpm", _vs_status(vs),
                   vs.get("message", ""), vs.get("detail", ""))

        if not result.passed:
            shutil.move(str(staging_path), str(STAGING_QUARANTINE / safe_filename))
            audit_log("VALIDATE", current_user, "FAILURE", package=safe_filename,
                      detail="Format invalide — rejeté en quarantaine",
                      extra={"validation_steps": result.steps})
            yield step("validation", "Pipeline de validation", "error", "Paquet rejeté — format invalide")
            yield _sse("result", {"status": "rejected", "message": "Format .rpm invalide.",
                                  "validation": result.to_dict()})
            yield "data: done|DONE\n\n"
            return

        # ── 2. Intégrité SHA-256 ────────────────────────────────────────────────
        yield step("sub_checksum", "Intégrité SHA-256", "running")
        await asyncio.to_thread(validate_provenance_sha256, str(staging_path), None, result)
        vs = _last_vs(result, "provenance")
        yield step("sub_checksum", "Intégrité SHA-256", _vs_status(vs),
                   vs.get("message", ""), vs.get("detail", ""))

        if not result.passed:
            shutil.move(str(staging_path), str(STAGING_QUARANTINE / safe_filename))
            audit_log("VALIDATE", current_user, "FAILURE", package=safe_filename,
                      detail="SHA256 invalide", extra={"validation_steps": result.steps})
            yield step("validation", "Pipeline de validation", "error", "Paquet rejeté")
            yield _sse("result", {"status": "rejected", "message": "Checksum invalide.",
                                  "validation": result.to_dict()})
            yield "data: done|DONE\n\n"
            return

        # ── 3. Antivirus ClamAV ─────────────────────────────────────────────────
        if cfg.get("clamav_scan", True):
            yield step("sub_clamav", "Scan antivirus ClamAV", "running")
            try:
                await asyncio.to_thread(validate_clamav, str(staging_path), result)
            except subprocess.TimeoutExpired:
                result.add_step("antivirus", True, "ClamAV — timeout, scan ignoré")
            vs = _last_vs(result, "antivirus")
            yield step("sub_clamav", "Scan antivirus ClamAV", _vs_status(vs),
                       vs.get("message", ""), vs.get("detail", ""))

            if not result.passed:
                shutil.move(str(staging_path), str(STAGING_QUARANTINE / safe_filename))
                audit_log("VALIDATE", current_user, "FAILURE", package=safe_filename,
                          detail="ClamAV — menace détectée",
                          extra={"validation_steps": result.steps})
                yield step("validation", "Pipeline de validation", "error", "Menace détectée — rejeté")
                yield _sse("result", {"status": "rejected", "message": "Menace antivirus détectée.",
                                      "validation": result.to_dict()})
                yield "data: done|DONE\n\n"
                return

        # ── 4. Analyse CVE — Grype ──────────────────────────────────────────────
        # Grype peut prendre jusqu'à 300 s sur les gros paquets.
        # L'utilisateur voit l'étape "running" pendant toute la durée du scan.
        if cfg.get("grype_scan", True):
            yield step("sub_cve", "Analyse CVE (Grype)", "running",
                       "Scan en cours — peut prendre quelques minutes…")
            cve_policy  = get_settings().get("cve_policy")
            fail_on     = cfg.get("grype_fail_on", "critical")
            auto_enrich = cve_policy.get("auto_enrich", True) if cve_policy else True
            try:
                await asyncio.to_thread(
                    validate_cve_grype, str(staging_path), result,
                    fail_on=fail_on, distro=distribution,
                    cve_policy=cve_policy, auto_enrich=auto_enrich,
                )
            except Exception as exc:
                result.add_step("cve", True, "Grype — erreur inattendue (ignorée)", str(exc)[:300])
            vs = _last_vs(result, "cve")
            yield step("sub_cve", "Analyse CVE (Grype)", _vs_status(vs),
                       vs.get("message", ""), vs.get("detail", ""))

            if result.cve_status == "blocked":
                result.passed = False
                shutil.move(str(staging_path), str(STAGING_QUARANTINE / safe_filename))
                audit_log("VALIDATE", current_user, "FAILURE", package=safe_filename,
                          detail="CVE bloquante", extra={"validation_steps": result.steps})
                yield step("validation", "Pipeline de validation", "error", "CVE bloquante — rejeté")
                yield _sse("result", {"status": "rejected", "message": "CVE bloquante détectée.",
                                      "validation": result.to_dict()})
                yield "data: done|DONE\n\n"
                return

        # ── 5. Signature GPG ────────────────────────────────────────────────────
        yield step("sub_gpg", "Signature GPG", "running")
        await asyncio.to_thread(validate_gpg, str(staging_path), result)
        vs = _last_vs(result, "gpg")
        yield step("sub_gpg", "Signature GPG", _vs_status(vs),
                   vs.get("message", ""), vs.get("detail", ""))

        # ── 6. Dépendances RPM ──────────────────────────────────────────────────
        yield step("sub_dependencies", "Dépendances RPM", "running")
        deps = await asyncio.to_thread(validate_dependencies, str(staging_path), result)
        result.deps = deps
        # strict_deps=False : dépendances manquantes → avertissement, non bloquant
        dep_step = next((s for s in result.steps if s["name"] == "dependencies"), None)
        if dep_step and not dep_step["passed"]:
            dep_step["warning"] = True
            result.passed = True
        vs = _last_vs(result, "dependencies")
        yield step("sub_dependencies", "Dépendances RPM", _vs_status(vs),
                   vs.get("message", ""), vs.get("detail", ""))

        yield step("validation", "Pipeline de validation", "done", "Toutes les vérifications passées")

        # ── Pool ────────────────────────────────────────────────────────────────
        yield step("pool", "Déplacement vers le pool", "running")
        pool_path = POOL_DIR / safe_filename
        shutil.move(str(staging_path), str(pool_path))
        yield step("pool", "Déplacement vers le pool", "done", f"pool/{safe_filename}")

        # ── Manifest ────────────────────────────────────────────────────────────
        yield step("manifest", "Génération du manifest", "running")
        cve_status = result.cve_status
        manifest_status = "pending_review" if cve_status == "pending_review" else "validated"
        manifest = generate_manifest(
            str(pool_path), imported_by=current_user,
            validated_deps=result.deps if result.deps else None,
            validation_steps=result.steps,
            cve_results=result.cve_results if result.cve_results else None,
            distribution=distribution,
        )
        manifest["status"] = manifest_status
        save_manifest(manifest)
        yield step("manifest", "Génération du manifest", "done",
                   f"{manifest['name']} {manifest['version']} · {manifest['arch']}")

        # ── Index ───────────────────────────────────────────────────────────────
        yield step("index", "Mise à jour de l'index", "running")
        add_to_index(manifest)
        yield step("index", "Mise à jour de l'index", "done")

        # ── createrepo_c ────────────────────────────────────────────────────────
        if cve_status != "pending_review":
            yield step("createrepo", "Mise à jour dépôt RPM (createrepo_c)", "running",
                       f"Distribution : {distribution}")
            r = await asyncio.to_thread(
                subprocess.run,
                ["sh", ADD_RPM_SCRIPT, distribution, pool_path.name],
                capture_output=True, text=True,
                env={**os.environ,
                     "GNUPG_HOME": os.getenv("GNUPG_HOME", "/repos/gnupg"),
                     "REPO_BASE": os.getenv("REPO_BASE", "/repos")},
            )
            createrepo_ok = r.returncode == 0
            yield step("createrepo", "Mise à jour dépôt RPM (createrepo_c)",
                       "done" if createrepo_ok else "warn",
                       (r.stdout or r.stderr or "").strip()[:120])
        else:
            yield step("createrepo", "Mise à jour dépôt RPM (createrepo_c)", "warn",
                       "En attente de révision RSSI — non publié dans le dépôt")

        audit_log("UPLOAD", current_user,
                  "PENDING_REVIEW" if cve_status == "pending_review" else "SUCCESS",
                  package=manifest["name"], version=manifest["version"],
                  detail=f"sha256={manifest['integrity']['sha256']}",
                  extra={"validation_steps": result.steps, "cve_status": cve_status})

        yield _sse("result", {
            "status": "pending_review" if cve_status == "pending_review" else "accepted",
            "package": manifest["name"], "version": manifest["version"],
            "arch": manifest["arch"], "sha256": manifest["integrity"]["sha256"],
            "distribution": distribution,
            "message": (
                f"{manifest['name']} {manifest['version']} importé — en attente de révision RSSI"
                if cve_status == "pending_review"
                else f"{manifest['name']} {manifest['version']} ajouté au dépôt {distribution}"
            ),
            "validation": result.to_dict(),
        })

    except Exception as exc:
        yield step("error", "Erreur inattendue", "error", str(exc))
        yield _sse("result", {"status": "error", "message": str(exc)})

    yield "data: done|DONE\n\n"


@router.post("/stream")
@limiter.limit("20/minute")
async def upload_package_stream(
    request: Request,
    file: UploadFile = File(...),
    distribution: str = Form("almalinux8"),
    current_user: str = Depends(get_uploader_user),
):
    """Upload avec workflow SSE en temps réel (mono-phase, petits fichiers < ~50 Mo)."""
    if distribution not in VALID_CODENAMES:
        raise HTTPException(status_code=400,
                            detail=f"Distribution invalide : {', '.join(sorted(VALID_CODENAMES))}")
    filename = file.filename or "unknown.rpm"
    if not filename.endswith(".rpm"):
        raise HTTPException(status_code=400, detail="Seuls les fichiers .rpm sont acceptés")
    safe_filename = Path(filename).name
    staging_path = STAGING_INCOMING / safe_filename
    try:
        with open(staging_path, "wb") as buf:
            shutil.copyfileobj(file.file, buf)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur écriture staging: {e}")

    return StreamingResponse(
        _upload_stream_generator(safe_filename, staging_path, distribution, current_user),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── Upload deux phases (grands fichiers) ────────────────────────────────────
#
# Phase 1 : POST /upload/stage   — XHR avec progress bar côté frontend
#   Reçoit le fichier, le sauvegarde dans staging, retourne un staging_id.
#
# Phase 2 : POST /upload/pipeline/{staging_id} — SSE workflow
#   Lance le pipeline de validation sur le fichier déjà stagé.
#   Le frontend peut afficher la progression en temps réel dès le début.
#
# Avantage : fetch() ne supporte pas upload.onprogress ; XHR oui.
# Pour les gros paquets (> ~50 Mo) le navigateur peut mettre plusieurs minutes
# à envoyer le corps multipart. Sans séparation, le SSE ne démarre qu'après
# réception complète → l'utilisateur voit une interface gelée sans feedback.
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/stage")
@limiter.limit("20/minute")
async def stage_upload(
    request: Request,
    file: UploadFile = File(...),
    current_user: str = Depends(get_uploader_user),
):
    """
    Phase 1 — Réception du fichier .rpm dans le staging.

    Le frontend envoie le fichier via XHR (supporte upload.onprogress).
    Retourne un staging_id à passer à POST /upload/pipeline/{staging_id}.
    Le fichier est nommé {staging_id}_{safe_filename} pour permettre plusieurs
    uploads simultanés du même fichier sans collision.
    """
    filename = file.filename or "unknown.rpm"
    if not filename.endswith(".rpm"):
        raise HTTPException(status_code=400, detail="Seuls les fichiers .rpm sont acceptés")

    safe_filename = Path(filename).name
    sid          = str(uuid.uuid4())
    staging_path = STAGING_INCOMING / f"{sid}_{safe_filename}"

    try:
        with open(staging_path, "wb") as buf:
            shutil.copyfileobj(file.file, buf)
    except Exception as e:
        audit_log("UPLOAD_STAGE", current_user, "FAILURE", package=safe_filename,
                  detail=f"Erreur écriture staging: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur écriture staging: {e}")

    audit_log("UPLOAD_STAGE", current_user, "SUCCESS", package=safe_filename,
              detail=f"Stagé sous {staging_path.name} ({staging_path.stat().st_size} octets)")

    return {
        "staging_id": sid,
        "filename":   safe_filename,
        "size":       staging_path.stat().st_size,
    }


class PipelineRequest(BaseModel):
    distribution: str = "almalinux8"


@router.post("/pipeline/{staging_id}")
async def pipeline_sse(
    staging_id: str,
    body: PipelineRequest = PipelineRequest(),
    current_user: str = Depends(get_uploader_user),
):
    """
    Phase 2 — Pipeline de validation SSE pour un fichier déjà stagé.

    Retrouve le fichier par son staging_id (glob STAGING_INCOMING/{staging_id}_*.rpm),
    lance _upload_stream_generator et retourne une StreamingResponse SSE.
    Le fichier stagé est géré (déplacé vers pool/ ou quarantine/) par le générateur.
    """
    if body.distribution not in VALID_CODENAMES:
        raise HTTPException(
            status_code=400,
            detail=f"Distribution invalide : {', '.join(sorted(VALID_CODENAMES))}",
        )

    matches = list(STAGING_INCOMING.glob(f"{staging_id}_*.rpm"))
    if not matches:
        raise HTTPException(
            status_code=404,
            detail="staging_id introuvable — le fichier a peut-être expiré ou déjà été traité",
        )

    staging_path = matches[0]
    # Le nom réel du fichier = tout ce qui suit "staging_id_"
    safe_filename = staging_path.name[len(staging_id) + 1:]

    return StreamingResponse(
        _upload_stream_generator(safe_filename, staging_path, body.distribution, current_user),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
