"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import AnimatedBackground from "@/components/AnimatedBackground";
import Nav from "@/components/Nav";
import { useAuth } from "@/context/AuthContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { companies, loading, session } = useAuth();
  const [activeNav, setActiveNav] = useState("overview");

  const isLocalDev = process.env.NEXT_PUBLIC_LOCAL_DEV === "true";

  // No Supabase session → login (middleware cannot read localStorage)
  useEffect(() => {
    if (isLocalDev || loading) return;
    if (!session) {
      const next = encodeURIComponent(pathname || "/dashboard");
      router.replace(`/login?next=${next}`);
    }
  }, [loading, session, router, isLocalDev, pathname]);

  // Signed in but no company yet → setup
  useEffect(() => {
    if (isLocalDev || loading || !session) return;
    if (companies.length === 0) {
      const timer = setTimeout(() => {
        if (companies.length === 0) router.replace("/setup-company");
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [loading, companies, session, router, isLocalDev]);

  type MainNavItem = {
    id: string;
    label: string;
    icon: string;
    href: string;
    mandateCountdown?: boolean;
  };

  const mandateJan2027 = new Date("2027-01-01T00:00:00+04:00");
  const daysToPhase1Mandate = Math.max(
    0,
    Math.ceil((mandateJan2027.getTime() - Date.now()) / 86400000)
  );

  const navItems: MainNavItem[] = [
    { id: "overview", label: "Overview", icon: "🏠", href: "/dashboard" },
    {
      id: "e-invoicing",
      label: "E-Invoicing",
      icon: "📧",
      href: "/dashboard/e-invoicing",
      mandateCountdown: true,
    },
    { id: "vat-classifier", label: "VAT Classifier", icon: "📊", href: "/dashboard/vat-classifier" },
    { id: "invoice-flow", label: "Invoice Flow", icon: "🧾", href: "/dashboard/invoice-flow" },
    { id: "vat-return", label: "VAT Return", icon: "📋", href: "/dashboard/vat-return" },
    { id: "recon", label: "Recon Bot", icon: "🔍", href: "/dashboard/recon" },
  ];

  type ComplianceNavItem = {
    id: string;
    label: string;
    icon: string;
    href: string;
    coming?: string;
  };

  const complianceItems: ComplianceNavItem[] = [
    { id: "corporate-tax", label: "Corporate Tax", icon: "🏛️", href: "/dashboard/corporate-tax" },
    { id: "esr", label: "ESR Filing", icon: "⚖️", href: "/dashboard/esr-filing" },
    { id: "transfer-pricing", label: "Transfer Pricing", icon: "🌐", href: "/dashboard/transfer-pricing" },
    { id: "cbcr", label: "CbCR Report", icon: "📑", href: "/dashboard/cbcr-report" },
  ];

  const reportItems = [
    { id: "tax-memo", label: "Tax Memo", icon: "🗒️", href: "/dashboard/tax-memo" },
    { id: "fta-reports", label: "FTA Reports", icon: "📈", href: "/dashboard/fta-reports" },
    { id: "suppliers", label: "Supplier Ledger", icon: "🏭", href: "/dashboard/suppliers" },
    { id: "multi-entity", label: "Multi-Entity", icon: "🏢", href: "#" },
  ];

  return (
    <>
      <AnimatedBackground />
      <Nav />
      <div className="flex pt-16">
        {/* SIDEBAR */}
        <div className="w-60 flex-shrink-0 bg-[rgba(4,12,30,0.97)] border-r border-[rgba(78,168,255,0.15)] h-[calc(100vh-64px)] sticky top-16 overflow-y-auto p-6 flex flex-col gap-1 backdrop-blur-[20px]">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted2 font-mono px-3 pt-2.5 pb-1.5 mt-2">
            Main
          </div>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setActiveNav(item.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] cursor-pointer text-[13px] font-medium transition-all select-none ${
                  isActive
                    ? "bg-gold-pale text-gold-lt border border-border-g"
                    : "text-muted hover:bg-[rgba(30,70,150,0.25)] hover:text-white"
                }`}
              >
                <span className="text-base flex-shrink-0">{item.icon}</span>
                {item.label}
                {item.mandateCountdown && (
                  <span
                    className="ml-auto text-[9px] font-mono tabular-nums bg-[rgba(255,107,107,0.18)] text-red border border-red/35 px-1.5 py-0.5 rounded-full"
                    title="Days until Phase 1 e-invoicing go-live (1 Jan 2027)"
                  >
                    {daysToPhase1Mandate}d
                  </span>
                )}
              </Link>
            );
          })}

          <div className="text-[10px] uppercase tracking-[0.12em] text-muted2 font-mono px-3 pt-2.5 pb-1.5 mt-2">
            Compliance
          </div>
          {complianceItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] cursor-pointer text-[13px] font-medium transition-all select-none ${
                  isActive
                    ? "bg-gold-pale text-gold-lt border border-border-g"
                    : "text-muted hover:bg-[rgba(30,70,150,0.25)] hover:text-white"
                }`}
              >
                <span className="text-base flex-shrink-0">{item.icon}</span>
                {item.label}
                {item.coming && (
                  <span className="ml-auto text-[9px] bg-[rgba(255,255,255,0.07)] text-muted2 px-1.5 py-0.5 rounded-full font-mono uppercase tracking-wide">
                    {item.coming}
                  </span>
                )}
              </Link>
            );
          })}

          <div className="text-[10px] uppercase tracking-[0.12em] text-muted2 font-mono px-3 pt-2.5 pb-1.5 mt-2">
            Reports
          </div>
          {reportItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] cursor-pointer text-[13px] font-medium transition-all select-none ${
                  isActive
                    ? "bg-gold-pale text-gold-lt border border-border-g"
                    : "text-muted hover:bg-[rgba(30,70,150,0.25)] hover:text-white"
                }`}
              >
                <span className="text-base flex-shrink-0">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}

          <div className="text-[10px] uppercase tracking-[0.12em] text-muted2 font-mono px-3 pt-2.5 pb-1.5 mt-2">
            Settings
          </div>
          <Link
            href="/dashboard/settings"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] cursor-pointer text-[13px] font-medium text-muted transition-all select-none hover:bg-[rgba(30,70,150,0.25)] hover:text-white"
          >
            <span className="text-base flex-shrink-0">⚙️</span>
            Settings
          </Link>
          <Link
            href="/"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] cursor-pointer text-[13px] font-medium text-muted transition-all select-none hover:bg-[rgba(30,70,150,0.25)] hover:text-white"
          >
            <span className="text-base flex-shrink-0">←</span>
            Back to Site
          </Link>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex-1 overflow-y-auto h-[calc(100vh-64px)] p-8">
          {children}
        </div>
      </div>
    </>
  );
}
