"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, setCompanyId } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

const PLANS = [
  { id: "starter", label: "Starter", desc: "Free — VAT classifier & returns" },
  { id: "professional", label: "Professional", desc: "E-invoicing + CT module" },
  { id: "enterprise", label: "Enterprise", desc: "Multi-entity + API access" },
] as const;

function validateTrn(trn: string): boolean {
  if (!trn.trim()) return true;
  return /^1\d{14}$/.test(trn.replace(/\D/g, ""));
}

export default function SignupPage() {
  const router = useRouter();
  const { refreshCompanies } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [trn, setTrn] = useState("");
  const [plan, setPlan] = useState<string>("starter");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!companyName.trim()) {
      setError("Company name is required.");
      return;
    }
    if (!validateTrn(trn)) {
      setError("TRN must be 15 digits starting with 1.");
      return;
    }

    setLoading(true);

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() } },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    const session = authData.session;
    if (!session) {
      setError("Account created — check your email to confirm, then sign in.");
      setLoading(false);
      return;
    }

    const userId = authData.user?.id;
    const cleanedTrn = trn.replace(/\D/g, "") || null;

    // Supabase SaaS tables (UUID) — optional if migration 005 applied
    try {
      const { data: sbCompany, error: coErr } = await supabase
        .from("companies")
        .insert({
          name: companyName.trim(),
          trn: cleanedTrn,
          country: "UAE",
          currency: "AED",
          plan,
        })
        .select("id")
        .single();

      if (!coErr && sbCompany && userId) {
        await supabase.from("user_companies").insert({
          user_id: userId,
          company_id: sbCompany.id,
          role: "owner",
        });
      }
    } catch {
      /* Supabase tables may not exist — backend setup is canonical */
    }

    // Backend company (integer id for API / X-Company-ID)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    try {
      const res = await fetch(`${apiUrl}/api/auth/setup-company`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          company_name: companyName.trim(),
          trn: cleanedTrn,
          entity_type: "mainland",
          plan,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { detail?: string }).detail || "Company setup failed.");
        setLoading(false);
        return;
      }

      const company = await res.json();
      setCompanyId(company.company_id);
    } catch {
      setError("Could not reach the API. Is the backend running?");
      setLoading(false);
      return;
    }

    await refreshCompanies();
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-deep px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 bg-gradient-to-br from-gold to-gold-lt rounded-lg flex items-center justify-center font-playfair font-black text-lg text-deep shadow-[0_4px_16px_rgba(201,168,76,0.45)]">
            G
          </div>
          <span className="font-playfair text-xl font-bold bg-gradient-to-br from-gold-lt to-white bg-clip-text text-transparent">
            GulfTax AI
          </span>
        </div>

        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 shadow-[0_8px_40px_rgba(0,0,0,0.45)]">
          <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">// Sign up</div>
          <h1 className="font-playfair text-2xl font-bold text-white mb-1">Create account</h1>
          <p className="text-[13px] text-muted mb-7">Set up your UAE tax compliance workspace.</p>

          {error && (
            <div className="mb-5 rounded-[10px] border border-red/40 bg-[rgba(255,107,107,0.1)] px-4 py-3 text-sm text-red">
              {error}
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">Full name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none" />
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none" />
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">Password (min 8)</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none" />
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">Company name</label>
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none" />
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">TRN (optional)</label>
              <input value={trn} onChange={(e) => setTrn(e.target.value)} placeholder="100123456700003" className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm font-mono focus:border-border-g focus:outline-none" />
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">Plan</label>
              <div className="space-y-2">
                {PLANS.map((p) => (
                  <label key={p.id} className={`flex items-start gap-3 rounded-[10px] border px-4 py-3 cursor-pointer ${plan === p.id ? "border-border-g bg-gold-pale" : "border-border"}`}>
                    <input type="radio" name="plan" value={p.id} checked={plan === p.id} onChange={() => setPlan(p.id)} className="mt-1 accent-gold" />
                    <div>
                      <span className="text-sm text-white font-medium">{p.label}</span>
                      <p className="text-[11px] text-muted">{p.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" disabled={loading} className="w-full py-3 rounded-[10px] text-sm font-semibold bg-gradient-to-br from-gold to-gold-lt text-deep disabled:opacity-50 mt-2">
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </form>

          <p className="text-center text-[13px] text-muted mt-6">
            Already have an account?{" "}
            <Link href="/login" className="text-gold-lt hover:text-gold transition-colors">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
