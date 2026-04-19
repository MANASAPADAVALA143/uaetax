"use client";

import { useMemo, useState } from "react";
import axios from "axios";

const COMPANY_ID = 1;
const STORAGE_RETURNS = "gulftax_vat_returns";

type Quarter = 1 | 2 | 3 | 4;

interface StoredReturn {
  return_id: number;
  period_start: string;
  period_end: string;
}

function quarterToRange(q: Quarter, year: number): { period_start: string; period_end: string } {
  const ranges: Record<Quarter, [number, number, number, number]> = {
    1: [year, 1, 1, year, 3, 31],
    2: [year, 4, 1, year, 6, 30],
    3: [year, 7, 1, year, 9, 30],
    4: [year, 10, 1, year, 12, 31],
  };
  const [ys, ms, ds, ye, me, de] = ranges[q];
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    period_start: `${ys}-${pad(ms)}-${pad(ds)}`,
    period_end: `${ye}-${pad(me)}-${pad(de)}`,
  };
}

function rememberReturn(entry: StoredReturn) {
  try {
    const raw = localStorage.getItem(STORAGE_RETURNS);
    const list: StoredReturn[] = raw ? JSON.parse(raw) : [];
    const next = [entry, ...list.filter((x) => x.return_id !== entry.return_id)].slice(0, 25);
    localStorage.setItem(STORAGE_RETURNS, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

interface BoxState {
  box1_standard_rated_supplies: number;
  box2_vat_on_supplies: number;
  box3_zero_rated_supplies: number;
  box4_exempt_supplies: number;
  box5_total_taxable_supplies: number;
  box6_taxable_expenses: number;
  box7_vat_on_expenses: number;
  box8_vat_payable_or_refundable: number;
}

const ZERO_BOXES: BoxState = {
  box1_standard_rated_supplies: 0,
  box2_vat_on_supplies: 0,
  box3_zero_rated_supplies: 0,
  box4_exempt_supplies: 0,
  box5_total_taxable_supplies: 0,
  box6_taxable_expenses: 0,
  box7_vat_on_expenses: 0,
  box8_vat_payable_or_refundable: 0,
};

const BOX_META: { key: keyof BoxState; n: number; title: string }[] = [
  { n: 1, key: "box1_standard_rated_supplies", title: "Standard rated supplies" },
  { n: 2, key: "box2_vat_on_supplies", title: "VAT on supplies (5%)" },
  { n: 3, key: "box3_zero_rated_supplies", title: "Zero rated supplies" },
  { n: 4, key: "box4_exempt_supplies", title: "Exempt supplies" },
  { n: 5, key: "box5_total_taxable_supplies", title: "Total taxable supplies" },
  { n: 6, key: "box6_taxable_expenses", title: "Taxable expenses" },
  { n: 7, key: "box7_vat_on_expenses", title: "VAT on expenses (5%)" },
  { n: 8, key: "box8_vat_payable_or_refundable", title: "VAT payable / (refundable)" },
];

function fmtAed(n: number): string {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function VATReturnPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const [quarter, setQuarter] = useState<Quarter>(1);
  const [year, setYear] = useState(2025);
  const [boxes, setBoxes] = useState<BoxState>(ZERO_BOXES);
  const [returnId, setReturnId] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<"pdf" | "excel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const period = useMemo(() => quarterToRange(quarter, year), [quarter, year]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const { data } = await axios.post(`${apiUrl}/api/vat/generate-return`, {
        company_id: COMPANY_ID,
        period_start: period.period_start,
        period_end: period.period_end,
      });
      setBoxes({
        box1_standard_rated_supplies: Number(data.box1_standard_rated_supplies) || 0,
        box2_vat_on_supplies: Number(data.box2_vat_on_supplies) || 0,
        box3_zero_rated_supplies: Number(data.box3_zero_rated_supplies) || 0,
        box4_exempt_supplies: Number(data.box4_exempt_supplies) || 0,
        box5_total_taxable_supplies: Number(data.box5_total_taxable_supplies) || 0,
        box6_taxable_expenses: Number(data.box6_taxable_expenses) || 0,
        box7_vat_on_expenses: Number(data.box7_vat_on_expenses) || 0,
        box8_vat_payable_or_refundable: Number(data.box8_vat_payable_or_refundable) || 0,
      });
      const id = Number(data.return_id);
      setReturnId(id);
      setStatus(data.status || "draft");
      rememberReturn({
        return_id: id,
        period_start: String(data.period_start).slice(0, 10),
        period_end: String(data.period_end).slice(0, 10),
      });
    } catch (e: unknown) {
      const ax = axios.isAxiosError(e);
      const msg = ax
        ? (e.response?.data as { detail?: string })?.detail || e.message
        : "Failed to generate return";
      setError(typeof msg === "string" ? msg : "Failed to generate return");
      setReturnId(null);
      setBoxes(ZERO_BOXES);
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = async (kind: "pdf" | "excel") => {
    if (!returnId) return;
    setDownloading(kind);
    setError(null);
    try {
      const path = kind === "pdf" ? "pdf" : "excel";
      const res = await axios.get(`${apiUrl}/api/vat/returns/${returnId}/${path}`, {
        responseType: "blob",
      });
      const blob = new Blob([res.data], {
        type:
          kind === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = kind === "pdf" ? `vat_return_${returnId}.pdf` : `vat_return_${returnId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: unknown) {
      const ax = axios.isAxiosError(e);
      const msg = ax ? e.message : "Download failed";
      setError(msg);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-7">
        <div>
          <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">
            // VAT Return
          </div>
          <h2 className="font-playfair text-[26px] font-bold">FTA VAT return (8 boxes)</h2>
          <p className="text-[13px] text-muted mt-1">
            Company ID {COMPANY_ID} · verified transactions in period · live API
          </p>
        </div>
      </div>

      <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 mb-6 space-y-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
              Quarter
            </label>
            <select
              value={quarter}
              onChange={(e) => setQuarter(Number(e.target.value) as Quarter)}
              className="rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm min-w-[120px] focus:border-border-g focus:outline-none"
            >
              <option value={1}>Q1</option>
              <option value={2}>Q2</option>
              <option value={3}>Q3</option>
              <option value={4}>Q4</option>
            </select>
          </div>
          <div>
            <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
              Year
            </label>
            <input
              type="number"
              min={2020}
              max={2030}
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || year)}
              className="w-28 rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
            />
          </div>
          <div className="text-[13px] text-muted pb-2">
            Period:{" "}
            <span className="text-gold-lt font-mono">
              {period.period_start} → {period.period_end}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="px-6 py-2.5 rounded-[10px] text-sm font-medium bg-gradient-to-br from-gold to-gold-lt text-deep shadow-[0_4px_18px_rgba(201,168,76,0.38)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Generating…" : "Generate return"}
          </button>
          <button
            type="button"
            onClick={() => downloadFile("pdf")}
            disabled={!returnId || !!downloading}
            className="px-5 py-2.5 rounded-[10px] text-sm font-medium border border-border-g text-gold-lt bg-gold-pale hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {downloading === "pdf" ? "Downloading…" : "Download PDF"}
          </button>
          <button
            type="button"
            onClick={() => downloadFile("excel")}
            disabled={!returnId || !!downloading}
            className="px-5 py-2.5 rounded-[10px] text-sm font-medium border border-border text-muted hover:border-border-g hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {downloading === "excel" ? "Downloading…" : "Download Excel"}
          </button>
        </div>

        {error && (
          <div className="rounded-[10px] border border-red/40 bg-[rgba(255,107,107,0.1)] px-4 py-3 text-sm text-red">
            {error}
          </div>
        )}

        {status && returnId && (
          <p className="text-[13px] text-green">
            Return #{returnId} · status: <span className="font-mono">{status}</span>
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {BOX_META.map((b) => (
          <div
            key={b.key}
            className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-xl px-5 py-4 flex flex-col gap-1"
          >
            <div className="text-[11px] text-muted2 uppercase tracking-wide">
              Box {b.n} · {b.title}
            </div>
            <div className="font-mono text-lg text-white">{fmtAed(boxes[b.key])}</div>
          </div>
        ))}
      </div>
    </>
  );
}
