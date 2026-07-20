"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { apiClient } from "@/lib/api";

interface VatReturnOption {
  return_id: number;
  period_start: string;
  period_end: string;
  status?: string;
  box8_vat_payable_or_refundable?: number;
}

interface MismatchRow {
  box?: string;
  invoice_number?: string;
  invoice?: string;
  issue: string;
  invoice_amount?: number;
  transaction_amount?: number;
  return_amount?: number;
  difference?: number;
}

interface ReconcileResult {
  status: string;
  difference_aed: number;
  mismatches: MismatchRow[];
  recommendation: string;
  found?: boolean;
  reconciliation_id?: number;
  created_at?: string;
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

function periodLabel(start: string, end: string): string {
  return `${String(start).slice(0, 10)} → ${String(end).slice(0, 10)}`;
}

export default function ReconPage() {
  const [options, setOptions] = useState<VatReturnOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [manualId, setManualId] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [loadedFromDb, setLoadedFromDb] = useState(false);

  const refreshOptions = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<VatReturnOption[]>("/api/vat/returns", {
        params: { limit: 50 },
      });
      const list = Array.isArray(data) ? data : [];
      setOptions(list);
      if (list.length > 0) {
        setSelectedId((prev) => {
          if (prev && list.some((r) => String(r.return_id) === prev)) return prev;
          return String(list[0].return_id);
        });
      }
    } catch (e: unknown) {
      const ax = axios.isAxiosError(e);
      const msg = ax
        ? (e.response?.data as { detail?: string })?.detail || e.message
        : "Failed to load VAT returns";
      setError(typeof msg === "string" ? msg : "Failed to load VAT returns");
      setOptions([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshOptions();
  }, [refreshOptions]);

  const effectiveReturnId = selectedId || manualId.trim();

  const loadLatestRecon = useCallback(async (id: number) => {
    try {
      const { data } = await apiClient.get<ReconcileResult>(
        `/api/vat/reconcile/${id}/latest`
      );
      if (data?.found && data.status) {
        setResult(data);
        setLoadedFromDb(true);
      } else {
        setResult(null);
        setLoadedFromDb(false);
      }
    } catch {
      // No prior recon is fine — user can run a new one
      setResult(null);
      setLoadedFromDb(false);
    }
  }, []);

  useEffect(() => {
    const id = parseInt(effectiveReturnId, 10);
    if (!Number.isFinite(id) || id < 1) {
      setResult(null);
      setLoadedFromDb(false);
      return;
    }
    void loadLatestRecon(id);
  }, [effectiveReturnId, loadLatestRecon]);

  const handleReconcile = async () => {
    const id = parseInt(effectiveReturnId, 10);
    if (!Number.isFinite(id) || id < 1) {
      setError("Select a VAT return from the list or enter a valid return ID.");
      return;
    }
    setLoading(true);
    setError(null);
    setLoadedFromDb(false);
    try {
      const { data } = await apiClient.post<ReconcileResult>(`/api/vat/reconcile/${id}`);
      setResult(data);
    } catch (e: unknown) {
      const ax = axios.isAxiosError(e);
      const msg = ax
        ? (e.response?.data as { detail?: string })?.detail || e.message
        : "Reconciliation failed";
      setError(typeof msg === "string" ? msg : "Reconciliation failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const rows: MismatchRow[] = result?.mismatches || [];

  const exportCsv = () => {
    const header = ["Box / Invoice", "Issue", "Transaction amount", "Return amount", "Difference"];
    const lines = [header.join(",")];
    for (const m of rows) {
      const inv = (m.box ?? m.invoice_number ?? m.invoice ?? "").toString().replace(/"/g, '""');
      const issue = (m.issue ?? "").replace(/"/g, '""');
      const txAmt = m.transaction_amount ?? m.invoice_amount ?? "";
      lines.push(
        [`"${inv}"`, `"${issue}"`, txAmt, m.return_amount ?? "", m.difference ?? ""].join(",")
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
          Compares verified transactions against VAT returns stored for your company. Results are
          saved to the database (not the browser).
        </p>
      </div>

      <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 mb-6 space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
              VAT return (from database)
            </label>
            <select
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value);
                if (e.target.value) setManualId("");
              }}
              disabled={listLoading}
              className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none disabled:opacity-50"
            >
              <option value="">{listLoading ? "Loading…" : "— Select —"}</option>
              {options.map((o) => (
                <option key={o.return_id} value={String(o.return_id)}>
                  #{o.return_id} · {periodLabel(o.period_start, o.period_end)}
                  {o.status ? ` · ${o.status}` : ""}
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
            onClick={() => void refreshOptions()}
            disabled={listLoading}
            className="px-4 py-2.5 rounded-[10px] text-sm text-muted border border-border hover:border-border-g disabled:opacity-50"
          >
            {listLoading ? "Refreshing…" : "Refresh list"}
          </button>
        </div>

        {!listLoading && options.length === 0 && (
          <p className="text-[12px] text-muted2">
            No VAT returns found for this company. Generate one on{" "}
            <Link href="/dashboard/vat-return" className="text-gold-lt underline">
              VAT Return
            </Link>
            .
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
          <div className="flex flex-wrap gap-6 text-sm items-end">
            <div>
              <span className="text-muted2 uppercase text-[11px]">Status</span>
              <div className="font-mono text-gold-lt">{result.status}</div>
            </div>
            <div>
              <span className="text-muted2 uppercase text-[11px]">Total difference</span>
              <div className="font-mono text-white">{fmtAed(result.difference_aed)}</div>
            </div>
            {loadedFromDb && (
              <div className="text-[11px] text-muted2 font-mono pb-0.5">
                Loaded from database
                {result.created_at
                  ? ` · ${new Date(result.created_at).toLocaleString()}`
                  : ""}
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[rgba(4,12,30,0.95)] text-muted2 uppercase text-[11px]">
                <tr>
                  <th className="px-4 py-3">Box / Invoice</th>
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
                        {m.box ?? m.invoice_number ?? m.invoice ?? "—"}
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
