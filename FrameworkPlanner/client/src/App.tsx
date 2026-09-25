import { Switch, Route, Redirect, useLocation } from "wouter";
import React, { Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { InboundCallToast } from "@/components/telnyx/InboundCallToast";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppErrorBoundary } from "@/components/system/AppErrorBoundary";
import { LogoLoader } from "@/components/system/LogoLoader";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Signup from "@/pages/signup";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import MagicLink from "@/pages/magic-link";
import PublicListing from "@/pages/public-listing";
import { getAppVariant } from "@/lib/appVariant";

const Dashboard = React.lazy(() => import("@/pages/dashboard"));
const Leads = React.lazy(() => import("@/pages/leads"));
const Campaigns = React.lazy(() => import("@/pages/campaigns"));
const RvmPage = React.lazy(() => import("@/pages/rvm"));
const PropertyDetail = React.lazy(() => import("@/pages/property-detail"));
const Properties = React.lazy(() => import("@/pages/properties"));
const Contracts = React.lazy(() => import("@/pages/contracts"));
const ContractGenerator = React.lazy(() => import("@/pages/contract-generator"));
const ContractWizard = React.lazy(() => import("@/pages/contract-wizard"));
const ContractDetail = React.lazy(() => import("@/pages/contract-detail"));
const Analytics = React.lazy(() => import("@/pages/analytics"));
const Settings = React.lazy(() => import("@/pages/settings"));
const Calculator = React.lazy(() => import("@/pages/calculator"));
const Timesheet = React.lazy(() => import("@/pages/timesheet"));
const Notifications = React.lazy(() => import("@/pages/notifications"));
const MessagesPage = React.lazy(() => import("@/pages/messages"));
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
const CommunicationsWorkspace = React.lazy(() => import("@/pages/workspace-communications"));
const ScriptsPage = React.lazy(() => import("@/pages/scripts"));
const CallAuditPage = React.lazy(() => import("@/pages/call-audit"));
const LoisPage = React.lazy(() => import("@/pages/lois"));
const VoicemailPage = React.lazy(() => import("@/pages/voicemail"));
const SystemHealthPage = React.lazy(() => import("@/pages/system-health"));
const TeamsPage = React.lazy(() => import("@/pages/teams"));
const XpLandingPage = React.lazy(() => import("@/pages/xp/index"));
const XpExperiencePage = React.lazy(() => import("@/pages/xp/experience"));
const XpAdminPage = React.lazy(() => import("@/pages/xp/admin"));
const XpCheckoutSuccessPage = React.lazy(() => import("@/pages/xp/checkout-success"));
const XpCheckoutCancelPage = React.lazy(() => import("@/pages/xp/checkout-cancel"));
const CompaniesPage = React.lazy(() => import("@/pages/companies"));
const DocumentsPage = React.lazy(() => import("@/pages/documents"));
const DocsPage = React.lazy(() => import("@/pages/docs"));
const AutomationsPage = React.lazy(() => import("@/pages/automations"));
const AuditPage = React.lazy(() => import("@/pages/audit"));
const AuditLogPage = React.lazy(() => import("@/pages/audit-log"));
const TeamPulsePage = React.lazy(() => import("@/pages/team-pulse"));

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LogoLoader size={72} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><LogoLoader size={72} /></div>}>
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
        <LogoLoader size={72} />
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

      {/* Public Listing Route (no auth required) */}
      <Route path="/l/:token" component={() => (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><LogoLoader size={72} /></div>}>
          <PublicListing />
        </Suspense>
      )} />

      {/* Public E-Sign Route (no auth, token-authenticated) */}
      <Route path="/sign/:token" component={() => (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><LogoLoader size={72} /></div>}>
          <SignContractPage />
        </Suspense>
      )} />

      {/* XP Routes — static slugs first so /xp/:slug never shadows them.
          DEV-003: the customer storefront is public (the XP APIs are too);
          only /xp/admin requires a CRM login. */}
      <Route path="/xp" component={() => (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><LogoLoader size={72} /></div>}>
          <XpLandingPage />
        </Suspense>
      )} />
      <Route path="/xp/experience" component={() => (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><LogoLoader size={72} /></div>}>
          <XpExperiencePage />
        </Suspense>
      )} />
      <Route path="/xp/admin" component={() => <ProtectedRoute component={XpAdminPage} />} />
      <Route path="/xp/checkout-success" component={() => (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><LogoLoader size={72} /></div>}>
          <XpCheckoutSuccessPage />
        </Suspense>
      )} />
      <Route path="/xp/checkout-cancel" component={() => (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><LogoLoader size={72} /></div>}>
          <XpCheckoutCancelPage />
        </Suspense>
      )} />
      {/* XP-CRIT-1: the storefront links to /xp/<slug>; without this route the
          entire customer booking flow 404s. */}
      <Route path="/xp/:slug" component={() => (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><LogoLoader size={72} /></div>}>
          <XpExperiencePage />
        </Suspense>
      )} />

      {/* Core Protected Routes */}
      <Route path="/" component={() => (isAuthenticated ? <ProtectedRoute component={Dashboard} /> : <Redirect to="/login" />)} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/leads" component={() => <ProtectedRoute component={Leads} />} />
      <Route path="/campaigns" component={() => <ProtectedRoute component={Campaigns} />} />
      <Route path="/rvm" component={() => <ProtectedRoute component={RvmPage} />} />
      <Route path="/property/:id" component={() => <ProtectedRoute component={PropertyDetail} />} />
      <Route path="/opportunities/:id" component={() => <ProtectedRoute component={PropertyDetail} />} />
      <Route path="/properties" component={() => <ProtectedRoute component={Properties} />} />
      <Route path="/opportunities" component={() => <ProtectedRoute component={Properties} />} />
      <Route path="/contracts" component={() => <ProtectedRoute component={Contracts} />} />
      <Route path="/contract-generator" component={() => <ProtectedRoute component={ContractGenerator} />} />
      <Route path="/contracts/new" component={() => <ProtectedRoute component={ContractWizard} />} />
      <Route path="/contracts/:id" component={() => <ProtectedRoute component={ContractDetail} />} />
      <Route path="/analytics" component={() => <ProtectedRoute component={Analytics} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
      <Route path="/calculator" component={() => <ProtectedRoute component={Calculator} />} />
      <Route path="/timesheet" component={() => <ProtectedRoute component={Timesheet} />} />
      <Route path="/notifications" component={() => <ProtectedRoute component={Notifications} />} />
      <Route path="/messages" component={() => <ProtectedRoute component={MessagesPage} />} />
      <Route path="/playground" component={() => <ProtectedRoute component={Playground} />} />
      <Route path="/buyers" component={() => <ProtectedRoute component={Buyers} />} />
      <Route path="/tasks" component={() => <ProtectedRoute component={TasksPage} />} />
      <Route path="/calendar" component={() => <ProtectedRoute component={CalendarPage} />} />
      <Route path="/today" component={() => <ProtectedRoute component={TodayPage} />} />
      <Route path="/contacts" component={() => <ProtectedRoute component={Contacts} />} />
      <Route path="/search" component={() => <ProtectedRoute component={SearchPage} />} />
      <Route path="/field" component={() => <ProtectedRoute component={FieldModePage} />} />
      <Route path="/phone" component={() => <ProtectedRoute component={PhoneWorkspace} />} />
      <Route path="/voicemail" component={() => <ProtectedRoute component={VoicemailPage} />} />
      <Route path="/dialer" component={() => <ProtectedRoute component={Dialer} />} />
      <Route path="/dialer-workspace" component={() => <ProtectedRoute component={DialerWorkspace} />} />
      <Route path="/dialer/workspace" component={() => <ProtectedRoute component={DialerWorkspace} />} />
      <Route path="/workspace/communications" component={() => <ProtectedRoute component={CommunicationsWorkspace} />} />
      <Route path="/scripts" component={() => <ProtectedRoute component={ScriptsPage} />} />
      {/* N5: Call Audit was only reachable as a Settings tab; the nav deep-link
          404'd. Dedicated route reuses the same CallAuditContent component. */}
      <Route path="/call-audit" component={() => <ProtectedRoute component={CallAuditPage} />} />
      {/* M22/M29: LOIs live in the Document Management tabs; give them a real
          standalone route so the lifecycle is reachable and /lois doesn't 404. */}
      <Route path="/lois" component={() => <ProtectedRoute component={LoisPage} />} />
      <Route path="/system-health" component={() => <ProtectedRoute component={SystemHealthPage} />} />
      <Route path="/teams" component={() => <ProtectedRoute component={TeamsPage} />} />
      {/* Team Pulse — simplified daily standup (replaces the activity-feed wall) */}
      <Route path="/team" component={() => <ProtectedRoute component={TeamPulsePage} />} />
      <Route path="/companies" component={() => <ProtectedRoute component={CompaniesPage} />} />
      <Route path="/documents" component={() => <ProtectedRoute component={DocumentsPage} />} />
      <Route path="/docs" component={() => <ProtectedRoute component={DocsPage} />} />
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
            <SonnerToaster position="bottom-right" richColors closeButton />
            <InboundCallToast />
          </TooltipProvider>
        </AppErrorBoundary>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
