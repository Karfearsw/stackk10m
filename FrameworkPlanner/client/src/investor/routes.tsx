/**
 * Investor portal route group (/investor/*).
 *
 * Flag contract: the portal is enabled server-side via INVESTOR_PORTAL_ENABLED
 * (default OFF). The client asks /api/investor/status; when the flag is OFF
 * every /investor/* path renders the CRM 404 page — no public routes or nav
 * entries are reachable.
 */
import React, { Suspense } from "react";
import { Switch, Route, Redirect } from "wouter";
import { LogoLoader } from "@/components/system/LogoLoader";
import NotFound from "@/pages/not-found";
import { usePortalEnabled } from "./api";
import { RequireInvestor } from "./InvestorLayout";

const InvestorSignup = React.lazy(() => import("./InvestorAuth").then((m) => ({ default: m.InvestorSignup })));
const InvestorLogin = React.lazy(() => import("./InvestorAuth").then((m) => ({ default: m.InvestorLogin })));
const BuyBoxWizard = React.lazy(() => import("./BuyBoxWizard").then((m) => ({ default: m.BuyBoxWizard })));
const DiscoverFeed = React.lazy(() => import("./DiscoverFeed").then((m) => ({ default: m.DiscoverFeed })));
const SavedPage = React.lazy(() => import("./SavedPage").then((m) => ({ default: m.SavedPage })));
const OffersPage = React.lazy(() => import("./OffersPage").then((m) => ({ default: m.OffersPage })));
const MessagesPage = React.lazy(() => import("./MessagesPage").then((m) => ({ default: m.MessagesPage })));
const AccountPage = React.lazy(() => import("./AccountPage").then((m) => ({ default: m.AccountPage })));

function Fallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#000000]">
      <LogoLoader size={72} />
    </div>
  );
}

export default function InvestorRoutes() {
  const { loading, enabled } = usePortalEnabled();

  if (loading) return <Fallback />;
  // Flag OFF: nothing under /investor/* is reachable.
  if (!enabled) return <NotFound />;

  return (
    <Suspense fallback={<Fallback />}>
      <Switch>
        <Route path="/investor/signup" component={InvestorSignup} />
        <Route path="/investor/login" component={InvestorLogin} />
        <Route path="/investor/discover" component={DiscoverFeed} />
        <Route path="/investor/saved" component={SavedPage} />
        <Route path="/investor/offers" component={OffersPage} />
        <Route path="/investor/buy-box" component={BuyBoxWizard} />
        <Route path="/investor/messages" component={MessagesPage} />
        <Route path="/investor/account" component={AccountPage} />
        <Route path="/investor">
          {() => (
            <RequireInvestor>
              <Redirect to="/investor/discover" />
            </RequireInvestor>
          )}
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}
