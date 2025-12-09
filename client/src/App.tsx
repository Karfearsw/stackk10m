import { Switch, Route, Redirect, useLocation } from "wouter";
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
  const [location] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/login">
        {isAuthenticated ? <Redirect to="/" /> : <Login />}
      </Route>
      <Route path="/signup">
        {isAuthenticated ? <Redirect to="/" /> : <Signup />}
      </Route>
      <Route path="/">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/leads">
        {() => <ProtectedRoute component={Leads} />}
      </Route>
      <Route path="/opportunities">
        {() => <ProtectedRoute component={Properties} />}
      </Route>
      <Route path="/properties">
        {() => <Redirect to="/opportunities" />}
      </Route>
      <Route path="/opportunities/:id">
        {() => <ProtectedRoute component={PropertyDetail} />}
      </Route>
      <Route path="/properties/:id">
        {() => {
          const [location] = useLocation();
          return <Redirect to={location.replace('/properties', '/opportunities')} />;
        }}
      </Route>
      <Route path="/contracts">
        {() => <ProtectedRoute component={ContractGenerator} />}
      </Route>
      <Route path="/contracts-old">
        {() => <ProtectedRoute component={Contracts} />}
      </Route>
      <Route path="/analytics">
        {() => <ProtectedRoute component={Analytics} />}
      </Route>
      <Route path="/settings">
        {() => <ProtectedRoute component={Settings} />}
      </Route>
      <Route path="/calculator">
        {() => <ProtectedRoute component={Calculator} />}
      </Route>
      <Route path="/timesheet">
        {() => <ProtectedRoute component={Timesheet} />}
      </Route>
      <Route path="/notifications">
        {() => <ProtectedRoute component={Notifications} />}
      </Route>
      <Route path="/playground">
        {() => <ProtectedRoute component={Playground} />}
      </Route>
      <Route path="/dialer">
        {() => <ProtectedRoute component={Dialer} />}
      </Route>
      <Route path="/buyers">
        {() => <ProtectedRoute component={Buyers} />}
      </Route>
      <Route path="/contacts">
        {() => <ProtectedRoute component={Contacts} />}
      </Route>
      <Route path="/history">
        {() => <ProtectedRoute component={History} />}
      </Route>
      <Route path="/voicemail">
        {() => <ProtectedRoute component={VoicemailPage} />}
      </Route>
      <Route path="/search">
        {() => <ProtectedRoute component={SearchPage} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
      <Route path="/dialer">
        {() => <ProtectedRoute component={require('@/pages/dialer').default} />}
      </Route>
