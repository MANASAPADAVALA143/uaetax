export default function DashboardOverview() {
  return (
    <>
      <div className="flex items-center justify-between mb-7">
        <div>
          <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">
            // Dashboard Overview
          </div>
          <h2 className="font-playfair text-[26px] font-bold">
            Al Baraka Trading LLC
          </h2>
          <div className="text-[13px] text-muted mt-1">
            TRN: 100123456700003 · Mainland · Q1 2025 (Jan–Mar)
          </div>
        </div>
        <div className="flex gap-2.5">
          <button className="px-5 py-2 rounded-lg text-xs font-semibold cursor-pointer border-none transition-all bg-transparent border border-border-g text-gold hover:bg-gold-pale">
            📥 Import CSV
          </button>
          <button className="px-5 py-2 rounded-lg text-xs font-semibold cursor-pointer border-none transition-all bg-gradient-to-br from-gold to-gold-lt text-deep shadow-[0_4px_18px_rgba(201,168,76,0.38)] hover:shadow-[0_6px_24px_rgba(201,168,76,0.52)] hover:-translate-y-px">
            ⚡ Generate VAT Return
          </button>
        </div>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-4 gap-4 mb-7">
        {[
          { label: "VAT Due (Box 8)", icon: "🧾", val: "AED 42,180", valClass: "gold", change: "↑ Payable to FTA", changeClass: "up" },
          { label: "Transactions Classified", icon: "✅", val: "50", change: "↑ 100% processed", changeClass: "up" },
          { label: "Recon Mismatches", icon: "🔍", val: "2", valClass: "red", change: "⚠ Review required", changeClass: "down" },
          { label: "FTA Deadline", icon: "📅", val: "28 Apr", change: "⏱ 51 days left", changeClass: "", changeColor: "amber" },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6 transition-all hover:border-border-g hover:-translate-y-0.5"
          >
            <div className="text-xs text-muted uppercase tracking-[0.07em] font-medium mb-2.5 flex items-center justify-between">
              {kpi.label} <span className="text-base">{kpi.icon}</span>
            </div>
            <div
              className={`font-playfair text-[30px] font-black text-white leading-none mb-2 ${
                kpi.valClass === "gold"
                  ? "text-gold-lt"
                  : kpi.valClass === "red"
                  ? "text-red"
                  : kpi.valClass === "green"
                  ? "text-green"
                  : ""
              }`}
            >
              {kpi.val}
            </div>
            <div
              className={`text-xs font-mono ${
                kpi.changeClass === "up"
                  ? "text-green"
                  : kpi.changeClass === "down"
                  ? "text-red"
                  : kpi.changeColor === "amber"
                  ? "text-amber"
                  : ""
              }`}
            >
              {kpi.change}
            </div>
          </div>
        ))}
      </div>

      {/* MAIN CONTENT GRID */}
      <div className="grid grid-cols-[1fr_340px] gap-5 mb-5">
        {/* Transaction Table */}
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-[rgba(78,168,255,0.14)] flex items-center justify-between">
            <div className="text-sm font-semibold text-white flex items-center gap-2">
              Recent Transactions{" "}
              <span className="font-mono text-[11px] text-gold bg-gold-pale px-2 py-0.5 rounded">
                AI Classified
              </span>
            </div>
            <button className="px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border-none transition-all bg-transparent border border-border-g text-gold hover:bg-gold-pale">
              View All 50
            </button>
          </div>
          <div className="p-6">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-[11px] uppercase tracking-[0.08em] text-muted px-3 pb-3 text-left font-medium font-mono border-b border-[rgba(78,168,255,0.14)]">
                    Description
                  </th>
                  <th className="text-[11px] uppercase tracking-[0.08em] text-muted px-3 pb-3 text-left font-medium font-mono border-b border-[rgba(78,168,255,0.14)]">
                    Amount AED
                  </th>
                  <th className="text-[11px] uppercase tracking-[0.08em] text-muted px-3 pb-3 text-left font-medium font-mono border-b border-[rgba(78,168,255,0.14)]">
                    VAT Treatment
                  </th>
                  <th className="text-[11px] uppercase tracking-[0.08em] text-muted px-3 pb-3 text-left font-medium font-mono border-b border-[rgba(78,168,255,0.14)]">
                    Confidence
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  { desc: "Office Furniture Supply", vendor: "Al Futtaim LLC", amt: "52,500", treatment: "Standard 5%", treatmentClass: "pill-std", conf: "99%", confClass: "hi" },
                  { desc: "Export to Saudi Arabia", vendor: "Saudi Trader Co.", amt: "128,000", treatment: "Zero Rated", treatmentClass: "pill-zero", conf: "97%", confClass: "hi" },
                  { desc: "Microsoft Azure Sub.", vendor: "Microsoft Ireland", amt: "8,400", treatment: "⚠ Review", treatmentClass: "pill-flag", conf: "72%", confClass: "mid" },
                  { desc: "Bare Land Rental", vendor: "Dubai Properties", amt: "35,000", treatment: "Exempt", treatmentClass: "pill-ex", conf: "96%", confClass: "hi" },
                  { desc: "Salary — March 2025", vendor: "Payroll Batch", amt: "210,000", treatment: "Out of Scope", treatmentClass: "pill-oos", conf: "100%", confClass: "hi" },
                  { desc: "Consulting Services", vendor: "Accenture UAE", amt: "75,000", treatment: "Standard 5%", treatmentClass: "pill-std", conf: "98%", confClass: "hi" },
                ].map((txn, i) => (
                  <tr key={i} className="hover:bg-[rgba(20,50,100,0.25)]">
                    <td className="px-3 py-3.5 text-[13px] border-b border-[rgba(255,255,255,0.04)] align-middle">
                      <div className="text-white font-medium">{txn.desc}</div>
                      <div className="text-[11px] text-muted mt-0.5">{txn.vendor}</div>
                    </td>
                    <td className="px-3 py-3.5 text-[13px] border-b border-[rgba(255,255,255,0.04)] align-middle font-mono text-white">
                      {txn.amt}
                    </td>
                    <td className="px-3 py-3.5 text-[13px] border-b border-[rgba(255,255,255,0.04)] align-middle">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-semibold font-mono tracking-wide whitespace-nowrap ${
                          txn.treatmentClass === "pill-std"
                            ? "bg-[rgba(45,212,160,0.12)] text-green border border-[rgba(45,212,160,0.25)]"
                            : txn.treatmentClass === "pill-zero"
                            ? "bg-[rgba(78,168,255,0.12)] text-blue border border-[rgba(78,168,255,0.25)]"
                            : txn.treatmentClass === "pill-ex"
                            ? "bg-gold-pale text-gold-lt border border-border-g"
                            : txn.treatmentClass === "pill-flag"
                            ? "bg-[rgba(255,107,107,0.12)] text-red border border-[rgba(255,107,107,0.25)]"
                            : "bg-[rgba(122,132,153,0.14)] text-muted border border-[rgba(122,132,153,0.2)]"
                        }`}
                      >
                        {txn.treatment}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-[13px] border-b border-[rgba(255,255,255,0.04)] align-middle">
                      <span
                        className={`font-mono text-xs ${
                          txn.confClass === "hi" ? "text-green" : "text-amber"
                        }`}
                      >
                        {txn.conf}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col gap-4">
          {/* VAT Return Boxes */}
          <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-[rgba(78,168,255,0.14)] flex items-center justify-between">
              <div className="text-sm font-semibold text-white">VAT Return — Q1 2025</div>
              <button className="px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer border-none transition-all bg-transparent border border-border-g text-gold hover:bg-gold-pale">
                Export PDF
              </button>
            </div>
            <div className="p-6">
              <div className="flex flex-col gap-2">
                {[
                  { label: "Standard Rated Sales", box: "BOX 1", val: "842,500" },
                  { label: "Output VAT (5%)", box: "BOX 2", val: "42,125" },
                  { label: "Zero Rated Supplies", box: "BOX 3", val: "420,000" },
                  { label: "Taxable Expenses", box: "BOX 6", val: "-155,400" },
                  { label: "Input VAT Recoverable", box: "BOX 7", val: "-7,770" },
                  { label: "VAT Payable to FTA", box: "BOX 8", val: "AED 42,180", highlight: true, payable: true },
                ].map((vb) => (
                  <div
                    key={vb.box}
                    className={`flex items-center justify-between px-4 py-3 rounded-[10px] border transition-all ${
                      vb.highlight
                        ? "bg-gold-pale border-border-g"
                        : "bg-[rgba(15,40,90,0.35)] border-border hover:border-border-g"
                    }`}
                  >
                    <div>
                      <div className={`text-xs ${vb.highlight ? "text-gold" : "text-muted"}`}>
                        {vb.label}
                      </div>
                      <div className="font-mono text-[10px] text-gold mt-0.5">{vb.box}</div>
                    </div>
                    <div
                      className={`font-mono text-sm font-semibold ${
                        vb.payable ? "text-red" : "text-white"
                      }`}
                    >
                      {vb.val}
                    </div>
                  </div>
                ))}
              </div>
              <div className="h-1 bg-[rgba(255,255,255,0.07)] rounded-full mt-4 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-gold to-gold-lt transition-all" style={{ width: "85%" }} />
              </div>
              <div className="text-[11px] text-muted mt-2 font-mono">
                85% complete · 2 items pending review
              </div>
            </div>
          </div>

          {/* Deadline Tracker */}
          <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-[rgba(78,168,255,0.14)]">
              <div className="text-sm font-semibold text-white">Compliance Deadlines</div>
            </div>
            <div className="p-6">
              <div className="flex flex-col gap-2.5">
                {[
                  { icon: "🧾", title: "Q1 VAT Return", date: "28 April 2025", days: "51d", status: "soon" },
                  { icon: "🏛️", title: "Corporate Tax Return", date: "31 December 2025", days: "295d", status: "ok" },
                  { icon: "⚖️", title: "ESR Annual Report", date: "31 December 2025", days: "295d", status: "ok" },
                ].map((dl) => (
                  <div key={dl.title} className="flex items-center gap-3.5 px-4 py-3.5 rounded-[10px] bg-[rgba(15,40,90,0.35)] border border-border">
                    <div className="text-xl flex-shrink-0">{dl.icon}</div>
                    <div className="flex-1">
                      <div className="text-[13px] font-medium text-white">{dl.title}</div>
                      <div className="text-[11px] text-muted font-mono mt-0.5">{dl.date}</div>
                    </div>
                    <div
                      className={`font-mono text-xs font-semibold px-2.5 py-1 rounded-md ${
                        dl.status === "urgent"
                          ? "bg-[rgba(255,107,107,0.12)] text-red"
                          : dl.status === "soon"
                          ? "bg-[rgba(255,169,64,0.12)] text-amber"
                          : "bg-[rgba(45,212,160,0.1)] text-green"
                      }`}
                    >
                      {dl.days}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
