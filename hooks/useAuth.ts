/**
 * Convenience re-exports so pages can import from one place.
 *
 *   import { useAuth, useCompanyId } from "@/hooks/useAuth";
 */
"use client";

import { useAuth as _useAuth } from "@/context/AuthContext";

export { useAuth } from "@/context/AuthContext";

/** Returns the active company_id (integer) or null if not yet loaded. */
export function useCompanyId(): number | null {
  const { activeCompany } = _useAuth();
  return activeCompany?.company_id ?? null;
}
