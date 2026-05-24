"""
edition.py — Feature gating for Repod RPM Community Edition.

Usage in any router:
    from edition import require_enterprise
    from fastapi import Depends

    @router.get("/some-enterprise-endpoint")
    async def endpoint(_: None = Depends(require_enterprise)):
        ...
"""
import os
from fastapi import HTTPException

EDITION = os.getenv("REPOD_EDITION", "community")

UPGRADE_RESPONSE = {
    "edition": "community",
    "feature": "enterprise",
    "message": (
        "This feature is not available in Repod RPM Community Edition. "
        "Upgrade to Enterprise to unlock CVE/CVSS scanning, EPSS enrichment, "
        "CISA KEV cross-reference, CISO approval queue, RBAC, LDAP/AD, "
        "OIDC/SSO, MFA/TOTP, SBOM, SARIF, NIS2 compliance mode, and more."
    ),
    "upgrade_url": "https://repod.getautoflow.dev/#demo",
    "contact": "contact@getautoflow.dev",
}


def require_enterprise():
    """
    FastAPI dependency. Raises HTTP 402 Payment Required when running
    Community Edition. Include as Depends() on any enterprise endpoint.
    """
    if EDITION == "community":
        raise HTTPException(
            status_code=402,
            detail=UPGRADE_RESPONSE,
        )
