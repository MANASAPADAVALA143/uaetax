"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/lib/api";

interface VatReturnOption {
  return_id: number;
  period_start: string | null;
  period_end: string | null;
  output_vat: number;
  input_vat: number;
  net_vat: number;
  status: string;
}

interface VatMovement {
  gl_input_vat: number;
  gl_output_vat: number;
  gl_net_position: number;
  return_input_vat: number;
  return_output_vat: number;
  return_net: number;
  input_difference: number;
  output_difference: number;
  net_difference: number;
  is_reconciled: boolean;
}

interface Transaction {
  date: string;
  voucher_no: string;
  party: string;
  party_trn: string;
  taxable_amount: number;
  tax_rate_pct: number;
  vat_amount: number;
  classification: string;
  tax_claim: string;
  debit: number;
  credit: number;
  flagged: boolean;
  category?: string;
}

interface Discrepancy {
  title: string;
  severity: string;
  gl_amount: number;
  return_amount: number;
  difference: number;
  likely_cause: string;
  action: string;
}

interface ReconcileResponse {
  vat_movement: VatMovement;
  transactions: Transaction[];
  discrepancies: Discrepancy[];
  row_count: number;
  pdf_base64: string;
  excel_base64: string;
  reconciliation_id: string;
}

interface HistoryRow {
  id: string;
  period: string;
  net_difference: number;
  is_reconciled: boolean;
  created_at: string | null;
}

type TxFilter = "all" | "input" | "output" | "non-claimable" | "flagged";

const STEPS = [
  "Reading journal entries...",
  "Identifying VAT accounts...",
  "Mapping to VAT treatments...",
  "Comparing against VAT return...",
  "Generating reconciliation report...",
];

