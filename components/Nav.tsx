"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import CompanySelector from "@/components/CompanySelector";

export default function Nav() {
  const pathname = usePathname();
  const isDashboard = pathname?.startsWith("/dashboard");
  const { user, signOut, loading } = useAuth();

  return (
    <nav
      id="main-nav"
      className="fixed top-0 left-0 right-0 z-[200] flex items-center justify-between px-12 h-16 bg-[rgba(4,13,31,0.90)] backdrop-blur-[24px] border-b border-[rgba(78,168,255,0.14)] transition-all"
    >
      <Link href="/" className="flex items-center gap-[11px] cursor-pointer no-underline">
        <div className="w-9 h-9 bg-gradient-to-br from-gold to-gold-lt rounded-lg flex items-center justify-center font-playfair font-black text-base text-deep shadow-[0_4px_16px_rgba(201,168,76,0.45)] flex-shrink-0">
          G
        </div>
        <span className="font-playfair text-lg font-bold bg-gradient-to-br from-gold-lt to-white bg-clip-text text-transparent">
          GulfTax AI
        </span>
      </Link>

      {!isDashboard && (
        <ul className="flex gap-8 list-none">
          <li>
            <a href="#usecases" className="text-muted no-underline text-sm font-medium tracking-wide hover:text-white transition-colors">
              Use Cases
            </a>
          </li>
          <li>
            <a href="#modules" className="text-muted no-underline text-sm font-medium tracking-wide hover:text-white transition-colors">
              Modules
            </a>
          </li>
          <li>
            <a href="#pricing" className="text-muted no-underline text-sm font-medium tracking-wide hover:text-white transition-colors">
              Pricing
            </a>
          </li>
          <li>
            <a href="#why" className="text-muted no-underline text-sm font-medium tracking-wide hover:text-white transition-colors">
              Why Us
            </a>
          </li>
        </ul>
      )}

      {isDashboard && !loading && (
        <div className="flex items-center gap-4">
          <CompanySelector />
          {user?.email && (
            <span className="text-xs text-muted font-mono hidden lg:block truncate max-w-[180px]">
              {user.email}
            </span>
          )}
        </div>
      )}

      <div className="flex gap-2.5 items-center">
        {!isDashboard && (
          <Link
            href="/login"
            className="px-5 py-2 rounded-lg text-xs font-semibold cursor-pointer border-none no-underline transition-all bg-transparent border border-border-g text-gold hover:bg-gold-pale"
          >
            Sign In
          </Link>
        )}
        {isDashboard && user ? (
          <button
            onClick={() => signOut()}
            className="px-5 py-2 rounded-lg text-xs font-semibold cursor-pointer border border-border text-muted hover:text-white hover:border-[rgba(78,168,255,0.3)] transition-all bg-transparent"
          >
            Sign out
          </button>
        ) : (
          <Link
            href={isDashboard ? "/dashboard" : "/dashboard"}
            className="px-5 py-2 rounded-lg text-xs font-semibold cursor-pointer border-none no-underline transition-all bg-gradient-to-br from-gold to-gold-lt text-deep shadow-[0_4px_18px_rgba(201,168,76,0.38)] hover:shadow-[0_6px_24px_rgba(201,168,76,0.52)] hover:-translate-y-px"
          >
            {isDashboard ? "Dashboard" : "Open Dashboard →"}
          </Link>
        )}
      </div>
    </nav>
  );
}
