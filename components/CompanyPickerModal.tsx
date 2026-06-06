"use client";

import { useState } from "react";
import type { CompanyInfo } from "@/context/AuthContext";

interface Props {
  companies: CompanyInfo[];
  onSelect: (company: CompanyInfo) => void;
}

/** Shown after login when user belongs to multiple companies. */
export default function CompanyPickerModal({ companies, onSelect }: Props) {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-[rgba(4,13,31,0.85)] backdrop-blur-sm px-4">
      <div className="w-full max-w-md bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
        <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">
          // Select workspace
        </div>
        <h2 className="font-playfair text-xl font-bold text-white mb-2">Choose a company</h2>
        <p className="text-[13px] text-muted mb-6">Your account has access to multiple companies.</p>
        <ul className="space-y-2 mb-6">
          {companies.map((c) => (
            <li key={c.company_id}>
              <button
                type="button"
                onClick={() => setSelected(c.company_id)}
                className={`w-full text-left rounded-[10px] border px-4 py-3 transition-all ${
                  selected === c.company_id
                    ? "border-border-g bg-gold-pale text-gold-lt"
                    : "border-border text-muted hover:border-border-g"
                }`}
              >
                <span className="font-medium text-white block">{c.company_name}</span>
                {c.trn && <span className="text-[11px] font-mono text-muted2">TRN {c.trn}</span>}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={selected === null}
          onClick={() => {
            const co = companies.find((c) => c.company_id === selected);
            if (co) onSelect(co);
          }}
          className="w-full py-3 rounded-[10px] text-sm font-semibold bg-gradient-to-br from-gold to-gold-lt text-deep disabled:opacity-50"
        >
          Continue to dashboard
        </button>
      </div>
    </div>
  );
}
