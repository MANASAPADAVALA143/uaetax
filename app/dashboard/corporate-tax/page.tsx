"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";

type FreeZoneStatus = "mainland" | "free_zone_qfzp" | "free_zone_non_qfzp";

interface CTBreakdownRow {
  label: string;
  amount_aed: number;
  note?: string;
}

interface CTComputeResult {
  taxable_income_aed: number;
  ct_payable_aed: number;
  effective_rate_percent: number;
  free_zone_status: string;
  small_business_relief_applied: boolean;
  breakdown: CTBreakdownRow[];
}

interface TPCheckResult {
  documentation_required: boolean;
  flags: string[];
  recommendation: string;
  party_ytd_total_aed: number;
  aggregate_related_party_aed: number;
}

function fmtAed(n: number): string {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

export default function CorporateTaxPage() {
  const [tab, setTab] = useState(0);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  /* Tab 1 — Compute */
  const [accountingProfit, setAccountingProfit] = useState("");
  const [revenue, setRevenue] = useState("");
  const [freeZoneStatus, setFreeZoneStatus] = useState<FreeZoneStatus>("mainland");
  const [relatedParty, setRelatedParty] = useState("");
  const [exemptIncome, setExemptIncome] = useState("");
  const [nonDeductible, setNonDeductible] = useState("");
  const [qualifyingIncome, setQualifyingIncome] = useState("");
  const [sbr, setSbr] = useState(false);
  const [computeLoading, setComputeLoading] = useState(false);
  const [computeResult, setComputeResult] = useState<CTComputeResult | null>(null);

  /* Tab 2 — Return PDF */
  const [fyYear, setFyYear] = useState(String(new Date().getFullYear() - 1));
  const [returnRevenue, setReturnRevenue] = useState("");
  const [returnTaxable, setReturnTaxable] = useState("");
  const [returnExemptions, setReturnExemptions] = useState("");
  const [returnPayable, setReturnPayable] = useState("");
  const [returnLoading, setReturnLoading] = useState(false);

  /* Tab 3 — TP Check */
  const [tpAmount, setTpAmount] = useState("");
  const [tpParty, setTpParty] = useState("");
  const [tpRelationship, setTpRelationship] = useState("");
  const [tpPartyYtd, setTpPartyYtd] = useState("");
  const [tpAggregate, setTpAggregate] = useState("");
  const [tpLoading, setTpLoading] = useState(false);
  const [tpResult, setTpResult] = useState<TPCheckResult | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (computeResult) {
      setReturnRevenue(revenue || "0");
      setReturnTaxable(String(computeResult.taxable_income_aed));
      setReturnExemptions(exemptIncome || "0");
      setReturnPayable(String(computeResult.ct_payable_aed));
    }
  }, [computeResult, revenue, exemptIncome]);

  const onCompute = async (e: React.FormEvent) => {
    e.preventDefault();
    setComputeLoading(true);
    try {
      const res = await apiClient.post<CTComputeResult>("/api/corporatetax/compute", {
        accounting_profit: parseFloat(accountingProfit) || 0,
        free_zone_status: freeZoneStatus,
        revenue: parseFloat(revenue) || 0,
        related_party_transactions: parseFloat(relatedParty) || 0,
        exempt_income: parseFloat(exemptIncome) || 0,
        non_deductible_expenses: parseFloat(nonDeductible) || 0,
        qualifying_income: freeZoneStatus === "free_zone_qfzp" ? parseFloat(qualifyingIncome) || undefined : undefined,
        small_business_relief: sbr,
      });
      setComputeResult(res.data);
    } catch {
      setToast({ kind: "error", message: "CT computation failed" });
    } finally {
      setComputeLoading(false);
    }
  };

  const onGenerateReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    setReturnLoading(true);
    try {
      const year = parseInt(fyYear, 10);
      const res = await apiClient.post(
        "/api/corporatetax/generate-return",
        {
          tax_period_start: `${year}-01-01`,
          tax_period_end: `${year}-12-31`,
          revenue: parseFloat(returnRevenue) || 0,
          taxable_income: parseFloat(returnTaxable) || 0,
          exemptions_claimed: parseFloat(returnExemptions) || 0,
          ct_payable: parseFloat(returnPayable) || 0,
        },
        { responseType: "blob" }
      );
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ct_return_${year}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setToast({ kind: "success", message: "CT return PDF downloaded" });
    } catch {
      setToast({ kind: "error", message: "PDF generation failed" });
    } finally {
      setReturnLoading(false);
    }
  };

  const onTpCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setTpLoading(true);
    setTpResult(null);
    try {
      const res = await apiClient.post<TPCheckResult>("/api/corporatetax/tp-check", {
        transaction_amount: parseFloat(tpAmount) || 0,
        party_name: tpParty,
        relationship: tpRelationship,
        party_ytd_total: parseFloat(tpPartyYtd) || 0,
        all_related_party_total: parseFloat(tpAggregate) || 0,
      });
      setTpResult(res.data);
    } catch {
      setToast({ kind: "error", message: "TP check failed" });
    } finally {
      setTpLoading(false);
    }
  };

  const TABS = ["CT Computation", "CT Return", "Transfer Pricing"];

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

      <div className="mb-7">
        <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">
          // Corporate Tax
        </div>
        <h2 className="font-playfair text-[26px] font-bold">UAE Corporate Tax</h2>
        <p className="text-[13px] text-muted mt-1 max-w-3xl">
          CT computation (0% on first AED 375k, 9% above), return preparation, and transfer pricing checks.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 border-b border-border pb-3">
        {TABS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setTab(i)}
            className={`px-4 py-2 rounded-[10px] text-[13px] font-medium transition-all ${
              tab === i
                ? "bg-gold-pale text-gold-lt border border-border-g"
                : "text-muted hover:bg-[rgba(30,70,150,0.25)] hover:text-white border border-transparent"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 0 && (
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 space-y-6">
          <form onSubmit={onCompute} className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">Accounting profit (AED)</label>
              <input value={accountingProfit} onChange={(e) => setAccountingProfit(e.target.value)} inputMode="decimal" required className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none" />
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">Revenue (AED) — for SBR</label>
              <input value={revenue} onChange={(e) => setRevenue(e.target.value)} inputMode="decimal" required className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none" />
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">Free zone status</label>
              <select value={freeZoneStatus} onChange={(e) => setFreeZoneStatus(e.target.value as FreeZoneStatus)} className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none">
                <option value="mainland">Mainland</option>
                <option value="free_zone_qfzp">Free Zone QFZP</option>
                <option value="free_zone_non_qfzp">Free Zone non-QFZP</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">Related party transactions (AED)</label>
              <input value={relatedParty} onChange={(e) => setRelatedParty(e.target.value)} inputMode="decimal" className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none" />
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">Exempt income (AED)</label>
              <input value={exemptIncome} onChange={(e) => setExemptIncome(e.target.value)} inputMode="decimal" className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none" placeholder="Dividends, capital gains" />
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">Non-deductible expenses (AED)</label>
              <input value={nonDeductible} onChange={(e) => setNonDeductible(e.target.value)} inputMode="decimal" className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none" placeholder="Entertainment 50%, fines" />
            </div>
            {freeZoneStatus === "free_zone_qfzp" && (
              <div className="md:col-span-2">
                <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">Qualifying income (AED)</label>
                <input value={qualifyingIncome} onChange={(e) => setQualifyingIncome(e.target.value)} inputMode="decimal" className="w-full max-w-md rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none" />
              </div>
            )}
            <div className="md:col-span-2">
              <label className="flex items-center gap-3 cursor-pointer text-[13px] text-muted">
                <input type="checkbox" checked={sbr} onChange={(e) => setSbr(e.target.checked)} className="rounded border-border w-4 h-4 accent-gold" />
                Elect Small Business Relief (revenue &lt; AED 3M → 0% CT)
              </label>
            </div>
            <div className="md:col-span-2">
              <button type="submit" disabled={computeLoading} className="px-6 py-2.5 rounded-[10px] text-sm font-medium bg-gold-pale text-gold-lt border border-border-g disabled:opacity-50">
                {computeLoading ? "Computing..." : "Compute CT"}
              </button>
            </div>
          </form>

          {computeResult && (
            <div className="border border-border rounded-xl p-6 space-y-4">
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <div className="text-[11px] text-muted2 uppercase">Taxable income</div>
                  <div className="text-xl font-mono text-white">{fmtAed(computeResult.taxable_income_aed)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted2 uppercase">CT payable</div>
                  <div className="text-xl font-mono text-gold-lt">{fmtAed(computeResult.ct_payable_aed)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted2 uppercase">Effective rate</div>
                  <div className="text-xl font-mono text-white">{computeResult.effective_rate_percent}%</div>
                </div>
              </div>
              {computeResult.small_business_relief_applied && (
                <p className="text-[13px] text-green">Small Business Relief applied — CT payable is AED 0.</p>
              )}
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-muted2 text-[11px] uppercase">
                    <th className="text-left py-2">Breakdown</th>
                    <th className="text-right py-2">Amount (AED)</th>
                  </tr>
                </thead>
                <tbody>
                  {computeResult.breakdown.map((row, i) => (
                    <tr key={i} className="border-t border-border text-muted">
                      <td className="py-2 text-white">{row.label}{row.note && <span className="block text-[11px] text-muted2">{row.note}</span>}</td>
                      <td className="py-2 text-right font-mono">{row.amount_aed.toLocaleString("en-AE", { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 1 && (
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 space-y-6">
          <p className="text-[13px] text-muted">Generate FTA-format CT return draft. Payment due date is 9 months after fiscal year end.</p>
          <form onSubmit={onGenerateReturn} className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">Fiscal year</label>
              <input value={fyYear} onChange={(e) => setFyYear(e.target.value)} required className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none" />
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">Revenue (AED)</label>
              <input value={returnRevenue} onChange={(e) => setReturnRevenue(e.target.value)} inputMode="decimal" required className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none" />
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">Taxable income (AED)</label>
              <input value={returnTaxable} onChange={(e) => setReturnTaxable(e.target.value)} inputMode="decimal" required className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none" />
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">Exemptions claimed (AED)</label>
              <input value={returnExemptions} onChange={(e) => setReturnExemptions(e.target.value)} inputMode="decimal" className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none" />
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">CT payable (AED)</label>
              <input value={returnPayable} onChange={(e) => setReturnPayable(e.target.value)} inputMode="decimal" required className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none" />
            </div>
            <div className="md:col-span-2">
              <button type="submit" disabled={returnLoading} className="px-6 py-2.5 rounded-[10px] text-sm font-medium bg-gold-pale text-gold-lt border border-border-g disabled:opacity-50">
                {returnLoading ? "Generating..." : "Download CT Return PDF"}
              </button>
            </div>
          </form>
        </div>
      )}

      {tab === 2 && (
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 space-y-6">
          <p className="text-[13px] text-muted">
            Check if arm&apos;s length documentation is required. Thresholds: AED 3M per party or AED 40M aggregate.
          </p>
          <form onSubmit={onTpCheck} className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">Transaction amount (AED)</label>
              <input value={tpAmount} onChange={(e) => setTpAmount(e.target.value)} inputMode="decimal" required className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none" />
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">Party name</label>
              <input value={tpParty} onChange={(e) => setTpParty(e.target.value)} required className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none" />
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">Relationship</label>
              <input value={tpRelationship} onChange={(e) => setTpRelationship(e.target.value)} required placeholder="e.g. Parent company, subsidiary" className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none" />
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">Party YTD total (AED)</label>
              <input value={tpPartyYtd} onChange={(e) => setTpPartyYtd(e.target.value)} inputMode="decimal" className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">All related-party YTD total (AED)</label>
              <input value={tpAggregate} onChange={(e) => setTpAggregate(e.target.value)} inputMode="decimal" className="w-full max-w-md rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none" />
            </div>
            <div className="md:col-span-2">
              <button type="submit" disabled={tpLoading} className="px-6 py-2.5 rounded-[10px] text-sm font-medium bg-gold-pale text-gold-lt border border-border-g disabled:opacity-50">
                {tpLoading ? "Checking..." : "Run TP Check"}
              </button>
            </div>
          </form>

          {tpResult && (
            <div className={`rounded-xl border p-6 ${tpResult.documentation_required ? "border-red/40 bg-[rgba(255,107,107,0.08)]" : "border-green/40 bg-[rgba(45,212,160,0.08)]"}`}>
              <h3 className={`text-lg font-semibold mb-2 ${tpResult.documentation_required ? "text-red" : "text-green"}`}>
                {tpResult.documentation_required ? "TP documentation required" : "Below TP thresholds"}
              </h3>
              <p className="text-[13px] text-muted mb-3">{tpResult.recommendation}</p>
              {tpResult.flags.length > 0 && (
                <ul className="list-disc list-inside text-[13px] text-muted space-y-1">
                  {tpResult.flags.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              )}
              <p className="text-[12px] text-muted2 mt-3">
                Party YTD: {fmtAed(tpResult.party_ytd_total_aed)} · Aggregate: {fmtAed(tpResult.aggregate_related_party_aed)}
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
