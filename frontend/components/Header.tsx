"use client";

import { useState } from "react";

export default function Header() {
  const [selectedCompany, setSelectedCompany] = useState("Al Baraka Trading LLC");

  const companies = [
    "Al Baraka Trading LLC",
    "Dubai Properties Group",
    "Emirates Trading Co.",
  ];

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-[#040D1F] border-b border-[rgba(78,168,255,0.14)] z-50 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-[#C9A84C] to-[#E8C96A] rounded-lg flex items-center justify-center font-bold text-[#040D1F] text-sm">
            G
          </div>
          <span className="text-lg font-bold bg-gradient-to-br from-[#E8C96A] to-white bg-clip-text text-transparent">
            GulfTax AI
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <select
          value={selectedCompany}
          onChange={(e) => setSelectedCompany(e.target.value)}
          className="bg-[#0A1A35] border border-[rgba(78,168,255,0.22)] rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-[#4EA8FF]"
        >
          {companies.map((company) => (
            <option key={company} value={company}>
              {company}
            </option>
          ))}
        </select>

        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#4EA8FF] to-[#60BFFF] flex items-center justify-center text-white font-semibold text-sm">
          U
        </div>
      </div>
    </header>
  );
}
