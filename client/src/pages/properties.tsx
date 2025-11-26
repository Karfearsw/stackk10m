import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Filter, Search, MapPin, DollarSign, Home } from "lucide-react";
import propertyImage from "@assets/generated_images/modern_suburban_house_exterior_for_real_estate_placeholder.png";
import interiorImage from "@assets/generated_images/interior_of_a_modern_living_room_for_real_estate_placeholder.png";

const properties = [
  {
    id: 1,
    address: "123 Maple Street",
    city: "Orlando, FL",
    price: "$245,000",
    beds: 3,
    baths: 2,
    sqft: 1850,
    status: "Active",
    image: propertyImage
  },
  {
    id: 2,
    address: "456 Oak Avenue",
    city: "Tampa, FL",
    price: "$310,000",
    beds: 4,
    baths: 3,
    sqft: 2200,
    status: "Under Contract",
    image: interiorImage
  },
  {
    id: 3,
    address: "789 Pine Lane",
    city: "Miami, FL",
    price: "$185,000",
    beds: 2,
    baths: 1,
    sqft: 1200,
    status: "Sold",
    image: null
  },
];

export default function Properties() {
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
        {properties.map((prop) => (
          <Card key={prop.id} className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer">
            <div className="relative h-40 bg-muted overflow-hidden">
              {prop.image ? (
                <img src={prop.image} alt={prop.address} className="h-full w-full object-cover hover:scale-105 transition-transform duration-300" />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-secondary">
                  <Home className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div className="absolute top-2 right-2">
                <Badge className={prop.status === "Sold" ? "bg-primary text-primary-foreground" : prop.status === "Under Contract" ? "bg-accent text-accent-foreground" : "bg-green-600 text-white"}>
                  {prop.status}
                </Badge>
              </div>
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg line-clamp-1">{prop.address}</CardTitle>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {prop.city}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-2xl font-bold text-primary">{prop.price}</div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Beds</p>
                  <p className="font-medium">{prop.beds}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Baths</p>
                  <p className="font-medium">{prop.baths}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">SqFt</p>
                  <p className="font-medium">{prop.sqft.toLocaleString()}</p>
                </div>
              </div>
              <Button className="w-full bg-primary hover:bg-primary/90 text-white">View Details</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </Layout>
  );
}
