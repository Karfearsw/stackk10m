import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Filter, FileText, Download, Eye } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";

export default function Contracts() {
  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["contracts"],
    queryFn: async () => {
      const res = await fetch("/api/contracts");
      if (!res.ok) throw new Error("Failed to fetch contracts");
      return res.json();
    }
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="text-center py-12">Loading contracts...</div>
      </Layout>
    );
  }

  const totalContracts = contracts.length;
  const signedContracts = contracts.filter((c: any) => c.status === "signed").length;
  const pendingContracts = contracts.filter((c: any) => c.status === "pending").length;
  const completedContracts = contracts.filter((c: any) => c.status === "completed").length;

  return (
    <Layout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Contracts</h1>
          <p className="text-muted-foreground">Manage purchase agreements and contracts.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Filter className="mr-2 h-4 w-4" /> Filter
          </Button>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" /> New Contract
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Contracts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalContracts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Pending Signature</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{pendingContracts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Signed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{signedContracts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{completedContracts}</div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contract ID</TableHead>
              <TableHead>Property ID</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sign Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contracts.map((contract: any) => (
              <TableRow key={contract.id} className="hover:bg-muted/50">
                <TableCell className="font-medium">C-{contract.id}</TableCell>
                <TableCell>{contract.propertyId}</TableCell>
                <TableCell className="font-medium text-primary">${contract.amount ? parseInt(contract.amount).toLocaleString() : "—"}</TableCell>
                <TableCell>
                  <Badge 
                    className={
                      contract.status === "signed" ? "bg-primary text-primary-foreground" :
                      contract.status === "pending" ? "bg-yellow-600 text-white" :
                      "bg-green-600 text-white"
                    }
                  >
                    {contract.status}
                  </Badge>
                </TableCell>
                <TableCell>{contract.signDate ? new Date(contract.signDate).toLocaleDateString() : "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {contracts.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">No contracts yet.</div>
        )}
      </div>
    </Layout>
  );
}
