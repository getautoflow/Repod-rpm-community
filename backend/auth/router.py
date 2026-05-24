"""
Routes d'authentification et de gestion des utilisateurs.
Community Edition — local auth only (LDAP/OIDC/MFA require Enterprise).

Publique :
  POST /auth/token           → connexion locale, retourne JWT

Authentifié (tout rôle) :
  GET  /auth/me              → info du compte courant
  POST /auth/change-password → changer son propre mot de passe

Admin uniquement :
  GET    /auth/users                        → liste tous les utilisateurs
  POST   /auth/users                        → créer un utilisateur
  PATCH  /auth/users/{username}             → modifier rôle/infos
  DELETE /auth/users/{username}             → supprimer un utilisateur
  POST   /auth/users/{username}/reset-password → réinitialiser le mdp

Enterprise only (returns HTTP 402) :
  POST /auth/mfa/setup        → TOTP setup (Enterprise)
  POST /auth/mfa/confirm      → TOTP confirm (Enterprise)
  POST /auth/mfa/authenticate → TOTP authenticate (Enterprise)
  POST /auth/mfa/disable      → TOTP disable (Enterprise)
"""
import logging as _logging
import re
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from .api_tokens import create_token, list_tokens, revoke_token, PREFIX as API_TOKEN_PREFIX
from .dependencies import get_admin_user, get_current_user, get_current_user_full
from .models import PasswordChange, PasswordReset, Token, UserCreate, UserLogin, UserUpdate
from .reset_tokens import consume_reset_token, create_reset_token
from .users import (
    ROLE_DESCRIPTIONS,
    VALID_ROLES,
    change_password,
    create_user,
    delete_user,
    get_user,
    get_user_any,
    list_users,
    update_last_login,
    update_user,
    verify_password,
)
from edition import require_enterprise
from limiter import auth_limit, limiter
from services.audit import log as audit_log

router = APIRouter(prefix="/auth", tags=["Auth"])

_logger = _logging.getLogger("auth.router")


# ─── Validation de la politique mot de passe ─────────────────────────────────

def _validate_password(password: str, field: str = "Le mot de passe") -> None:
    if len(password) < 8:
        raise HTTPException(status_code=400, detail=f"{field} doit contenir au moins 8 caractères.")
    if not re.search(r"[A-Z]", password):
        raise HTTPException(status_code=400, detail=f"{field} doit contenir au moins une lettre majuscule.")
    if not re.search(r"[0-9!@#$%^&*()_+\-=\[\]{}|;':\",./<>?]", password):
        raise HTTPException(status_code=400, detail=f"{field} doit contenir au moins un chiffre ou un caractère spécial.")


# ─── Connexion (local auth only) ──────────────────────────────────────────────

@router.post("/token", response_model=Token)
@limiter.limit(auth_limit)
def login(request: Request, credentials: UserLogin):
    """
    Authentifie un utilisateur via auth locale.
    LDAP/AD et OIDC/SSO sont disponibles dans Repod Enterprise.
    """
    client_ip = request.client.host if request.client else "unknown"

    user = get_user(credentials.username)
    if not user or user.get("auth_source") == "ldap":
        audit_log("LOGIN", credentials.username, "FAILURE",
                  detail="Utilisateur inconnu", extra={"ip": client_ip})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Identifiants incorrects")

    if not verify_password(credentials.password, user["hashed_password"]):
        audit_log("LOGIN", credentials.username, "FAILURE",
                  detail="Mot de passe incorrect", extra={"ip": client_ip})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Identifiants incorrects")

    if not user.get("active", True):
        audit_log("LOGIN", credentials.username, "FAILURE",
                  detail="Compte désactivé", extra={"ip": client_ip})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Compte désactivé")

    update_last_login(user["username"])
    audit_log("LOGIN", user["username"], "SUCCESS",
              extra={"ip": client_ip, "role": user["role"]})

    from .jwt import create_access_token
    token = create_access_token({
        "sub":       user["username"],
        "role":      user["role"],
        "full_name": user.get("full_name", ""),
    })
    return {"access_token": token, "token_type": "bearer"}


# ─── Compte courant ───────────────────────────────────────────────────────────

