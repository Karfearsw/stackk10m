import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Leads from "@/pages/leads";
import PropertyDetail from "@/pages/property-detail";
import Properties from "@/pages/properties";
import Contracts from "@/pages/contracts";
import ContractGenerator from "@/pages/contract-generator";
import Analytics from "@/pages/analytics";
import Settings from "@/pages/settings";
import Calculator from "@/pages/calculator";
import Timesheet from "@/pages/timesheet";
import Login from "@/pages/login";
import Signup from "@/pages/signup";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import Notifications from "@/pages/notifications";
import Playground from "@/pages/playground";
import Buyers from "@/pages/buyers";
import Dialer from "@/pages/dialer";
import Contacts from "@/pages/contacts";
import History from "@/pages/history";
import VoicemailPage from "@/pages/voicemail";
import SearchPage from "@/pages/search";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  return <Component />;
}

function Router() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/" component={() => (isAuthenticated ? <Dashboard /> : <Login />)} />
      <Route path="/login" component={() => (isAuthenticated ? <Dashboard /> : <Login />)} />
      <Route path="/signup" component={() => <Signup />} />
      <Route path="/forgot-password" component={() => <ForgotPassword />} />
      <Route path="/reset-password" component={() => <ResetPassword />} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/leads" component={() => <ProtectedRoute component={Leads} />} />
      <Route path="/properties" component={() => <ProtectedRoute component={Properties} />} />
      <Route path="/property/:id" component={() => <ProtectedRoute component={PropertyDetail} />} />
      <Route path="/contracts" component={() => <ProtectedRoute component={Contracts} />} />
      <Route path="/contract-generator" component={() => <ProtectedRoute component={ContractGenerator} />} />
      <Route path="/analytics" component={() => <ProtectedRoute component={Analytics} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
      <Route path="/calculator" component={() => <ProtectedRoute component={Calculator} />} />
      <Route path="/timesheet" component={() => <ProtectedRoute component={Timesheet} />} />
      <Route path="/notifications" component={() => <ProtectedRoute component={Notifications} />} />
      <Route path="/playground" component={() => <ProtectedRoute component={Playground} />} />
      <Route path="/buyers" component={() => <ProtectedRoute component={Buyers} />} />
      <Route path="/dialer" component={() => <ProtectedRoute component={Dialer} />} />
      <Route path="/contacts" component={() => <ProtectedRoute component={Contacts} />} />
      <Route path="/history" component={() => <ProtectedRoute component={History} />} />
      <Route path="/voicemail" component={() => <ProtectedRoute component={VoicemailPage} />} />
      <Route path="/search" component={() => <ProtectedRoute component={SearchPage} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
