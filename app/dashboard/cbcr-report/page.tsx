"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";

const CBC_THRESHOLD = 3_150_000_000;

const DEMO_COUNTRIES = [
  { country: "UAE", related: 12_500_000, unrelated: 45_000_000, pbt: 8_200_000, paid: 0, accrued: 738_000, employees: 85, assets: 22_000_000, activities: "HQ, software" },
  { country: "United Kingdom", related: 2_100_000, unrelated: 18_000_000, pbt: 3_400_000, paid: 850_000, accrued: 0, employees: 12, assets: 4_500_000, activities: "Consulting" },
  { country: "Singapore", related: 900_000, unrelated: 6_200_000, pbt: 1_100_000, paid: 187_000, accrued: 0, employees: 8, assets: 2_100_000, activities: "Regional sales" },
];

function fmt(n: number) {
  return n.toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function CbcrReportPage() {
  const fyEnd = new Date("2025-12-31");
  const filingDeadline = new Date(fyEnd);
  filingDeadline.setMonth(filingDeadline.getMonth() + 12);

  const [groupRevenue, setGroupRevenue] = useState("850000000");
  const [countryCount, setCountryCount] = useState("8");
  const [surrogateEntity, setSurrogateEntity] = useState("GulfTax AI FZ-LLC");
  const [filingCountry, setFilingCountry] = useState("UAE");
  const [submissionStatus, setSubmissionStatus] = useState<"not_started" | "in_progress" | "filed">("not_started");

  const applicability = useMemo(() => {
    const revenue = parseFloat(groupRevenue) || 0;
    const required = revenue >= CBC_THRESHOLD;
    return { revenue, required };
  }, [groupRevenue]);

  return (
    <>
      <div className="mb-7">
        <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">
          // CbCR Report
        </div>
        <h2 className="font-playfair text-[26px] font-bold">Country-by-Country Reporting</h2>
        <p className="text-[13px] text-muted mt-1">
          UAE Ministry of Finance · MNE groups · OECD BEPS Action 13
        </p>
      </div>

      {/* Section 1 — Applicability */}
      <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6 mb-6">
        <h3 className="text-sm font-semibold text-white mb-4">CbCR Applicability Check</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <label className="text-[11px] text-muted2">
            Consolidated group revenue (AED)
            <input
              type="number"
              value={groupRevenue}
              onChange={(e) => setGroupRevenue(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white font-mono"
            />
          </label>
          <label className="text-[11px] text-muted2">
            Number of countries operating in
            <input
              type="number"
              value={countryCount}
              onChange={(e) => setCountryCount(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white font-mono"
            />
          </label>
        </div>
        {applicability.required ? (
          <div className="rounded-lg border border-red/30 bg-[rgba(255,107,107,0.08)] p-4 text-sm space-y-1">
            <p className="text-red font-semibold">🔴 CbCR mandatory — file with MoF</p>
            <p className="text-muted">Deadline: 12 months after FY end ({filingDeadline.toLocaleDateString("en-GB")})</p>
            <p className="text-muted2 text-[12px]">First filing: FY 2019 onwards</p>
          </div>
        ) : (
          <div className="rounded-lg border border-green/30 bg-[rgba(45,212,160,0.08)] p-4 text-sm">
            <p className="text-green font-semibold">✅ CbCR not required</p>
            <p className="text-muted mt-1">Monitor if group revenue approaches AED 3.15B threshold</p>
            <p className="text-muted2 text-[12px] mt-1">
              Current: AED {fmt(applicability.revenue)} · Threshold: AED {fmt(CBC_THRESHOLD)}
            </p>
          </div>
        )}
      </div>

      {/* Section 2 — Country table (shown when required OR as demo preview) */}
      <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-white">Country Data Table</h3>
          <p className="text-[11px] text-muted2 mt-1">
            {applicability.required ? "CbCR filing data by jurisdiction" : "Sample structure — activate when group exceeds threshold"}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border bg-[rgba(4,12,30,0.6)]">
                {["Country", "Rev (RP)", "Rev (3rd party)", "PBT", "Tax paid", "Tax accrued", "Employees", "Assets", "Activities"].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-muted2 uppercase font-mono whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DEMO_COUNTRIES.map((row, i) => (
                <tr key={row.country} className={i % 2 ? "bg-[rgba(255,255,255,0.02)]" : ""}>
                  <td className="px-3 py-2 text-white font-medium">{row.country}</td>
                  <td className="px-3 py-2 font-mono text-muted">{fmt(row.related)}</td>
                  <td className="px-3 py-2 font-mono text-muted">{fmt(row.unrelated)}</td>
                  <td className="px-3 py-2 font-mono text-white">{fmt(row.pbt)}</td>
                  <td className="px-3 py-2 font-mono text-muted">{fmt(row.paid)}</td>
                  <td className="px-3 py-2 font-mono text-muted">{fmt(row.accrued)}</td>
                  <td className="px-3 py-2 font-mono text-center">{row.employees}</td>
                  <td className="px-3 py-2 font-mono text-muted">{fmt(row.assets)}</td>
                  <td className="px-3 py-2 text-muted">{row.activities}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 3 — Filing status */}
      <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4">CbCR Filing Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <label className="text-[11px] text-muted2">
            Surrogate filing entity
            <input value={surrogateEntity} onChange={(e) => setSurrogateEntity(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white text-sm" />
          </label>
          <label className="text-[11px] text-muted2">
            Filing country
            <select value={filingCountry} onChange={(e) => setFilingCountry(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white text-sm">
              <option value="UAE">UAE</option>
              <option value="Other">Other jurisdiction</option>
            </select>
          </label>
          <label className="text-[11px] text-muted2">
            Submission status
            <select value={submissionStatus} onChange={(e) => setSubmissionStatus(e.target.value as typeof submissionStatus)} className="mt-1 w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white text-sm">
              <option value="not_started">Not started</option>
              <option value="in_progress">In progress</option>
              <option value="filed">Filed</option>
            </select>
          </label>
          <div className="rounded-lg border border-border p-3">
            <p className="text-[10px] text-muted2 uppercase font-mono">Filing deadline</p>
            <p className="text-lg font-bold font-mono text-white mt-1">{filingDeadline.toLocaleDateString("en-GB")}</p>
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-border p-4 text-[12px] text-muted">
          Status: <span className="text-gold-lt font-mono capitalize">{submissionStatus.replace("_", " ")}</span>
          {!applicability.required && (
            <span className="ml-2 text-green">· No filing obligation at current revenue level</span>
          )}
        </div>
      </div>
    </>
  );
}
