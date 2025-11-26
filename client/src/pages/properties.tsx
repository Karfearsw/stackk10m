import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Filter, Search, Home } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export default function Properties() {
  const { data: properties = [], isLoading } = useQuery({
    queryKey: ["properties"],
    queryFn: async () => {
      const res = await fetch("/api/properties");
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    }
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="text-center py-12">Loading properties...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Properties</h1>
          <p className="text-muted-foreground">Browse and manage all properties in your portfolio.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative hidden md:block">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." className="w-[200px] pl-9" />
          </div>
          <Button variant="outline" size="sm">
            <Filter className="mr-2 h-4 w-4" /> Filter
          </Button>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" /> Add Property
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {properties.map((prop: any) => (
          <Card key={prop.id} className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer">
            <div className="relative h-40 bg-muted overflow-hidden">
              <div className="h-full w-full flex items-center justify-center bg-secondary">
                <Home className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="absolute top-2 right-2">
                <Badge className={prop.status === "active" ? "bg-green-600 text-white" : "bg-primary text-primary-foreground"}>
                  {prop.status || "Active"}
                </Badge>
              </div>
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg line-clamp-1">{prop.address}</CardTitle>
              <p className="text-sm text-muted-foreground">{prop.city}, {prop.state}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-2xl font-bold text-primary">${prop.price ? parseInt(prop.price).toLocaleString() : "—"}</div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Beds</p>
                  <p className="font-medium">{prop.beds || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Baths</p>
                  <p className="font-medium">{prop.baths || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">SqFt</p>
                  <p className="font-medium">{prop.sqft ? prop.sqft.toLocaleString() : "—"}</p>
                </div>
              </div>
              <Button className="w-full bg-primary hover:bg-primary/90 text-white">View Details</Button>
            </CardContent>
          </Card>
        ))}
      </div>
      {properties.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">No properties yet.</div>
      )}
    </Layout>
  );
}