function fmtAed(n: number): string {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function downloadBase64(base64: string, filename: string, mime: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function classificationStyle(classification: string): string {
  const c = classification.toLowerCase();
  if (c.includes("input")) return "text-blue-300 bg-blue-900/30 border-blue-400/30";
  if (c.includes("output")) return "text-green bg-green/20 border-green/30";
  if (c.includes("reverse")) return "text-purple-300 bg-purple-900/30 border-purple-400/30";
  if (c.includes("non-claimable") || c.includes("blocked")) return "text-red bg-red/15 border-red/30";
  return "text-gray-300 bg-white/5 border-white/10";
}

function periodLabel(r: VatReturnOption): string {
  const s = r.period_start?.slice(0, 10) ?? "?";
  const e = r.period_end?.slice(0, 10) ?? "?";
  return `#${r.return_id} — ${s} to ${e} (${fmtAed(r.net_vat)} net)`;
}

export default function VatVsAccountsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [returns, setReturns] = useState<VatReturnOption[]>([]);
  const [vatReturnId, setVatReturnId] = useState<string>("");
  const [useManual, setUseManual] = useState(false);
  const [manualOutput, setManualOutput] = useState("");
  const [manualInput, setManualInput] = useState("");
  const [period, setPeriod] = useState("Q1 2026 Jan-Mar");
  const [companyTrn, setCompanyTrn] = useState("");
  const [loading, setLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReconcileResponse | null>(null);
  const [filter, setFilter] = useState<TxFilter>("all");
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const fetchReturns = useCallback(async () => {
    try {
      const { data } = await apiClient.get<VatReturnOption[]>("/api/vat-accounts/returns");
      setReturns(data);
    } catch {
      setReturns([]);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const { data } = await apiClient.get<{ reconciliations: HistoryRow[] }>("/api/vat-accounts/history");
      setHistory(data.reconciliations ?? []);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    fetchReturns();
    fetchHistory();
  }, [fetchReturns, fetchHistory]);

  const onFileChange = async (f: File | null) => {
    setFile(f);
    setResult(null);
    setError(null);
    if (!f) {
      setRowCount(null);
      return;
    }
    const text = await f.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    setRowCount(Math.max(0, lines.length - 1));
  };

  const filteredTransactions = useMemo(() => {
    if (!result) return [];
    const txs = result.transactions;
    if (filter === "all") return txs;
    if (filter === "input") return txs.filter((t) => t.classification.includes("Input"));
    if (filter === "output") return txs.filter((t) => t.classification.includes("Output"));
    if (filter === "non-claimable") return txs.filter((t) => t.classification.includes("Non-Claimable") || t.tax_claim === "Blocked");
    return txs.filter((t) => t.flagged);
  }, [result, filter]);

  const runReconciliation = async () => {
    if (!file) {
      setError("Upload a journal entries or trial balance file first.");
      return;
    }
    if (!useManual && !vatReturnId) {
      setError("Select a VAT return or switch to manual input/output VAT amounts.");
      return;
    }
    if (useManual && (manualOutput === "" || manualInput === "")) {
      setError("Enter both Output VAT and Input VAT amounts.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setStepIndex(0);

    const stepTimer = window.setInterval(() => {
      setStepIndex((i) => (i < STEPS.length - 1 ? i + 1 : i));
    }, 700);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("period", period);
      form.append("company_trn", companyTrn);
      if (!useManual && vatReturnId) {
        form.append("vat_return_id", vatReturnId);
      } else {
        form.append("manual_output_vat", manualOutput);
        form.append("manual_input_vat", manualInput);
      }

      const { data } = await apiClient.post<ReconcileResponse>("/api/vat-accounts/reconcile", form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120_000,
      });
      setResult(data);
      setStepIndex(STEPS.length - 1);
      fetchHistory();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Reconciliation failed. Check your file and return figures.";
      setError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      window.clearInterval(stepTimer);
      setLoading(false);
    }
  };

  const markReconciled = async () => {
    if (!result?.reconciliation_id) return;
    try {
      await apiClient.patch(`/api/vat-accounts/${result.reconciliation_id}/mark-reconciled`);
      setResult({
        ...result,
        vat_movement: { ...result.vat_movement, is_reconciled: true, net_difference: 0 },
      });
      fetchHistory();
    } catch {
      setError("Could not mark as reconciled.");
    }
  };

  const movement = result?.vat_movement;

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-white">VAT Reconciliation vs Accounts</h1>
        <p className="text-gray-400 mt-1">
          Compare VAT declared in your return against VAT posted in your accounting system
        </p>
      </div>

      {/* Section 1 — Upload */}
      <section className="rounded-xl border border-white/10 bg-[#1E3A5F]/40 p-6 space-y-5">
        <div className="grid md:grid-cols-2 gap-5">
          <div
            className="border-2 border-dashed border-[#C8A951]/50 rounded-lg p-6 text-center cursor-pointer hover:border-[#C8A951] transition-colors"
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            />
            <div className="text-3xl mb-2">📁</div>
            <p className="font-medium text-white">Upload Journal Entries / Trial Balance</p>
            <p className="text-sm text-gray-400 mt-1">From your ERP, Tally, Zoho, QuickBooks or Excel</p>
            <p className="text-xs text-gray-500 mt-2">.xlsx, .xls, .csv</p>
            {file && (
              <p className="mt-3 text-sm text-[#C8A951]">
                {file.name}
                {rowCount !== null ? ` — ${rowCount} rows` : ""}
              </p>
            )}
          </div>

          <div className="border border-white/10 rounded-lg p-6 space-y-4">
            <p className="font-medium text-white">Select VAT Return to Reconcile</p>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={useManual}
                onChange={(e) => setUseManual(e.target.checked)}
                className="rounded"
              />
              Enter manual Output / Input VAT instead
            </label>
            {!useManual ? (
              <select
                value={vatReturnId}
                onChange={(e) => setVatReturnId(e.target.value)}
                className="w-full rounded-lg bg-[#0f1f33] border border-white/20 px-3 py-2 text-white text-sm"
              >
                <option value="">— Select VAT return —</option>
                {returns.map((r) => (
                  <option key={r.return_id} value={String(r.return_id)}>
                    {periodLabel(r)}
                  </option>
                ))}
              </select>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400">Output VAT (AED)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={manualOutput}
                    onChange={(e) => setManualOutput(e.target.value)}
                    placeholder="11900"
                    className="w-full mt-1 rounded-lg bg-[#0f1f33] border border-white/20 px-3 py-2 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Input VAT (AED)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    placeholder="8150"
                    className="w-full mt-1 rounded-lg bg-[#0f1f33] border border-white/20 px-3 py-2 text-white text-sm"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-400">Period</label>
            <input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full mt-1 rounded-lg bg-[#0f1f33] border border-white/20 px-3 py-2 text-white text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Company TRN</label>
            <input
              value={companyTrn}
              onChange={(e) => setCompanyTrn(e.target.value)}
              placeholder="100xxxxxxxxxxxx"
              className="w-full mt-1 rounded-lg bg-[#0f1f33] border border-white/20 px-3 py-2 text-white text-sm"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red/40 bg-red/10 px-4 py-3 text-red text-sm">{error}</div>
        )}

        <button
          type="button"
          onClick={runReconciliation}
          disabled={loading}
          className="w-full py-3 rounded-lg font-semibold text-[#1E3A5F] bg-[#C8A951] hover:bg-[#d4b85c] disabled:opacity-50 transition-colors"
        >
          {loading ? "Analysing…" : "⚖️ Run VAT Reconciliation"}
        </button>
      </section>

      {/* Section 2 — Processing steps */}
      {loading && stepIndex >= 0 && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-2">
          {STEPS.map((step, i) => (
            <div key={step} className={`text-sm ${i <= stepIndex ? "text-green" : "text-gray-500"}`}>
              {i <= stepIndex ? "✅" : "⏳"} {step}
            </div>
          ))}
        </section>
      )}

      {/* Section 3 — VAT Movement Balance */}
      {movement && (
        <section className="rounded-xl border border-white/10 overflow-hidden">
          <div className="bg-[#1E3A5F] px-5 py-3 flex items-center justify-between">
            <h2 className="font-semibold text-white">VAT Movement Balance</h2>
            {movement.is_reconciled ? (
              <span className="text-green text-sm font-medium">✅ Reconciled</span>
            ) : (
              <span className="text-red text-sm font-medium">
                🔴 Discrepancy Found — {fmtAed(Math.abs(movement.net_difference))}
              </span>
            )}
          </div>
          <div className="divide-y divide-white/10">
            <div className="px-5 py-2 text-xs uppercase tracking-wide text-gray-500 bg-white/5">From GL</div>
            {[
              ["Input Tax (Purchases) — from GL", movement.gl_input_vat],
              ["Output Tax (Sales) — from GL", movement.gl_output_vat],
              ["Net Tax Position (Current)", movement.gl_net_position],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex justify-between px-5 py-3 text-sm">
                <span className="text-gray-300">{label}</span>
                <span className="text-white font-medium">{fmtAed(val as number)}</span>
              </div>
            ))}
            <div className="px-5 py-2 text-xs uppercase tracking-wide text-gray-500 bg-white/5">From VAT Return</div>
            {[
              ["Input Tax (Purchases) — from Return", movement.return_input_vat],
              ["Output Tax (Sales) — from Return", movement.return_output_vat],
              ["Net Tax Position (Till Date)", movement.return_net],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex justify-between px-5 py-3 text-sm">
                <span className="text-gray-300">{label}</span>
                <span className="text-white font-medium">{fmtAed(val as number)}</span>
              </div>
            ))}
            <div className="px-5 py-2 text-xs uppercase tracking-wide text-gray-500 bg-white/5">Differences</div>
            {[
              ["Input Difference", movement.input_difference],
              ["Output Difference", movement.output_difference],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex justify-between px-5 py-3 text-sm">
                <span className="text-gray-300">{label}</span>
                <span className={Math.abs(val as number) > 1 ? "text-red" : "text-green"}>{fmtAed(val as number)}</span>
              </div>
            ))}
            <div
              className={`flex justify-between px-5 py-4 text-base font-bold ${
                movement.is_reconciled ? "bg-green/15 text-green" : "bg-red/15 text-red"
              }`}
            >
              <span>NET DIFFERENCE</span>
              <span>{fmtAed(movement.net_difference)}</span>
            </div>
          </div>
        </section>
      )}

      {/* Section 4 — Transactions */}
      {result && (
        <section className="rounded-xl border border-white/10 p-5 space-y-4">
          <h2 className="font-semibold text-white">VAT Transactions from Accounts</h2>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "All"],
                ["input", "Input Tax"],
                ["output", "Output Tax"],
                ["non-claimable", "Non-Claimable"],
                ["flagged", "Flagged"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`px-3 py-1 rounded-full text-xs border ${
                  filter === key ? "bg-[#C8A951] text-[#1E3A5F] border-[#C8A951]" : "border-white/20 text-gray-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-white/10">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Voucher No</th>
                  <th className="py-2 pr-3">Party</th>
                  <th className="py-2 pr-3">Party TRN</th>
                  <th className="py-2 pr-3 text-right">Taxable</th>
                  <th className="py-2 pr-3 text-right">Rate %</th>
                  <th className="py-2 pr-3 text-right">VAT</th>
                  <th className="py-2 pr-3">Classification</th>
                  <th className="py-2 pr-3">Tax Claim</th>
                  <th className="py-2 pr-3 text-right">DR</th>
                  <th className="py-2 pr-3 text-right">CR</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((t, i) => (
                  <tr key={`${t.voucher_no}-${i}`} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2 pr-3 text-gray-300">{t.date || "—"}</td>
                    <td className="py-2 pr-3">{t.voucher_no}</td>
                    <td className="py-2 pr-3">{t.party || "—"}</td>
                    <td className="py-2 pr-3">
                      <span className={t.party_trn?.toUpperCase() === "NOT-REGISTERED" || !t.party_trn ? "text-amber" : ""}>
                        {t.party_trn || "—"}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right">{fmtAed(t.taxable_amount)}</td>
                    <td className="py-2 pr-3 text-right">{t.tax_rate_pct}%</td>
                    <td className="py-2 pr-3 text-right font-medium">{fmtAed(t.vat_amount)}</td>
                    <td className="py-2 pr-3">
                      <span className={`inline-block px-2 py-0.5 rounded border text-xs ${classificationStyle(t.classification)}`}>
                        {t.classification}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{t.tax_claim}</td>
                    <td className="py-2 pr-3 text-right">{t.debit ? fmtAed(t.debit) : "—"}</td>
                    <td className="py-2 pr-3 text-right">{t.credit ? fmtAed(t.credit) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Section 5 — Discrepancies */}
      {result && result.discrepancies.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-semibold text-white">Discrepancies Found</h2>
          {result.discrepancies.map((d) => (
            <div key={d.title} className="rounded-xl border border-red/30 bg-red/5 p-5 space-y-2">
              <p className="font-medium text-red">🔴 {d.title}</p>
              <p className="text-sm text-gray-300">GL shows: {fmtAed(d.gl_amount)}</p>
              <p className="text-sm text-gray-300">Return shows: {fmtAed(d.return_amount)}</p>
              <p className="text-sm text-white font-medium">Difference: {fmtAed(d.difference)}</p>
              <p className="text-sm text-gray-400">Likely cause: {d.likely_cause}</p>
              <p className="text-sm text-[#C8A951]">Action: {d.action}</p>
            </div>
          ))}
        </section>
      )}

      {/* Section 6 — Export */}
      {result && (
        <section className="flex flex-wrap gap-3">
          {result.pdf_base64 && (
            <button
              type="button"
              onClick={() => downloadBase64(result.pdf_base64, `vat-recon-${period.replace(/\s+/g, "-")}.pdf`, "application/pdf")}
              className="px-4 py-2 rounded-lg border border-[#C8A951]/50 text-[#C8A951] hover:bg-[#C8A951]/10 text-sm"
            >
              📄 Download Forensic Report PDF
            </button>
          )}
          {result.excel_base64 && (
            <button
              type="button"
              onClick={() =>
                downloadBase64(
                  result.excel_base64,
                  `vat-recon-${period.replace(/\s+/g, "-")}.xlsx`,
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                )
              }
              className="px-4 py-2 rounded-lg border border-white/20 text-gray-200 hover:bg-white/5 text-sm"
            >
              📊 Download Excel Reconciliation
            </button>
          )}
          <button
            type="button"
            onClick={markReconciled}
            className="px-4 py-2 rounded-lg bg-green/20 border border-green/40 text-green text-sm hover:bg-green/30"
          >
            ✅ Mark as Reconciled
          </button>
        </section>
      )}

      {/* History */}
      {history.length > 0 && (
        <section className="rounded-xl border border-white/10 p-5">
          <h2 className="font-semibold text-white mb-3">Recent Reconciliations</h2>
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="flex justify-between text-sm border-b border-white/5 py-2">
                <span className="text-gray-300">{h.period}</span>
                <span className={h.is_reconciled ? "text-green" : "text-red"}>
                  {h.is_reconciled ? "✅ Reconciled" : fmtAed(h.net_difference)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
