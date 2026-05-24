"""
OIDC/SSO — Enterprise Edition only.

All endpoints return HTTP 402 in Community Edition.
Upgrade to Repod Enterprise for OpenID Connect with PKCE, auto-provisioning,
and Active Directory / Azure AD integration.
"""
from fastapi import APIRouter, Depends
from edition import require_enterprise

router = APIRouter(prefix="/auth/oidc", tags=["SSO OIDC"])


@router.get("/public-config")
def oidc_public_config(_: None = Depends(require_enterprise)):
    """OIDC public config — Enterprise Edition only."""


@router.post("/authorize")
def oidc_authorize(_: None = Depends(require_enterprise)):
    """OIDC authorization URL — Enterprise Edition only."""


@router.post("/callback")
def oidc_callback(_: None = Depends(require_enterprise)):
    """OIDC callback — Enterprise Edition only."""


@router.post("/test-discovery")
def oidc_test_discovery(_: None = Depends(require_enterprise)):
    """OIDC discovery test — Enterprise Edition only."""
