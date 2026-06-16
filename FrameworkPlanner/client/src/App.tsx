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
import MagicLink from "@/pages/magic-link";
import { getAppVariant } from "@/lib/appVariant";

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
const Dialer = React.lazy(() => import("@/pages/dialer"));
const DialerWorkspace = React.lazy(() => import("@/pages/dialer-workspace"));
const SystemHealthPage = React.lazy(() => import("@/pages/system-health"));
const TeamsPage = React.lazy(() => import("@/pages/teams"));
const XpLandingPage = React.lazy(() => import("@/pages/xp/index"));
const XpExperiencePage = React.lazy(() => import("@/pages/xp/experience"));
const XpAdminPage = React.lazy(() => import("@/pages/xp/admin"));
const XpCheckoutSuccessPage = React.lazy(() => import("@/pages/xp/checkout-success"));
const XpCheckoutCancelPage = React.lazy(() => import("@/pages/xp/checkout-cancel"));
const CompaniesPage = React.lazy(() => import("@/pages/companies"));
const DocumentsPage = React.lazy(() => import("@/pages/documents"));
const AutomationsPage = React.lazy(() => import("@/pages/automations"));
const AuditPage = React.lazy(() => import("@/pages/audit"));
const AuditLogPage = React.lazy(() => import("@/pages/audit-log"));

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

  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <Component />
    </Suspense>
  );
}

function Router() {
  const { isAuthenticated, loading } = useAuth();
  const appVariant = getAppVariant();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <Switch>
      {/* Auth Routes */}
      <Route path="/login" component={() => (isAuthenticated ? <Redirect to="/" /> : <Login />)} />
      <Route path="/signup" component={() => (isAuthenticated ? <Redirect to="/" /> : <Signup />)} />
      <Route path="/forgot-password" component={() => <ForgotPassword />} />
      <Route path="/reset-password" component={() => <ResetPassword />} />
      <Route path="/magic-link" component={() => <MagicLink />} />

      {/* XP Routes */}
      <Route path="/xp" component={() => <ProtectedRoute component={XpLandingPage} />} />
      <Route path="/xp/experience" component={() => <ProtectedRoute component={XpExperiencePage} />} />
      <Route path="/xp/admin" component={() => <ProtectedRoute component={XpAdminPage} />} />
      <Route path="/xp/checkout-success" component={() => <ProtectedRoute component={XpCheckoutSuccessPage} />} />
      <Route path="/xp/checkout-cancel" component={() => <ProtectedRoute component={XpCheckoutCancelPage} />} />

      {/* Core Protected Routes */}
      <Route path="/" component={() => (isAuthenticated ? <ProtectedRoute component={Dashboard} /> : <Redirect to="/login" />)} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/leads" component={() => <ProtectedRoute component={Leads} />} />
      <Route path="/campaigns" component={() => <ProtectedRoute component={Campaigns} />} />
      <Route path="/rvm" component={() => <ProtectedRoute component={RvmPage} />} />
      <Route path="/property/:id" component={() => <ProtectedRoute component={PropertyDetail} />} />
      <Route path="/properties" component={() => <ProtectedRoute component={Properties} />} />
      <Route path="/contracts" component={() => <ProtectedRoute component={Contracts} />} />
      <Route path="/contract-generator" component={() => <ProtectedRoute component={ContractGenerator} />} />
      <Route path="/analytics" component={() => <ProtectedRoute component={Analytics} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
      <Route path="/calculator" component={() => <ProtectedRoute component={Calculator} />} />
      <Route path="/timesheet" component={() => <ProtectedRoute component={Timesheet} />} />
      <Route path="/notifications" component={() => <ProtectedRoute component={Notifications} />} />
      <Route path="/playground" component={() => <ProtectedRoute component={Playground} />} />
      <Route path="/buyers" component={() => <ProtectedRoute component={Buyers} />} />
      <Route path="/tasks" component={() => <ProtectedRoute component={TasksPage} />} />
      <Route path="/calendar" component={() => <ProtectedRoute component={CalendarPage} />} />
      <Route path="/today" component={() => <ProtectedRoute component={TodayPage} />} />
      <Route path="/contacts" component={() => <ProtectedRoute component={Contacts} />} />
      <Route path="/search" component={() => <ProtectedRoute component={SearchPage} />} />
      <Route path="/sign-contract/:id" component={() => <ProtectedRoute component={SignContractPage} />} />
      <Route path="/field" component={() => <ProtectedRoute component={FieldModePage} />} />
      <Route path="/phone" component={() => <ProtectedRoute component={PhoneWorkspace} />} />
      <Route path="/dialer" component={() => <ProtectedRoute component={Dialer} />} />
      <Route path="/dialer-workspace" component={() => <ProtectedRoute component={DialerWorkspace} />} />
      <Route path="/system-health" component={() => <ProtectedRoute component={SystemHealthPage} />} />
      <Route path="/teams" component={() => <ProtectedRoute component={TeamsPage} />} />
      <Route path="/companies" component={() => <ProtectedRoute component={CompaniesPage} />} />
      <Route path="/documents" component={() => <ProtectedRoute component={DocumentsPage} />} />
      <Route path="/automations" component={() => <ProtectedRoute component={AutomationsPage} />} />
      <Route path="/audit" component={() => <ProtectedRoute component={AuditPage} />} />
      <Route path="/audit-log" component={() => <ProtectedRoute component={AuditLogPage} />} />

      {/* Fallback */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppErrorBoundary>
          <TooltipProvider>
            <Router />
            <Toaster />
          </TooltipProvider>
        </AppErrorBoundary>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
