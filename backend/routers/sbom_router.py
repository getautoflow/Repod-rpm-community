"""
SBOM / SARIF export — Enterprise Edition only.

All endpoints return HTTP 402 in Community Edition.
Upgrade to Repod Enterprise for SPDX 2.3, CycloneDX 1.5, and SARIF 2.1.0 export.
"""
from fastapi import APIRouter, Depends
from edition import require_enterprise

router = APIRouter(prefix="/sbom", tags=["SBOM"])


@router.get("/export")
def export_sbom(_: None = Depends(require_enterprise)):
    """SBOM export — Enterprise Edition only."""


@router.get("/{name}/{version}")
def get_package_sbom(name: str, version: str, _: None = Depends(require_enterprise)):
    """Package SBOM — Enterprise Edition only."""
