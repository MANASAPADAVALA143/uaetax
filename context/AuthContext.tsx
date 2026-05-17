"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { setApiAuth } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────

export interface CompanyInfo {
  company_id: number;
  company_name: string;
  trn: string | null;
  entity_type: string;
  role: string;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  companies: CompanyInfo[];
  activeCompany: CompanyInfo | null;
  loading: boolean;
  setActiveCompany: (company: CompanyInfo) => void;
  signOut: () => Promise<void>;
  refreshCompanies: () => Promise<void>;
}

// ── Context ────────────────────────────────────────────────────

const AuthContext = createContext<AuthState>({
  user: null,
  session: null,
  companies: [],
  activeCompany: null,
  loading: true,
  setActiveCompany: () => {},
  signOut: async () => {},
  refreshCompanies: async () => {},
});

const ACTIVE_COMPANY_KEY = "gulftax_active_company_id";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Provider ───────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [companies, setCompanies] = useState<CompanyInfo[]>([]);
  const [activeCompany, setActiveCompanyState] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(true);

  /** Fetch user's company list from the backend using the current token. */
  const fetchCompanies = useCallback(async (token: string): Promise<CompanyInfo[]> => {
    try {
      const res = await fetch(`${API_URL}/api/auth/my-companies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return await res.json() as CompanyInfo[];
    } catch {
      return [];
    }
  }, []);

  /** Resolve which company should be active after loading company list. */
  const resolveActive = useCallback(
    (list: CompanyInfo[]): CompanyInfo | null => {
      if (list.length === 0) return null;
      const saved =
        typeof window !== "undefined"
          ? localStorage.getItem(ACTIVE_COMPANY_KEY)
          : null;
      if (saved) {
        const id = parseInt(saved, 10);
        const match = list.find((c) => c.company_id === id);
        if (match) return match;
      }
      return list[0];
    },
    []
  );

  /** Full refresh — called after login or company setup. */
  const refreshCompanies = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const list = await fetchCompanies(token);
    setCompanies(list);
    const active = resolveActive(list);
    setActiveCompanyState(active);
    setApiAuth(token, active?.company_id ?? null);
  }, [fetchCompanies, resolveActive]);

  /** Manually switch active company (multi-company users). */
  const setActiveCompany = useCallback(
    (company: CompanyInfo) => {
      setActiveCompanyState(company);
      localStorage.setItem(ACTIVE_COMPANY_KEY, String(company.company_id));
      setApiAuth(session?.access_token ?? null, company.company_id);
    },
    [session]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setCompanies([]);
    setActiveCompanyState(null);
    setApiAuth(null, null);
    localStorage.removeItem(ACTIVE_COMPANY_KEY);
    window.location.href = "/login";
  }, []);

  // ── Bootstrap on mount ───────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      const s = data.session;
      if (!mounted) return;

      if (s) {
        setSession(s);
        setUser(s.user);
        const list = await fetchCompanies(s.access_token);
        if (!mounted) return;
        setCompanies(list);
        const active = resolveActive(list);
        setActiveCompanyState(active);
        setApiAuth(s.access_token, active?.company_id ?? null);
      }
      setLoading(false);
    };

    init();

    // Listen for session changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        if (!mounted) return;
        setSession(s);
        setUser(s?.user ?? null);

        if (s) {
          const list = await fetchCompanies(s.access_token);
          if (!mounted) return;
          setCompanies(list);
          const active = resolveActive(list);
          setActiveCompanyState(active);
          setApiAuth(s.access_token, active?.company_id ?? null);
        } else {
          setCompanies([]);
          setActiveCompanyState(null);
          setApiAuth(null, null);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchCompanies, resolveActive]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        companies,
        activeCompany,
        loading,
        setActiveCompany,
        signOut,
        refreshCompanies,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Exports ────────────────────────────────────────────────────

export function useAuth() {
  return useContext(AuthContext);
}
