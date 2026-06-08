"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api";

interface VendorRow {
  vendor_name: string;
  transaction_count: number;
  total_spend_aed: number;
  total_vat_aed: number;
  vat_treatment: string | null;
  flagged_count: number;
  risk_level: "high" | "low";
}

const RISK_BADGE: Record<string, string> = {
  high: "bg-[rgba(255,107,107,0.15)] text-red border-red/30",
  low: "bg-[rgba(45,212,160,0.12)] text-green border-green/30",
};

const VAT_BADGE: Record<string, string> = {
  standard_rated: "bg-[rgba(45,212,160,0.12)] text-green border-green/30",
  zero_rated: "bg-[rgba(78,168,255,0.12)] text-blue-300 border-blue-400/30",
  exempt: "bg-[rgba(255,255,255,0.08)] text-muted border-border",
  reverse_charge: "bg-[rgba(255,183,0,0.12)] text-amber border-amber/30",
  entertainment_restricted: "bg-[rgba(255,107,107,0.12)] text-red border-red/30",
  import_vat: "bg-[rgba(78,168,255,0.12)] text-blue-300 border-blue-400/30",
};

const VAT_LABEL: Record<string, string> = {
  standard_rated: "Standard",
  zero_rated: "Zero Rated",
  exempt: "Exempt",
  reverse_charge: "Reverse Charge",
  entertainment_restricted: "Art.54",
  import_vat: "Import VAT",
};

function fmtAed(n: number) {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

type SortKey = "total_spend_aed" | "total_vat_aed" | "transaction_count" | "flagged_count" | "risk_level";

export default function SuppliersPage() {
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<"all" | "high" | "low">("all");
  const [sortKey, setSortKey] = useState<SortKey>("total_spend_aed");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const fetchVendors = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get("/api/vat/vendors");
      setVendors(Array.isArray(data) ? data : []);
    } catch {
      setVendors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filtered = vendors
    .filter((v) => {
      if (search && !v.vendor_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (riskFilter !== "all" && v.risk_level !== riskFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortKey === "risk_level") {
        const rank: Record<string, number> = { high: 1, low: 0 };
        const av = rank[a.risk_level] ?? 0;
        const bv = rank[b.risk_level] ?? 0;
        return sortDir === "desc" ? bv - av : av - bv;
      }
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDir === "desc" ? bv - av : av - bv;
    });

  const totals = {
    vendors: vendors.length,
    spend: vendors.reduce((s, v) => s + v.total_spend_aed, 0),
    vat: vendors.reduce((s, v) => s + v.total_vat_aed, 0),
    flagged: vendors.reduce((s, v) => s + v.flagged_count, 0),
    highRisk: vendors.filter((v) => v.risk_level === "high").length,
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
            Vendors from VAT Classifier · spend · VAT treatment · flagged transactions
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total vendors", value: totals.vendors.toString(), color: "text-white" },
          { label: "Total spend", value: fmtAed(totals.spend), color: "text-gold-lt" },
          { label: "Total VAT", value: fmtAed(totals.vat), color: "text-blue-300" },
          {
            label: "High-risk vendors",
            value: totals.highRisk.toString(),
            color: totals.highRisk > 0 ? "text-red" : "text-green",
          },
        ].map((c) => (
          <div key={c.label} className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-5">
            <p className="text-[11px] text-muted2 uppercase tracking-wide mb-1">{c.label}</p>
            <p className={`text-[18px] font-bold font-mono ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <input
          type="search"
          placeholder="Search vendor name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2 text-white text-sm w-60 focus:border-border-g focus:outline-none"
        />
        {(["all", "high", "low"] as const).map((r) => (
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
            {r === "all" ? "All" : r === "high" ? "HIGH" : "LOW"}
            {r !== "all" && (
              <span className="ml-1.5 opacity-60">
                {vendors.filter((v) => v.risk_level === r).length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-muted2 animate-pulse">Loading suppliers…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted2">
            <div className="text-4xl mb-3">🏭</div>
            <p>{vendors.length === 0 ? "No classified purchase transactions yet" : "No vendors match this filter"}</p>
            {vendors.length === 0 && (
              <p className="text-[12px] mt-2">Upload transactions in VAT Classifier to populate this ledger</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-[rgba(4,12,30,0.6)]">
                  <th className="text-left px-5 py-3 text-[10px] text-muted2 uppercase tracking-wide font-mono">Vendor</th>
                  <th className="px-4 py-3"><SortBtn col="total_spend_aed" label="Total spend" /></th>
                  <th className="px-4 py-3"><SortBtn col="total_vat_aed" label="Total VAT" /></th>
                  <th className="px-4 py-3 text-[10px] text-muted2 uppercase tracking-wide font-mono whitespace-nowrap">VAT treatment</th>
                  <th className="px-4 py-3"><SortBtn col="flagged_count" label="Flagged" /></th>
                  <th className="px-4 py-3"><SortBtn col="risk_level" label="Risk" /></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v, i) => (
                  <tr
                    key={v.vendor_name}
                    className={`border-b border-border/50 hover:bg-[rgba(30,70,150,0.12)] transition-colors ${i % 2 === 0 ? "" : "bg-[rgba(255,255,255,0.015)]"} ${v.flagged_count > 0 ? "bg-[rgba(255,107,107,0.04)]" : ""}`}
                  >
                    <td className="px-5 py-3 text-white font-medium max-w-[220px] truncate">{v.vendor_name}</td>
                    <td className="px-4 py-3 text-right text-white font-mono">{fmtAed(v.total_spend_aed)}</td>
                    <td className="px-4 py-3 text-right text-muted font-mono">{fmtAed(v.total_vat_aed)}</td>
                    <td className="px-4 py-3">
                      {v.vat_treatment ? (
                        <span
                          className={`px-2 py-0.5 rounded-full border text-[10px] font-mono ${
                            VAT_BADGE[v.vat_treatment] || "bg-[rgba(255,255,255,0.06)] text-muted2 border-border"
                          }`}
                        >
                          {VAT_LABEL[v.vat_treatment] || v.vat_treatment.replace(/_/g, " ")}
                        </span>
                      ) : (
                        <span className="text-muted2">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-mono">
                      <span className={v.flagged_count > 0 ? "text-red font-semibold" : "text-muted2"}>
                        {v.flagged_count > 0 ? v.flagged_count : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-mono uppercase ${RISK_BADGE[v.risk_level]}`}>
                        {v.risk_level}
                      </span>
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