@router.get("/me")
def me(current_user: dict = Depends(get_current_user_full)):
    """Retourne les informations du compte connecté."""
    user = get_user_any(current_user["username"])
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    return {
        "username":    user["username"],
        "role":        user["role"],
        "full_name":   user.get("full_name", ""),
        "email":       user.get("email", ""),
        "active":      bool(user["active"]),
        "last_login":  user.get("last_login"),
        "mfa_enabled": False,  # MFA not available in Community Edition
    }


@router.post("/change-password")
def change_own_password(
    payload: PasswordChange,
    current_user: dict = Depends(get_current_user_full),
):
    """Permet à l'utilisateur connecté de changer son propre mot de passe."""
    username = current_user["username"]
    user = get_user_any(username)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    if not verify_password(payload.current_password, user["hashed_password"]):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")

    _validate_password(payload.new_password, "Le nouveau mot de passe")
    change_password(username, payload.new_password)
    audit_log("PASSWORD_CHANGE", username, "SUCCESS", detail="Changement de mot de passe par l'utilisateur")
    return {"status": "ok", "message": "Mot de passe modifié avec succès"}


# ─── Gestion des utilisateurs (admin) ────────────────────────────────────────

@router.get("/roles")
def list_roles():
    """Retourne la liste des rôles disponibles avec leur description (public)."""
    return {"roles": ROLE_DESCRIPTIONS}


@router.get("/users")
def list_all_users(admin: str = Depends(get_admin_user)):
    """Liste tous les utilisateurs (admin uniquement)."""
    users = list_users()
    return {"users": [
        {k: v for k, v in u.items() if k != "hashed_password"}
        for u in users
    ]}


@router.post("/users", status_code=201)
def create_new_user(payload: UserCreate, admin: str = Depends(get_admin_user)):
    """Crée un nouvel utilisateur (admin uniquement)."""
    if payload.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Rôle invalide. Valeurs acceptées : {', '.join(VALID_ROLES)}")

    _validate_password(payload.password)

    existing = get_user_any(payload.username)
    if existing:
        raise HTTPException(status_code=409, detail=f"L'utilisateur '{payload.username}' existe déjà")

    user = create_user(
        username=payload.username,
        password=payload.password,
        role=payload.role,
        full_name=payload.full_name,
        email=payload.email,
    )
    audit_log("USER_CREATE", admin, "SUCCESS",
              detail=f"Utilisateur créé : {payload.username} (rôle={payload.role})")
    return {k: v for k, v in user.items() if k != "hashed_password"}


@router.patch("/users/{username}")
def update_existing_user(
    username: str,
    payload: UserUpdate,
    admin: str = Depends(get_admin_user),
):
    """Met à jour le rôle et/ou les infos d'un utilisateur (admin uniquement)."""
    if username == admin and payload.role is not None and payload.role != "admin":
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas changer votre propre rôle")

    if payload.role is not None and payload.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Rôle invalide. Valeurs acceptées : {', '.join(VALID_ROLES)}")

    before = get_user_any(username)
    user = update_user(
        username=username,
        role=payload.role,
        full_name=payload.full_name,
        email=payload.email,
        active=payload.active,
    )
    if not user:
        raise HTTPException(status_code=404, detail=f"Utilisateur '{username}' introuvable")

    changes = []
    if payload.role is not None and before and before.get("role") != payload.role:
        changes.append(f"rôle : {before.get('role')} → {payload.role}")
    if payload.active is not None and before and bool(before.get("active")) != payload.active:
        changes.append(f"actif : {bool(before.get('active'))} → {payload.active}")
    if changes:
        audit_log("USER_UPDATE", admin, "SUCCESS", detail=f"{username} — {', '.join(changes)}")

    return {k: v for k, v in user.items() if k != "hashed_password"}


@router.delete("/users/{username}")
def delete_existing_user(username: str, admin: str = Depends(get_admin_user)):
    """Supprime un utilisateur (admin uniquement)."""
    if username == admin:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas supprimer votre propre compte")

    ok = delete_user(username)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Utilisateur '{username}' introuvable")

    audit_log("USER_DELETE", admin, "SUCCESS", detail=f"Utilisateur supprimé : {username}")
    return {"status": "deleted", "username": username}


