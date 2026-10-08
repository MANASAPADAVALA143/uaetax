"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, Radar } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  fetchFtaApRisk,
  fetchFtaAuditChecklist,
  fetchVatTransactions,
  taxPeriodToDateRange,
  type FtaApRisk,
  type FtaAuditChecklist,
  type VatTxn,
} from "@/lib/ftaHelpers";

function currentQuarter(): string {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}

export default function AnomalyDetectionPage() {
  const { activeCompany } = useAuth();
  const activeCompanyId = activeCompany?.company_id ?? null;
  const [period, setPeriod] = useState(currentQuarter());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apRisk, setApRisk] = useState<FtaApRisk | null>(null);
  const [checklist, setChecklist] = useState<FtaAuditChecklist | null>(null);
  const [txns, setTxns] = useState<VatTxn[]>([]);

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    const { start, end } = taxPeriodToDateRange(period);
    try {
      const [risk, cl, vat] = await Promise.all([
        fetchFtaApRisk().catch(() => null),
        fetchFtaAuditChecklist(start, end).catch(() => null),
        fetchVatTransactions(200).catch(() => [] as VatTxn[]),
      ]);
      setApRisk(risk);
      setChecklist(cl);
      setTxns(vat);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load anomalies");
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, period]);

  useEffect(() => {
    void load();
  }, [load]);

  const lowConfidence = useMemo(
    () =>
      txns.filter(
        (t) => t.confidence_score != null && Number(t.confidence_score) < 70 && !t.is_verified,
      ),
    [txns],
  );

  const unclassified = useMemo(
    () => txns.filter((t) => !(t.vat_treatment || "").trim()),
    [txns],
  );

  const failItems = (checklist?.items || []).filter(
    (i) => i.status === "fail" || i.status === "warning",
  );

  // When the FTA checklist API is unavailable, surface AP risk as compliance warnings
  const derivedWarnings = useMemo(() => {
    if (failItems.length > 0 || !apRisk) return [];
    const items: { id: string; title: string; detail: string; status: "fail" | "warning" }[] = [];
    const missing = apRisk.anomaly_counts?.missing_or_invalid_trn ?? 0;
    const dupes = apRisk.anomaly_counts?.duplicate_invoices ?? 0;
    const high = apRisk.flag_counts?.high ?? 0;
    if (missing > 0) {
      items.push({
        id: "trn",
        title: "Missing or invalid supplier TRN",
        detail: `${missing} invoice flag(s) for missing/invalid TRN`,
        status: "fail",
      });
    }
    if (dupes > 0) {
      items.push({
        id: "dup",
        title: "Duplicate invoices detected",
        detail: `${dupes} duplicate invoice flag(s)`,
        status: "fail",
      });
    }
    if (high > 0) {
      items.push({
        id: "high",
        title: "High-severity AP risk flags",
        detail: `${high} HIGH severity anomaly flag(s) across invoice flow`,
        status: "warning",
      });
    }
    if ((apRisk.total_vat_at_risk_aed ?? 0) > 0) {
      items.push({
        id: "vat-risk",
        title: "VAT at risk from AP anomalies",
        detail: `AED ${Number(apRisk.total_vat_at_risk_aed).toLocaleString("en-AE", { minimumFractionDigits: 2 })} flagged`,
        status: "warning",
      });
    }
    return items;
  }, [apRisk, failItems.length]);

  const warnings =
    failItems.length > 0
      ? failItems.map((i) => ({
          id: i.id,
          title: i.title,
          detail: i.detail,
          status: i.status as "fail" | "warning",
        }))
      : derivedWarnings;

  const fmt = (n: number) =>
    `AED ${Number(n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2 })}`;

  return (
    <div>
      <p className="text-[11px] font-mono uppercase tracking-widest text-amber-500 mb-1">VAT Advanced</p>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Radar className="w-7 h-7 text-amber-400" />
            Anomaly Detection
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Tax &amp; AP risk signals — TRN gaps, duplicates, low-confidence VAT classifications
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="2026-Q3"
            className="bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white w-32"
          />
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || !activeCompanyId}
            className="px-3 py-2 rounded-lg text-sm bg-amber-500/20 text-amber-400 border border-amber-500/30 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
          </button>
        </div>
      </div>

      {!activeCompanyId && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Select a company to load anomaly signals.
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl border border-border bg-gradient-to-br from-card to-[#071228] p-4">
          <div className="text-[10px] uppercase text-muted2 font-mono">Missing / invalid TRN</div>
          <div className="text-2xl font-bold text-amber-400 mt-1">
            {apRisk?.anomaly_counts?.missing_or_invalid_trn ?? "—"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-gradient-to-br from-card to-[#071228] p-4">
          <div className="text-[10px] uppercase text-muted2 font-mono">Duplicate invoices</div>
          <div className="text-2xl font-bold text-red mt-1">
            {apRisk?.anomaly_counts?.duplicate_invoices ?? "—"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-gradient-to-br from-card to-[#071228] p-4">
          <div className="text-[10px] uppercase text-muted2 font-mono">VAT at risk</div>
          <div className="text-2xl font-bold text-white mt-1">
            {apRisk?.total_vat_at_risk_aed != null ? fmt(apRisk.total_vat_at_risk_aed) : "—"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-gradient-to-br from-card to-[#071228] p-4">
          <div className="text-[10px] uppercase text-muted2 font-mono">Low-confidence VAT</div>
          <div className="text-2xl font-bold text-amber-300 mt-1">{lowConfidence.length}</div>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-amber-100">
          Review flagged AP invoices in Invoice Flow, or open the full FTA AP Risk report.
        </p>
        <div className="flex gap-3">
          <Link
            href="/dashboard/invoice-flow/review"
            className="text-xs font-semibold text-amber-300 underline"
          >
            Invoice review queue →
          </Link>
          <Link
            href="/dashboard/fta-reports"
            className="text-xs font-semibold text-amber-300 underline"
          >
            FTA AP Risk report →
          </Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border border-border overflow-hidden bg-gradient-to-br from-card to-[#071228]">
          <div className="px-4 py-3 bg-white/[0.03] border-b border-border text-sm font-semibold text-white">
            Compliance warnings
          </div>
          <div className="divide-y divide-white/5 max-h-80 overflow-y-auto">
            {warnings.length === 0 && (
              <p className="px-4 py-6 text-sm text-muted2">
                No fail/warning checklist items for this period.
              </p>
            )}
            {warnings.map((item) => (
              <div key={item.id} className="px-4 py-3 flex gap-2">
                <AlertTriangle
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    item.status === "fail" ? "text-red" : "text-amber"
                  }`}
                />
                <div>
                  <div className="text-sm text-white">{item.title}</div>
                  <div className="text-xs text-muted2 font-mono mt-0.5">{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border overflow-hidden bg-gradient-to-br from-card to-[#071228]">
          <div className="px-4 py-3 bg-white/[0.03] border-b border-border text-sm font-semibold text-white">
            Low-confidence / unclassified ({lowConfidence.length + unclassified.length})
          </div>
          <div className="divide-y divide-white/5 max-h-80 overflow-y-auto">
            {[...unclassified, ...lowConfidence].slice(0, 40).map((t, i) => (
              <div key={t.id ?? i} className="px-4 py-2.5 text-sm">
                <div className="text-white truncate">
                  {t.invoice_number || t.description || "Transaction"}
                </div>
                <div className="text-xs text-muted2 mt-0.5">
                  {t.vendor_or_customer || "—"} · conf {t.confidence_score ?? "—"}% ·{" "}
                  {t.vat_treatment || "unclassified"}
                </div>
              </div>
            ))}
            {lowConfidence.length + unclassified.length === 0 && (
              <p className="px-4 py-6 text-sm text-muted2">
                No classification anomalies in saved transactions.
              </p>
            )}
          </div>
          <div className="px-4 py-2 border-t border-border">
            <Link href="/dashboard/vat-classifier" className="text-xs text-teal-400 underline">
              Review in VAT Classifier →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
