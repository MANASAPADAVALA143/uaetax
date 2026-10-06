"use client";

import { useState } from "react";
import { MapPin, AlertTriangle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  DESIGNATED_ZONES,
  evaluateDesignatedZone,
  type LocationType,
  type TransactionKind,
} from "@/lib/gulftax/vatAdvanced";
import { saveDesignatedZoneTransaction } from "@/lib/vatAdvanced.service";

const LOCATION_OPTIONS: { value: LocationType; label: string }[] = [
  { value: "mainland", label: "UAE Mainland" },
  { value: "free_zone", label: "Free Zone (non-designated)" },
  { value: "designated_zone", label: "Designated Zone" },
  { value: "overseas", label: "Overseas" },
];

export default function DesignatedZonesPage() {
  const { activeCompany } = useAuth();
  const activeCompanyId = activeCompany ? String(activeCompany.company_id) : null;
  const wsId = activeCompanyId ?? "";

  const [supplierLocation, setSupplierLocation] = useState<LocationType>("designated_zone");
  const [customerLocation, setCustomerLocation] = useState<LocationType>("mainland");
  const [transactionType, setTransactionType] = useState<TransactionKind>("goods");
  const [supplierZone, setSupplierZone] = useState("jafza");
  const [customerZone, setCustomerZone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const supplierZoneName =
    supplierLocation === "designated_zone"
      ? DESIGNATED_ZONES.find((z) => z.id === supplierZone)?.name ?? supplierZone
      : undefined;
  const customerZoneName =
    customerLocation === "designated_zone"
      ? DESIGNATED_ZONES.find((z) => z.id === customerZone)?.name ?? customerZone
      : undefined;

  const result = evaluateDesignatedZone({
    supplierLocation,
    customerLocation,
    transactionType,
    supplierZoneName,
    customerZoneName,
  });

  const onEvaluate = async () => {
    if (!wsId) {
      setSaveOk(false);
      setSaveMsg("No active company — complete company setup first.");
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    setSaveOk(false);
    try {
      await saveDesignatedZoneTransaction(
        wsId,
        activeCompanyId,
        {
          supplierLocation,
          customerLocation,
          transactionType,
          supplierZoneName,
          customerZoneName,
        },
        result,
      );
      setSaveOk(true);
      setSaveMsg("Transaction logged.");
    } catch (e) {
      setSaveOk(false);
      setSaveMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <p className="text-[11px] font-mono uppercase tracking-widest text-amber-500 mb-1">VAT Advanced</p>
      <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
        <MapPin className="w-7 h-7 text-amber-400" />
        Designated Zones Handler
      </h1>
      <p className="text-sm text-gray-400 mb-6 max-w-2xl">
        Designated Zones have special VAT treatment for <strong className="text-white">goods only</strong>.
        Services always follow normal UAE VAT rules — selecting DZ for services is the most common compliance mistake.
      </p>

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <div className="rounded-2xl border border-border bg-gradient-to-br from-card to-[#071228] p-6 space-y-4">
          <label className="block text-xs text-gray-400">
            Transaction type
            <select
              value={transactionType}
              onChange={(e) => setTransactionType(e.target.value as TransactionKind)}
              className="mt-1 w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-white"
            >
              <option value="goods">Goods</option>
              <option value="services">Services</option>
            </select>
          </label>
          <label className="block text-xs text-gray-400">
            Supplier location
            <select
              value={supplierLocation}
              onChange={(e) => setSupplierLocation(e.target.value as LocationType)}
              className="mt-1 w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-white"
            >
              {LOCATION_OPTIONS.filter((o) => o.value !== "overseas").map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          {supplierLocation === "designated_zone" && (
            <label className="block text-xs text-gray-400">
              Supplier Designated Zone
              <select
                value={supplierZone}
                onChange={(e) => setSupplierZone(e.target.value)}
                className="mt-1 w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-white"
              >
                {DESIGNATED_ZONES.map((z) => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-xs text-gray-400">
            Customer location
            <select
              value={customerLocation}
              onChange={(e) => setCustomerLocation(e.target.value as LocationType)}
              className="mt-1 w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-white"
            >
              {LOCATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          {customerLocation === "designated_zone" && (
            <label className="block text-xs text-gray-400">
              Customer Designated Zone
              <select
                value={customerZone}
                onChange={(e) => setCustomerZone(e.target.value)}
                className="mt-1 w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-white"
              >
                <option value="">Select zone…</option>
                {DESIGNATED_ZONES.map((z) => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={() => void onEvaluate()}
            disabled={saving || !wsId}
            className="px-4 py-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-sm disabled:opacity-50"
          >
            {saving ? "Logging…" : "Evaluate & log transaction"}
          </button>
          {saveMsg && (
            <p className={`text-sm ${saveOk ? "text-green-400" : "text-red-400"}`}>{saveMsg}</p>
          )}
        </div>

        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
          <h2 className="text-sm font-semibold text-amber-400 mb-3">VAT treatment</h2>
          <div className="text-2xl font-bold text-white mb-1">{result.vatTreatment}</div>
          <div className="text-sm font-mono text-amber-300 mb-4">Rate: {result.vatRate}%</div>
          <p className="text-sm text-gray-300 leading-relaxed">{result.explanation}</p>
          {result.warning && (
            <div className="mt-4 flex gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              {result.warning}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border text-sm font-semibold text-white">
          UAE Designated Zones (FTA list)
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
          {DESIGNATED_ZONES.map((z) => (
            <div key={z.id} className="bg-[#071228] px-4 py-3">
              <div className="text-sm text-white">{z.name}</div>
              <div className="text-[11px] text-gray-500">{z.emirate}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-gray-400">
        <strong className="text-gray-300">Goods quick reference:</strong> DZ→DZ outside scope · DZ→Mainland import 5% ·
        Mainland→DZ export 0% · DZ→Overseas export 0%
      </div>
    </div>
  );
}
