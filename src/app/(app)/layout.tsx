import Sidebar from "@/components/Sidebar";
import { AppDataProvider } from "@/components/AppDataProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppDataProvider>
      <div className="shell">
        <Sidebar />
        <main className="main">{children}</main>
      </div>
    </AppDataProvider>
  );
}
