"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";

const STORAGE_RETURNS = "gulftax_vat_returns";

interface StoredReturn {
  return_id: number;
  period_start: string;
  period_end: string;
}

interface MismatchRow {
  invoice_number?: string;
  invoice?: string;
  issue: string;
  transaction_amount?: number;
  return_amount?: number;
  difference?: number;
}

interface ReconcileResult {
  status: string;
  difference_aed: number;
  mismatches: MismatchRow[];
  recommendation: string;
}

function loadReturns(): StoredReturn[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_RETURNS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function fmtAed(n: number | undefined): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

export default function ReconPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const [options, setOptions] = useState<StoredReturn[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [manualId, setManualId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReconcileResult | null>(null);

  const refreshOptions = useCallback(() => {
    setOptions(loadReturns());
  }, []);

  useEffect(() => {
    refreshOptions();
    const onFocus = () => refreshOptions();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshOptions]);

  const effectiveReturnId = selectedId || manualId.trim();

  const handleReconcile = async () => {
    const id = parseInt(effectiveReturnId, 10);
    if (!Number.isFinite(id) || id < 1) {
      setError("Select a VAT return from the list or enter a valid return ID.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await axios.post<ReconcileResult>(
        `${apiUrl}/api/vat/reconcile/${id}`
      );
      setResult(data);
    } catch (e: unknown) {
      const ax = axios.isAxiosError(e);
      const msg = ax
        ? (e.response?.data as { detail?: string })?.detail || e.message
        : "Reconciliation failed";
      setError(typeof msg === "string" ? msg : "Reconciliation failed");
    } finally {
      setLoading(false);
    }
  };

  const rows: MismatchRow[] = result?.mismatches || [];

  const exportCsv = () => {
    const header = ["Invoice / ref", "Issue", "Transaction amount", "Return amount", "Difference"];
    const lines = [header.join(",")];
    for (const m of rows) {
      const inv = (m.invoice_number ?? m.invoice ?? "").toString().replace(/"/g, '""');
      const issue = (m.issue ?? "").replace(/"/g, '""');
      lines.push(
        [
          `"${inv}"`,
          `"${issue}"`,
          m.transaction_amount ?? "",
          m.return_amount ?? "",
          m.difference ?? "",
        ].join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reconciliation_${effectiveReturnId || "export"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="mb-7">
        <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">
          // Recon Bot
        </div>
        <h2 className="font-playfair text-[26px] font-bold">VAT return reconciliation</h2>
        <p className="text-[13px] text-muted mt-1">
          Returns generated in this browser are listed below; you can also enter a return ID from
          the API.
        </p>
      </div>

      <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 mb-6 space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
              VAT return
            </label>
            <select
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value);
                if (e.target.value) setManualId("");
              }}
              className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
            >
              <option value="">— Select —</option>
              {options.map((o) => (
                <option key={o.return_id} value={String(o.return_id)}>
                  #{o.return_id} · {o.period_start} → {o.period_end}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
              Or return ID
            </label>
            <input
              value={manualId}
              onChange={(e) => {
                setManualId(e.target.value);
                if (e.target.value) setSelectedId("");
              }}
              placeholder="e.g. 12"
              className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm font-mono focus:border-border-g focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleReconcile}
            disabled={loading || !effectiveReturnId}
            className="px-6 py-2.5 rounded-[10px] text-sm font-medium bg-gradient-to-br from-gold to-gold-lt text-deep shadow-[0_4px_18px_rgba(201,168,76,0.38)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Running…" : "Run reconciliation"}
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="px-5 py-2.5 rounded-[10px] text-sm font-medium border border-border text-muted hover:border-border-g hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={refreshOptions}
            className="px-4 py-2.5 rounded-[10px] text-sm text-muted border border-border hover:border-border-g"
          >
            Refresh list
          </button>
        </div>

        {options.length === 0 && (
          <p className="text-[12px] text-muted2">
            No returns in memory yet. Generate one on{" "}
            <Link href="/dashboard/vat-return" className="text-gold-lt underline">
              VAT Return
            </Link>{" "}
            or type a return ID.
          </p>
        )}

        {error && (
          <div className="rounded-[10px] border border-red/40 bg-[rgba(255,107,107,0.1)] px-4 py-3 text-sm text-red">
            {error}
          </div>
        )}
      </div>

      {result && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-muted2 uppercase text-[11px]">Status</span>
              <div className="font-mono text-gold-lt">{result.status}</div>
            </div>
            <div>
              <span className="text-muted2 uppercase text-[11px]">Total difference</span>
              <div className="font-mono text-white">{fmtAed(result.difference_aed)}</div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[rgba(4,12,30,0.95)] text-muted2 uppercase text-[11px]">
                <tr>
                  <th className="px-4 py-3">Invoice / ref</th>
                  <th className="px-4 py-3">Issue</th>
                  <th className="px-4 py-3 text-right">Difference</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-muted text-center">
                      No mismatches above threshold — return aligns with invoices.
                    </td>
                  </tr>
                ) : (
                  rows.map((m, i) => (
                    <tr key={i} className="border-t border-border text-muted">
                      <td className="px-4 py-3 font-mono text-white">
                        {m.invoice_number ?? m.invoice ?? "—"}
                      </td>
                      <td className="px-4 py-3">{m.issue}</td>
                      <td className="px-4 py-3 text-right font-mono text-amber">
                        {fmtAed(m.difference)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-border bg-[rgba(4,12,30,0.5)] px-5 py-4">
            <div className="text-[11px] text-muted2 uppercase mb-2">Recommendation</div>
            <p className="text-[13px] text-muted leading-relaxed whitespace-pre-wrap">
              {result.recommendation}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
