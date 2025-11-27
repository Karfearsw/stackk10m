import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { 
  Globe, 
  MapPin, 
  Search, 
  Building2, 
  Hammer, 
  FileText, 
  Users, 
  ExternalLink,
  Bookmark,
  Plus,
  Trash2,
  ChevronRight,
  Home,
  TreePine,
  Factory,
  Calculator,
  Phone,
  Mail,
  Lightbulb,
  Save
} from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

interface QuickLink {
  id: string;
  name: string;
  url: string;
  category: string;
}

interface ResearchNote {
  id: string;
  title: string;
  content: string;
  propertyType: string;
  createdAt: string;
}

const defaultResources = {
  zoning: [
    { name: "Florida Property Appraiser", url: "https://www.floridapa.com/", state: "FL" },
    { name: "Orange County FL Property", url: "https://www.ocpafl.org/", state: "FL" },
    { name: "Miami-Dade Property Search", url: "https://www.miamidade.gov/pa/", state: "FL" },
    { name: "Hillsborough County GIS", url: "https://gis.hcpafl.org/", state: "FL" },
    { name: "Massachusetts GIS", url: "https://www.mass.gov/orgs/massgis-bureau-of-geographic-information", state: "MA" },
    { name: "Rhode Island GIS", url: "https://rigis-edc.opendata.arcgis.com/", state: "RI" },
    { name: "Zillow Zoning Info", url: "https://www.zillow.com/", state: "All" },
    { name: "County GIS Lookup", url: "https://www.countygis.com/", state: "All" },
  ],
  skipTrace: [
    { name: "TruePeopleSearch", url: "https://www.truepeoplesearch.com/", type: "Free" },
    { name: "FastPeopleSearch", url: "https://www.fastpeoplesearch.com/", type: "Free" },
    { name: "Spokeo", url: "https://www.spokeo.com/", type: "Paid" },
    { name: "BeenVerified", url: "https://www.beenverified.com/", type: "Paid" },
    { name: "Skip Genie", url: "https://skipgenie.com/", type: "Paid" },
    { name: "REI Skip", url: "https://reiskip.com/", type: "Paid" },
  ],
  comps: [
    { name: "Zillow", url: "https://www.zillow.com/", type: "Free" },
    { name: "Redfin", url: "https://www.redfin.com/", type: "Free" },
    { name: "Realtor.com", url: "https://www.realtor.com/", type: "Free" },
    { name: "PropStream", url: "https://www.propstream.com/", type: "Paid" },
    { name: "RentCast", url: "https://rentcast.io/", type: "Paid" },
    { name: "ATTOM Data", url: "https://www.attomdata.com/", type: "Paid" },
  ],
  suppliers: [
    { name: "Home Depot Pro", url: "https://www.homedepot.com/c/Pro", category: "Materials" },
    { name: "Lowe's Pro", url: "https://www.lowes.com/l/Pro", category: "Materials" },
    { name: "BuildZoom", url: "https://www.buildzoom.com/", category: "Contractors" },
    { name: "Angi (Angie's List)", url: "https://www.angi.com/", category: "Contractors" },
    { name: "Thumbtack", url: "https://www.thumbtack.com/", category: "Contractors" },
    { name: "HomeAdvisor", url: "https://www.homeadvisor.com/", category: "Contractors" },
  ],
  title: [
    { name: "First American Title", url: "https://www.firstam.com/", type: "National" },
    { name: "Old Republic Title", url: "https://www.oldrepublictitle.com/", type: "National" },
    { name: "Fidelity National Title", url: "https://www.fntic.com/", type: "National" },
    { name: "Stewart Title", url: "https://www.stewart.com/", type: "National" },
    { name: "Chicago Title", url: "https://www.ctic.com/", type: "National" },
  ],
  legal: [
    { name: "FL Division of Corporations", url: "https://dos.myflorida.com/sunbiz/", state: "FL" },
    { name: "FL Real Estate Commission", url: "https://www.myfloridalicense.com/", state: "FL" },
    { name: "MA Secretary of State", url: "https://www.sec.state.ma.us/cor/", state: "MA" },
    { name: "RI Secretary of State", url: "https://business.sos.ri.gov/", state: "RI" },
  ],
};

const propertyTypes = [
  { value: "residential", label: "Residential", icon: Home },
  { value: "land", label: "Land/Vacant", icon: TreePine },
  { value: "commercial", label: "Commercial", icon: Factory },
  { value: "multifamily", label: "Multi-Family", icon: Building2 },
];

