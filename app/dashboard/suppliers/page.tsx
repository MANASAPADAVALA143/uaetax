"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api";

interface VendorRow {
  vendor_name: string;
  invoice_count: number;
  total_spend_aed: number;
  avg_invoice_aed: number;
  max_invoice_aed: number;
  typical_vat_treatment: string | null;
  last_invoice_date: string | null;
  highest_risk: "clear" | "review" | "escalate";
  escalated_count: number;
  pending_review_count: number;
  auto_approved_count: number;
  total_vat_at_risk_aed: number;
}

const RISK_COLORS: Record<string, string> = {
  escalate: "bg-[rgba(255,107,107,0.15)] text-red border-red/30",
  review:   "bg-[rgba(255,183,0,0.12)] text-amber border-amber/30",
  clear:    "bg-[rgba(45,212,160,0.12)] text-green border-green/30",
};
const RISK_LABEL: Record<string, string> = {
  escalate: "⛔ High risk",
  review:   "⚠ Medium risk",
  clear:    "✓ Clear",
};

const VAT_COLORS: Record<string, string> = {
  standard_rated: "text-green",
  zero_rated:     "text-blue-300",
  exempt:         "text-amber",
  reverse_charge: "text-purple-300",
  out_of_scope:   "text-muted2",
};

function fmtAed(n: number) {
  return new Intl.NumberFormat("en-AE", {
    style: "currency", currency: "AED",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

type SortKey = "total_spend_aed" | "invoice_count" | "total_vat_at_risk_aed" | "highest_risk";

export default function SuppliersPage() {
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<"all" | "escalate" | "review" | "clear">("all");
  const [sortKey, setSortKey] = useState<SortKey>("total_spend_aed");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const fetchVendors = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get("/api/invoice/vendors");
      setVendors(Array.isArray(data) ? data : []);
    } catch {
      setVendors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchVendors(); }, [fetchVendors]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filtered = vendors
    .filter(v => {
      if (search && !v.vendor_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (riskFilter !== "all" && v.highest_risk !== riskFilter) return false;
      return true;
    })
    .sort((a, b) => {
      let av: number, bv: number;
      if (sortKey === "highest_risk") {
        const rank: Record<string, number> = { escalate: 2, review: 1, clear: 0 };
        av = rank[a.highest_risk] ?? 0;
        bv = rank[b.highest_risk] ?? 0;
      } else {
        av = a[sortKey] as number;
        bv = b[sortKey] as number;
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });

  const totals = {
    vendors: vendors.length,
    spend: vendors.reduce((s, v) => s + v.total_spend_aed, 0),
    at_risk: vendors.reduce((s, v) => s + v.total_vat_at_risk_aed, 0),
    escalated: vendors.filter(v => v.highest_risk === "escalate").length,
  };

  const SortBtn = ({ col, label }: { col: SortKey; label: string }) => (
    <button
      type="button"
      onClick={() => toggleSort(col)}
      className={`text-left text-[10px] uppercase tracking-wide font-mono whitespace-nowrap flex items-center gap-1 ${sortKey === col ? "text-gold-lt" : "text-muted2 hover:text-white"}`}
    >
      {label}
      {sortKey === col && <span>{sortDir === "desc" ? "↓" : "↑"}</span>}
    </button>
  );

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-7">
        <div>
          <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">
            // Supplier Ledger
          </div>
          <h2 className="font-playfair text-[26px] font-bold">Vendor Risk Register</h2>
          <p className="text-[13px] text-muted mt-1">
            All vendors · risk level · spend · VAT treatment history
          </p>
        </div>
        <button
          type="button"
          onClick={fetchVendors}
          className="px-4 py-2 rounded-[8px] text-[12px] font-medium border border-border text-muted hover:border-border-g hover:text-white transition"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total vendors",    value: totals.vendors.toString(),        color: "text-white" },
          { label: "Total spend",      value: fmtAed(totals.spend),             color: "text-gold-lt" },
          { label: "VAT at risk",      value: fmtAed(totals.at_risk),           color: totals.at_risk > 0 ? "text-red" : "text-muted2" },
          { label: "High-risk vendors",value: totals.escalated.toString(),       color: totals.escalated > 0 ? "text-red" : "text-green" },
        ].map(c => (
          <div key={c.label} className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-5">
            <p className="text-[11px] text-muted2 uppercase tracking-wide mb-1">{c.label}</p>
            <p className={`text-[22px] font-bold font-mono ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <input
          type="search"
          placeholder="Search vendor name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2 text-white text-sm w-60 focus:border-border-g focus:outline-none"
        />
        {(["all", "escalate", "review", "clear"] as const).map(r => (
          <button
            key={r}
            type="button"
            onClick={() => setRiskFilter(r)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all ${
              riskFilter === r
                ? "bg-gold-pale text-gold-lt border-border-g"
                : "text-muted2 border-border hover:border-border-g hover:text-white"
            }`}
          >
            {r === "all" ? "All" : RISK_LABEL[r]}
            {r !== "all" && (
              <span className="ml-1.5 opacity-60">
                {vendors.filter(v => v.highest_risk === r).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-muted2 animate-pulse">Loading suppliers…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted2">
            <div className="text-4xl mb-3">🏭</div>
            <p>{vendors.length === 0 ? "No invoices processed yet" : "No vendors match this filter"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-[rgba(4,12,30,0.6)]">
                  <th className="text-left px-5 py-3 text-[10px] text-muted2 uppercase tracking-wide font-mono">Vendor</th>
                  <th className="px-4 py-3"><SortBtn col="highest_risk" label="Risk" /></th>
                  <th className="px-4 py-3"><SortBtn col="invoice_count" label="Invoices" /></th>
                  <th className="px-4 py-3"><SortBtn col="total_spend_aed" label="Total spend" /></th>
                  <th className="px-4 py-3 text-[10px] text-muted2 uppercase tracking-wide font-mono whitespace-nowrap">Avg invoice</th>
                  <th className="px-4 py-3 text-[10px] text-muted2 uppercase tracking-wide font-mono whitespace-nowrap">VAT treatment</th>
                  <th className="px-4 py-3"><SortBtn col="total_vat_at_risk_aed" label="VAT at risk" /></th>
                  <th className="px-4 py-3 text-[10px] text-muted2 uppercase tracking-wide font-mono whitespace-nowrap">Queue status</th>
                  <th className="px-4 py-3 text-[10px] text-muted2 uppercase tracking-wide font-mono whitespace-nowrap">Last invoice</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v, i) => (
                  <tr
                    key={v.vendor_name}
                    className={`border-b border-border/50 hover:bg-[rgba(30,70,150,0.12)] transition-colors ${i % 2 === 0 ? "" : "bg-[rgba(255,255,255,0.015)]"}`}
                  >
                    <td className="px-5 py-3 text-white font-medium max-w-[200px] truncate">
                      {v.vendor_name}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-mono ${RISK_COLORS[v.highest_risk]}`}>
                        {RISK_LABEL[v.highest_risk]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-white font-mono">{v.invoice_count}</td>
                    <td className="px-4 py-3 text-right text-white font-mono">{fmtAed(v.total_spend_aed)}</td>
                    <td className="px-4 py-3 text-right text-muted font-mono">{fmtAed(v.avg_invoice_aed)}</td>
                    <td className="px-4 py-3">
                      {v.typical_vat_treatment ? (
                        <span className={`font-mono text-[10px] ${VAT_COLORS[v.typical_vat_treatment] || "text-muted2"}`}>
                          {v.typical_vat_treatment.replace(/_/g, " ")}
                        </span>
                      ) : <span className="text-muted2">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span className={v.total_vat_at_risk_aed > 0 ? "text-red" : "text-muted2"}>
                        {v.total_vat_at_risk_aed > 0 ? fmtAed(v.total_vat_at_risk_aed) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        {v.escalated_count > 0 && (
                          <span className="text-[10px] text-red font-mono">⛔ {v.escalated_count} blocked</span>
                        )}
                        {v.pending_review_count > 0 && (
                          <span className="text-[10px] text-amber font-mono">⚠ {v.pending_review_count} in review</span>
                        )}
                        {v.auto_approved_count > 0 && (
                          <span className="text-[10px] text-green font-mono">✓ {v.auto_approved_count} auto-OK</span>
                        )}
                        {v.escalated_count === 0 && v.pending_review_count === 0 && v.auto_approved_count === 0 && (
                          <span className="text-[10px] text-muted2 font-mono">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted font-mono text-[11px] whitespace-nowrap">
                      {v.last_invoice_date ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
