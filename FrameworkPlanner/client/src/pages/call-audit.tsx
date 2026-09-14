import { Layout } from "@/components/layout/Layout";
import { CallAuditContent } from "@/components/telecom/CallAuditContent";

// N5: Call Audit existed only as a Settings tab; the router never had this
// route so the nav deep-link 404'd. Same content, dedicated route.
export default function CallAuditPage() {
  return (
    <Layout>
      <div className="p-4 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl md:text-4xl font-display font-bold text-foreground mb-2" data-testid="page-title">
            Call Audit
          </h1>
          <p className="text-muted-foreground">Review team calls, sessions, and dispositions</p>
        </div>
        <CallAuditContent />
      </div>
    </Layout>
  );
}
