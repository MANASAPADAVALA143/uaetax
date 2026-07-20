"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api";

type Status = "vat_overdue" | "vat_due_this_period" | "fully_settled";

interface CalcResult {
  vat_at_advance: number;
  vat_at_delivery: number;
  total_vat: number;
  advance_period: string;
  delivery_period: string;
  tax_invoice_due: string;
  is_overdue: boolean;
  status: Status;
}

interface LogRow {
  id: number;
  description: string | null;
  order_value: number;
  advance_amount: number;
  advance_date: string;
  delivery_date: string;
  vat_rate: number;
  vat_at_advance: number;
  vat_at_delivery: number;
  status: Status;
}

function fmtAed(n: number): string {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dubai" });
}

function statusLabel(s: Status): string {
  if (s === "vat_overdue") return "VAT Overdue";
  if (s === "vat_due_this_period") return "VAT Due This Period";
  return "Fully Settled";
}

export default function AdvancePaymentPage() {
  const [orderValue, setOrderValue] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceDate, setAdvanceDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [vatRate, setVatRate] = useState("0.05");
  const [description, setDescription] = useState("");
  const [customerTrn, setCustomerTrn] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const remainingAmount = useMemo(() => {
    const o = parseFloat(orderValue) || 0;
    const a = parseFloat(advanceAmount) || 0;
    return Math.max(0, o - a);
  }, [orderValue, advanceAmount]);

  const fetchRows = useCallback(async () => {
    try {
      const { data } = await apiClient.get<LogRow[]>("/api/advance-payment/list");
      setRows(data);
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  async function onCalculate() {
    setError(null);
    setLoading(true);
    try {
      const payload = {
        order_value: parseFloat(orderValue) || 0,
        advance_amount: parseFloat(advanceAmount) || 0,
        advance_date: advanceDate,
        delivery_date: deliveryDate,
        vat_rate: parseFloat(vatRate),
      };
      const [{ data: calc }, { data: saved }] = await Promise.all([
        apiClient.post<CalcResult>("/api/advance-payment/calculate", payload),
        apiClient.post("/api/advance-payment/save", { ...payload, description }),
      ]);
      setResult(calc);
      await fetchRows();
      if (!saved?.ok) setError("Saved with warning.");
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Failed to calculate VAT.");
    } finally {
      setLoading(false);
    }
  }

  function exportCsvClient() {
    const header = ["Date", "Description", "Order Value", "Advance", "VAT at Advance", "Remaining VAT", "Delivery Date", "Status"];
    const lines = rows.map((r) => [
      fmtDate(r.advance_date),
      r.description || "",
      r.order_value.toFixed(2),
      r.advance_amount.toFixed(2),
      r.vat_at_advance.toFixed(2),
      r.vat_at_delivery.toFixed(2),
      fmtDate(r.delivery_date),
      statusLabel(r.status),
    ]);
    const csv = [header, ...lines].map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "advance_payments_log.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="mb-7">
        <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">// Advance Payment VAT</div>
        <h2 className="font-playfair text-[26px] font-bold">Advance Payment VAT Tracker</h2>
      </div>

      <div className="bg-gradient-to-br from-card to-[#071228] border border-border-g rounded-2xl p-6 mb-6">
        <h3 className="text-sm font-semibold text-white mb-4">Log Advance Payment</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <label className="text-xs text-muted">
            Order / Contract Value (AED)
            <input value={orderValue} onChange={(e) => setOrderValue(e.target.value)} type="number" className="mt-1.5 w-full bg-[rgba(4,12,30,0.75)] border border-border rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="text-xs text-muted">
            Advance Received (AED)
            <input value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} type="number" className="mt-1.5 w-full bg-[rgba(4,12,30,0.75)] border border-border rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="text-xs text-muted">
            Date Payment Received
            <input value={advanceDate} onChange={(e) => setAdvanceDate(e.target.value)} type="date" className="mt-1.5 w-full bg-[rgba(4,12,30,0.75)] border border-border rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="text-xs text-muted">
            Expected Delivery Date
            <input value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} type="date" className="mt-1.5 w-full bg-[rgba(4,12,30,0.75)] border border-border rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="text-xs text-muted">
            VAT Rate
            <select value={vatRate} onChange={(e) => setVatRate(e.target.value)} className="mt-1.5 w-full bg-[rgba(4,12,30,0.75)] border border-border rounded-lg px-3 py-2 text-sm">
              <option value="0.05">5%</option>
              <option value="0">0%</option>
            </select>
          </label>
          <label className="text-xs text-muted">
            Description
            <input value={description} onChange={(e) => setDescription(e.target.value)} type="text" placeholder="Office fit-out contract" className="mt-1.5 w-full bg-[rgba(4,12,30,0.75)] border border-border rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="text-xs text-muted md:col-span-2">
            Customer TRN (optional)
            <input value={customerTrn} onChange={(e) => setCustomerTrn(e.target.value)} type="text" className="mt-1.5 w-full bg-[rgba(4,12,30,0.75)] border border-border rounded-lg px-3 py-2 text-sm" />
          </label>
        </div>
        {error && <div className="text-xs text-red mt-3">{error}</div>}
        <button onClick={onCalculate} disabled={loading} className="mt-4 w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-br from-gold to-gold-lt text-deep disabled:opacity-60">
          {loading ? "Calculating..." : "Calculate VAT Liability"}
        </button>
      </div>

      {result && (
        <div className="grid lg:grid-cols-2 gap-4 mb-6">
          <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-5">
            <div className="text-xs text-gold uppercase tracking-wide mb-1">Step 1: At Advance Payment</div>
            <div className="text-xs text-muted mb-2">Date: {fmtDate(advanceDate)}</div>
            <div className="text-xl font-semibold text-gold-lt mb-2">VAT Due: {fmtAed(result.vat_at_advance)}</div>
            <ul className="text-xs text-muted space-y-1">
              <li>✅ Issue Tax Invoice by {fmtDate(result.tax_invoice_due)}</li>
              <li>✅ Report in VAT Return Period: {result.advance_period}</li>
            </ul>
            <div className={`inline-flex mt-3 px-2.5 py-1 rounded-full text-[10px] font-mono border ${result.status === "vat_overdue" ? "bg-[rgba(255,107,107,0.18)] text-red border-red/30" : "bg-[rgba(255,183,0,0.12)] text-amber border-amber/30"}`}>
              {result.status === "vat_overdue" ? "VAT DUE NOW" : "Upcoming"}
            </div>
          </div>

          <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-5">
            <div className="text-xs text-blue-300 uppercase tracking-wide mb-1">Step 2: At Final Delivery</div>
            <div className="text-xs text-muted mb-1">Remaining Amount: {fmtAed(remainingAmount)}</div>
            <div className="text-xs text-muted mb-1">VAT on Remaining: {fmtAed(result.vat_at_delivery)}</div>
            <div className="text-sm font-semibold text-white mb-1">Total VAT Payable: {fmtAed(result.total_vat)}</div>
            <div className="text-xs text-muted">Report in Period: {result.delivery_period}</div>
          </div>
        </div>
      )}

      <div className="bg-[rgba(30,70,150,0.22)] border border-[rgba(78,168,255,0.35)] rounded-2xl p-5 text-sm text-blue-100 mb-6">
        <div className="font-semibold text-white mb-1">FTA Key Rule</div>
        <div>VAT is triggered at the earliest of payment received, tax invoice issued, or goods delivered/services completed.</div>
      </div>

      <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Advance Payments Log</h3>
          <button onClick={exportCsvClient} className="px-3 py-2 text-xs rounded-lg bg-gradient-to-br from-gold to-gold-lt text-deep font-semibold">Export to CSV</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted2 border-b border-border">
                <th className="text-left py-2">Date</th>
                <th className="text-left py-2">Description</th>
                <th className="text-right py-2">Order Value</th>
                <th className="text-right py-2">Advance</th>
                <th className="text-right py-2">VAT at Advance</th>
                <th className="text-right py-2">Remaining VAT</th>
                <th className="text-left py-2">Delivery Date</th>
                <th className="text-left py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="py-2">{fmtDate(r.advance_date)}</td>
                  <td className="py-2">{r.description || "—"}</td>
                  <td className="py-2 text-right">{fmtAed(r.order_value)}</td>
                  <td className="py-2 text-right">{fmtAed(r.advance_amount)}</td>
                  <td className="py-2 text-right">{fmtAed(r.vat_at_advance)}</td>
                  <td className="py-2 text-right">{fmtAed(r.vat_at_delivery)}</td>
                  <td className="py-2">{fmtDate(r.delivery_date)}</td>
                  <td className="py-2">
                    <span className={`inline-flex px-2 py-1 rounded-full border text-[10px] font-mono ${
                      r.status === "vat_overdue"
                        ? "bg-[rgba(255,107,107,0.18)] text-red border-red/30"
                        : r.status === "vat_due_this_period"
                          ? "bg-[rgba(255,183,0,0.12)] text-amber border-amber/30"
                          : "bg-[rgba(45,212,160,0.12)] text-green border-green/30"
                    }`}>
                      {r.status === "vat_overdue" ? "🔴 VAT Overdue" : r.status === "vat_due_this_period" ? "🟡 VAT Due This Period" : "🟢 Fully Settled"}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-4 text-center text-muted">No advance payments logged yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
