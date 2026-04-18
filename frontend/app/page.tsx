import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0d1b2e] flex items-center justify-center">
      <div className="text-center">
        <div className="mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-[#C9A84C] to-[#E8C96A] rounded-lg flex items-center justify-center font-bold text-[#040D1F] text-2xl mx-auto mb-4">
            G
          </div>
          <h1 className="text-4xl font-bold mb-4 text-white">GulfTax AI</h1>
          <p className="text-[#7A9BB5] mb-8">UAE Tax Compliance Platform</p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 bg-gradient-to-br from-[#C9A84C] to-[#E8C96A] text-[#040D1F] px-8 py-3 rounded-lg font-semibold hover:shadow-lg transition-all"
        >
          Open Dashboard →
        </Link>
      </div>
    </div>
  );
}
