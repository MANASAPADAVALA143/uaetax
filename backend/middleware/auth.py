"""FastAPI auth middleware for Supabase JWT + company tenancy checks.

Every user-facing route should depend on either:
  - get_current_user  — just verify the token
  - get_current_company_id  — verify token AND company ownership

n8n webhook routes (HMAC-signed) must NOT use these deps.
"""
import os
from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import UserCompany, Company

# ── Role hierarchy ──────────────────────────────────────────────
ROLE_ORDER = {"member": 0, "admin": 1, "owner": 2}


# ── JWT verification ────────────────────────────────────────────
def _verify_jwt(token: str) -> dict:
    """
    Verify a Supabase-issued JWT locally using the JWT secret (HS256).
    Falls back to a live Supabase API call when no secret is configured.
    """
    secret = os.getenv("SUPABASE_JWT_SECRET", "")

    if secret:
        try:
            from jose import JWTError, jwt as jose_jwt
            payload = jose_jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
            return {"user_id": payload.get("sub", ""), "email": payload.get("email", "")}
        except JWTError as exc:
            raise HTTPException(status_code=401, detail=f"Invalid token: {exc}") from exc

    # ── Fallback: call Supabase REST API ──
    supabase_url = os.getenv("SUPABASE_URL", "")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url:
        raise HTTPException(
            status_code=500,
            detail="Auth not configured — set SUPABASE_JWT_SECRET or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY",
        )
    try:
        import httpx
        resp = httpx.get(
            f"{supabase_url}/auth/v1/user",
            headers={"Authorization": f"Bearer {token}", "apikey": service_key},
            timeout=10,
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        data = resp.json()
        return {"user_id": data.get("id", ""), "email": data.get("email", "")}
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Auth service unreachable: {exc}") from exc


# ── FastAPI dependencies ─────────────────────────────────────────

async def get_current_user(
    authorization: Optional[str] = Header(default=None),
) -> dict:
    """Dependency: extract and verify Bearer token. Returns {user_id, email}."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty bearer token")
    return _verify_jwt(token)


async def get_current_company_id(
    x_company_id: Optional[str] = Header(default=None, alias="X-Company-ID"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> int:
    """
    Dependency: verify token, then confirm user belongs to the requested company.
    Returns company_id as int.
    """
    if not x_company_id:
        raise HTTPException(status_code=400, detail="Missing X-Company-ID header")
    try:
        cid = int(x_company_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="X-Company-ID must be an integer")

    membership = (
        db.query(UserCompany)
        .filter(UserCompany.user_id == user["user_id"], UserCompany.company_id == cid)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied: not a member of this company")
    return cid


def require_role(minimum_role: str):
    """
    Dependency factory: require at least `minimum_role` in the active company.
    Usage: some_val = Depends(require_role("admin"))
    """
    min_level = ROLE_ORDER.get(minimum_role, 0)

    async def _check(
        x_company_id: Optional[str] = Header(default=None, alias="X-Company-ID"),
        user: dict = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> dict:
        if not x_company_id:
            raise HTTPException(status_code=400, detail="Missing X-Company-ID header")
        try:
            cid = int(x_company_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid X-Company-ID")
        membership = (
            db.query(UserCompany)
            .filter(UserCompany.user_id == user["user_id"], UserCompany.company_id == cid)
            .first()
        )
        if not membership:
            raise HTTPException(status_code=403, detail="Access denied")
        if ROLE_ORDER.get(membership.role, 0) < min_level:
            raise HTTPException(
                status_code=403,
                detail=f"Requires '{minimum_role}' role (you are '{membership.role}')",
            )
        return {"user": user, "company_id": cid, "role": membership.role}

    return Depends(_check)
