"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AnimatedBackground from "@/components/AnimatedBackground";
import Nav from "@/components/Nav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [activeNav, setActiveNav] = useState("overview");

  const navItems = [
    { id: "overview", label: "Overview", icon: "🏠", href: "/dashboard" },
    { id: "vat-classifier", label: "VAT Classifier", icon: "📊", href: "/dashboard/vat-classifier" },
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
    { id: "esr", label: "ESR Filing", icon: "⚖️", href: "#", coming: "Soon" },
    { id: "transfer-pricing", label: "Transfer Pricing", icon: "🌐", href: "#", coming: "Soon" },
    { id: "cbcr", label: "CbCR Report", icon: "📑", href: "#", coming: "Soon" },
  ];

  const reportItems = [
    { id: "fta-reports", label: "FTA Reports", icon: "📈", href: "#" },
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
          {reportItems.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] cursor-pointer text-[13px] font-medium text-muted transition-all select-none hover:bg-[rgba(30,70,150,0.25)] hover:text-white"
            >
              <span className="text-base flex-shrink-0">{item.icon}</span>
              {item.label}
            </Link>
          ))}

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
