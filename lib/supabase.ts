import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Singleton Supabase browser client. */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "gulftax_session",
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

export const COMPANY_ID_KEY = "gulftax_company_id";

/** Active company id (integer string from backend API). */
export async function getCompanyId(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(COMPANY_ID_KEY);
}

export function setCompanyId(id: number | string | null): void {
  if (typeof window === "undefined") return;
  if (id === null) localStorage.removeItem(COMPANY_ID_KEY);
  else localStorage.setItem(COMPANY_ID_KEY, String(id));
}
