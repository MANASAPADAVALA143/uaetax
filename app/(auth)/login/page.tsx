"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import CompanyPickerModal from "@/components/CompanyPickerModal";
import type { CompanyInfo } from "@/context/AuthContext";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refreshCompanies, setActiveCompany, companies } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerCompanies, setPickerCompanies] = useState<CompanyInfo[] | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      setError("Invalid email or password");
      setLoading(false);
      return;
    }

    await refreshCompanies();

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    let list: CompanyInfo[] = [];
    if (token) {
      try {
        const res = await fetch(`${apiUrl}/api/auth/my-companies`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) list = await res.json();
      } catch {
        list = companies;
      }
    }

    if (list.length > 1) {
      setPickerCompanies(list);
      setLoading(false);
      return;
    }

    const next = params.get("next") || "/dashboard";
    router.push(next);
  };

  const onCompanyPicked = (company: CompanyInfo) => {
    setActiveCompany(company);
    setPickerCompanies(null);
    const next = params.get("next") || "/dashboard";
    router.push(next);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-deep px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-10 justify-center">
          <div className="w-10 h-10 bg-gradient-to-br from-gold to-gold-lt rounded-lg flex items-center justify-center font-playfair font-black text-lg text-deep shadow-[0_4px_16px_rgba(201,168,76,0.45)]">
            G
          </div>
          <span className="font-playfair text-xl font-bold bg-gradient-to-br from-gold-lt to-white bg-clip-text text-transparent">
            GulfTax AI
          </span>
        </div>

        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 shadow-[0_8px_40px_rgba(0,0,0,0.45)]">
          <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">
            // Sign in
          </div>
          <h1 className="font-playfair text-2xl font-bold text-white mb-1">
            Welcome back
          </h1>
          <p className="text-[13px] text-muted mb-7">
            UAE Tax Compliance, Powered by AI
          </p>

          {error && (
            <div className="mb-5 rounded-[10px] border border-red/40 bg-[rgba(255,107,107,0.1)] px-4 py-3 text-sm text-red">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@company.ae"
                className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none placeholder:text-muted2"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[12px] text-muted2 uppercase tracking-wide">
                  Password
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    if (!email) {
                      setError("Enter your email address first.");
                      return;
                    }
                    const { error: e } = await supabase.auth.resetPasswordForEmail(email);
                    if (e) setError(e.message);
                    else setError(null);
                    alert("Check your email for a password reset link.");
                  }}
                  className="text-[11px] text-gold hover:text-gold-lt transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none placeholder:text-muted2"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-[10px] text-sm font-semibold bg-gradient-to-br from-gold to-gold-lt text-deep shadow-[0_4px_18px_rgba(201,168,76,0.38)] hover:shadow-[0_6px_24px_rgba(201,168,76,0.52)] hover:-translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 mt-2"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="text-center text-[13px] text-muted mt-6">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-gold-lt hover:text-gold transition-colors">
              Sign up
            </Link>
          </p>
        </div>

        <p className="text-center text-[11px] text-muted2 mt-6">
          Secured with Supabase Auth · Data stays in your company workspace
        </p>
      </div>
      {pickerCompanies && (
        <CompanyPickerModal companies={pickerCompanies} onSelect={onCompanyPicked} />
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
