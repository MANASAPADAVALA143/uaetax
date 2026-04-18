import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0d1b2e]">
      <Header />
      <Sidebar />
      <main className="ml-64 pt-16 min-h-screen">
        {children}
      </main>
    </div>
  );
}
