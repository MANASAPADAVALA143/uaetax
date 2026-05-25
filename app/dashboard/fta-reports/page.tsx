"use client";

import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api";

type Tab = "summary" | "transactions" | "ap-risk";

interface VATBox {
  box1_standard_rated_sales: number;
  box2_output_vat: number;
  box3_zero_rated_sales: number;
  box4_exempt_sales: number;
  box5_total_taxable_supplies: number;
  box6_taxable_expenses: number;
  box7_input_vat_recoverable: number;
  box8_net_vat_payable: number;
}

interface SummaryData {
  company_name: string;
  trn: string | null;
  period_start: string;
  period_end: string;
  transaction_count: number;
  vat_boxes: VATBox;
  counts: Record<string, number>;
}

interface TxRow {
  id: number;
  date: string;
  description: string;
  vendor_customer: string;
  invoice_number: string;
  type: string;
  vat_treatment: string;
  amount_aed: number;
  vat_amount_aed: number;
  total_aed: number;
}

interface APRisk {
  total_invoices: number;
  status_breakdown: Record<string, number>;
  total_vat_at_risk_aed: number;
  blocked_input_vat_aed: number;
  flag_counts: { high: number; medium: number; low: number; total: number };
  anomaly_counts: { missing_or_invalid_trn: number; duplicate_invoices: number };
}

const VAT_TREATMENT_BADGE: Record<string, string> = {
  standard_rated: "bg-[rgba(45,212,160,0.12)] text-green border-green/30",
  zero_rated: "bg-[rgba(78,168,255,0.1)] text-blue-300 border-blue-400/30",
  exempt: "bg-[rgba(255,183,0,0.12)] text-amber border-amber/30",
  reverse_charge: "bg-[rgba(200,100,255,0.12)] text-purple-300 border-purple-400/30",
  out_of_scope: "bg-[rgba(255,255,255,0.06)] text-muted border-border",
};

