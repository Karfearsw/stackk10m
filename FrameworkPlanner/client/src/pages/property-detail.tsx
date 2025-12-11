import React from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, 
  MapPin, 
  Phone, 
  Mail, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  MessageSquare,
  FileText,
  Calculator
} from "lucide-react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import propertyImage from "@assets/generated_images/modern_suburban_house_exterior_for_real_estate_placeholder.png";
import interiorImage from "@assets/generated_images/interior_of_a_modern_living_room_for_real_estate_placeholder.png";
import { Spinner } from "@/components/ui/spinner";

export default function PropertyDetail() {
  const [, params] = useRoute("/opportunities/:id");
  const id = params?.id ? parseInt(params.id) : 0;
  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/opportunities", id],
    queryFn: async () => {
      const res = await fetch(`/api/opportunities/${id}`);
      if (!res.ok) throw new Error("Failed to fetch opportunity");
      return res.json();
    },
    enabled: !!id,
  });
  const property = data?.property;
  const lead = data?.lead;

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Link href="/opportunities" className="hover:text-foreground flex items-center gap-1 transition-colors">
                <ArrowLeft className="h-3 w-3" /> Back to Opportunities
              </Link>
              <span>/</span>
              <span>O-{id || "—"}</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              {property?.address || "—"}
              <Badge variant="default" className="bg-accent text-accent-foreground hover:bg-accent/80">{property?.status ? property.status.replace("_", " ") : "—"}</Badge>
            </h1>
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {property ? `${property.city || ""}, ${property.state || ""} ${property.zipCode || ""}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline">
              <Calculator className="mr-2 h-4 w-4" />
              Run Comps
            </Button>
            <Button variant="outline">
              <FileText className="mr-2 h-4 w-4" />
              Generate Offer
            </Button>
            <Button>
              <Phone className="mr-2 h-4 w-4" />
              Call Owner
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Property Info & Photos */}
          <div className="lg:col-span-2 space-y-6">
            {/* Photos */}
            <div className="grid grid-cols-2 gap-4 h-64 md:h-80">
              <div className="relative h-full rounded-lg overflow-hidden group">
                <img 
                  src={(property?.images && property.images[0]) || propertyImage} 
                  alt="Exterior" 
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 text-xs rounded backdrop-blur-sm">
                  Front Exterior
                </div>
              </div>
              <div className="relative h-full rounded-lg overflow-hidden group">
                <img 
                  src={(property?.images && property.images[1]) || interiorImage} 
                  alt="Interior" 
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 text-xs rounded backdrop-blur-sm">
                  Living Room
                </div>
              </div>
            </div>

            {/* Tabs for Details */}
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="w-full justify-start border-b rounded-none bg-transparent p-0 h-auto">
                <TabsTrigger 
                  value="details" 
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
                >
                  Property Details
                </TabsTrigger>
                <TabsTrigger 
                  value="financials" 
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
                >
                  Financial Analysis
                </TabsTrigger>
                <TabsTrigger 
                  value="activity" 
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2"
                >
                  Activity Log
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="details" className="mt-6 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Property Facts</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Bedrooms</p>
                      <p className="font-medium text-lg">{property?.beds ?? "—"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Bathrooms</p>
                      <p className="font-medium text-lg">{property?.baths ?? "—"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Square Feet</p>
                      <p className="font-medium text-lg">{property?.sqft ? property.sqft.toLocaleString() : "—"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Year Built</p>
                      <p className="font-medium text-lg">{property?.yearBuilt ?? "—"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Lot Size</p>
                      <p className="font-medium text-lg">{property?.lotSize ?? "—"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Occupancy</p>
                      <p className="font-medium text-lg">{property?.occupancy ?? "—"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Zoning</p>
                      <p className="font-medium text-lg">—</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">APN</p>
                      <p className="font-medium text-lg">{property?.apn ?? "—"}</p>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Owner Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {lead?.ownerName ? (lead.ownerName.split(' ').map((s: string) => s[0]).slice(0,2).join('').toUpperCase()) : "—"}
                        </div>
                        <div>
                          <p className="font-medium">{lead?.ownerName ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">Primary Owner</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm"><Phone className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm"><Mail className="h-4 w-4" /></Button>
                      </div>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Phone</p>
                        <p className="font-medium">{lead?.ownerPhone ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Email</p>
                        <p className="font-medium">{lead?.ownerEmail ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Mailing Address</p>
                        <p className="font-medium">{property ? `${property.address}, ${property.city} ${property.zipCode}` : "—"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Motivation</p>
                        <p className="font-medium">{lead?.motivation ?? "—"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="financials">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-muted-foreground text-center py-8">Financial analysis module would go here.</p>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="activity">
                <Card>
                  <CardContent className="pt-6">
                    <ActivitySection propertyId={property?.id} leadId={lead?.id} />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Column - RELAS Score & Actions */}
          <div className="space-y-6">
            <Card className="border-accent/50 bg-accent/5">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between">
                  <span>RELAS Score</span>
                  <Badge className="bg-accent hover:bg-accent/90 text-xl px-3 py-1">{lead?.relasScore ?? "—"}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  This lead shows <strong className="text-accent-foreground">Motivation</strong> based on key factors.
                </p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" /> Vacant Property</span>
                    <span className="font-medium">+25</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" /> Out of State Owner</span>
                    <span className="font-medium">+20</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" /> Tax Delinquent</span>
                    <span className="font-medium">+30</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-accent" /> Quick Sale Requested</span>
                    <span className="font-medium">+17</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Deal Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Current Stage</span>
                    <span className="font-medium">Negotiation</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary w-[60%]"></div>
                  </div>
                  <p className="text-xs text-muted-foreground">Started 4 days ago</p>
                </div>
                
                <Separator />
                
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Next Steps</h4>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 text-sm">
                      <div className="h-4 w-4 rounded-full border border-muted-foreground mt-0.5"></div>
                      <span>Confirm repair estimates</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm">
                      <div className="h-4 w-4 rounded-full border border-muted-foreground mt-0.5"></div>
                      <span>Send final offer letter</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/50 p-3 rounded-md text-sm text-muted-foreground italic mb-3">
                  {(lead?.notes ?? property?.notes) ?? "No notes yet."}
                </div>
                <AddNoteForm leadId={lead?.id} propertyId={property?.id} initialNotes={lead?.notes ?? property?.notes}
                  onAdded={() => { location.reload(); }} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </div>
      )}
      {error && (
        <div className="p-4 text-red-600">Failed to load opportunity.</div>
      )}
    </Layout>
  );
}

function ActivitySection({ propertyId, leadId }: { propertyId?: number; leadId?: number }) {
  const { data: logs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/activity", propertyId, leadId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (propertyId) params.set("propertyId", String(propertyId));
      if (leadId) params.set("leadId", String(leadId));
      const res = await fetch(`/api/activity?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch activity");
      return res.json();
    },
    enabled: !!propertyId || !!leadId,
  });

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading activity…</div>;
  }
  if (!logs.length) {
    return <div className="py-8 text-center text-muted-foreground">No recent activity.</div>;
  }
  return (
    <div className="space-y-3">
      {logs.map((log: any) => (
        <div key={log.id} className="flex items-start justify-between border rounded-md p-3">
          <div>
            <div className="text-sm font-medium">{log.action.replaceAll('_',' ')}</div>
            <div className="text-xs text-muted-foreground">{log.description}</div>
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(log.createdAt).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}

function AddNoteForm({ leadId, propertyId, initialNotes, onAdded }: { leadId?: number; propertyId?: number; initialNotes?: string; onAdded?: () => void }) {
  const [text, setText] = React.useState("");
  const disabled = (!leadId && !propertyId) || !text.trim();
  const handleAdd = async () => {
    const targetLeadId = leadId;
    const targetPropertyId = propertyId;
    const timestamp = new Date().toLocaleString();
    const nextNotes = [initialNotes || "", `[# ${timestamp}] ${text.trim()}`].filter(Boolean).join("\n");
    let res: Response;
    if (targetLeadId) {
      res = await fetch(`/api/leads/${targetLeadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: nextNotes })
      });
    } else if (targetPropertyId) {
      res = await fetch(`/api/opportunities/${targetPropertyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: nextNotes })
      });
    } else {
      return;
    }
    if (res.ok) {
      onAdded?.();
    } else {
      alert("Failed to add note");
    }
  };
  return (
    <div className="relative">
      <textarea
        className="w-full min-h-[80px] rounded-md border bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        placeholder="Add a note..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button size="sm" className="absolute bottom-2 right-2 h-7 px-2" onClick={handleAdd} disabled={disabled}>
        Add
      </Button>
    </div>
  );
}
