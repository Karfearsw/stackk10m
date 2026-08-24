import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, Bed, Bath, Home, Maximize, Calendar, DollarSign, Send, Phone, Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface PublicListingData {
  listing: {
    id: number;
    title: string;
    description: string | null;
    slug: string;
    visibility: string;
    viewCount: number;
    publishedAt: string | null;
    exposeAddress: boolean;
    exposeComps: boolean;
    exposeFinancials: boolean;
    exposeDocs: boolean;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
  property: {
    address: string;
    city: string;
    state: string;
    zipCode: string;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    yearBuilt: number | null;
    propertyType: string | null;
    lotSize: string | null;
    occupancy: string | null;
    images: string[];
    latitude: string | null;
    longitude: string | null;
    price: string | null;
    arv: string | null;
    repairCost: string | null;
    askingPrice: string | null;
    targetDispositionPrice: string | null;
    internalSummary: string | null;
  };
}

type FormMode = "inquiry" | "offer";

export default function PublicListingPage() {
  const [, params] = useRoute("/l/:token");
  const token = params?.token;
  const [password, setPassword] = useState("");
  const [passwordSubmitted, setPasswordSubmitted] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("inquiry");
  const { toast } = useToast();

  const { data, error, isLoading, refetch } = useQuery<PublicListingData>({
    queryKey: [`/api/public/listings/${token}${passwordSubmitted && password ? `?pw=${encodeURIComponent(password)}` : ""}`],
    retry: false,
  });

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Listing Not Found</h1>
          <p className="text-gray-600">The listing link you provided is invalid.</p>
        </div>
      </div>
    );
  }

  if (error) {
    const errMsg = String((error as any)?.message || "");
    if (errMsg.includes("Password required") || errMsg.includes("401")) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Password Protected Listing</CardTitle>
              <CardDescription>This listing is password protected. Please enter the password to view details.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setPasswordSubmitted(true);
                        refetch();
                      }
                    }}
                  />
                </div>
                <Button onClick={() => { setPasswordSubmitted(true); refetch(); }} className="w-full">
                  View Listing
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Unable to Load Listing</h1>
          <p className="text-gray-600">{errMsg || "The listing could not be loaded."}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Listing Not Found</h1>
          <p className="text-gray-600">The listing you're looking for doesn't exist or has expired.</p>
        </div>
      </div>
    );
  }

  const { listing, property } = data;

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                OL
              </div>
              <span className="font-bold text-xl text-gray-900">OceanLuxe Realty</span>
            </div>
            {listing.visibility === "public" && <Badge variant="secondary">Public Listing</Badge>}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl">{listing.title || `${property.address}, ${property.city}, ${property.state} ${property.zipCode}`}</CardTitle>
            {listing.description && (
              <CardDescription className="text-base mt-2">{listing.description}</CardDescription>
            )}
          </CardHeader>

          {property.images && property.images.length > 0 && (
            <CardContent>
              <ImageGallery images={property.images} />
            </CardContent>
          )}

          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {property.beds !== null && (
                <StatItem icon={<Bed className="h-5 w-5" />} label="Beds" value={property.beds} />
              )}
              {property.baths !== null && (
                <StatItem icon={<Bath className="h-5 w-5" />} label="Baths" value={property.baths} />
              )}
              {property.sqft !== null && (
                <StatItem icon={<Maximize className="h-5 w-5" />} label="Sqft" value={property.sqft.toLocaleString()} />
              )}
              {property.yearBuilt !== null && (
                <StatItem icon={<Calendar className="h-5 w-5" />} label="Year Built" value={property.yearBuilt} />
              )}
              {property.propertyType && (
                <StatItem icon={<Home className="h-5 w-5" />} label="Type" value={property.propertyType} />
              )}
              {property.lotSize && (
                <StatItem icon={<Maximize className="h-5 w-5" />} label="Lot Size" value={property.lotSize} />
              )}
            </div>

            {listing.exposeAddress && (
              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 mb-2 flex items-center">
                  <MapPin className="h-5 w-5 mr-2 text-gray-600" />
                  Property Address
                </h3>
                <p className="text-gray-700">
                  {property.address}
                  <br />
                  {property.city}, {property.state} {property.zipCode}
                </p>
              </div>
            )}

            {listing.exposeFinancials && (property.price || property.askingPrice || property.arv || property.repairCost || property.targetDispositionPrice) && (
              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 mb-2 flex items-center">
                  <DollarSign className="h-5 w-5 mr-2 text-gray-600" />
                  Financial Overview
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {property.price && <StatItem label="List Price" value={`$${Number(property.price).toLocaleString()}`} />}
                  {property.askingPrice && <StatItem label="Asking Price" value={`$${Number(property.askingPrice).toLocaleString()}`} />}
                  {property.arv && <StatItem label="ARV" value={`$${Number(property.arv).toLocaleString()}`} />}
                  {property.repairCost && <StatItem label="Est. Repair" value={`$${Number(property.repairCost).toLocaleString()}`} />}
                  {property.targetDispositionPrice && <StatItem label="Target Sale" value={`$${Number(property.targetDispositionPrice).toLocaleString()}`} />}
                </div>
              </div>
            )}

            {listing.exposeComps && property.latitude && property.longitude && (
              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 mb-2">Nearby Comps</h3>
                <div className="bg-gray-100 rounded-lg h-48 flex items-center justify-center">
                  <span className="text-gray-500">Map with nearby comparable sales</span>
                </div>
              </div>
            )}

            {listing.exposeDocs && property.images && property.images.length > 0 && (
              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 mb-2">Documents</h3>
                <p className="text-sm text-gray-600">{property.images.length} photo(s) available for download</p>
              </div>
            )}

            {property.internalSummary && listing.exposeFinancials && (
              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 mb-2">Property Summary</h3>
                <p className="text-gray-700">{property.internalSummary}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex space-x-4 border-b">
              <button
                onClick={() => setFormMode("inquiry")}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                  formMode === "inquiry"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                )}
              >
                Request Details
              </button>
              <button
                onClick={() => setFormMode("offer")}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                  formMode === "offer"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                )}
              >
                Submit Offer
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <InquiryForm
              token={token}
              mode={formMode}
              onSuccess={() => {
                refetch();
                toast({
                  title: "Success",
                  description: formMode === "offer" ? "Offer submitted successfully!" : "Inquiry submitted successfully!",
                });
              }}
            />
          </CardContent>
          <CardFooter className="bg-gray-50 border-t">
            <div className="flex flex-col sm:flex-row gap-4 w-full">
              <Button variant="outline" className="flex-1" asChild>
                <a href={`tel:${listing.contactPhone || ""}`}>
                  <Phone className="h-4 w-4 mr-2" />
                  Call Agent
                </a>
              </Button>
              <Button variant="outline" className="flex-1" asChild>
                <a href={`mailto:${listing.contactEmail || ""}`}>
                  <Mail className="h-4 w-4 mr-2" />
                  Email Agent
                </a>
              </Button>
              <Button variant="outline" className="flex-1" asChild>
                <a href={`https://calendly.com/`} target="_blank" rel="noopener noreferrer">
                  <Calendar className="h-4 w-4 mr-2" />
                  Schedule Call
                </a>
              </Button>
            </div>
          </CardFooter>
        </Card>
      </main>

      <footer className="bg-white border-t py-6 mt-12">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm text-gray-500">
          <p>This listing is provided by OceanLuxe Realty. All information is deemed reliable but not guaranteed.</p>
          <p className="mt-1">Viewing this listing: {listing.viewCount} time(s)</p>
        </div>
      </footer>
    </div>
  );
}

