import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/leads" component={Leads} />
      <Route path="/properties" component={Properties} />
      <Route path="/properties/:id" component={PropertyDetail} />
      <Route path="/contracts" component={ContractGenerator} />
      <Route path="/contracts-old" component={Contracts} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/settings" component={Settings} />
      <Route path="/calculator" component={Calculator} />
      <Route path="/timesheet" component={Timesheet} />
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
