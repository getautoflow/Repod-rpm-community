"""
Incoming webhooks — Enterprise Edition only.

All endpoints return HTTP 402 in Community Edition.
Upgrade to Repod Enterprise for GitHub Security Advisory webhooks,
CISA KEV push integration, and email/Slack notifications.
"""
from fastapi import APIRouter, Depends
from edition import require_enterprise

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


@router.post("/github")
def webhook_github(_: None = Depends(require_enterprise)):
    """GitHub Security Advisory webhook — Enterprise Edition only."""


@router.post("/kev")
def webhook_kev(_: None = Depends(require_enterprise)):
    """CISA KEV webhook — Enterprise Edition only."""
