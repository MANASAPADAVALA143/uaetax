"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";

const ESR_ACTIVITIES = [
  "Banking Business",
  "Insurance Business",
  "Investment Fund Management",
  "Lease Finance Business",
  "Headquarters Business",
  "Shipping Business",
  "Holding Company Business",
  "Intellectual Property Business",
  "Distribution & Service Centre Business",
] as const;

type TestStatus = "pass" | "fail" | "partial";

function statusBadge(status: TestStatus) {
  if (status === "pass") return { label: "Pass ✅", className: "text-green bg-[rgba(45,212,160,0.12)] border-green/30" };
  if (status === "partial") return { label: "Partial ⚠️", className: "text-amber bg-[rgba(255,183,0,0.12)] border-amber/30" };
  return { label: "Fail ❌", className: "text-red bg-[rgba(255,107,107,0.12)] border-red/30" };
}

export default function EsrFilingPage() {
  const fyEnd = new Date("2025-12-31");
  const notificationDeadline = new Date(fyEnd);
  notificationDeadline.setMonth(notificationDeadline.getMonth() + 6);
  const filingDeadline = new Date(fyEnd);
  filingDeadline.setMonth(filingDeadline.getMonth() + 12);

  const daysRemaining = Math.max(0, Math.ceil((filingDeadline.getTime() - Date.now()) / 86400000));

  const [activities, setActivities] = useState<Record<string, boolean>>({
    "Headquarters Business": true,
  });

  const [test1, setTest1] = useState({
    boardMeetings: true,
    quorumInUae: true,
    minutesKept: true,
    directorKnowledge: false,
  });

  const [test2, setTest2] = useState({
    cigaInUae: true,
    adequateEmployees: true,
    adequateSpend: true,
    physicalAssets: false,
  });

  const [test3, setTest3] = useState({
    employees: "12",
    expenditure: "4200000",
    premises: "yes",
  });

  const [notificationFiled, setNotificationFiled] = useState(false);
  const [notificationDate, setNotificationDate] = useState("");
  const [returnFiled, setReturnFiled] = useState(false);
  const [returnDate, setReturnDate] = useState("");

  const esrApplies = Object.values(activities).some(Boolean);

  const test1Status: TestStatus = useMemo(() => {
    const vals = Object.values(test1);
    const pass = vals.filter(Boolean).length;
    if (pass === vals.length) return "pass";
    if (pass >= 2) return "partial";
    return "fail";
  }, [test1]);

  const test2Status: TestStatus = useMemo(() => {
    const vals = Object.values(test2);
    const pass = vals.filter(Boolean).length;
    if (pass === vals.length) return "pass";
    if (pass >= 2) return "partial";
    return "fail";
  }, [test2]);

  const test3Status: TestStatus = useMemo(() => {
    const emp = parseInt(test3.employees, 10) || 0;
    const spend = parseFloat(test3.expenditure) || 0;
    if (emp >= 3 && spend >= 1_000_000 && test3.premises === "yes") return "pass";
    if (emp >= 1 && spend >= 500_000) return "partial";
    return "fail";
  }, [test3]);

  const toggleActivity = (name: string) => {
    setActivities((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <>
      <div className="mb-7">
        <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">
          // ESR Filing
        </div>
        <h2 className="font-playfair text-[26px] font-bold">Economic Substance Regulations</h2>
        <p className="text-[13px] text-muted mt-1">
          Cabinet Resolution 57/2020 · UAE Ministry of Finance
        </p>
      </div>

      {/* Section 1 — Activity test */}
      <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6 mb-6">
        <h3 className="text-sm font-semibold text-white mb-4">ESR Activity Test</h3>
        <p className="text-[12px] text-muted mb-3">Does the company conduct any relevant activity?</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
          {ESR_ACTIVITIES.map((act) => (
            <label key={act} className="flex items-center gap-2 text-[13px] text-muted cursor-pointer hover:text-white">
              <input
                type="checkbox"
                checked={!!activities[act]}
                onChange={() => toggleActivity(act)}
                className="rounded border-border"
              />
              {activities[act] ? "☑" : "□"} {act}
            </label>
          ))}
        </div>
        {esrApplies ? (
          <div className="rounded-lg border border-amber/40 bg-[rgba(255,183,0,0.08)] p-4 text-sm">
            <p className="text-amber font-semibold">ESR applies to your business</p>
            <p className="text-muted mt-1">Filing deadline: {filingDeadline.toLocaleDateString("en-GB")} (12 months after FY end)</p>
            <p className="text-muted">Notification deadline: {notificationDeadline.toLocaleDateString("en-GB")} (6 months after FY end)</p>
          </div>
        ) : (
          <div className="rounded-lg border border-green/30 bg-[rgba(45,212,160,0.08)] p-4 text-sm text-green">
            ✅ ESR does not apply — no filing required
          </div>
        )}
      </div>

      {esrApplies && (
        <>
          {/* Section 2 — Substance tests */}
          <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6 mb-6">
            <h3 className="text-sm font-semibold text-white mb-4">Economic Substance Test</h3>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-xl border border-border p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[12px] font-semibold text-white">Test 1: Directed & Managed in UAE</p>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${statusBadge(test1Status).className}`}>
                    {statusBadge(test1Status).label}
                  </span>
                </div>
                {(
                  [
                    ["boardMeetings", "Board meetings held in UAE"],
                    ["quorumInUae", "Quorum of directors physically in UAE"],
                    ["minutesKept", "Board minutes kept in UAE"],
                    ["directorKnowledge", "Directors have necessary knowledge"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-[12px] text-muted mb-2 cursor-pointer">
                    <input type="checkbox" checked={test1[key]} onChange={(e) => setTest1({ ...test1, [key]: e.target.checked })} />
                    {test1[key] ? "☑" : "□"} {label}
                  </label>
                ))}
              </div>

              <div className="rounded-xl border border-border p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[12px] font-semibold text-white">Test 2: CIGA in UAE</p>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${statusBadge(test2Status).className}`}>
                    {statusBadge(test2Status).label}
                  </span>
                </div>
                {(
                  [
                    ["cigaInUae", "CIGA performed in UAE"],
                    ["adequateEmployees", "Adequate employees in UAE"],
                    ["adequateSpend", "Adequate expenditure in UAE"],
                    ["physicalAssets", "Physical assets in UAE"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-[12px] text-muted mb-2 cursor-pointer">
                    <input type="checkbox" checked={test2[key]} onChange={(e) => setTest2({ ...test2, [key]: e.target.checked })} />
                    {test2[key] ? "☑" : "□"} {label}
                  </label>
                ))}
              </div>

              <div className="rounded-xl border border-border p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[12px] font-semibold text-white">Test 3: Adequacy</p>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${statusBadge(test3Status).className}`}>
                    {statusBadge(test3Status).label}
                  </span>
                </div>
                <label className="block text-[11px] text-muted2 mb-2">
                  UAE employees
                  <input value={test3.employees} onChange={(e) => setTest3({ ...test3, employees: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white font-mono text-sm" />
                </label>
                <label className="block text-[11px] text-muted2 mb-2">
                  Annual UAE expenditure (AED)
                  <input value={test3.expenditure} onChange={(e) => setTest3({ ...test3, expenditure: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white font-mono text-sm" />
                </label>
                <label className="block text-[11px] text-muted2">
                  UAE premises
                  <select value={test3.premises} onChange={(e) => setTest3({ ...test3, premises: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white text-sm">
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          {/* Section 3 — Filing status */}
          <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-white mb-4">ESR Filing Status</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="rounded-lg border border-border p-4">
                <label className="flex items-center gap-2 text-sm text-white mb-2">
                  <input type="checkbox" checked={notificationFiled} onChange={(e) => setNotificationFiled(e.target.checked)} />
                  Notification filed
                </label>
                <input
                  type="date"
                  value={notificationDate}
                  onChange={(e) => setNotificationDate(e.target.value)}
                  disabled={!notificationFiled}
                  className="w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white text-sm disabled:opacity-40"
                />
              </div>
              <div className="rounded-lg border border-border p-4">
                <label className="flex items-center gap-2 text-sm text-white mb-2">
                  <input type="checkbox" checked={returnFiled} onChange={(e) => setReturnFiled(e.target.checked)} />
                  Annual Return filed
                </label>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  disabled={!returnFiled}
                  className="w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white text-sm disabled:opacity-40"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Filing deadline", value: filingDeadline.toLocaleDateString("en-GB") },
                { label: "Days remaining", value: String(daysRemaining), highlight: true },
                { label: "First-year penalty", value: "AED 20,000" },
                { label: "Repeat penalty", value: "AED 400,000" },
              ].map((c) => (
                <div key={c.label} className="rounded-lg border border-border p-3">
                  <p className="text-[10px] text-muted2 uppercase font-mono">{c.label}</p>
                  <p className={`text-lg font-bold font-mono mt-1 ${c.highlight ? "text-red" : "text-white"}`}>{c.value}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
