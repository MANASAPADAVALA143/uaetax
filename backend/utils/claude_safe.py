"""Anthropic SDK 1.x-safe helpers.

SDK 1.0+ removed temperature/top_p/top_k from messages.create() signatures.
Passing them raises: TypeError: unexpected keyword argument 'temperature'
"""
from __future__ import annotations

from typing import Any

# Bump this when invoice Claude call sites change — exposed via /health
INVOICE_CLAUDE_FIX_ID = "no-temperature-v2-20261008"

_STRIP_KEYS = ("temperature", "top_p", "top_k")


def messages_create(client: Any, **kwargs: Any) -> Any:
    """Call client.messages.create after stripping removed sampling kwargs."""
    for key in _STRIP_KEYS:
        kwargs.pop(key, None)
    return client.messages.create(**kwargs)
