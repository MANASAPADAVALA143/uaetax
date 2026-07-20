/**
 * Shared axios instance for all UAE Tax API calls.
 *
 * Automatically injects:
 *   Authorization: Bearer <supabase_access_token>
 *   X-Company-ID: <active_company_id>
 *
 * AuthContext calls setApiAuth() whenever the session / active company changes.
 */
import axios from "axios";

// Module-level store — updated by AuthContext, read by the request interceptor
let _token: string | null = null;
let _companyId: number | null = null;

/** Called by AuthContext when session or active company changes. */
export function setApiAuth(token: string | null, companyId: number | null) {
  _token = token;
  _companyId = companyId;
}

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  timeout: 30_000,
});

// ── Request interceptor — inject auth headers ──────────────────
apiClient.interceptors.request.use((config) => {
  if (_token) {
    config.headers["Authorization"] = `Bearer ${_token}`;
  }
  if (_companyId !== null) {
    config.headers["X-Company-ID"] = String(_companyId);
  }
  return config;
});

const _LOCAL_DEV = process.env.NEXT_PUBLIC_LOCAL_DEV === "true";

// ── Response interceptor — handle auth errors ──────────────────
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== "undefined" && !_LOCAL_DEV) {
      if (error.response?.status === 401) {
        // Token expired or missing — redirect to login
        window.location.href = "/login";
      }
      // 403 is handled per-call (wrong company etc.)
    }
    return Promise.reject(error);
  }
);
