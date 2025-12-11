import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { SidebarProvider, useSidebar } from "@/contexts/SidebarContext";

interface LayoutProps {
  children: React.ReactNode;
}

function LayoutContent({ children }: LayoutProps) {
  const { isHidden, isExpanded, setState } = useSidebar();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      
      {isExpanded && (
        <div 
          className="fixed inset-0 bg-black/50 md:hidden z-30 transition-opacity duration-300"
          onClick={() => setState("hidden")}
          data-testid="sidebar-overlay"
        />
      )}
      
      <div className="flex flex-1 flex-col overflow-hidden w-full">
        <Header />
        <main className="flex-1 scroll-y-container bg-muted/20 p-4 md:p-6">
          <div className="mx-auto max-w-7xl space-y-6 md:space-y-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export function Layout({ children }: LayoutProps) {
  return (
    <SidebarProvider>
      <LayoutContent>{children}</LayoutContent>
    </SidebarProvider>
  );
}
