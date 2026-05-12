"""Utility helpers for resilient audit logging."""
from __future__ import annotations

import sys
from typing import Optional

from sqlalchemy.orm import Session

from models import AuditLog


def log_audit_event(
    db: Session,
    entity_type: str,
    action: str,
    entity_id: int = None,
    company_id: int = None,
    actor: str = "system",
    before_state: dict = None,
    after_state: dict = None,
) -> Optional[AuditLog]:
    """Persist an audit event without blocking primary request flow."""
    try:
        event = AuditLog(
            company_id=company_id,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            actor=actor,
            before_state=before_state,
            after_state=after_state,
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        return event
    except Exception as exc:  # pragma: no cover - defensive path
        print(f"Audit logging failed: {exc}", file=sys.stderr)
        try:
            db.rollback()
        except Exception:
            pass
        return None
