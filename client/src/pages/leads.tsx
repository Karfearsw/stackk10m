import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Filter, Plus, Search, Building2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import propertyImage from "@assets/generated_images/modern_suburban_house_exterior_for_real_estate_placeholder.png";
import interiorImage from "@assets/generated_images/interior_of_a_modern_living_room_for_real_estate_placeholder.png";

const leads = [
  {
    id: "L-1023",
    address: "123 Maple Street, Orlando, FL",
    owner: "John Doe",
    status: "New Lead",
    score: 85,
    price: "$245,000",
    lastContact: "2 days ago",
    image: propertyImage
  },
  {
    id: "L-1024",
    address: "456 Oak Avenue, Tampa, FL",
    owner: "Jane Smith",
    status: "Negotiation",
    score: 92,
    price: "$310,000",
    lastContact: "4 hours ago",
    image: interiorImage
  },
  {
    id: "L-1025",
    address: "789 Pine Lane, Miami, FL",
    owner: "Robert Johnson",
    status: "Follow Up",
    score: 64,
    price: "$185,000",
    lastContact: "1 week ago",
    image: null
  },
  {
    id: "L-1026",
    address: "321 Elm St, Jacksonville, FL",
    owner: "Maria Garcia",
    status: "Contract Sent",
    score: 78,
    price: "$275,000",
    lastContact: "Yesterday",
    image: null
  },
  {
    id: "L-1027",
    address: "555 Cedar Dr, Tallahassee, FL",
    owner: "David Wilson",
    status: "Dead",
    score: 20,
    price: "$150,000",
    lastContact: "3 days ago",
    image: null
  },
];

export default function Leads() {
  const [, setLocation] = useLocation();

  return (
    <Layout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Leads Pipeline</h1>
          <p className="text-muted-foreground">Manage and track your active property leads.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative hidden md:block">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Filter leads..."
              className="w-[200px] pl-9 bg-background"
            />
          </div>
          <Button variant="outline" size="sm">
            <Filter className="mr-2 h-4 w-4" />
            Filter
          </Button>
          
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-primary hover:bg-primary/90">
                <Plus className="mr-2 h-4 w-4" />
                Add Lead
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Lead</DialogTitle>
                <DialogDescription>
                  Enter the property details manually or import from RELAS.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="address" className="text-right">
                    Address
                  </Label>
                  <Input id="address" placeholder="123 Main St" className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="city" className="text-right">
                    City
                  </Label>
                  <Input id="city" placeholder="Orlando" className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="owner" className="text-right">
                    Owner
                  </Label>
                  <Input id="owner" placeholder="John Doe" className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="phone" className="text-right">
                    Phone
                  </Label>
                  <Input id="phone" placeholder="(555) 123-4567" className="col-span-3" />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">Create Lead</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="rounded-md border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Image</TableHead>
              <TableHead>Property Address</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>RELAS Score</TableHead>
              <TableHead>Est. Value</TableHead>
              <TableHead className="text-right">Last Contact</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => (
              <TableRow 
                key={lead.id} 
                className="hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => setLocation(`/properties/${lead.id}`)}
              >
                <TableCell>
                  <div className="h-10 w-14 overflow-hidden rounded-sm bg-muted border border-border/50">
                    {lead.image ? (
                      <img 
                        src={lead.image} 
                        alt="Property" 
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center bg-secondary text-secondary-foreground">
                        <Building2 className="h-4 w-4 opacity-50" />
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-medium">{lead.address}</TableCell>
                <TableCell>{lead.owner}</TableCell>
                <TableCell>
                  <Badge 
                    variant={
                      lead.status === "New Lead" ? "secondary" :
                      lead.status === "Negotiation" ? "default" :
                      lead.status === "Contract Sent" ? "outline" :
                      lead.status === "Dead" ? "destructive" :
                      "secondary"
                    }
                    className={
                      lead.status === "Negotiation" ? "bg-accent text-accent-foreground hover:bg-accent/80" : 
                      lead.status === "Contract Sent" ? "border-accent text-accent font-medium" : ""
                    }
                  >
                    {lead.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-full max-w-[80px] rounded-full bg-secondary overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${
                          lead.score > 80 ? 'bg-accent' : 
                          lead.score > 50 ? 'bg-yellow-500' : 'bg-destructive'
                        }`}
                        style={{ width: `${lead.score}%` }}
                      />
                    </div>
                    <span className={`text-xs font-bold ${
                      lead.score > 80 ? 'text-accent' : 
                      lead.score > 50 ? 'text-yellow-600' : 'text-destructive'
                    }`}>{lead.score}</span>
                  </div>
                </TableCell>
                <TableCell>{lead.price}</TableCell>
                <TableCell className="text-right text-muted-foreground">{lead.lastContact}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Layout>
  );
}