function fmtAed(n: number) {
  return `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FTAReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [periodStart, setPeriodStart] = useState(`${new Date().getFullYear()}-01-01`);
  const [periodEnd, setPeriodEnd] = useState(`${new Date().getFullYear()}-12-31`);

  // Detect actual data year from most recent transaction on mount
  useEffect(() => {
    apiClient.get("/api/vat/transactions?limit=1")
      .then(res => {
        const list = Array.isArray(res.data) ? res.data : [];
        if (list.length > 0 && list[0].date) {
          const y = new Date(list[0].date).getFullYear();
          setPeriodStart(`${y}-01-01`);
          setPeriodEnd(`${y}-12-31`);
        }
      })
      .catch(() => { /* keep current year default */ });
  }, []);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [apRisk, setApRisk] = useState<APRisk | null>(null);
  const [txFilter, setTxFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === "summary") {
        const { data } = await apiClient.get(
          `/api/fta/summary?period_start=${periodStart}&period_end=${periodEnd}`
        );
        setSummary(data);
      } else if (activeTab === "transactions") {
        const { data } = await apiClient.get(
          `/api/fta/transaction-listing?period_start=${periodStart}&period_end=${periodEnd}&tx_type=${txFilter}`
        );
        setTransactions(data.transactions || []);
      } else if (activeTab === "ap-risk") {
        const { data } = await apiClient.get(`/api/fta/ap-risk-summary`);
        setApRisk(data);
      }
    } catch {
      setError("Failed to load report data.");
    } finally {
      setLoading(false);
    }
  };

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "summary", label: "VAT Summary", icon: "📊" },
    { id: "transactions", label: "Transaction Listing", icon: "📋" },
    { id: "ap-risk", label: "AP Risk Report", icon: "⚠️" },
  ];

  return (
    <>
      <div className="flex items-center justify-between mb-7">
        <div>
          <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">
            // FTA Reports
          </div>
          <h2 className="font-playfair text-[26px] font-bold">FTA Audit Reports</h2>
          <p className="text-[13px] text-muted mt-1">
            UAE FTA-ready reports generated from your VAT Classifier data
          </p>
        </div>
      </div>

      {/* Report tabs */}
      <div className="flex gap-2 mb-6 border-b border-border pb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setActiveTab(t.id); setSummary(null); setTransactions([]); setApRisk(null); }}
            className={`px-4 py-2 rounded-[8px] text-[12px] font-medium transition-all flex items-center gap-1.5 ${
              activeTab === t.id
                ? "bg-gold-pale text-gold-lt border border-border-g"
                : "text-muted hover:bg-[rgba(30,70,150,0.25)] hover:text-white border border-transparent"
            }`}
          >
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Period selector */}
      {activeTab !== "ap-risk" && (
        <div className="flex flex-wrap items-end gap-4 mb-6 bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-5">
          <div>
            <label className="block text-[11px] text-muted2 uppercase tracking-wide mb-1.5">Period Start</label>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="rounded-[8px] bg-[rgba(4,12,30,0.85)] border border-border px-3 py-2 text-white text-sm focus:border-border-g focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] text-muted2 uppercase tracking-wide mb-1.5">Period End</label>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="rounded-[8px] bg-[rgba(4,12,30,0.85)] border border-border px-3 py-2 text-white text-sm focus:border-border-g focus:outline-none"
            />
          </div>
          {activeTab === "transactions" && (
            <div>
              <label className="block text-[11px] text-muted2 uppercase tracking-wide mb-1.5">Type</label>
              <select
                value={txFilter}
                onChange={(e) => setTxFilter(e.target.value)}
                className="rounded-[8px] bg-[rgba(4,12,30,0.85)] border border-border px-3 py-2 text-white text-sm focus:border-border-g focus:outline-none"
              >
                <option value="all">All</option>
                <option value="sale">Sales only</option>
                <option value="purchase">Purchases only</option>
              </select>
            </div>
          )}
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="px-5 py-2 rounded-[8px] text-sm font-semibold bg-gradient-to-br from-gold to-gold-lt text-deep disabled:opacity-50"
          >
            {loading ? "Generating…" : "Generate Report"}
          </button>
        </div>
      )}

      {activeTab === "ap-risk" && (
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="mb-6 px-5 py-2 rounded-[8px] text-sm font-semibold bg-gradient-to-br from-gold to-gold-lt text-deep disabled:opacity-50"
        >
          {loading ? "Loading…" : "Generate AP Risk Report"}
        </button>
      )}

      {error && (
        <div className="rounded-[10px] border border-red/40 bg-[rgba(255,107,107,0.1)] px-4 py-3 text-sm text-red mb-6">
          {error}
        </div>
      )}

      {/* ── VAT SUMMARY REPORT ── */}
      {activeTab === "summary" && summary && (
        <div className="space-y-5">
          <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
              <div>
                <p className="text-white font-bold text-lg">{summary.company_name}</p>
                {summary.trn && <p className="text-[12px] text-muted2 font-mono">TRN: {summary.trn}</p>}
                <p className="text-[12px] text-muted2 mt-0.5">{summary.period_start} → {summary.period_end} · {summary.transaction_count} transactions</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => downloadCsv(`fta_vat_summary_${periodStart}_${periodEnd}.csv`, [
                    ["Company", "TRN", "Period Start", "Period End", "Transactions"],
                    [summary.company_name, summary.trn ?? "", summary.period_start, summary.period_end, String(summary.transaction_count)],
                    [],
                    ["Box", "Description", "Amount AED"],
                    ["Box 1", "Standard Rated Sales", String(summary.vat_boxes.box1_standard_rated_sales)],
                    ["Box 2", "Output VAT Due", String(summary.vat_boxes.box2_output_vat)],
                    ["Box 3", "Zero Rated Sales", String(summary.vat_boxes.box3_zero_rated_sales)],
                    ["Box 4", "Exempt Sales", String(summary.vat_boxes.box4_exempt_sales)],
                    ["Box 5", "Total Taxable Supplies", String(summary.vat_boxes.box5_total_taxable_supplies)],
                    ["Box 6", "Taxable Expenses", String(summary.vat_boxes.box6_taxable_expenses)],
                    ["Box 7", "Input VAT Recoverable", String(summary.vat_boxes.box7_input_vat_recoverable)],
                    ["Box 8", "Net VAT Payable", String(summary.vat_boxes.box8_net_vat_payable)],
                  ])}
                  className="px-3 py-1.5 rounded-[8px] text-[11px] font-medium border border-border-g text-gold-lt bg-gold-pale hover:opacity-90 transition"
                >
                  📥 Export CSV
                </button>
                <span className="text-[10px] font-mono text-muted2 border border-border px-2 py-1 rounded">FTA VAT Return</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { box: "Box 1", label: "Standard Rated Sales", value: summary.vat_boxes.box1_standard_rated_sales, color: "text-green" },
                { box: "Box 2", label: "Output VAT Due", value: summary.vat_boxes.box2_output_vat, color: "text-green" },
                { box: "Box 3", label: "Zero Rated Sales", value: summary.vat_boxes.box3_zero_rated_sales, color: "text-blue-300" },
                { box: "Box 4", label: "Exempt Sales", value: summary.vat_boxes.box4_exempt_sales, color: "text-amber" },
                { box: "Box 5", label: "Total Taxable Supplies", value: summary.vat_boxes.box5_total_taxable_supplies, color: "text-white" },
                { box: "Box 6", label: "Taxable Expenses (Input)", value: summary.vat_boxes.box6_taxable_expenses, color: "text-muted" },
                { box: "Box 7", label: "Input VAT Recoverable", value: summary.vat_boxes.box7_input_vat_recoverable, color: "text-blue-300" },
              ].map((row) => (
                <div key={row.box} className="flex items-center justify-between rounded-[10px] border border-border bg-[rgba(4,12,30,0.5)] px-4 py-3">
                  <div>
                    <span className="text-[10px] font-mono text-muted2 uppercase">{row.box}</span>
                    <p className="text-[13px] text-muted mt-0.5">{row.label}</p>
                  </div>
                  <span className={`font-mono font-semibold text-[14px] ${row.color}`}>{fmtAed(row.value)}</span>
                </div>
              ))}

              {/* Box 8 — Net VAT Payable / Refundable */}
              <div className={`flex items-center justify-between rounded-[10px] border px-4 py-3 col-span-full ${
                summary.vat_boxes.box8_net_vat_payable >= 0
                  ? "border-red/30 bg-[rgba(255,107,107,0.08)]"
                  : "border-green/30 bg-[rgba(45,212,160,0.08)]"
              }`}>
                <div>
                  <span className="text-[10px] font-mono text-muted2 uppercase">Box 8</span>
                  <p className="text-[13px] font-semibold text-white mt-0.5">
                    Net VAT {summary.vat_boxes.box8_net_vat_payable >= 0 ? "Payable to FTA" : "Refundable from FTA"}
                  </p>
                </div>
                <span className={`font-mono font-bold text-[18px] ${summary.vat_boxes.box8_net_vat_payable >= 0 ? "text-red" : "text-green"}`}>
                  {fmtAed(Math.abs(summary.vat_boxes.box8_net_vat_payable))}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TRANSACTION LISTING ── */}
      {activeTab === "transactions" && transactions.length > 0 && (
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <p className="text-sm font-semibold text-white">{transactions.length} transactions</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => downloadCsv(`fta_transaction_listing_${periodStart}_${periodEnd}.csv`, [
                  ["Date", "Description", "Vendor/Customer", "Invoice #", "Type", "VAT Treatment", "Amount AED", "VAT AED", "Total AED"],
                  ...transactions.map(t => [
                    t.date, t.description, t.vendor_customer || "", t.invoice_number || "",
                    t.type, t.vat_treatment,
                    String(t.amount_aed), String(t.vat_amount_aed), String(t.total_aed),
                  ]),
                ])}
                className="px-3 py-1.5 rounded-[8px] text-[11px] font-medium border border-border-g text-gold-lt bg-gold-pale hover:opacity-90 transition"
              >
                📥 Export CSV (TAF)
              </button>
              <span className="text-[10px] text-muted2 font-mono uppercase">Tax Audit File (TAF)</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-[rgba(4,12,30,0.6)]">
                  {["Date", "Description", "Vendor/Customer", "Invoice #", "Type", "VAT Treatment", "Amount", "VAT", "Total"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-muted2 uppercase tracking-wide text-[10px] font-mono whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map((t, i) => (
                  <tr key={t.id} className={`border-b border-border/50 ${i % 2 === 0 ? "" : "bg-[rgba(255,255,255,0.02)]"}`}>
                    <td className="px-4 py-2 text-muted font-mono whitespace-nowrap">{t.date}</td>
                    <td className="px-4 py-2 text-white max-w-[200px] truncate">{t.description}</td>
                    <td className="px-4 py-2 text-muted truncate max-w-[140px]">{t.vendor_customer || "—"}</td>
                    <td className="px-4 py-2 text-muted font-mono">{t.invoice_number || "—"}</td>
                    <td className="px-4 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${t.type === "sale" ? "text-green bg-[rgba(45,212,160,0.12)]" : "text-amber bg-[rgba(255,183,0,0.1)]"}`}>
                        {t.type}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-mono ${VAT_TREATMENT_BADGE[t.vat_treatment] || VAT_TREATMENT_BADGE.out_of_scope}`}>
                        {(t.vat_treatment || "—").replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-white font-mono text-right whitespace-nowrap">{t.amount_aed.toLocaleString("en-AE", { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2 text-muted font-mono text-right whitespace-nowrap">{t.vat_amount_aed.toLocaleString("en-AE", { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2 text-white font-mono text-right font-semibold whitespace-nowrap">{t.total_aed.toLocaleString("en-AE", { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── AP RISK REPORT ── */}
      {activeTab === "ap-risk" && apRisk && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => downloadCsv(`fta_ap_risk_summary.csv`, [
                ["Metric", "Value"],
                ["Total Invoices", String(apRisk.total_invoices)],
                ["Total VAT at Risk (AED)", String(apRisk.total_vat_at_risk_aed)],
                ["Blocked Input VAT (AED)", String(apRisk.blocked_input_vat_aed)],
                ["HIGH Flags", String(apRisk.flag_counts.high)],
                ["MEDIUM Flags", String(apRisk.flag_counts.medium)],
                ["LOW Flags", String(apRisk.flag_counts.low)],
                ["Missing/Invalid TRN", String(apRisk.anomaly_counts.missing_or_invalid_trn)],
                ["Duplicate Invoices", String(apRisk.anomaly_counts.duplicate_invoices)],
                [],
                ["Status", "Count"],
                ...Object.entries(apRisk.status_breakdown).map(([s, c]) => [s, String(c)]),
              ])}
              className="px-3 py-1.5 rounded-[8px] text-[11px] font-medium border border-border-g text-gold-lt bg-gold-pale hover:opacity-90 transition"
            >
              📥 Export CSV
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Total Invoices", value: apRisk.total_invoices, color: "text-white" },
              { label: "VAT at Risk", value: `AED ${apRisk.total_vat_at_risk_aed.toLocaleString("en-AE")}`, color: "text-red" },
              { label: "Blocked Input VAT", value: `AED ${apRisk.blocked_input_vat_aed.toLocaleString("en-AE")}`, color: "text-amber" },
              { label: "Total Anomaly Flags", value: apRisk.flag_counts.total, color: "text-white" },
            ].map((card) => (
              <div key={card.label} className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-5">
                <p className="text-[11px] text-muted2 uppercase tracking-wide mb-1">{card.label}</p>
                <p className={`text-[22px] font-bold font-mono ${card.color}`}>{card.value}</p>
              </div>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-5">
              <p className="text-[12px] font-semibold text-white mb-3">Flags by Severity</p>
              {[
                { label: "HIGH", count: apRisk.flag_counts.high, color: "text-red bg-[rgba(255,107,107,0.15)]" },
                { label: "MEDIUM", count: apRisk.flag_counts.medium, color: "text-amber bg-[rgba(255,183,0,0.12)]" },
                { label: "LOW", count: apRisk.flag_counts.low, color: "text-blue-300 bg-[rgba(78,168,255,0.1)]" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${row.color}`}>{row.label}</span>
                  <span className="text-white font-mono font-semibold">{row.count} flags</span>
                </div>
              ))}
            </div>

            <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-5">
              <p className="text-[12px] font-semibold text-white mb-3">Invoice Status</p>
              {Object.entries(apRisk.status_breakdown).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <span className="text-[12px] text-muted capitalize">{status}</span>
                  <span className="text-white font-mono font-semibold">{count}</span>
                </div>
              ))}
              <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                <span className="text-[11px] text-muted2">Missing/Invalid TRN</span>
                <span className="text-amber font-mono">{apRisk.anomaly_counts.missing_or_invalid_trn}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[11px] text-muted2">Duplicate Invoices</span>
                <span className="text-red font-mono">{apRisk.anomaly_counts.duplicate_invoices}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && !summary && transactions.length === 0 && !apRisk && (
        <div className="text-center py-20 text-muted2">
          <div className="text-5xl mb-4">📈</div>
          <p className="text-[14px]">Select a report type and click Generate</p>
          <p className="text-[12px] mt-1">Data comes from your VAT Classifier uploads</p>
        </div>
      )}
    </>
  );
}
