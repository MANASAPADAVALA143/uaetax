"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api";

const CT_ZERO_BAND_AED = 375_000;
const SBR_REVENUE_CAP_AED = 3_000_000;
const RATE_ABOVE_BAND = 0.09;
const FILING_DEADLINE = new Date("2026-09-30T23:59:59+04:00");

type EntityType = "mainland" | "free_zone_qfzp" | "free_zone_other";

type LineItem = { id: string; label: string; amount: string };

function newLine(): LineItem {
  return { id: crypto.randomUUID(), label: "", amount: "" };
}

function parseAmount(s: string): number {
  const n = parseFloat(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function fmtAed(n: number): string {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

function useCountdown(target: Date) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return useMemo(() => {
    const end = target.getTime();
    const ms = end - now;
    if (ms <= 0) {
      return { past: true, days: 0, hours: 0, minutes: 0 };
    }
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return { past: false, days, hours, minutes };
  }, [now, target]);
}

const DEFAULT_CHECKLIST = [
  "Financial statements prepared (IFRS / applicable framework)",
  "Accounting policies and CT-relevant elections documented",
  "Exempt income and qualifying activities mapped",
  "Related-party transactions and transfer pricing file status",
  "Withholding tax and counterparty documentation",
  "Losses / pre-CT periods reconciled for utilization rules",
  "Small Business Relief eligibility and revenue cap (≤ AED 3M) checked",
  "CT registration / TRN and FTA portal access verified",
  "Board / shareholder resolutions for CT elections (if any)",
  "Payment method and filing calendar owner assigned",
] as const;

const FILING_STAGES = [
  "Draft workspace",
  "Internal review",
  "Ready to e-file",
  "Submitted to FTA",
] as const;

export default function CorporateTaxPage() {
  const [tab, setTab] = useState(0);
  const [revenue, setRevenue] = useState("");
  const [expenses, setExpenses] = useState("");
  const [addbacks, setAddbacks] = useState<LineItem[]>([newLine()]);
  const [deductions, setDeductions] = useState<LineItem[]>([newLine()]);
  const [entityType, setEntityType] = useState<EntityType>("mainland");
  const [flagSbr, setFlagSbr] = useState(false);
  const [flagLossCf, setFlagLossCf] = useState(false);
  const [flagRelatedParty, setFlagRelatedParty] = useState(false);
  const [checklist, setChecklist] = useState(() =>
    DEFAULT_CHECKLIST.map((label, i) => ({ id: String(i), label, done: false }))
  );
  const [filingStage, setFilingStage] = useState(0);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [narrativeError, setNarrativeError] = useState<string | null>(null);
  const countdown = useCountdown(FILING_DEADLINE);

  const totals = useMemo(() => {
    const rev = parseAmount(revenue);
    const exp = parseAmount(expenses);
    const addSum = addbacks.reduce((s, r) => s + parseAmount(r.amount), 0);
    const dedSum = deductions.reduce((s, r) => s + parseAmount(r.amount), 0);
    const profit = rev - exp;
    let taxable = profit + addSum - dedSum;
    if (taxable < 0) taxable = 0;

    const sbrOk = flagSbr && rev > 0 && rev <= SBR_REVENUE_CAP_AED;
    let liability = 0;
    let amount0 = 0;
    let amount9 = 0;
    let tax9 = 0;

    if (sbrOk) {
      liability = 0;
    } else {
      amount0 = Math.min(taxable, CT_ZERO_BAND_AED);
      amount9 = Math.max(taxable - CT_ZERO_BAND_AED, 0);
      tax9 = amount9 * RATE_ABOVE_BAND;
      liability = tax9;
    }

    return {
      rev,
      exp,
      addSum,
      dedSum,
      profit,
      taxable,
      sbrOk,
      amount0,
      amount9,
      tax9,
      liability,
    };
  }, [revenue, expenses, addbacks, deductions, flagSbr]);

  const steps = useMemo(() => {
    const t = totals;
    const rows: { k: string; v: string; note?: string }[] = [
      { k: "Revenue (Tab 1)", v: fmtAed(t.rev) },
      { k: "Less: operating expenses", v: `(${fmtAed(t.exp)})` },
      { k: "Accounting profit / (loss) before adjustments", v: fmtAed(t.profit) },
      { k: "Add: permanent / other add-backs (sum)", v: fmtAed(t.addSum) },
      { k: "Less: deductions / reliefs in scope (sum)", v: `(${fmtAed(t.dedSum)})` },
      { k: "Taxable income (floored at zero for this shell)", v: fmtAed(t.taxable) },
    ];

    if (t.sbrOk) {
      rows.push({
        k: "Small Business Relief",
        v: "Applied — AED 0 CT (revenue ≤ AED 3M and election on)",
        note: "Illustrative only; confirm against Cabinet Decision No. 73 of 2023 and FTA guidance.",
      });
    } else {
      if (flagSbr && t.rev > SBR_REVENUE_CAP_AED) {
        rows.push({
          k: "Small Business Relief",
          v: "Not applied — revenue above AED 3M cap",
        });
      } else if (flagSbr && t.rev <= 0) {
        rows.push({
          k: "Small Business Relief",
          v: "Not applied — enter revenue to test SBR cap",
        });
      } else if (!flagSbr) {
        rows.push({ k: "Small Business Relief", v: "Election off — standard rate schedule" });
      }
      rows.push({
        k: `First AED ${CT_ZERO_BAND_AED.toLocaleString("en-AE")} of taxable income @ 0%`,
        v: fmtAed(t.amount0),
      });
      rows.push({
        k: "Balance @ 9%",
        v: `${fmtAed(t.amount9)} → ${fmtAed(t.tax9)}`,
      });
    }

    rows.push({ k: "Estimated CT liability (client-side demo)", v: fmtAed(t.liability) });
    return rows;
  }, [totals, flagSbr]);

  const updateLine = (
    kind: "add" | "ded",
    id: string,
    field: "label" | "amount",
    value: string
  ) => {
    const set = kind === "add" ? setAddbacks : setDeductions;
    set((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const handleGenerateNarrative = async () => {
    setNarrativeLoading(true);
    setNarrativeError(null);
    setNarrative(null);
    try {
      const { data } = await apiClient.post("/api/ct/narrative", {
        accounting_profit: totals.profit,
        taxable_income: totals.taxable,
        ct_liability: totals.liability,
        entity_type: entityType,
        addbacks: addbacks.filter(r => r.label && parseAmount(r.amount) > 0).map(r => ({ label: r.label, amount: parseAmount(r.amount) })),
        deductions: deductions.filter(r => r.label && parseAmount(r.amount) > 0).map(r => ({ label: r.label, amount: parseAmount(r.amount) })),
        sbr_elected: flagSbr,
        filing_deadline: "30 September 2026",
      });
      setNarrative(data.narrative);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail || "Failed to generate narrative";
      setNarrativeError(typeof msg === "string" ? msg : "Failed to generate narrative");
    } finally {
      setNarrativeLoading(false);
    }
  };

  return (
    <>
      <div className="mb-7">
        <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">
          // Corporate Tax
        </div>
        <h2 className="font-playfair text-[26px] font-bold">UAE CT workspace</h2>
        <p className="text-[13px] text-muted mt-1 max-w-3xl">
          Client-side shell: 0% on the first AED 375k of taxable income, 9% above, optional Small
          Business Relief when revenue ≤ AED 3M. Backend and statutory nuance (e.g. QFZP) come
          later.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 border-b border-border pb-3">
        {["Input", "Calculation", "Checklist", "Advisory", "Filing"].map((label, i) => (
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
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 space-y-8">
          <section className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                Revenue (AED)
              </label>
              <input
                value={revenue}
                onChange={(e) => setRevenue(e.target.value)}
                className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
                inputMode="decimal"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                Expenses (AED)
              </label>
              <input
                value={expenses}
                onChange={(e) => setExpenses(e.target.value)}
                className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
                inputMode="decimal"
                placeholder="0"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                Entity type
              </label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value as EntityType)}
                className="w-full max-w-md rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
              >
                <option value="mainland">Mainland / standard resident</option>
                <option value="free_zone_qfzp">Free zone — QFZP track (informational)</option>
                <option value="free_zone_other">Free zone — other</option>
              </select>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Add-backs</h3>
              <button
                type="button"
                onClick={() => setAddbacks((r) => [...r, newLine()])}
                className="text-[12px] text-gold-lt hover:underline"
              >
                + Add row
              </button>
            </div>
            <div className="space-y-2">
              {addbacks.map((row) => (
                <div key={row.id} className="flex flex-wrap gap-2 items-center">
                  <input
                    value={row.label}
                    onChange={(e) => updateLine("add", row.id, "label", e.target.value)}
                    placeholder="Description"
                    className="flex-1 min-w-[140px] rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-3 py-2 text-sm focus:border-border-g focus:outline-none"
                  />
                  <input
                    value={row.amount}
                    onChange={(e) => updateLine("add", row.id, "amount", e.target.value)}
                    placeholder="AED"
                    className="w-36 rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-3 py-2 text-sm focus:border-border-g focus:outline-none"
                    inputMode="decimal"
                  />
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Deductions</h3>
              <button
                type="button"
                onClick={() => setDeductions((r) => [...r, newLine()])}
                className="text-[12px] text-gold-lt hover:underline"
              >
                + Add row
              </button>
            </div>
            <div className="space-y-2">
              {deductions.map((row) => (
                <div key={row.id} className="flex flex-wrap gap-2 items-center">
                  <input
                    value={row.label}
                    onChange={(e) => updateLine("ded", row.id, "label", e.target.value)}
                    placeholder="Description"
                    className="flex-1 min-w-[140px] rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-3 py-2 text-sm focus:border-border-g focus:outline-none"
                  />
                  <input
                    value={row.amount}
                    onChange={(e) => updateLine("ded", row.id, "amount", e.target.value)}
                    placeholder="AED"
                    className="w-36 rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-3 py-2 text-sm focus:border-border-g focus:outline-none"
                    inputMode="decimal"
                  />
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-white mb-3">Flags</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer text-[13px] text-muted">
                <input
                  type="checkbox"
                  checked={flagSbr}
                  onChange={(e) => setFlagSbr(e.target.checked)}
                  className="rounded border-border w-4 h-4 accent-gold"
                />
                Elect Small Business Relief (revenue must be ≤ AED 3M; sets illustrative CT to
                zero)
              </label>
              <label className="flex items-center gap-3 cursor-pointer text-[13px] text-muted">
                <input
                  type="checkbox"
                  checked={flagLossCf}
                  onChange={(e) => setFlagLossCf(e.target.checked)}
                  className="rounded border-border w-4 h-4 accent-gold"
                />
                Loss carryforward under review (not applied in this demo calculator)
              </label>
              <label className="flex items-center gap-3 cursor-pointer text-[13px] text-muted">
                <input
                  type="checkbox"
                  checked={flagRelatedParty}
                  onChange={(e) => setFlagRelatedParty(e.target.checked)}
                  className="rounded border-border w-4 h-4 accent-gold"
                />
                Significant related-party transactions (checklist reminder only)
              </label>
            </div>
          </section>
        </div>
      )}

      {tab === 1 && (
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8">
          <h3 className="text-lg font-semibold text-white mb-4">Step-by-step liability</h3>
          <p className="text-[13px] text-muted mb-6">
            Entity type:{" "}
            <span className="text-gold-lt">
              {entityType === "mainland"
                ? "Mainland / standard"
                : entityType === "free_zone_qfzp"
                  ? "QFZP (rates not split in this shell)"
                  : "Free zone — other"}
            </span>
            {flagLossCf && (
              <span className="block mt-2 text-amber">
                Loss carryforward flag is on — quantitative offset is not modeled here.
              </span>
            )}
            {flagRelatedParty && (
              <span className="block mt-2 text-muted2">
                Related-party flag: ensure TP file aligns before filing.
              </span>
            )}
          </p>
          <ol className="space-y-3">
            {steps.map((row, idx) => (
              <li
                key={`${idx}-${row.k}`}
                className="border-b border-border/60 pb-3 last:border-0 space-y-1"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                  <span className="text-[13px] text-muted flex-1">{row.k}</span>
                  <span className="text-sm font-mono text-white sm:text-right">{row.v}</span>
                </div>
                {row.note ? (
                  <p className="text-[11px] text-muted2 pl-0 sm:pl-0">{row.note}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      )}

      {tab === 2 && (
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8">
          <h3 className="text-lg font-semibold text-white mb-2">Preparation checklist</h3>
          <p className="text-[13px] text-muted mb-6">Tap an item to toggle done / open.</p>
          <ul className="space-y-2">
            {checklist.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() =>
                    setChecklist((xs) =>
                      xs.map((x) => (x.id === item.id ? { ...x, done: !x.done } : x))
                    )
                  }
                  className={`w-full text-left rounded-[10px] border px-4 py-3 text-[13px] transition-all ${
                    item.done
                      ? "border-green/40 bg-[rgba(45,212,160,0.08)] text-green"
                      : "border-border bg-[rgba(4,12,30,0.5)] text-muted hover:border-border-g"
                  }`}
                >
                  <span className="mr-2">{item.done ? "✓" : "○"}</span>
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 3 && (
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">AI CT Advisory Note</h3>
            <p className="text-[13px] text-muted">Generated by Claude using UAE CT Law (Federal Decree-Law No. 47 of 2022).</p>
          </div>

          <div className="grid grid-cols-3 gap-3 rounded-xl border border-border bg-[rgba(4,12,30,0.5)] p-4">
            <div className="text-center"><div className="text-[11px] text-muted2 uppercase tracking-wide mb-1">Taxable Income</div><div className="font-mono text-gold-lt text-sm">{fmtAed(totals.taxable)}</div></div>
            <div className="text-center"><div className="text-[11px] text-muted2 uppercase tracking-wide mb-1">CT Liability</div><div className="font-mono text-sm text-white">{fmtAed(totals.liability)}</div></div>
            <div className="text-center"><div className="text-[11px] text-muted2 uppercase tracking-wide mb-1">Effective Rate</div><div className="font-mono text-sm text-white">{totals.taxable > 0 ? ((totals.liability / totals.taxable) * 100).toFixed(1) : "0.0"}%</div></div>
          </div>

          <button
            type="button"
            onClick={handleGenerateNarrative}
            disabled={narrativeLoading || totals.profit === 0}
            className="px-6 py-2.5 rounded-[10px] text-sm font-medium bg-gradient-to-br from-gold to-gold-lt text-deep shadow-[0_4px_18px_rgba(201,168,76,0.38)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {narrativeLoading ? "Generating advisory…" : "Generate AI Advisory Note"}
          </button>

          {totals.profit === 0 && (
            <p className="text-[12px] text-muted2">Enter revenue and expenses in the Input tab first.</p>
          )}

          {narrativeError && (
            <div className="rounded-[10px] border border-red/40 bg-[rgba(255,107,107,0.1)] px-4 py-3 text-sm text-red">{narrativeError}</div>
          )}

          {narrative && (
            <div className="space-y-4">
              {narrative.split("\n\n").filter(Boolean).map((para, i) => (
                <p key={i} className="text-[14px] text-muted leading-relaxed border-l-2 border-gold/30 pl-4">{para}</p>
              ))}
              <p className="text-[11px] text-muted2 mt-4">⚠ This is an AI-generated advisory note for discussion purposes only. Confirm all figures with a licensed UAE tax advisor before filing.</p>
            </div>
          )}
        </div>
      )}

      {tab === 4 && (
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 space-y-8">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Filing deadline</h3>
            <p className="text-sm text-muted mb-2">Target date (demo): 30 September 2026 · UAE</p>
            {countdown.past ? (
              <p className="text-amber text-lg font-mono">Deadline passed (demo clock).</p>
            ) : (
              <p className="text-2xl font-mono text-gold-lt">
                {countdown.days}d {countdown.hours}h {countdown.minutes}m remaining
              </p>
            )}
          </div>

          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Status pipeline</h3>
            <div className="flex flex-col gap-3">
              {FILING_STAGES.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setFilingStage(i)}
                  className={`flex items-center gap-3 rounded-[10px] border px-4 py-3 text-left text-[13px] transition-all ${
                    i === filingStage
                      ? "border-border-g bg-gold-pale text-gold-lt"
                      : i < filingStage
                        ? "border-green/30 text-green"
                        : "border-border text-muted hover:border-border-g"
                  }`}
                >
                  <span className="font-mono text-xs w-6">{i + 1}</span>
                  {label}
                  {i < filingStage && <span className="ml-auto text-xs">Done</span>}
                </button>
              ))}
            </div>
          </div>

          <div>
            <button
              type="button"
              disabled
              className="px-6 py-3 rounded-[10px] text-sm font-medium bg-[rgba(255,255,255,0.06)] text-muted2 border border-border cursor-not-allowed opacity-70"
            >
              Download PDF pack
            </button>
          </div>
        </div>
      )}
    </>
  );
}
