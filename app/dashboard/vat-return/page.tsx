"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import axios from "axios";
import { apiClient } from "@/lib/api";

type Quarter = 1 | 2 | 3 | 4;

function quarterToRange(q: Quarter, year: number): { period_start: string; period_end: string } {
  const ranges: Record<Quarter, [number, number, number, number, number, number]> = {
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

interface BoxState {
  box1_standard_rated_supplies: number;
  box2_vat_on_supplies: number;
  box3_zero_rated_supplies: number;
  box4_exempt_supplies: number;
  box5_total_taxable_supplies: number;
  box6_taxable_expenses: number;
  box7_vat_on_expenses: number;
  box8_vat_payable_or_refundable: number;
  box9_standard_rated_purchases: number;
  box10_zero_rated_purchases: number;
  box11_exempt_purchases: number;
}

interface RCMeta {
  rc_net_aed: number;
  rc_vat_aed: number;
}

interface EntertainmentMeta {
  blocked_net_aed: number;
  blocked_vat_aed: number;
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
  box9_standard_rated_purchases: 0,
  box10_zero_rated_purchases: 0,
  box11_exempt_purchases: 0,
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
  { n: 9, key: "box9_standard_rated_purchases", title: "Standard rated purchases" },
  { n: 10, key: "box10_zero_rated_purchases", title: "Zero rated purchases" },
  { n: 11, key: "box11_exempt_purchases", title: "Exempt purchases" },
];

function fmtAed(n: number): string {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function statusLabel(status: string | null): string {
  if (!status) return "—";
  if (status === "draft" || status === "generated") return "Generated";
  if (status === "filed") return "Filed";
  return status;
}

export default function VATReturnPage() {
  const currentYear = new Date().getFullYear();
  const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3) as Quarter;
  const [quarter, setQuarter] = useState<Quarter>(currentQuarter);
  const [year, setYear] = useState(currentYear);
  const [boxes, setBoxes] = useState<BoxState>(ZERO_BOXES);
  const [returnId, setReturnId] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null);
  const [ftaReference, setFtaReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [markingFiled, setMarkingFiled] = useState(false);
  const [downloading, setDownloading] = useState<"pdf" | "excel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [rcMeta, setRcMeta] = useState<RCMeta | null>(null);
  const [entertainmentMeta, setEntertainmentMeta] = useState<EntertainmentMeta | null>(null);

  const period = useMemo(() => quarterToRange(quarter, year), [quarter, year]);
  const isFiled = status === "filed" || submissionStatus === "filed_manually";

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    setStatus(null);
    setSubmissionStatus(null);
    try {
      const { data } = await apiClient.post(`/api/vat/generate-return`, {
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
        box9_standard_rated_purchases: Number(data.box9_standard_rated_purchases) || 0,
        box10_zero_rated_purchases: Number(data.box10_zero_rated_purchases) || 0,
        box11_exempt_purchases: Number(data.box11_exempt_purchases) || 0,
      });
      const rcNet = Number(data._rc_net_aed) || 0;
      const rcVat = Number(data._rc_vat_aed) || 0;
      setRcMeta(rcNet > 0 ? { rc_net_aed: rcNet, rc_vat_aed: rcVat } : null);
      const entNet = Number(data._entertainment_blocked_net_aed) || 0;
      const entVat = Number(data._entertainment_blocked_vat_aed) || 0;
      setEntertainmentMeta(entNet > 0 ? { blocked_net_aed: entNet, blocked_vat_aed: entVat } : null);
      const id = Number(data.return_id);
      setReturnId(id);
      setStatus(data.status || "generated");
      setSubmissionStatus(data.submission_status || "not_submitted");
      setFtaReference(data.fta_reference_number || "");
      setInfo(
        "Return generated. Export the filing pack, then enter the box amounts on EmaraTax. This app does not submit to the FTA."
      );
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
      const res = await apiClient.get(`/api/vat/returns/${returnId}/${path}`, {
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
      a.download =
        kind === "pdf"
          ? `VAT201_filing_worksheet_${returnId}.pdf`
          : `VAT201_export_for_emaratax_${returnId}.xlsx`;
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

  const handleMarkFiled = async () => {
    if (!returnId) return;
    setMarkingFiled(true);
    setError(null);
    setInfo(null);
    try {
      const { data } = await apiClient.post(`/api/vat/returns/${returnId}/mark-filed`, {
        fta_reference_number: ftaReference.trim() || null,
      });
      setStatus(data.status || "filed");
      setSubmissionStatus(data.submission_status || "filed_manually");
      if (data.fta_reference_number) setFtaReference(data.fta_reference_number);
      setInfo(
        data.message ||
          "Marked as filed. Filing was recorded in UAE Tax only — EmaraTax remains the official submission channel."
      );
    } catch (e: unknown) {
      const ax = axios.isAxiosError(e);
      const msg = ax
        ? (e.response?.data as { detail?: string })?.detail || e.message
        : "Failed to mark as filed";
      setError(typeof msg === "string" ? msg : "Failed to mark as filed");
    } finally {
      setMarkingFiled(false);
    }
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-7">
        <div>
          <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">
            // VAT Return
          </div>
          <h2 className="font-playfair text-[26px] font-bold">VAT201 — Export for EmaraTax filing</h2>
          <p className="text-[13px] text-muted mt-1 max-w-2xl">
            Generate accurate Box 1–11 amounts from verified transactions, then export a filing pack
            for your team to enter on EmaraTax. UAE Tax does not auto-submit to the FTA.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-[rgba(78,168,255,0.25)] bg-[rgba(30,70,150,0.18)] px-5 py-4 mb-6 text-[13px] text-muted leading-relaxed">
        <strong className="text-white font-medium">Filing workflow:</strong> Generate return → Export
        PDF/Excel → Log in to{" "}
        <a
          href="https://eservices.tax.gov.ae/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gold-lt underline underline-offset-2"
        >
          EmaraTax
        </a>{" "}
        → enter box amounts (or use the portal&apos;s offline template upload) → Submit on EmaraTax →
        mark as Filed here.
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
            {loading ? "Generating…" : "Generate FTA Return"}
          </button>
          <button
            type="button"
            onClick={() => downloadFile("pdf")}
            disabled={!returnId || !!downloading}
            className="px-5 py-2.5 rounded-[10px] text-sm font-medium border border-border-g text-gold-lt bg-gold-pale hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {downloading === "pdf" ? "Downloading…" : "Export PDF worksheet"}
          </button>
          <button
            type="button"
            onClick={() => downloadFile("excel")}
            disabled={!returnId || !!downloading}
            className="px-5 py-2.5 rounded-[10px] text-sm font-medium border border-border text-muted hover:border-border-g hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {downloading === "excel" ? "Downloading…" : "Export for EmaraTax (Excel)"}
          </button>
        </div>

        {error && (
          <div className="rounded-[10px] border border-red/40 bg-[rgba(255,107,107,0.1)] px-4 py-3 text-sm text-red">
            {error}
          </div>
        )}

        {info && (
          <div className="rounded-[10px] border border-green/35 bg-[rgba(45,212,160,0.08)] px-4 py-3 text-sm text-green">
            {info}
          </div>
        )}

        {returnId && (
          <div className="space-y-4 pt-2 border-t border-border">
            <div className="flex flex-wrap items-center gap-3 text-[13px]">
              <span className="text-muted">
                Return #{returnId}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono uppercase tracking-wide border ${
                  isFiled
                    ? "bg-[rgba(45,212,160,0.12)] text-green border-green/40"
                    : "bg-gold-pale text-gold-lt border-border-g"
                }`}
              >
                {statusLabel(status)}
              </span>
              {!isFiled && (
                <span className="text-[11px] text-muted2">→ mark Filed after EmaraTax submit</span>
              )}
            </div>

            {!isFiled && (
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                    EmaraTax reference (optional)
                  </label>
                  <input
                    type="text"
                    value={ftaReference}
                    onChange={(e) => setFtaReference(e.target.value)}
                    placeholder="Acknowledgement / reference number"
                    className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleMarkFiled}
                  disabled={markingFiled}
                  className="px-5 py-2.5 rounded-[10px] text-sm font-medium border border-green/40 text-green bg-[rgba(45,212,160,0.1)] hover:bg-[rgba(45,212,160,0.18)] disabled:opacity-50"
                >
                  {markingFiled ? "Saving…" : "Mark as Filed"}
                </button>
              </div>
            )}

            {isFiled && ftaReference && (
              <p className="text-[12px] text-muted font-mono">
                EmaraTax ref: {ftaReference}
              </p>
            )}
          </div>
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
            {b.n === 2 && rcMeta && rcMeta.rc_vat_aed > 0 && (
              <div className="text-[10px] text-purple-300/70 font-mono mt-0.5">
                Incl. {fmtAed(rcMeta.rc_vat_aed)} reverse charge output VAT (Art. 48)
              </div>
            )}
            {b.n === 6 && rcMeta && rcMeta.rc_net_aed > 0 && (
              <div className="text-[10px] text-purple-300/70 font-mono mt-0.5">
                Incl. {fmtAed(rcMeta.rc_net_aed)} reverse charge expenses (self-assessed, Art. 48)
              </div>
            )}
            {b.n === 6 && entertainmentMeta && entertainmentMeta.blocked_net_aed > 0 && (
              <div className="text-[10px] text-amber/70 font-mono mt-0.5">
                Excl. {fmtAed(entertainmentMeta.blocked_net_aed)} entertainment (Art. 53 — input VAT
                blocked)
              </div>
            )}
            {b.n === 7 && rcMeta && rcMeta.rc_vat_aed > 0 && (
              <div className="text-[10px] text-purple-300/70 font-mono mt-0.5">
                Incl. {fmtAed(rcMeta.rc_vat_aed)} reverse charge input VAT (Art. 48)
              </div>
            )}
            {b.n === 7 && entertainmentMeta && entertainmentMeta.blocked_vat_aed > 0 && (
              <div className="text-[10px] text-amber/70 font-mono mt-0.5">
                Excl. {fmtAed(entertainmentMeta.blocked_vat_aed)} blocked VAT on entertainment (Art.
                53)
              </div>
            )}
            {b.n >= 9 && (
              <div className="text-[10px] text-blue-300/70 font-mono mt-0.5">
                Auto-populated from verified purchase classifications
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
