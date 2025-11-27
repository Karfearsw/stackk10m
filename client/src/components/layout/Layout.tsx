import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { SidebarProvider } from "@/contexts/SidebarContext";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Sidebar />
        {/* Mobile overlay for sidebar */}
        <div className="fixed inset-0 bg-black/50 md:hidden z-5 hidden" id="sidebar-overlay" />
        
        <div className="flex flex-1 flex-col overflow-hidden w-full">
          <Header />
          <main className="flex-1 scroll-y-container bg-muted/20 p-4 md:p-6">
            <div className="mx-auto max-w-7xl space-y-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