function StatItem({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center p-3 bg-gray-50 rounded-lg">
      {icon && <div className="mb-1 text-gray-600">{icon}</div>}
      <span className="text-xs text-gray-500 font-medium">{label}</span>
      <span className="text-lg font-semibold text-gray-900">{value}</span>
    </div>
  );
}

function ImageGallery({ images }: { images: string[] }) {
  const [current, setCurrent] = useState(0);

  if (images.length === 1) {
    return <img src={images[0]} alt="Property" className="w-full h-64 md:h-80 object-cover rounded-lg" loading="lazy" />;
  }

  return (
    <div className="relative">
      <img
        src={images[current]}
        alt="Property"
        className="w-full h-64 md:h-80 object-cover rounded-lg"
        key={current}
        loading="lazy"
      />
      {images.length > 1 && (
        <>
          <button
            onClick={() => setCurrent((c) => (c === 0 ? images.length - 1 : c - 1))}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 rounded-full p-2 shadow-md"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => setCurrent((c) => (c === images.length - 1 ? 0 : c + 1))}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 rounded-full p-2 shadow-md"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex space-x-1">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={cn(
                  "w-2 h-2 rounded-full",
                  i === current ? "bg-white" : "bg-white/50"
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function InquiryForm({
  token,
  mode,
  onSuccess,
}: {
  token: string;
  mode: FormMode;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    buyerType: "",
    message: "",
    offerAmount: "",
    terms: "",
    closingDateTarget: "",
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const endpoint = mode === "offer" ? `/api/listings/${token}/offer` : `/api/listings/${token}/inquiries`;
      const payload = mode === "offer"
        ? {
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            offerAmount: formData.offerAmount,
            terms: formData.terms,
            closingDateTarget: formData.closingDateTarget || undefined,
          }
        : {
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            company: formData.company,
            buyerType: formData.buyerType,
            message: formData.message,
          };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Submission failed" }));
        throw new Error(err.message || "Submission failed");
      }

      onSuccess();
      setFormData({ name: "", email: "", phone: "", company: "", buyerType: "", message: "", offerAmount: "", terms: "", closingDateTarget: "" });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">Full Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => handleChange("name", e.target.value)}
            required
            minLength={2}
            disabled={isSubmitting}
          />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => handleChange("email", e.target.value)}
            disabled={isSubmitting}
          />
        </div>
        <div>
          <Label htmlFor="phone">Phone *</Label>
          <Input
            id="phone"
            type="tel"
            value={formData.phone}
            onChange={(e) => handleChange("phone", e.target.value)}
            required
            disabled={isSubmitting}
          />
        </div>
        {mode === "inquiry" && (
          <>
            <div>
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                value={formData.company}
                onChange={(e) => handleChange("company", e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="buyerType">Buyer Type</Label>
              <Select value={formData.buyerType} onValueChange={(v) => handleChange("buyerType", v)} disabled={isSubmitting}>
                <SelectTrigger id="buyerType">
                  <SelectValue placeholder="Select buyer type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual Buyer</SelectItem>
                  <SelectItem value="entity">Entity / LLC</SelectItem>
                  <SelectItem value="fund">Investment Fund</SelectItem>
                  <SelectItem value="rehabber">Rehabber</SelectItem>
                  <SelectItem value="landlord">Landlord</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                value={formData.message}
                onChange={(e) => handleChange("message", e.target.value)}
                rows={4}
                disabled={isSubmitting}
                placeholder="Tell us about your interest, financing, timeline..."
              />
            </div>
          </>
        )}
        {mode === "offer" && (
          <>
            <div>
              <Label htmlFor="offerAmount">Offer Amount ($) *</Label>
              <Input
                id="offerAmount"
                type="number"
                value={formData.offerAmount}
                onChange={(e) => handleChange("offerAmount", e.target.value)}
                required
                disabled={isSubmitting}
                placeholder="e.g. 450000"
              />
            </div>
            <div>
              <Label htmlFor="closingDateTarget">Target Close Date</Label>
              <Input
                id="closingDateTarget"
                type="date"
                value={formData.closingDateTarget}
                onChange={(e) => handleChange("closingDateTarget", e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="terms">Terms & Conditions</Label>
              <Textarea
                id="terms"
                value={formData.terms}
                onChange={(e) => handleChange("terms", e.target.value)}
                rows={3}
                disabled={isSubmitting}
                placeholder="Specify terms: cash, financing, contingencies, etc."
              />
            </div>
          </>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Send className="h-4 w-4 mr-2" />
            {mode === "offer" ? "Submit Offer" : "Send Inquiry"}
          </>
        )}
      </Button>
    </form>
  );
}
