"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

/**
 * CbCR is hidden from nav (Enterprise / MNE groups above AED 3.15B only).
 * This page remains so old bookmarks don't land on demo data.
 */
export default function CbcrReportPage() {
  return (
    <>
      <div className="mb-7">
        <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">
          // CbCR Report
        </div>
        <h2 className="font-playfair text-[26px] font-bold">Country-by-Country Reporting</h2>
        <p className="text-[13px] text-muted mt-1">
          Not included in the current release for typical UAE SME / CA firm clients.
        </p>
      </div>

      <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 max-w-2xl space-y-4">
        <span className="inline-block text-[9px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-gold-pale text-gold-lt border border-border-g">
          Enterprise roadmap
        </span>
        <p className="text-[14px] text-muted leading-relaxed">
          UAE CbCR applies to large multinational groups with consolidated revenue at or above{" "}
          <span className="text-white font-mono">AED 3.15 billion</span> (OECD BEPS Action 13 /
          UAE CT alignment). It is not required for most mid-market clients.
        </p>
        <p className="text-[14px] text-muted leading-relaxed">
          This module is deferred — we do not ship demo jurisdiction tables or claim OECD CbC XML
          generation. Contact us if your group meets the threshold and needs a scoped build.
        </p>
        <Link
          href="/dashboard"
          className="inline-block mt-2 px-5 py-2.5 rounded-[10px] text-sm font-medium bg-gradient-to-br from-gold to-gold-lt text-deep no-underline"
        >
          Back to Overview
        </Link>
      </div>
    </>
  );
}
