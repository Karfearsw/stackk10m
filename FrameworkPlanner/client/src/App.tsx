import { Switch, Route, Redirect, useLocation } from "wouter";
import React, { Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
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
const TeamsPage = React.lazy(() => import("@/pages/teams"));
const XpLandingPage = React.lazy(() => import("@/pages/xp/index"));
const XpExperiencePage = React.lazy(() => import("@/pages/xp/experience"));
const XpAdminPage = React.lazy(() => import("@/pages/xp/admin"));
const XpCheckoutSuccessPage = React.lazy(() => import("@/pages/xp/checkout-success"));
const XpCheckoutCancelPage = React.lazy(() => import("@/pages/xp/checkout-cancel"));

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

  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
      <Component />
    </Suspense>
  );
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
      <Route path="/sign/:token">
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
          <SignContractPage />
        </Suspense>
      </Route>
      <Route path="/login">
        {isAuthenticated ? <Redirect to="/" /> : <Login />}
      </Route>
      <Route path="/signup">
        {isAuthenticated ? <Redirect to="/" /> : <Signup />}
      </Route>
      <Route path="/forgot-password">
        {isAuthenticated ? <Redirect to="/" /> : <ForgotPassword />}
      </Route>
      <Route path="/reset-password">
        {isAuthenticated ? <Redirect to="/" /> : <ResetPassword />}
      </Route>
      <Route path="/xp/admin">
        {() => <ProtectedRoute component={XpAdminPage} />}
      </Route>
      <Route path="/xp/checkout/success">
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
          <XpCheckoutSuccessPage />
        </Suspense>
      </Route>
      <Route path="/xp/checkout/cancel">
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
          <XpCheckoutCancelPage />
        </Suspense>
      </Route>
      <Route path="/xp/:slug">
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
          <XpExperiencePage />
        </Suspense>
      </Route>
      <Route path="/xp">
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
          <XpLandingPage />
        </Suspense>
      </Route>
      <Route path="/">
        {() => <ProtectedRoute component={Dashboard} />}
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
      <Route path="/field">
        {() => <ProtectedRoute component={FieldModePage} />}
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
        {() => <Redirect to="/phone?tab=dial" />}
      </Route>
      <Route path="/dialer/workspace">
        {() => <ProtectedRoute component={DialerWorkspace} />}
      </Route>
      <Route path="/phone">
        {() => <ProtectedRoute component={PhoneWorkspace} />}
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
      <Route path="/teams">
        {() => <ProtectedRoute component={TeamsPage} />}
      </Route>
      <Route path="/history">
        {() => <Redirect to="/phone?tab=history" />}
      </Route>
      <Route path="/voicemail">
        {() => <Redirect to="/phone?tab=voicemail" />}
      </Route>
      <Route path="/system/health">
        {() => <ProtectedRoute component={SystemHealthPage} />}
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