@router.post("/users/{username}/reset-password")
def reset_user_password(
    username: str,
    payload: PasswordReset,
    admin: str = Depends(get_admin_user),
):
    """Réinitialise le mot de passe d'un utilisateur (admin uniquement)."""
    _validate_password(payload.new_password)

    user = get_user_any(username)
    if not user:
        raise HTTPException(status_code=404, detail=f"Utilisateur '{username}' introuvable")

    change_password(username, payload.new_password)
    audit_log("PASSWORD_RESET", admin, "SUCCESS",
              detail=f"Réinitialisation mot de passe de '{username}' par l'admin")
    return {"status": "ok", "message": f"Mot de passe de '{username}' réinitialisé"}


# ─── Réinitialisation de mot de passe (publique) ─────────────────────────────

class ForgotPasswordPayload(BaseModel):
    username: str


class ResetPasswordPayload(BaseModel):
    token: str
    new_password: str


@router.post("/forgot-password")
@limiter.limit(auth_limit)
def forgot_password(request: Request, payload: ForgotPasswordPayload):
    """
    Génère un token de réinitialisation. Dans Community Edition, l'email
    n'est pas envoyé automatiquement — contacter l'administrateur.
    """
    user = get_user_any(payload.username)
    if not user or not user.get("email"):
        return {"status": "ok", "message": "Si ce compte existe et a un email, un lien a été envoyé."}

    _token = create_reset_token(payload.username)
    _logger.info(f"[reset] Token de reset créé pour {payload.username} (Community: pas d'email automatique)")
    return {"status": "ok", "message": "Si ce compte existe et a un email, un lien a été envoyé."}


@router.post("/reset-password")
@limiter.limit(auth_limit)
def reset_password_with_token(request: Request, payload: ResetPasswordPayload):
    """Réinitialise le mot de passe via un token one-time."""
    _validate_password(payload.new_password)

    username = consume_reset_token(payload.token)
    if not username:
        raise HTTPException(status_code=400, detail="Lien invalide ou expiré. Faites une nouvelle demande.")

    change_password(username, payload.new_password)
    audit_log("PASSWORD_RESET", username, "SUCCESS", detail="Reset via token")
    _logger.info(f"[reset] Mot de passe réinitialisé pour {username}")
    return {"status": "ok", "message": "Mot de passe modifié. Vous pouvez vous connecter."}


# ─── MFA TOTP — Enterprise only ───────────────────────────────────────────────

@router.post("/mfa/setup")
def mfa_setup(_: None = Depends(require_enterprise)):
    """MFA/TOTP — Enterprise Edition only."""


@router.post("/mfa/confirm")
def mfa_confirm(_: None = Depends(require_enterprise)):
    """MFA/TOTP — Enterprise Edition only."""


@router.post("/mfa/authenticate")
def mfa_authenticate(_: None = Depends(require_enterprise)):
    """MFA/TOTP — Enterprise Edition only."""


@router.post("/mfa/disable")
def mfa_disable(_: None = Depends(require_enterprise)):
    """MFA/TOTP — Enterprise Edition only."""


# ─── Tokens d'API (CI/CD) ─────────────────────────────────────────────────────

class TokenCreate(BaseModel):
    name: str
    role: str = "uploader"
    expires_days: Optional[int] = None


@router.get("/api-tokens")
def get_api_tokens(admin: str = Depends(get_admin_user)):
    """Liste tous les tokens d'API."""
    return {"tokens": list_tokens()}


@router.post("/api-tokens", status_code=201)
def create_api_token(payload: TokenCreate, admin: str = Depends(get_admin_user)):
    """Crée un nouveau token d'API. Le token en clair n'est retourné qu'une seule fois."""
    valid_roles = ("admin", "maintainer", "uploader", "reader", "auditor")
    if payload.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Rôle invalide. Valeurs possibles : {', '.join(valid_roles)}")
    raw = create_token(
        name=payload.name,
        role=payload.role,
        created_by=admin,
        expires_days=payload.expires_days,
    )
    return {
        "token": raw,
        "message": "Copiez ce token maintenant — il ne sera plus affiché.",
        "prefix": API_TOKEN_PREFIX,
    }


@router.delete("/api-tokens/{token_id}")
def delete_api_token(token_id: str, admin: str = Depends(get_admin_user)):
    """Révoque un token d'API."""
    ok = revoke_token(token_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Token introuvable")
    return {"status": "revoked", "token_id": token_id}
