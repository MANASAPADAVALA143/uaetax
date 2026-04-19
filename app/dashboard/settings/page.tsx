"use client";

import { useEffect, useState } from "react";

const STORAGE_SETTINGS = "gulftax_company_settings";

type EntityType = "mainland" | "free_zone" | "designated_zone";

interface CompanySettings {
  companyName: string;
  trn: string;
  entityType: EntityType;
}

const DEFAULTS: CompanySettings = {
  companyName: "Al Baraka Trading LLC",
  trn: "100123456700003",
  entityType: "mainland",
};

function loadSettings(): CompanySettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<CompanySettings>;
    return {
      companyName: typeof p.companyName === "string" ? p.companyName : DEFAULTS.companyName,
      trn: typeof p.trn === "string" ? p.trn : DEFAULTS.trn,
      entityType:
        p.entityType === "free_zone" || p.entityType === "designated_zone"
          ? p.entityType
          : "mainland",
    };
  } catch {
    return DEFAULTS;
  }
}

export default function SettingsPage() {
  const [companyName, setCompanyName] = useState(DEFAULTS.companyName);
  const [trn, setTrn] = useState(DEFAULTS.trn);
  const [entityType, setEntityType] = useState<EntityType>(DEFAULTS.entityType);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    const s = loadSettings();
    setCompanyName(s.companyName);
    setTrn(s.trn);
    setEntityType(s.entityType);
  }, []);

  const handleSave = () => {
    const payload: CompanySettings = { companyName, trn, entityType };
    try {
      localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2000);
  };

  return (
    <>
      <div className="mb-7">
        <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">
          // Settings
        </div>
        <h2 className="font-playfair text-[26px] font-bold">Workspace preferences</h2>
        <p className="text-[13px] text-muted mt-1">
          Company profile is stored in this browser only until Supabase auth ships (Prompt 5).
        </p>
      </div>

      <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 mb-6 space-y-6 max-w-xl">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Company</h3>
        <div>
          <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
            Company name
          </label>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
            TRN
          </label>
          <input
            value={trn}
            onChange={(e) => setTrn(e.target.value)}
            className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm font-mono focus:border-border-g focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
            Entity type
          </label>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as EntityType)}
            className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
          >
            <option value="mainland">Mainland</option>
            <option value="free_zone">Free zone</option>
            <option value="designated_zone">Designated zone</option>
          </select>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2.5 rounded-[10px] text-sm font-medium bg-gold-pale text-gold-lt border border-border-g hover:opacity-95"
          >
            Save
          </button>
          {savedFlash && <span className="text-sm text-green">Saved locally</span>}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 max-w-3xl">
        <div className="rounded-2xl border border-dashed border-border bg-[rgba(4,12,30,0.35)] p-6">
          <h3 className="text-sm font-semibold text-white mb-2">Team</h3>
          <p className="text-[13px] text-muted2 mb-3">Invite colleagues, roles, and approvals.</p>
          <span className="text-[10px] font-mono uppercase tracking-wide text-muted bg-[rgba(255,255,255,0.06)] px-2 py-1 rounded-full">
            Coming soon
          </span>
        </div>
        <div className="rounded-2xl border border-dashed border-border bg-[rgba(4,12,30,0.35)] p-6">
          <h3 className="text-sm font-semibold text-white mb-2">Integrations</h3>
          <p className="text-[13px] text-muted2 mb-3">
            ERP connectors, ASP webhooks, and FTA EmaraTax links.
          </p>
          <span className="text-[10px] font-mono uppercase tracking-wide text-muted bg-[rgba(255,255,255,0.06)] px-2 py-1 rounded-full">
            Coming soon
          </span>
        </div>
      </div>
    </>
  );
}
