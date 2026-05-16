import { Switch, Route, Redirect, useLocation } from "wouter";
import React, { Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppErrorBoundary } from "@/components/system/AppErrorBoundary";
import { Loader2 } from "lucide-react";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Signup from "@/pages/signup";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";

const Dashboard = React.lazy(() => import("@/pages/dashboard"));
const Leads = React.lazy(() => import("@/pages/leads"));
const Campaigns = React.lazy(() => import("@/pages/campaigns"));
const RvmPage = React.lazy(() => import("@/pages/rvm"));
const PropertyDetail = React.lazy(() => import("@/pages/property-detail"));
const Properties = React.lazy(() => import("@/pages/properties"));
const Contracts = React.lazy(() => import("@/pages/contracts"));
const ContractGenerator = React.lazy(() => import("@/pages/contract-generator"));
const Analytics = React.lazy(() => import("@/pages/analytics"));
const Settings = React.lazy(() => import("@/pages/settings"));
const Calculator = React.lazy(() => import("@/pages/calculator"));
const Timesheet = React.lazy(() => import("@/pages/timesheet"));
const Notifications = React.lazy(() => import("@/pages/notifications"));
const Playground = React.lazy(() => import("@/pages/playground"));
const Buyers = React.lazy(() => import("@/pages/buyers"));
const TasksPage = React.lazy(() => import("@/pages/tasks"));
const CalendarPage = React.lazy(() => import("@/pages/calendar"));
const TodayPage = React.lazy(() => import("@/pages/today"));
const Contacts = React.lazy(() => import("@/pages/contacts"));
const SearchPage = React.lazy(() => import("@/pages/search"));
const SignContractPage = React.lazy(() => import("@/pages/sign-contract"));
const FieldModePage = React.lazy(() => import("@/pages/field"));
const PhoneWorkspace = React.lazy(() => import("@/pages/phone"));
const DialerWorkspace = React.lazy(() => import("@/pages/dialer-workspace"));
const SystemHealthPage = React.lazy(() => import("@/pages/system-health"));

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, loading } = useAuth();
  const [location] = useLocation();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin text-border" /></div>}>
      <Component />
    </Suspense>
  );
}

function Router() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }
  return (
    <AppErrorBoundary>
      <Switch>
        <Route path="/login">
          {isAuthenticated ? <Redirect to="/dashboard" /> : <Login />}
        </Route>
        <Route path="/signup">
          {isAuthenticated ? <Redirect to="/login" /> : <Signup />}
        </Route>
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/dashboard">
          {() => <ProtectedRoute component={Dashboard} />}
        </Route>
        <Route path="/">
          {() => (isAuthenticated ? <Redirect to="/dashboard" /> : <Redirect to="/login" />)}
        </Route>
        <Route path="/leads">
          {() => <ProtectedRoute component={Leads} />}
        </Route>
        <Route path="/campaigns">
          {() => <ProtectedRoute component={Campaigns} />}
        </Route>
        <Route path="/rvm">
          {() => <ProtectedRoute component={RvmPage} />}
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
        <Route path="/sign-contract/:token">
          {() => <ProtectedRoute component={SignContractPage} />}
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
        <Route path="/buyers">
          {() => <ProtectedRoute component={Buyers} />}
        </Route>
        <Route path="/tasks">
          {() => <ProtectedRoute component={TasksPage} />}
        </Route>
        <Route path="/calendar">
          {() => <ProtectedRoute component={CalendarPage} />}
        </Route>
        <Route path="/today">
          {() => <ProtectedRoute component={TodayPage} />}
        </Route>
        <Route path="/contacts">
          {() => <ProtectedRoute component={Contacts} />}
        </Route>
        <Route path="/search">
          {() => <ProtectedRoute component={SearchPage} />}
        </Route>
        <Route path="/field">
          {() => <ProtectedRoute component={FieldModePage} />}
        </Route>
        <Route path="/phone">
          {() => <ProtectedRoute component={PhoneWorkspace} />}
        </Route>
        <Route path="/dialer">
          {() => <ProtectedRoute component={DialerWorkspace} />}
        </Route>
        <Route path="/system-health">
          {() => <ProtectedRoute component={SystemHealthPage} />}
        </Route>
        <Route component={NotFound} />
      </Switch>
    </AppErrorBoundary>
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
