import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { UserCheck, UserX, Clock, Building2, Phone, Mail } from "lucide-react";

interface PendingInvestor {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  companyName: string | null;
  investorStatus: string;
  createdAt: string;
}

export default function AdminInvestorsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rejectReason, setRejectReason] = useState<Record<number, string>>({});
  const [rejectingId, setRejectingId] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery<{ investors: PendingInvestor[] }>({
    queryKey: ["/api/admin/investors/pending"],
  });

  const decideMutation = useMutation({
    mutationFn: ({ id, decision, reason }: { id: number; decision: "approve" | "reject"; reason?: string }) =>
      apiRequest("POST", `/api/admin/investors/${id}/approve`, { decision, reason }),
    onSuccess: (_, { decision }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/investors/pending"] });
      setRejectingId(null);
      toast({
        title: decision === "approve" ? "Investor approved" : "Investor rejected",
        description: decision === "approve"
          ? "They can now log in to the investor portal."
          : "The investor has been notified.",
      });
    },
    onError: (e: any) => {
      toast({ title: "Action failed", description: e?.message, variant: "destructive" });
    },
  });

  const investors = data?.investors ?? [];

  return (
    <Layout>
      <div className="space-y-4 p-4 lg:p-6 max-w-4xl">
        <div>
          <h1 className="font-serif text-2xl font-semibold flex items-center gap-2">
            <UserCheck className="h-6 w-6" />
            Investor Approvals
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and approve investor portal signups. Approved investors can log in and access deals.
          </p>
        </div>

        {isError && (
          <Card className="border-destructive/40">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Couldn't load pending investors. Only admins can access this page.
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : investors.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Clock className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No pending investor signups.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {investors.map((inv) => (
              <Card key={inv.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">
                        {inv.firstName || inv.lastName
                          ? `${inv.firstName ?? ""} ${inv.lastName ?? ""}`.trim()
                          : inv.email}
                      </CardTitle>
                      <CardDescription className="mt-1 space-y-1">
                        <span className="flex items-center gap-1.5 text-xs">
                          <Mail className="h-3 w-3" /> {inv.email}
                        </span>
                        {inv.phone && (
                          <span className="flex items-center gap-1.5 text-xs">
                            <Phone className="h-3 w-3" /> {inv.phone}
                          </span>
                        )}
                        {inv.companyName && (
                          <span className="flex items-center gap-1.5 text-xs">
                            <Building2 className="h-3 w-3" /> {inv.companyName}
                          </span>
                        )}
                      </CardDescription>
                    </div>
                    <Badge variant="secondary">
                      Signed up {new Date(inv.createdAt).toLocaleDateString()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {rejectingId === inv.id ? (
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Rejection reason (optional)"
                        value={rejectReason[inv.id] ?? ""}
                        onChange={(e) => setRejectReason({ ...rejectReason, [inv.id]: e.target.value })}
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => decideMutation.mutate({
                            id: inv.id,
                            decision: "reject",
                            reason: rejectReason[inv.id],
                          })}
                          disabled={decideMutation.isPending}
                        >
                          <UserX className="h-4 w-4 mr-1" />
                          Confirm Reject
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRejectingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => decideMutation.mutate({ id: inv.id, decision: "approve" })}
                        disabled={decideMutation.isPending}
                      >
                        <UserCheck className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRejectingId(inv.id)}
                        disabled={decideMutation.isPending}
                      >
                        <UserX className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
