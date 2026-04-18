"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function daysUntilJan2027(): number {
  const target = new Date("2027-01-01T00:00:00");
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

type NavItem = {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  comingSoon?: boolean;
  badge?: string;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠", active: true },
  { href: "/dashboard/vat-classifier", label: "VAT Classifier", icon: "📊", active: true },
  { href: "/dashboard/vat-return", label: "VAT Return", icon: "📋", active: true },
  { href: "/dashboard/reconciliation", label: "Reconciliation", icon: "🔍", active: true },
  { href: "/dashboard/corporate-tax", label: "Corporate Tax", icon: "🏢", active: true },
  {
    href: "/dashboard/e-invoicing",
    label: "E-Invoicing",
    icon: "📡",
    active: true,
    badge: `Jan 2027 · ${daysUntilJan2027()}d`,
  },
  { href: "#", label: "ESR Compliance", icon: "⚖️", active: false, comingSoon: true },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙️", active: true },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="w-64 bg-[#0a1a35] border-r border-[rgba(78,168,255,0.15)] h-screen fixed left-0 top-0 pt-16 flex flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const isDisabled = !item.active;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-lg transition-all
                  ${
                    isActive
                      ? "bg-[rgba(201,168,76,0.12)] text-[#E8C96A] border border-[rgba(201,168,76,0.22)]"
                      : isDisabled
                      ? "text-[#3A5070] cursor-not-allowed opacity-50"
                      : "text-[#7A9BB5] hover:bg-[rgba(30,70,150,0.25)] hover:text-white"
                  }
                `}
                onClick={(e) => {
                  if (isDisabled) e.preventDefault();
                }}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="text-sm font-medium">{item.label}</span>
                {item.comingSoon && (
                  <span className="ml-auto text-xs text-[#3A5070] font-mono">
                    Soon
                  </span>
                )}
                {item.badge && (
                  <span className="ml-auto max-w-[7rem] truncate rounded bg-[rgba(255,107,107,0.15)] px-2 py-0.5 text-[10px] font-semibold text-[#FF6B6B]">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
