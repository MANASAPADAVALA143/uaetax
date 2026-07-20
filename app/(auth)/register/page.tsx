"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

const EMIRATES = [
  "Abu Dhabi",
  "Dubai",
  "Sharjah",
  "Ajman",
  "Umm Al Quwain",
  "Ras Al Khaimah",
  "Fujairah",
];

export default function RegisterPage() {
  const router = useRouter();
  const { refreshCompanies } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [trn, setTrn] = useState("");
  const [emirate, setEmirate] = useState("Dubai");
  const [entityType, setEntityType] = useState("mainland");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!companyName.trim()) {
      setError("Company name is required.");
      return;
    }

    setLoading(true);

    // 1. Create Supabase auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    const session = authData.session;
    if (!session) {
      // Some Supabase projects require email confirmation
      setError(
        "Account created — please check your email to confirm your address, then sign in."
      );
      setLoading(false);
      return;
    }

    // 2. Create company on the backend (uses the new JWT)
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
          trn: trn.trim() || null,
          emirate,
          entity_type: entityType,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          (body as { detail?: string }).detail ||
            "Company setup failed — please try again."
        );
        setLoading(false);
        return;
      }
    } catch {
      setError("Could not reach the API. Is the backend running?");
      setLoading(false);
      return;
    }

    // 3. Refresh AuthContext with new company
    await refreshCompanies();

    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-deep px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 bg-gradient-to-br from-gold to-gold-lt rounded-lg flex items-center justify-center font-playfair font-black text-lg text-deep shadow-[0_4px_16px_rgba(201,168,76,0.45)]">
            U
          </div>
          <span className="font-playfair text-xl font-bold bg-gradient-to-br from-gold-lt to-white bg-clip-text text-transparent">
            UAE Tax
          </span>
        </div>

        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 shadow-[0_8px_40px_rgba(0,0,0,0.45)]">
          <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">
            // Create account
          </div>
          <h1 className="font-playfair text-2xl font-bold text-white mb-1">
            Get started
          </h1>
          <p className="text-[13px] text-muted mb-7">
            Set up your company workspace in 60 seconds.
          </p>

          {error && (
            <div className="mb-5 rounded-[10px] border border-red/40 bg-[rgba(255,107,107,0.1)] px-4 py-3 text-sm text-red">
              {error}
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
            {/* Company details */}
            <div className="rounded-[10px] border border-[rgba(78,168,255,0.12)] bg-[rgba(15,40,90,0.2)] p-4 space-y-3">
              <p className="text-[11px] text-muted2 uppercase tracking-wide font-mono">Company</p>
              <div>
                <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                  Company name <span className="text-red">*</span>
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                  placeholder="Al Baraka Trading LLC"
                  className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none placeholder:text-muted2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                    TRN (optional)
                  </label>
                  <input
                    type="text"
                    value={trn}
                    onChange={(e) => setTrn(e.target.value)}
                    placeholder="100…"
                    maxLength={20}
                    className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm font-mono focus:border-border-g focus:outline-none placeholder:text-muted2"
                  />
                </div>
                <div>
                  <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                    Emirate
                  </label>
                  <select
                    value={emirate}
                    onChange={(e) => setEmirate(e.target.value)}
                    className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-3 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
                  >
                    {EMIRATES.map((em) => (
                      <option key={em} value={em}>
                        {em}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                  Entity type
                </label>
                <select
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value)}
                  className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
                >
                  <option value="mainland">Mainland taxable person</option>
                  <option value="free_zone">Free zone</option>
                  <option value="designated_zone">Designated zone</option>
                </select>
              </div>
            </div>

            {/* Login credentials */}
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                Email address <span className="text-red">*</span>
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
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                Password <span className="text-red">*</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Min 8 characters"
                className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none placeholder:text-muted2"
              />
            </div>

            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                Confirm password <span className="text-red">*</span>
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none placeholder:text-muted2"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-[10px] text-sm font-semibold bg-gradient-to-br from-gold to-gold-lt text-deep shadow-[0_4px_18px_rgba(201,168,76,0.38)] hover:shadow-[0_6px_24px_rgba(201,168,76,0.52)] hover:-translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 mt-2"
            >
              {loading ? "Creating workspace…" : "Create workspace →"}
            </button>
          </form>

          <p className="text-center text-[13px] text-muted mt-6">
            Already have an account?{" "}
            <Link href="/login" className="text-gold-lt hover:text-gold transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
