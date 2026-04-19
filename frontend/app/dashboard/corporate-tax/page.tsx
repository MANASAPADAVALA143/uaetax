"use client";

import { useMemo, useState } from "react";
import { FileDown } from "lucide-react";

const THRESHOLD_375K = 375_000;
const SBR_REVENUE_CAP = 3_000_000;
const FILING_DEADLINE = new Date("2026-09-30T23:59:59");

type TabId = "input" | "calc" | "checklist" | "advisory" | "filing";

type MoneyLine = { id: string; label: string; amount: number };

function newLine(prefix: string): MoneyLine {
  return { id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, label: "", amount: 0 };
}

function daysUntil(target: Date): number {
  return Math.ceil((target.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

const CHECKLIST_ITEMS: string[] = [
  "Trial balance and GL mapped to CT trial balance format",
  "Revenue recognition policy aligned with accounting standards",
  "Related-party transactions schedule prepared",
  "Small Business Relief eligibility documented (revenue ≤ AED 3M)",
  "Free zone / qualifying income position reviewed",
  "Non-deductible expenses and add-backs identified",
  "Tax losses and utilisation schedule (if applicable)",
  "Withholding tax and foreign tax credits reviewed",
  "EmaraTax registration and payment method verified",
  "Board / management sign-off on CT return figures",
];

type EntityType = "mainland_resident" | "free_zone_qfz" | "branch_foreign" | "other";

export default function CorporateTaxPage() {
  const [tab, setTab] = useState<TabId>("input");

  const [revenue, setRevenue] = useState<number>(0);
  const [expenses, setExpenses] = useState<number>(0);
  const [addbacks, setAddbacks] = useState<MoneyLine[]>([newLine("ab")]);
  const [deductions, setDeductions] = useState<MoneyLine[]>([newLine("dd")]);
  const [entityType, setEntityType] = useState<EntityType>("mainland_resident");
  const [flagSbr, setFlagSbr] = useState(false);
  const [flagLossCf, setFlagLossCf] = useState(false);
  const [flagQfzReview, setFlagQfzReview] = useState(false);

  const [checklist, setChecklist] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(CHECKLIST_ITEMS.map((_, i) => [i, false])) as Record<number, boolean>
  );

  const [filingStage, setFilingStage] = useState(0);
  const filingStages = ["Draft", "Data complete", "Partner review", "Ready to file", "Filed"];

  const breakdown = useMemo(() => {
    const sumLines = (lines: MoneyLine[]) =>
      lines.reduce((s, l) => s + (Number.isFinite(l.amount) ? l.amount : 0), 0);
    const addSum = sumLines(addbacks);
    const dedSum = sumLines(deductions);
    const accountingProfit = revenue - expenses;
    const taxableIncome = Math.max(0, accountingProfit + addSum - dedSum);

    const steps: { label: string; amount: number; note?: string }[] = [
      { label: "Revenue", amount: revenue },
      { label: "Less: operating expenses", amount: -expenses },
      { label: "Accounting profit (simplified)", amount: accountingProfit },
      { label: "Add: non-deductible / add-backs (total)", amount: addSum },
      { label: "Less: deductions / reliefs in scope (total)", amount: -dedSum },
      { label: "Taxable income (proxy)", amount: taxableIncome },
    ];

    if (flagSbr && revenue <= SBR_REVENUE_CAP) {
      return {
        taxableIncome,
        taxDue: 0,
        regime: "SBR" as const,
        steps: [
          ...steps,
          {
            label: "Small Business Relief (revenue ≤ AED 3M)",
            amount: 0,
            note: "Illustrative 0% CT under elected SBR for qualifying resident (UI model only).",
          },
        ],
      };
    }

    const band0 = Math.min(taxableIncome, THRESHOLD_375K);
    const band9Base = Math.max(0, taxableIncome - THRESHOLD_375K);
    const tax9 = band9Base * 0.09;

    return {
      taxableIncome,
      taxDue: tax9,
      regime: "STANDARD" as const,
      steps: [
        ...steps,
        { label: "First AED 375,000 of taxable income @ 0%", amount: band0 * 0 },
        {
          label: "Balance @ 9%",
          amount: tax9,
          note: `Taxable slice above threshold: AED ${band9Base.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`,
        },
      ],
    };
  }, [revenue, expenses, addbacks, deductions, flagSbr]);

  const daysLeft = daysUntil(FILING_DEADLINE);

  const tabs: { id: TabId; label: string }[] = [
    { id: "input", label: "Inputs" },
    { id: "calc", label: "Calculation" },
    { id: "checklist", label: "Checklist" },
    { id: "advisory", label: "Advisory" },
    { id: "filing", label: "Filing" },
  ];

  const updateLine = (kind: "add" | "ded", id: string, field: "label" | "amount", value: string | number) => {
    const setter = kind === "add" ? setAddbacks : setDeductions;
    setter((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        if (field === "label") return { ...row, label: String(value) };
        const n = typeof value === "number" ? value : parseFloat(String(value)) || 0;
        return { ...row, amount: n };
      })
    );
  };

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Corporate Tax</h1>
        <p className="text-[#7A9BB5]">
          UAE CT estimate (client-side model): 0% on first AED 375k of taxable income, 9% above; Small Business
          Relief at 0% when elected and revenue ≤ AED 3M. Not legal advice — backend wiring later.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-8 border-b border-[rgba(78,168,255,0.12)] pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-[rgba(201,168,76,0.15)] text-[#E8C96A] border border-b-0 border-[rgba(201,168,76,0.25)]"
                : "text-[#7A9BB5] hover:text-white border border-transparent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "input" && (
        <div className="space-y-8">
          <section className="bg-[#0A1A35] border border-[rgba(78,168,255,0.12)] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Core figures (AED)</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm text-[#7A9BB5] mb-2">Revenue</label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={revenue || ""}
                  onChange={(e) => setRevenue(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#071228] border border-[rgba(78,168,255,0.22)] rounded-lg px-4 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-[#7A9BB5] mb-2">Expenses</label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={expenses || ""}
                  onChange={(e) => setExpenses(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#071228] border border-[rgba(78,168,255,0.22)] rounded-lg px-4 py-2 text-white"
                />
              </div>
            </div>
          </section>

          <section className="bg-[#0A1A35] border border-[rgba(78,168,255,0.12)] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Add-backs</h2>
              <button
                type="button"
                onClick={() => setAddbacks((a) => [...a, newLine("ab")])}
                className="text-sm text-[#E8C96A] hover:underline"
              >
                + Add row
              </button>
            </div>
            <div className="space-y-3">
              {addbacks.map((row) => (
                <div key={row.id} className="flex flex-wrap gap-2 items-end">
                  <input
                    placeholder="Description"
                    value={row.label}
                    onChange={(e) => updateLine("add", row.id, "label", e.target.value)}
                    className="flex-1 min-w-[160px] bg-[#071228] border border-[rgba(78,168,255,0.22)] rounded-lg px-3 py-2 text-sm text-white"
                  />
                  <input
                    type="number"
                    placeholder="Amount"
                    value={row.amount || ""}
                    onChange={(e) => updateLine("add", row.id, "amount", parseFloat(e.target.value) || 0)}
                    className="w-36 bg-[#071228] border border-[rgba(78,168,255,0.22)] rounded-lg px-3 py-2 text-sm text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setAddbacks((a) => a.filter((r) => r.id !== row.id))}
                    className="text-sm text-[#FF6B6B] px-2"
                    disabled={addbacks.length <= 1}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-[#0A1A35] border border-[rgba(78,168,255,0.12)] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Deductions / reliefs in scope</h2>
              <button
                type="button"
                onClick={() => setDeductions((d) => [...d, newLine("dd")])}
                className="text-sm text-[#E8C96A] hover:underline"
              >
                + Add row
              </button>
            </div>
            <div className="space-y-3">
              {deductions.map((row) => (
                <div key={row.id} className="flex flex-wrap gap-2 items-end">
                  <input
                    placeholder="Description"
                    value={row.label}
                    onChange={(e) => updateLine("ded", row.id, "label", e.target.value)}
                    className="flex-1 min-w-[160px] bg-[#071228] border border-[rgba(78,168,255,0.22)] rounded-lg px-3 py-2 text-sm text-white"
                  />
                  <input
                    type="number"
                    placeholder="Amount"
                    value={row.amount || ""}
                    onChange={(e) => updateLine("ded", row.id, "amount", parseFloat(e.target.value) || 0)}
                    className="w-36 bg-[#071228] border border-[rgba(78,168,255,0.22)] rounded-lg px-3 py-2 text-sm text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setDeductions((d) => d.filter((r) => r.id !== row.id))}
                    className="text-sm text-[#FF6B6B] px-2"
                    disabled={deductions.length <= 1}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-[#0A1A35] border border-[rgba(78,168,255,0.12)] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Entity & flags</h2>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm text-[#7A9BB5] mb-2">Entity type</label>
                <select
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value as EntityType)}
                  className="w-full bg-[#071228] border border-[rgba(78,168,255,0.22)] rounded-lg px-4 py-2 text-white"
                >
                  <option value="mainland_resident">UAE mainland — resident</option>
                  <option value="free_zone_qfz">Free zone — QFZP / qualifying discussion</option>
                  <option value="branch_foreign">Foreign branch / permanent establishment</option>
                  <option value="other">Other / multiple elections</option>
                </select>
              </div>
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
                  <input type="checkbox" checked={flagSbr} onChange={(e) => setFlagSbr(e.target.checked)} className="rounded" />
                  Elect Small Business Relief (0% if revenue ≤ AED 3M — model)
                </label>
                <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
                  <input type="checkbox" checked={flagLossCf} onChange={(e) => setFlagLossCf(e.target.checked)} className="rounded" />
                  Tax losses carried forward under review
                </label>
                <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
                  <input type="checkbox" checked={flagQfzReview} onChange={(e) => setFlagQfzReview(e.target.checked)} className="rounded" />
                  Qualifying free zone income streams flagged
                </label>
              </div>
            </div>
            {entityType === "free_zone_qfz" && (
              <p className="mt-4 text-xs text-[#7A9BB5]">
                Free zone modelling is not applied in this shell — calculation still uses mainland-style bands unless SBR
                applies.
              </p>
            )}
          </section>
        </div>
      )}

      {tab === "calc" && (
        <div className="bg-[#0A1A35] border border-[rgba(78,168,255,0.12)] rounded-xl p-6 space-y-6">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="text-lg font-semibold text-white">CT liability breakdown</h2>
            <span className="text-xs font-mono uppercase text-[#E8C96A]">
              Regime: {breakdown.regime === "SBR" ? "Small Business Relief" : "Standard 0% / 9% bands"}
            </span>
          </div>
          <ul className="space-y-3">
            {breakdown.steps.map((s, i) => (
              <li
                key={i}
                className="flex flex-wrap justify-between gap-2 border-b border-[rgba(78,168,255,0.08)] pb-3 text-sm"
              >
                <div>
                  <span className="text-white">{s.label}</span>
                  {s.note && <p className="text-xs text-[#7A9BB5] mt-1">{s.note}</p>}
                </div>
                <span className="font-mono text-[#4EA8FF]">
                  {s.amount.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </li>
            ))}
          </ul>
          <div className="rounded-lg bg-[rgba(45,212,160,0.08)] border border-[rgba(45,212,160,0.2)] px-4 py-3 flex flex-wrap justify-between items-center gap-2">
            <span className="text-white font-medium">Estimated CT due (illustrative)</span>
            <span className="text-xl font-mono font-bold text-[#2DD4A0]">
              AED {breakdown.taxDue.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-xs text-[#7A9BB5]">
            Taxable income is floored at zero before rates apply.
            {flagLossCf ? " Loss carryforward is not modelled in this preview." : ""}
            {flagQfzReview ? " QFZ income allocation is not modelled here — review with your advisor." : ""}
          </p>
        </div>
      )}

      {tab === "checklist" && (
        <div className="bg-[#0A1A35] border border-[rgba(78,168,255,0.12)] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Preparation checklist</h2>
          <ul className="space-y-2">
            {CHECKLIST_ITEMS.map((item, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setChecklist((c) => ({ ...c, [i]: !c[i] }))}
                  className={`w-full text-left flex gap-3 items-start rounded-lg px-3 py-3 border transition-colors ${
                    checklist[i]
                      ? "border-[rgba(45,212,160,0.35)] bg-[rgba(45,212,160,0.08)]"
                      : "border-[rgba(78,168,255,0.12)] hover:border-[rgba(78,168,255,0.25)]"
                  }`}
                >
                  <span className="mt-0.5 text-lg">{checklist[i] ? "✓" : "○"}</span>
                  <span className={`text-sm ${checklist[i] ? "text-[#2DD4A0]" : "text-[#7A9BB5]"}`}>{item}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "advisory" && (
        <div className="bg-[#0A1A35] border border-[rgba(78,168,255,0.12)] rounded-xl p-12 text-center">
          <p className="text-[#7A9BB5] text-lg">AI narrative will appear here</p>
        </div>
      )}

      {tab === "filing" && (
        <div className="space-y-8">
          <div className="bg-[#0A1A35] border border-[rgba(78,168,255,0.12)] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-2">Filing deadline</h2>
            <p className="text-3xl font-mono text-[#E8C96A] mb-1">30 September 2026</p>
            <p className="text-sm text-[#7A9BB5]">
              {daysLeft > 0 ? `${daysLeft} calendar days remaining (illustrative deadline).` : "Deadline passed (demo)."}
            </p>
          </div>

          <div className="bg-[#0A1A35] border border-[rgba(78,168,255,0.12)] rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Status pipeline</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {filingStages.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setFilingStage(i)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold border transition-colors ${
                    i === filingStage
                      ? "border-[#E8C96A] bg-[rgba(201,168,76,0.15)] text-[#E8C96A]"
                      : i < filingStage
                        ? "border-[rgba(45,212,160,0.35)] text-[#2DD4A0]"
                        : "border-[rgba(78,168,255,0.15)] text-[#7A9BB5]"
                  }`}
                >
                  {i + 1}. {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-[#7A9BB5]">Click a stage to simulate workflow (local state only).</p>
          </div>

          <div className="bg-[#0A1A35] border border-[rgba(78,168,255,0.12)] rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white mb-1">CT return pack (PDF)</h2>
              <p className="text-sm text-[#7A9BB5]">Export will connect to the backend once filing APIs exist.</p>
            </div>
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-2 rounded-lg border border-[rgba(78,168,255,0.2)] px-4 py-2 text-sm font-semibold text-[#3A5070] cursor-not-allowed opacity-60"
            >
              <FileDown className="h-4 w-4" />
              Download PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
