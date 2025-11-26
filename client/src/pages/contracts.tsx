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

const contracts = [
  {
    id: "C-1001",
    property: "456 Oak Avenue, Tampa",
    seller: "Jane Smith",
    amount: "$310,000",
    status: "Signed",
    date: "Nov 15, 2024",
    daysOpen: 3
  },
  {
    id: "C-1002",
    property: "123 Maple Street, Orlando",
    seller: "John Doe",
    amount: "$245,000",
    status: "Pending",
    date: "Nov 18, 2024",
    daysOpen: 1
  },
  {
    id: "C-1003",
    property: "789 Pine Lane, Miami",
    seller: "Robert Johnson",
    amount: "$185,000",
    status: "Completed",
    date: "Oct 22, 2024",
    daysOpen: 27
  },
  {
    id: "C-1004",
    property: "321 Elm St, Jacksonville",
    seller: "Maria Garcia",
    amount: "$275,000",
    status: "Signed",
    date: "Nov 10, 2024",
    daysOpen: 8
  },
];

export default function Contracts() {
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
            <div className="text-3xl font-bold">4</div>
            <p className="text-xs text-muted-foreground mt-1">Active & Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Pending Signature</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">1</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting seller</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Signed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">2</div>
            <p className="text-xs text-muted-foreground mt-1">Ready to close</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">1</div>
            <p className="text-xs text-muted-foreground mt-1">Closed deals</p>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contract ID</TableHead>
              <TableHead>Property</TableHead>
              <TableHead>Seller</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Days Open</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contracts.map((contract) => (
              <TableRow key={contract.id} className="hover:bg-muted/50">
                <TableCell className="font-medium">{contract.id}</TableCell>
                <TableCell>{contract.property}</TableCell>
                <TableCell>{contract.seller}</TableCell>
                <TableCell className="font-medium text-primary">{contract.amount}</TableCell>
                <TableCell>
                  <Badge 
                    className={
                      contract.status === "Signed" ? "bg-primary text-primary-foreground" :
                      contract.status === "Pending" ? "bg-yellow-600 text-white" :
                      "bg-green-600 text-white"
                    }
                  >
                    {contract.status}
                  </Badge>
                </TableCell>
                <TableCell>{contract.date}</TableCell>
                <TableCell className="text-right">{contract.daysOpen}</TableCell>
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
      </div>
    </Layout>
  );
}
