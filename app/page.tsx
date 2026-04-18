import AnimatedBackground from "@/components/AnimatedBackground";
import Nav from "@/components/Nav";
import Link from "next/link";

export default function Home() {
  return (
    <>
      <AnimatedBackground />
      <Nav />
      <div id="landing" className="pt-16">
        {/* HERO */}
        <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center text-center px-10 py-20">
          <div className="inline-flex items-center gap-2 px-[18px] py-1.5 bg-gold-pale border border-border-g rounded-full text-xs font-medium text-gold-lt tracking-widest uppercase mb-10 animate-[fadeUp_0.7s_ease_both]">
            <span className="w-1.5 h-1.5 rounded-full bg-green shadow-[0_0_8px_#2DD4A0] animate-[blink_2s_infinite]" />
            Now live — UAE Corporate Tax + VAT Automation
          </div>

          <h1 className="font-playfair text-[clamp(48px,7.5vw,88px)] font-black leading-[1.04] tracking-[-0.025em] mb-7 animate-[fadeUp_0.7s_0.08s_ease_both]">
            UAE Tax Compliance,<br />
            <em className="italic bg-gradient-to-r from-gold via-gold-lt to-gold bg-[length:200%] bg-clip-text text-transparent animate-[shimmer_4s_ease_infinite]">
              Powered by AI
            </em>
          </h1>

          <p className="text-[clamp(16px,2.2vw,19px)] text-muted max-w-[580px] leading-[1.7] mx-auto mb-12 font-normal animate-[fadeUp_0.7s_0.16s_ease_both]">
            The only platform built for UAE's unique tax landscape — Corporate Tax (9%),
            VAT (5%), ESR, Transfer Pricing, FTA filing — all automated for CA firms and corporates.
          </p>

          <div className="flex gap-3.5 justify-center mb-18 animate-[fadeUp_0.7s_0.24s_ease_both]">
            <Link
              href="/dashboard"
              className="px-10 py-4 rounded-xl text-[15px] font-bold cursor-pointer border-none font-sans transition-all no-underline bg-gradient-to-br from-gold to-gold-lt text-deep shadow-[0_8px_32px_rgba(201,168,76,0.42)] hover:shadow-[0_12px_40px_rgba(201,168,76,0.58)] hover:-translate-y-0.5"
            >
              Open Dashboard →
            </Link>
            <a
              href="#modules"
              className="px-10 py-4 rounded-xl text-[15px] font-bold cursor-pointer border-none font-sans transition-all no-underline bg-transparent border-[1.5px] border-[rgba(255,255,255,0.18)] text-white hover:border-[rgba(255,255,255,0.4)] hover:bg-[rgba(30,70,150,0.25)]"
            >
              Explore Modules
            </a>
          </div>

          <div className="flex justify-center gap-0 max-w-[860px] w-full mx-auto bg-[rgba(6,18,48,0.92)] border border-border rounded-[18px] overflow-hidden backdrop-blur-[20px] animate-[fadeUp_0.7s_0.32s_ease_both]">
            <div className="flex-1 py-7 px-4 text-center border-r border-[rgba(78,168,255,0.15)]">
              <span className="font-playfair text-4xl font-black text-gold-lt block leading-none mb-1.5">
                12
              </span>
              <span className="text-[11px] text-muted uppercase tracking-widest font-medium">
                UAE Use Cases
              </span>
            </div>
            <div className="flex-1 py-7 px-4 text-center border-r border-[rgba(78,168,255,0.15)]">
              <span className="font-playfair text-4xl font-black text-gold-lt block leading-none mb-1.5">
                4
              </span>
              <span className="text-[11px] text-muted uppercase tracking-widest font-medium">
                GCC Countries
              </span>
            </div>
            <div className="flex-1 py-7 px-4 text-center border-r border-[rgba(78,168,255,0.15)]">
              <span className="font-playfair text-4xl font-black text-gold-lt block leading-none mb-1.5">
                98%
              </span>
              <span className="text-[11px] text-muted uppercase tracking-widest font-medium">
                VAT Accuracy
              </span>
            </div>
            <div className="flex-1 py-7 px-4 text-center">
              <span className="font-playfair text-4xl font-black text-gold-lt block leading-none mb-1.5">
                3 min
              </span>
              <span className="text-[11px] text-muted uppercase tracking-widest font-medium">
                Return Generated
              </span>
            </div>
          </div>
        </div>

        {/* USE CASES */}
        <div id="usecases" className="bg-navy border-t border-border border-b border-border">
          <div className="max-w-[1180px] mx-auto px-12 py-25">
            <span className="font-mono text-[11px] text-gold uppercase tracking-[0.14em] mb-3.5 block">
              // UAE Tax Coverage
            </span>
            <h2 className="font-playfair text-[clamp(30px,4vw,46px)] font-bold leading-[1.12] mb-3.5">
              12 Use Cases.<br />Total Compliance.
            </h2>
            <p className="text-base text-muted max-w-[500px] leading-[1.7] mb-13">
              Every UAE tax obligation — automated, tracked, and filed. Specific to the UAE regulatory environment, not a generic tool.
            </p>

            <div className="grid grid-cols-4 gap-3.5">
              {[
                { n: "01", title: "UAE Corporate Tax (9%)", text: "Taxable income computation, CT return preparation and e-filing to FTA. Introduced June 2023." },
                { n: "02", title: "VAT Compliance (5%)", text: "Classify transactions, calculate input/output VAT, generate all 8 FTA return boxes." },
                { n: "03", title: "Free Zone Tax Treatment", text: "QFZP eligibility checker — 0% qualifying income vs 9% non-qualifying auto-split." },
                { n: "04", title: "Transfer Pricing Docs", text: "Local file + master file generation for UAE MNCs with GCC operations." },
                { n: "05", title: "Excise Tax Filing", text: "Auto-filing for tobacco, energy drinks, carbonated drinks — excise duty calculations." },
                { n: "06", title: "ESR Compliance", text: "Annual notification + report auto-generation. Deadline tracking for UAE entities." },
                { n: "07", title: "CbCR Reporting", text: "Country-by-Country Reporting for groups above AED 3.15B. Auto-filing to FTA." },
                { n: "08", title: "RERA Compliance", text: "Escrow account accounting + IFRS 15 revenue recognition for UAE real estate CA firms." },
                { n: "09", title: "GCC Group Consolidation", text: "Multi-entity consolidation for UAE holding companies with KSA, Qatar, Bahrain subs." },
                { n: "10", title: "IFRS to UAE-GAAP Mapping", text: "Auto-mapping for CA firms serving UAE listed companies. Dual reporting automation." },
                { n: "11", title: "FTA Portal Integration", text: "Direct e-filing via FTA API. No manual portal entry. Status tracking included." },
                { n: "12", title: "VAT Recon Bot", text: "Cross-check VAT output tax vs invoices. Flags mismatches before filing. AED-level precision." },
              ].map((uc) => (
                <div
                  key={uc.n}
                  className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6 transition-all relative overflow-hidden hover:border-border-g hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.5)] group"
                >
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <span className="font-mono text-[11px] text-gold tracking-[0.1em] block mb-2.5">
                    {uc.n}
                  </span>
                  <div className="text-sm font-semibold text-white mb-2 leading-[1.35]">
                    {uc.title}
                  </div>
                  <div className="text-xs text-muted leading-[1.65]">
                    {uc.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* MODULES */}
        <div id="modules" className="bg-gradient-to-b from-[rgba(5,16,42,0.95)] to-[rgba(7,20,50,0.95)] border-t border-border border-b border-[rgba(78,168,255,0.14)]">
          <div className="max-w-[1180px] mx-auto px-12 py-25">
            <span className="font-mono text-[11px] text-gold uppercase tracking-[0.14em] mb-3.5 block">
              // Platform Architecture
            </span>
            <h2 className="font-playfair text-[clamp(30px,4vw,46px)] font-bold leading-[1.12] mb-3.5">
              Four Modules.<br />One Platform.
            </h2>
            <p className="text-base text-muted max-w-[500px] leading-[1.7] mb-13">
              Start with Module 1, expand as you grow. Each module is independently deployable — or use the full suite.
            </p>

            <div className="grid grid-cols-2 gap-4.5">
              <div className="col-span-2 bg-gradient-to-br from-card to-[#071228] border border-border rounded-[20px] p-9 transition-all relative overflow-hidden hover:border-border-g hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
                <div className="w-[50px] h-[50px] rounded-[14px] flex items-center justify-center text-[22px] mb-5.5 bg-gold-pale">
                  🧾
                </div>
                <span className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-2.5 block">
                  Module 01 — Core
                </span>
                <div className="font-playfair text-[22px] font-bold mb-3">
                  VAT Intelligence Engine
                </div>
                <p className="text-sm text-muted leading-[1.72] mb-5.5">
                  AI classifies every transaction using UAE VAT Decree rules — standard-rated (5%), zero-rated, exempt, out-of-scope, or reverse charge. Handles free zone vs mainland complexity automatically. Generates all 8 FTA return boxes and runs reconciliation before you file.
                </p>
                <div className="flex flex-wrap gap-2">
                  {["Transaction Classifier", "FTA Portal Filing", "VAT Recon Bot", "Free Zone Rules", "Return Generator"].map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 rounded-full text-[11px] font-medium font-mono tracking-wide bg-gold-pale text-gold-lt border border-border-g"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              {[
                { n: "Module 02", icon: "🏛️", title: "Corporate Tax Engine", desc: "9% CT liability calculator with QFZP eligibility checker. Determines qualifying vs non-qualifying income. Prepares and e-files CT returns directly.", tags: ["CT Return Filing", "QFZP Checker", "0% Free Zone Rate"], bg: "bg-[rgba(78,168,255,0.12)]" },
                { n: "Module 03", icon: "⚖️", title: "Regulatory Compliance Suite", desc: "ESR notifications, Excise Tax, Transfer Pricing local files, CbCR reporting, and RERA compliance — all automated with AI-generated documentation.", tags: ["ESR Filing", "Transfer Pricing", "CbCR", "RERA"], bg: "bg-[rgba(45,212,160,0.12)]" },
                { n: "Module 04 — Enterprise", icon: "🌐", title: "GCC Group & Reporting", desc: "Multi-entity GCC consolidation for UAE holding companies. IFRS to UAE-GAAP auto-mapping. Intercompany elimination automation.", tags: ["GCC Consolidation", "IFRS Mapping", "IC Elimination"], bg: "bg-[rgba(255,107,107,0.12)]" },
              ].map((mod) => (
                <div
                  key={mod.n}
                  className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-[20px] p-9 transition-all relative overflow-hidden hover:border-border-g hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
                >
                  <div className={`w-[50px] h-[50px] rounded-[14px] flex items-center justify-center text-[22px] mb-5.5 ${mod.bg}`}>
                    {mod.icon}
                  </div>
                  <span className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-2.5 block">
                    {mod.n}
                  </span>
                  <div className="font-playfair text-[22px] font-bold mb-3">
                    {mod.title}
                  </div>
                  <p className="text-sm text-muted leading-[1.72] mb-5.5">
                    {mod.desc}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {mod.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 rounded-full text-[11px] font-medium font-mono tracking-wide bg-gold-pale text-gold-lt border border-border-g"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* PRICING */}
        <div id="pricing" className="bg-navy border-t border-border border-b border-border">
          <div className="max-w-[1180px] mx-auto px-12 py-25">
            <span className="font-mono text-[11px] text-gold uppercase tracking-[0.14em] mb-3.5 block">
              // Pricing
            </span>
            <h2 className="font-playfair text-[clamp(30px,4vw,46px)] font-bold leading-[1.12] mb-3.5">
              Clear Pricing.<br />No Surprises.
            </h2>
            <p className="text-base text-muted max-w-[500px] leading-[1.7] mb-13">
              Choose by who you are. All plans include FTA integration, AI classification, and UAE tax law RAG.
            </p>

            <div className="grid grid-cols-4 gap-4">
              {[
                { who: "Indian CA Firms", price: "$1,500", per: "per month", features: ["Module 1 — VAT Intelligence", "Module 2 — Corporate Tax", "Up to 5 UAE client companies", "FTA portal integration", "Email support"], btn: "Get Started", featured: false },
                { who: "UAE CA / Audit Firms", price: "$4,000", per: "per month", features: ["All 4 Modules", "Unlimited client companies", "ESR + Transfer Pricing", "Priority support + onboarding", "Dedicated account manager"], btn: "Start Free Trial", featured: true },
                { who: "UAE Corporates", price: "$3,000", per: "per month", features: ["Modules 1 + 2 + 3", "Single entity filing", "ESR + Excise Tax", "CFO dashboard included", "Standard support"], btn: "Get Started", featured: false },
                { who: "GCC Enterprise", price: "Custom", per: "tailored pricing", features: ["All 4 Modules + white-label", "GCC consolidation", "CbCR + Transfer Pricing", "SLA-backed support", "On-prem deployment option"], btn: "Contact Sales", featured: false },
              ].map((p) => (
                <div
                  key={p.who}
                  className={`bg-gradient-to-br from-card to-[#071228] border rounded-[20px] p-[34px_26px] transition-all relative ${p.featured ? "border-border-g bg-gradient-to-br from-[rgba(201,168,76,0.1)] to-card" : "border-border"} hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)]`}
                >
                  {p.featured && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-br from-gold to-gold-lt text-deep text-[10px] font-bold px-3.5 py-1 rounded-full uppercase tracking-widest whitespace-nowrap">
                      Most Popular
                    </div>
                  )}
                  <div className="text-[11px] text-gold uppercase tracking-[0.1em] font-mono mb-3">
                    {p.who}
                  </div>
                  <div className="font-playfair text-[38px] font-black text-white leading-none">
                    {p.price}
                  </div>
                  <div className="text-[13px] text-muted mb-6 mt-1">
                    {p.per}
                  </div>
                  <div className="h-px bg-border my-5" />
                  <ul className="list-none flex flex-col gap-2.5 mb-7">
                    {p.features.map((f) => (
                      <li key={f} className="text-[13px] text-muted flex gap-2.5 items-start leading-[1.4]">
                        <span className="text-green font-bold flex-shrink-0 mt-0.5">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    className={`block w-full py-3 rounded-[10px] text-[13px] font-semibold cursor-pointer text-center font-sans transition-all border-none ${p.featured ? "bg-gradient-to-br from-gold to-gold-lt text-deep shadow-[0_4px_18px_rgba(201,168,76,0.4)] hover:shadow-[0_6px_26px_rgba(201,168,76,0.56)] hover:-translate-y-px" : "bg-transparent border-[1.5px] border-border-g text-gold hover:bg-gold-pale"}`}
                  >
                    {p.btn}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div id="why" className="text-center px-12 py-30 relative">
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse, rgba(30,90,200,0.50) 0%, rgba(14,50,130,0.22) 45%, transparent 70%)",
            }}
          />
          <span className="font-mono text-[11px] text-gold uppercase tracking-[0.14em] mb-3.5 block">
            // Get Started
          </span>
          <h2 className="font-playfair text-[clamp(36px,5vw,58px)] font-black leading-[1.08] mb-5">
            UAE Tax is Complex.<br />
            <em className="italic bg-gradient-to-r from-gold to-gold-lt bg-clip-text text-transparent">
              GulfTax AI isn't.
            </em>
          </h2>
          <p className="text-[17px] text-muted max-w-[480px] mx-auto mb-11 leading-[1.65]">
            Built by a CMA with 12 years at Barclays & HSBC. Built specifically for UAE regulations — not adapted from an India or US tool.
          </p>
          <div className="flex gap-3.5 justify-center">
            <Link
              href="/dashboard"
              className="px-10 py-4 rounded-xl text-[15px] font-bold cursor-pointer border-none font-sans transition-all no-underline bg-gradient-to-br from-gold to-gold-lt text-deep shadow-[0_8px_32px_rgba(201,168,76,0.42)] hover:shadow-[0_12px_40px_rgba(201,168,76,0.58)] hover:-translate-y-0.5"
            >
              Open Dashboard →
            </Link>
            <a
              href="#"
              className="px-10 py-4 rounded-xl text-[15px] font-bold cursor-pointer border-none font-sans transition-all no-underline bg-transparent border-[1.5px] border-[rgba(255,255,255,0.18)] text-white hover:border-[rgba(255,255,255,0.4)] hover:bg-[rgba(30,70,150,0.25)]"
            >
              Book a Demo
            </a>
          </div>
          <div className="text-[13px] text-muted2 mt-5">
            No credit card required · UAE VAT + CT ready · FTA integrated
          </div>
        </div>

        {/* FOOTER */}
        <footer className="border-t border-border px-12 py-9 flex items-center justify-between relative z-10">
          <div className="font-playfair text-[17px] font-bold text-gold-lt">
            GulfTax AI
          </div>
          <ul className="flex gap-7 list-none">
            <li>
              <a href="#" className="text-muted text-[13px] no-underline hover:text-white transition-colors">
                Privacy
              </a>
            </li>
            <li>
              <a href="#" className="text-muted text-[13px] no-underline hover:text-white transition-colors">
                Terms
              </a>
            </li>
            <li>
              <a href="#" className="text-muted text-[13px] no-underline hover:text-white transition-colors">
                FTA Compliance
              </a>
            </li>
            <li>
              <a href="#" className="text-muted text-[13px] no-underline hover:text-white transition-colors">
                Contact
              </a>
            </li>
          </ul>
          <div className="text-xs text-muted2">
            Built by Manasa Padavala · CMA · Ex-Barclays, HSBC · Gnanova Technologies
          </div>
        </footer>
      </div>
    </>
  );
}