export default function Playground() {
  const { toast } = useToast();
  const [browserUrl, setBrowserUrl] = useState("https://www.zillow.com/");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("browser");
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([]);
  const [newLinkName, setNewLinkName] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [notes, setNotes] = useState<ResearchNote[]>([]);
  const [activeNote, setActiveNote] = useState<ResearchNote | null>(null);
  const [selectedPropertyType, setSelectedPropertyType] = useState("residential");

  useEffect(() => {
    const savedLinks = localStorage.getItem("playground_quicklinks");
    const savedNotes = localStorage.getItem("playground_notes");
    if (savedLinks) setQuickLinks(JSON.parse(savedLinks));
    if (savedNotes) setNotes(JSON.parse(savedNotes));
  }, []);

  const saveQuickLinks = (links: QuickLink[]) => {
    setQuickLinks(links);
    localStorage.setItem("playground_quicklinks", JSON.stringify(links));
  };

  const saveNotes = (notesList: ResearchNote[]) => {
    setNotes(notesList);
    localStorage.setItem("playground_notes", JSON.stringify(notesList));
  };

  const handleSearch = () => {
    if (searchQuery) {
      const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
      setBrowserUrl(googleSearchUrl);
    }
  };

  const handleNavigate = (url: string) => {
    setBrowserUrl(url);
    setActiveTab("browser");
  };

  const addQuickLink = () => {
    if (newLinkName && newLinkUrl) {
      const newLink: QuickLink = {
        id: Date.now().toString(),
        name: newLinkName,
        url: newLinkUrl.startsWith("http") ? newLinkUrl : `https://${newLinkUrl}`,
        category: "Custom",
      };
      saveQuickLinks([...quickLinks, newLink]);
      setNewLinkName("");
      setNewLinkUrl("");
      toast({ title: "Bookmark added", description: `${newLinkName} saved to quick links` });
    }
  };

  const removeQuickLink = (id: string) => {
    saveQuickLinks(quickLinks.filter(l => l.id !== id));
    toast({ title: "Bookmark removed" });
  };

  const createNote = () => {
    const newNote: ResearchNote = {
      id: Date.now().toString(),
      title: "New Research Note",
      content: "",
      propertyType: selectedPropertyType,
      createdAt: new Date().toISOString(),
    };
    saveNotes([newNote, ...notes]);
    setActiveNote(newNote);
  };

  const updateNote = (updatedNote: ResearchNote) => {
    const updated = notes.map(n => n.id === updatedNote.id ? updatedNote : n);
    saveNotes(updated);
    setActiveNote(updatedNote);
  };

  const deleteNote = (id: string) => {
    saveNotes(notes.filter(n => n.id !== id));
    if (activeNote?.id === id) setActiveNote(null);
    toast({ title: "Note deleted" });
  };

  return (
    <Layout>
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2" data-testid="page-title">
              <Lightbulb className="h-8 w-8 text-primary" />
              Property Playground
            </h1>
            <p className="text-muted-foreground">Research hub for zoning, suppliers, comps, and deal ideas</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="browser" className="flex items-center gap-1">
                <Globe className="h-4 w-4" /> Browser
              </TabsTrigger>
              <TabsTrigger value="zoning" className="flex items-center gap-1">
                <MapPin className="h-4 w-4" /> Zoning
              </TabsTrigger>
              <TabsTrigger value="resources" className="flex items-center gap-1">
                <Building2 className="h-4 w-4" /> Resources
              </TabsTrigger>
              <TabsTrigger value="suppliers" className="flex items-center gap-1">
                <Hammer className="h-4 w-4" /> Suppliers
              </TabsTrigger>
              <TabsTrigger value="notes" className="flex items-center gap-1">
                <FileText className="h-4 w-4" /> Notes
              </TabsTrigger>
            </TabsList>

            <TabsContent value="browser" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2">
                      <Input
                        placeholder="Search anything..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                        className="flex-1"
                        data-testid="input-browser-search"
                      />
                      <Button onClick={handleSearch} size="sm" data-testid="button-search">
                        <Search className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => window.open(browserUrl, "_blank")}
                      data-testid="button-open-external"
                    >
                      <ExternalLink className="h-4 w-4 mr-1" /> Open External
                    </Button>
                  </div>
                  <div className="flex items-center gap-1 mt-2 text-sm text-muted-foreground">
                    <Globe className="h-3 w-3" />
                    <span className="truncate">{browserUrl}</span>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="relative w-full h-[600px] border-t">
                    <iframe
                      src={browserUrl}
                      className="w-full h-full"
                      title="Research Browser"
                      sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                      data-testid="iframe-browser"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="zoning" className="mt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-primary" />
                      Florida Resources
                    </CardTitle>
                    <CardDescription>Property appraiser and GIS lookup</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {defaultResources.zoning.filter(r => r.state === "FL").map((resource, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        className="w-full justify-between"
                        onClick={() => handleNavigate(resource.url)}
                        data-testid={`link-zoning-${i}`}
                      >
                        {resource.name}
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-blue-500" />
                      Northeast Resources
                    </CardTitle>
                    <CardDescription>Massachusetts & Rhode Island</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {defaultResources.zoning.filter(r => r.state === "MA" || r.state === "RI").map((resource, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        className="w-full justify-between"
                        onClick={() => handleNavigate(resource.url)}
                      >
                        <span className="flex items-center gap-2">
                          {resource.name}
                          <Badge variant="secondary" className="text-xs">{resource.state}</Badge>
                        </span>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    ))}
                  </CardContent>
                </Card>

                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Globe className="h-5 w-5 text-green-500" />
                      National Resources
                    </CardTitle>
                    <CardDescription>Works for any state</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-2 md:grid-cols-2">
                    {defaultResources.zoning.filter(r => r.state === "All").map((resource, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        className="justify-between"
                        onClick={() => handleNavigate(resource.url)}
                      >
                        {resource.name}
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="resources" className="mt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Phone className="h-5 w-5 text-orange-500" />
                      Skip Tracing
                    </CardTitle>
                    <CardDescription>Find owner contact information</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {defaultResources.skipTrace.map((resource, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        className="w-full justify-between"
                        onClick={() => handleNavigate(resource.url)}
                      >
                        <span className="flex items-center gap-2">
                          {resource.name}
                          <Badge variant={resource.type === "Free" ? "secondary" : "outline"} className="text-xs">
                            {resource.type}
                          </Badge>
                        </span>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calculator className="h-5 w-5 text-green-500" />
                      Comps & Values
                    </CardTitle>
                    <CardDescription>Property values and comparable sales</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {defaultResources.comps.map((resource, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        className="w-full justify-between"
                        onClick={() => handleNavigate(resource.url)}
                      >
                        <span className="flex items-center gap-2">
                          {resource.name}
                          <Badge variant={resource.type === "Free" ? "secondary" : "outline"} className="text-xs">
                            {resource.type}
                          </Badge>
                        </span>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-purple-500" />
                      Title Companies
                    </CardTitle>
                    <CardDescription>Closing and title services</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {defaultResources.title.map((resource, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        className="w-full justify-between"
                        onClick={() => handleNavigate(resource.url)}
                      >
                        {resource.name}
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-blue-500" />
                      Legal & Business
                    </CardTitle>
                    <CardDescription>State registrations and licensing</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {defaultResources.legal.map((resource, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        className="w-full justify-between"
                        onClick={() => handleNavigate(resource.url)}
                      >
                        <span className="flex items-center gap-2">
                          {resource.name}
                          <Badge variant="secondary" className="text-xs">{resource.state}</Badge>
                        </span>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="suppliers" className="mt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Hammer className="h-5 w-5 text-yellow-600" />
                      Materials & Supplies
                    </CardTitle>
                    <CardDescription>Building materials and hardware</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {defaultResources.suppliers.filter(s => s.category === "Materials").map((resource, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        className="w-full justify-between"
                        onClick={() => handleNavigate(resource.url)}
                      >
                        {resource.name}
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-blue-600" />
                      Contractors
                    </CardTitle>
                    <CardDescription>Find qualified contractors</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {defaultResources.suppliers.filter(s => s.category === "Contractors").map((resource, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        className="w-full justify-between"
                        onClick={() => handleNavigate(resource.url)}
                      >
                        {resource.name}
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="notes" className="mt-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="md:col-span-1">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">Research Notes</CardTitle>
                      <Button size="sm" onClick={createNote} data-testid="button-new-note">
                        <Plus className="h-4 w-4 mr-1" /> New
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {propertyTypes.map((type) => (
                        <Badge
                          key={type.value}
                          variant={selectedPropertyType === type.value ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => setSelectedPropertyType(type.value)}
                        >
                          <type.icon className="h-3 w-3 mr-1" />
                          {type.label}
                        </Badge>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-2">
                        {notes.filter(n => !selectedPropertyType || n.propertyType === selectedPropertyType).map((note) => (
                          <div
                            key={note.id}
                            className={`p-3 rounded-lg border cursor-pointer transition-colors ${activeNote?.id === note.id ? "bg-primary/10 border-primary" : "hover:bg-muted"}`}
                            onClick={() => setActiveNote(note)}
                            data-testid={`note-${note.id}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm truncate">{note.title}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {note.content || "No content yet..."}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="secondary" className="text-xs">
                                {propertyTypes.find(t => t.value === note.propertyType)?.label}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {new Date(note.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        ))}
                        {notes.filter(n => !selectedPropertyType || n.propertyType === selectedPropertyType).length === 0 && (
                          <div className="text-center py-8 text-muted-foreground">
                            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No notes yet</p>
                            <p className="text-xs">Create one to start researching</p>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card className="md:col-span-2">
                  {activeNote ? (
                    <>
                      <CardHeader className="pb-3">
                        <Input
                          value={activeNote.title}
                          onChange={(e) => updateNote({ ...activeNote, title: e.target.value })}
                          className="text-lg font-semibold border-none px-0 focus-visible:ring-0"
                          placeholder="Note title..."
                          data-testid="input-note-title"
                        />
                        <div className="flex items-center gap-2 mt-2">
                          {propertyTypes.map((type) => (
                            <Badge
                              key={type.value}
                              variant={activeNote.propertyType === type.value ? "default" : "outline"}
                              className="cursor-pointer"
                              onClick={() => updateNote({ ...activeNote, propertyType: type.value })}
                            >
                              <type.icon className="h-3 w-3 mr-1" />
                              {type.label}
                            </Badge>
                          ))}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <Textarea
                          value={activeNote.content}
                          onChange={(e) => updateNote({ ...activeNote, content: e.target.value })}
                          placeholder="Write your research notes, ideas, zoning findings, deal strategies..."
                          className="min-h-[400px] resize-none"
                          data-testid="textarea-note-content"
                        />
                        <div className="flex justify-end mt-3">
                          <Button size="sm" onClick={() => toast({ title: "Note saved!" })}>
                            <Save className="h-4 w-4 mr-1" /> Save Note
                          </Button>
                        </div>
                      </CardContent>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-[500px] text-muted-foreground">
                      <div className="text-center">
                        <Lightbulb className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p className="font-medium">Select or create a note</p>
                        <p className="text-sm">Document your research and deal ideas</p>
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bookmark className="h-5 w-5 text-primary" />
                Quick Links
              </CardTitle>
              <CardDescription>Your saved bookmarks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 mb-4">
                <Input
                  placeholder="Link name"
                  value={newLinkName}
                  onChange={(e) => setNewLinkName(e.target.value)}
                  data-testid="input-link-name"
                />
                <Input
                  placeholder="URL"
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  data-testid="input-link-url"
                />
                <Button size="sm" className="w-full" onClick={addQuickLink} data-testid="button-add-link">
                  <Plus className="h-4 w-4 mr-1" /> Add Bookmark
                </Button>
              </div>
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {quickLinks.map((link) => (
                    <div key={link.id} className="flex items-center gap-2 group">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 justify-start text-left truncate"
                        onClick={() => handleNavigate(link.url)}
                      >
                        <Globe className="h-3 w-3 mr-2 shrink-0" />
                        <span className="truncate">{link.name}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeQuickLink(link.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  {quickLinks.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No bookmarks yet
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Mail className="h-5 w-5 text-green-500" />
                Quick Tips
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="font-medium text-primary">Land Deals</p>
                <p className="text-muted-foreground text-xs mt-1">
                  Check zoning for buildable lots, utilities access, and flood zones before making offers.
                </p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="font-medium text-primary">Skip Tracing</p>
                <p className="text-muted-foreground text-xs mt-1">
                  Always verify with 2+ sources. Cross-reference with county records.
                </p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="font-medium text-primary">Comps</p>
                <p className="text-muted-foreground text-xs mt-1">
                  Use 90-day sold comps within 0.5 miles for most accurate ARV.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
