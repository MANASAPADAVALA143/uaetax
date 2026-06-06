"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiClient } from "@/lib/api";

type TabId = "profile" | "vat" | "einvoicing" | "notifications" | "api";

interface CompanyProfile {
  company_id: number;
  company_name: string;
  trn: string | null;
  country: string;
  currency: string;
  fiscal_year_start: number;
  vat_registered_date: string | null;
  entity_type: string;
  plan: string;
  annual_revenue_aed: number | null;
  settings: Record<string, unknown>;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function validateTrn(trn: string): boolean {
  if (!trn.trim()) return true;
  return /^1\d{14}$/.test(trn.replace(/\D/g, ""));
}

export default function SettingsPage() {
  const { user, activeCompany, signOut } = useAuth();
  const [tab, setTab] = useState<TabId>("profile");
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [trn, setTrn] = useState("");
  const [country, setCountry] = useState("UAE");
  const [currency, setCurrency] = useState("AED");
  const [fiscalStart, setFiscalStart] = useState(1);
  const [vatRegDate, setVatRegDate] = useState("");

  const [autoThreshold, setAutoThreshold] = useState(0.85);
  const [flagEntertainment, setFlagEntertainment] = useState(true);
  const [reverseCharge, setReverseCharge] = useState(true);

  const [revenue, setRevenue] = useState("");
  const [aspProvider, setAspProvider] = useState("");
  const [peppolId, setPeppolId] = useState("");
  const [aspReminder, setAspReminder] = useState(true);

  const [notify30, setNotify30] = useState(true);
  const [notify15, setNotify15] = useState(true);
  const [notify7, setNotify7] = useState(true);
  const [alertEmail, setAlertEmail] = useState("");

  const phaseLabel = useMemo(() => {
    const rev = parseFloat(revenue.replace(/,/g, "")) || 0;
    if (rev <= 0) return "Enter revenue to determine e-invoicing phase";
    return rev >= 50_000_000
      ? "Phase 1 — Mandatory 1 Jan 2027 · ASP deadline 30 Oct 2026"
      : "Phase 2 — Mandatory 1 Jul 2027 · ASP deadline 31 Mar 2027";
  }, [revenue]);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<CompanyProfile>("/api/auth/company-profile");
      setProfile(data);
      setCompanyName(data.company_name);
      setTrn(data.trn ?? "");
      setCountry(data.country);
      setCurrency(data.currency);
      setFiscalStart(data.fiscal_year_start);
      setVatRegDate(data.vat_registered_date?.slice(0, 10) ?? "");
      setRevenue(data.annual_revenue_aed != null ? String(data.annual_revenue_aed) : "");

      const s = data.settings || {};
      setAutoThreshold(Number(s.auto_classify_threshold) || 0.85);
      setFlagEntertainment(s.flag_entertainment !== false);
      setReverseCharge(s.reverse_charge_auto_detect !== false);
      setAspProvider(String(s.asp_provider || ""));
      setPeppolId(String(s.peppol_participant_id || ""));
      setAspReminder(s.asp_deadline_reminder !== false);
      setNotify30(s.notify_30_days !== false);
      setNotify15(s.notify_15_days !== false);
      setNotify7(s.notify_7_days !== false);
      setAlertEmail(String(s.alert_email || user?.email || ""));
    } catch {
      setToast({ kind: "error", message: "Could not load settings" });
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile, activeCompany?.company_id]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const saveProfile = async () => {
    if (!validateTrn(trn)) {
      setToast({ kind: "error", message: "TRN must be 15 digits starting with 1" });
      return;
    }
    setSaving(true);
    try {
      const { data } = await apiClient.patch<CompanyProfile>("/api/auth/company-profile", {
        company_name: companyName,
        trn: trn || null,
        country,
        currency,
        fiscal_year_start: fiscalStart,
        vat_registered_date: vatRegDate || null,
      });
      setProfile(data);
      setToast({ kind: "success", message: "Company profile saved" });
    } catch {
      setToast({ kind: "error", message: "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = async (extra: Record<string, unknown> = {}) => {
    setSaving(true);
    try {
      const { data } = await apiClient.patch<CompanyProfile>("/api/auth/company-settings", {
        settings: {
          auto_classify_threshold: autoThreshold,
          flag_entertainment: flagEntertainment,
          reverse_charge_auto_detect: reverseCharge,
          annual_revenue_aed: parseFloat(revenue.replace(/,/g, "")) || null,
          asp_provider: aspProvider,
          peppol_participant_id: peppolId,
          asp_deadline_reminder: aspReminder,
          notify_30_days: notify30,
          notify_15_days: notify15,
          notify_7_days: notify7,
          alert_email: alertEmail,
          ...extra,
        },
      });
      setProfile(data);
      setToast({ kind: "success", message: "Settings saved" });
    } catch {
      setToast({ kind: "error", message: "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const regenerateKey = async () => {
    if (!window.confirm("Regenerate API key? FinReportAI will need the new key.")) return;
    setSaving(true);
    try {
      const { data } = await apiClient.post<CompanyProfile>("/api/auth/regenerate-api-key");
      setProfile(data);
      setShowApiKey(true);
      setToast({ kind: "success", message: "API key regenerated" });
    } catch {
      setToast({ kind: "error", message: "Could not regenerate key" });
    } finally {
      setSaving(false);
    }
  };

  const apiKey = String(profile?.settings?.api_key || "");
  const finreportConnected = Boolean(profile?.settings?.finreportai_connected);

  const TABS: { id: TabId; label: string }[] = [
    { id: "profile", label: "Company Profile" },
    { id: "vat", label: "VAT Settings" },
    { id: "einvoicing", label: "E-Invoicing" },
    { id: "notifications", label: "Notifications" },
    { id: "api", label: "API Integration" },
  ];

  const inputClass =
    "w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none";

  return (
    <>
      {toast && (
        <div
          className={`mb-4 rounded-[10px] border px-4 py-3 text-sm ${
            toast.kind === "success"
              ? "border-green/40 bg-[rgba(45,212,160,0.1)] text-green"
              : "border-red/40 bg-[rgba(255,107,107,0.1)] text-red"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">// Settings</div>
          <h2 className="font-playfair text-[26px] font-bold">Workspace settings</h2>
          <p className="text-[13px] text-muted mt-1">
            {user?.email ? `Signed in as ${user.email}` : "Configure your GulfTax workspace"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => signOut()}
          className="px-4 py-2 rounded-[10px] text-sm border border-border text-muted hover:text-white hover:border-border-g"
        >
          Sign out
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 border-b border-border pb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-[10px] text-[13px] font-medium ${
              tab === t.id
                ? "bg-gold-pale text-gold-lt border border-border-g"
                : "text-muted border border-transparent hover:border-border"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-muted py-12 text-center">Loading settings…</div>
      ) : (
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 max-w-2xl space-y-6">
          {tab === "profile" && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="block text-[12px] text-muted2 uppercase mb-2">Company name</label>
                  <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-[12px] text-muted2 uppercase mb-2">TRN</label>
                  <input value={trn} onChange={(e) => setTrn(e.target.value)} className={`${inputClass} font-mono`} placeholder="100123456700003" />
                </div>
                <div>
                  <label className="block text-[12px] text-muted2 uppercase mb-2">Country</label>
                  <input value={country} onChange={(e) => setCountry(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-[12px] text-muted2 uppercase mb-2">Base currency</label>
                  <input value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-[12px] text-muted2 uppercase mb-2">Fiscal year start</label>
                  <select value={fiscalStart} onChange={(e) => setFiscalStart(Number(e.target.value))} className={inputClass}>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] text-muted2 uppercase mb-2">VAT registration date</label>
                  <input type="date" value={vatRegDate} onChange={(e) => setVatRegDate(e.target.value)} className={inputClass} />
                </div>
              </div>
              <button type="button" onClick={saveProfile} disabled={saving} className="px-6 py-2.5 rounded-[10px] text-sm bg-gold-pale text-gold-lt border border-border-g disabled:opacity-50">
                Save Changes
              </button>
            </>
          )}

          {tab === "vat" && (
            <>
              <div>
                <label className="block text-[12px] text-muted2 uppercase mb-2">
                  Auto-classify threshold: {(autoThreshold * 100).toFixed(0)}%
                </label>
                <input type="range" min={0.5} max={0.99} step={0.01} value={autoThreshold} onChange={(e) => setAutoThreshold(parseFloat(e.target.value))} className="w-full accent-gold" />
                <p className="text-[11px] text-muted mt-1">Transactions above this confidence auto-approve</p>
              </div>
              <label className="flex items-center gap-3 text-[13px] text-muted cursor-pointer">
                <input type="checkbox" checked={flagEntertainment} onChange={(e) => setFlagEntertainment(e.target.checked)} className="accent-gold w-4 h-4" />
                Flag entertainment expenses (Art.54) — default ON
              </label>
              <label className="flex items-center gap-3 text-[13px] text-muted cursor-pointer">
                <input type="checkbox" checked={reverseCharge} onChange={(e) => setReverseCharge(e.target.checked)} className="accent-gold w-4 h-4" />
                Reverse charge auto-detect — default ON
              </label>
              <button type="button" onClick={() => saveSettings()} disabled={saving} className="px-6 py-2.5 rounded-[10px] text-sm bg-gold-pale text-gold-lt border border-border-g disabled:opacity-50">
                Save VAT Settings
              </button>
            </>
          )}

          {tab === "einvoicing" && (
            <>
              <div>
                <label className="block text-[12px] text-muted2 uppercase mb-2">Annual revenue (AED)</label>
                <input value={revenue} onChange={(e) => setRevenue(e.target.value)} inputMode="decimal" className={inputClass} />
                <p className="text-[12px] text-gold-lt mt-2">{phaseLabel}</p>
              </div>
              <div>
                <label className="block text-[12px] text-muted2 uppercase mb-2">ASP provider name</label>
                <input value={aspProvider} onChange={(e) => setAspProvider(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-[12px] text-muted2 uppercase mb-2">Peppol participant ID</label>
                <input value={peppolId} onChange={(e) => setPeppolId(e.target.value)} className={inputClass} />
              </div>
              <label className="flex items-center gap-3 text-[13px] text-muted cursor-pointer">
                <input type="checkbox" checked={aspReminder} onChange={(e) => setAspReminder(e.target.checked)} className="accent-gold w-4 h-4" />
                ASP deadline reminder
              </label>
              <button type="button" onClick={() => saveSettings()} disabled={saving} className="px-6 py-2.5 rounded-[10px] text-sm bg-gold-pale text-gold-lt border border-border-g disabled:opacity-50">
                Save E-Invoicing Settings
              </button>
            </>
          )}

          {tab === "notifications" && (
            <>
              <p className="text-[13px] text-muted">Filing deadline reminders</p>
              {[
                { label: "30 days before", val: notify30, set: setNotify30 },
                { label: "15 days before", val: notify15, set: setNotify15 },
                { label: "7 days before", val: notify7, set: setNotify7 },
              ].map((n) => (
                <label key={n.label} className="flex items-center gap-3 text-[13px] text-muted cursor-pointer">
                  <input type="checkbox" checked={n.val} onChange={(e) => n.set(e.target.checked)} className="accent-gold w-4 h-4" />
                  {n.label}
                </label>
              ))}
              <div>
                <label className="block text-[12px] text-muted2 uppercase mb-2">Alert email</label>
                <input type="email" value={alertEmail} onChange={(e) => setAlertEmail(e.target.value)} className={inputClass} />
              </div>
              <button type="button" onClick={() => saveSettings()} disabled={saving} className="px-6 py-2.5 rounded-[10px] text-sm bg-gold-pale text-gold-lt border border-border-g disabled:opacity-50">
                Save Notifications
              </button>
            </>
          )}

          {tab === "api" && (
            <>
              <div>
                <h3 className="text-lg font-semibold text-white mb-1">Connect to FinReportAI</h3>
                <p className="text-[13px] text-muted mb-4">
                  Use this API key in FinReportAI Settings to sync VAT classifications and returns automatically.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-[rgba(4,12,30,0.5)] p-4">
                <label className="block text-[12px] text-muted2 uppercase mb-2">API Key</label>
                <div className="flex flex-wrap gap-2 items-center">
                  <code className="flex-1 font-mono text-sm text-gold-lt break-all">
                    {showApiKey ? apiKey : "•".repeat(Math.min(apiKey.length, 24))}
                  </code>
                  <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted hover:text-white">
                    {showApiKey ? "Hide" : "Reveal"}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(apiKey)}
                    className="px-3 py-1.5 text-xs border border-border-g rounded-lg text-gold-lt"
                  >
                    Copy
                  </button>
                </div>
                <button type="button" onClick={regenerateKey} disabled={saving} className="mt-4 px-4 py-2 text-sm border border-amber/40 text-amber rounded-lg hover:bg-[rgba(255,183,0,0.1)] disabled:opacity-50">
                  Regenerate Key
                </button>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className={finreportConnected ? "text-green" : "text-muted"}>
                  {finreportConnected ? "● Connected" : "● Not connected"}
                </span>
                <span className="text-muted">FinReportAI</span>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
