"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";

/**
 * Dropdown that shows the active company name and lets multi-company users
 * switch between workspaces.  Only visible when the user belongs to 2+
 * companies; if they have exactly one it renders as a static badge.
 */
export default function CompanySelector() {
  const { companies, activeCompany, setActiveCompany } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  if (!activeCompany) return null;

  // Single company — static badge, no dropdown
  if (companies.length <= 1) {
    return (
      <div className="flex items-center gap-2 px-3.5 py-1.5 bg-gold-pale border border-border-g rounded-full text-xs font-medium text-gold-lt font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-green animate-[blink_2s_infinite]" />
        {activeCompany.company_name}
      </div>
    );
  }

  // Multi-company — clickable dropdown
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3.5 py-1.5 bg-gold-pale border border-border-g rounded-full text-xs font-medium text-gold-lt font-mono hover:border-gold/50 transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-green animate-[blink_2s_infinite]" />
        {activeCompany.company_name}
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[199]"
            onClick={() => setOpen(false)}
          />
          {/* Menu */}
          <div className="absolute right-0 top-full mt-2 z-[200] min-w-[200px] bg-[rgba(4,12,30,0.97)] border border-[rgba(78,168,255,0.18)] rounded-[12px] shadow-[0_8px_32px_rgba(0,0,0,0.5)] py-1.5 backdrop-blur-[20px]">
            <p className="px-3 pt-1 pb-1.5 text-[10px] uppercase tracking-wide font-mono text-muted2">
              Switch workspace
            </p>
            {companies.map((c) => (
              <button
                key={c.company_id}
                onClick={() => {
                  setActiveCompany(c);
                  setOpen(false);
                  // Reload page so all data refreshes for the new company
                  window.location.reload();
                }}
                className={`w-full text-left px-3 py-2 text-[13px] transition-colors flex items-center gap-2 ${
                  c.company_id === activeCompany.company_id
                    ? "text-gold-lt bg-gold-pale"
                    : "text-muted hover:text-white hover:bg-[rgba(30,70,150,0.25)]"
                }`}
              >
                {c.company_id === activeCompany.company_id && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green flex-shrink-0" />
                )}
                {c.company_id !== activeCompany.company_id && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[rgba(78,168,255,0.3)] flex-shrink-0" />
                )}
                <span className="truncate">{c.company_name}</span>
                <span className="ml-auto text-[10px] text-muted2 font-mono uppercase">
                  {c.role}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
