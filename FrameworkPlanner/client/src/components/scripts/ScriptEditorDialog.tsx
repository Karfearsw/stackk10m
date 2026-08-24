import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Save, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "intro", label: "Intro / Cold Call" },
  { value: "followup", label: "Follow-up" },
  { value: "closing", label: "Closing / Offer" },
  { value: "objection", label: "Objection Handling" },
  { value: "disposition", label: "Post-Call Notes" },
  { value: "custom", label: "Custom" },
];

interface ScriptEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  script?: {
    id: number;
    name: string;
    content: string;
    description?: string;
    category?: string;
    tags?: string[];
    isDefault?: boolean;
    listId?: string;
  } | null;
  listId?: string;
  onSaved?: () => void;
  onDeleted?: () => void;
}

export function ScriptEditorDialog({
  open,
  onOpenChange,
  script,
  listId,
  onSaved,
  onDeleted,
}: ScriptEditorDialogProps) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (script) {
        setName(script.name || "");
        setContent(script.content || "");
        setDescription(script.description || "");
        setCategory(script.category || "general");
        setTags(Array.isArray(script.tags) ? script.tags : []);
        setIsDefault(Boolean(script.isDefault));
      } else {
        setName("");
        setContent("");
        setDescription("");
        setCategory("general");
        setTags([]);
        setIsDefault(false);
      }
      setTagInput("");
      setSaving(false);
    }
  }, [open, script]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Script name is required");
      return;
    }
    setSaving(true);
    try {
      const body = { name: trimmedName, content, description, category, tags, isDefault, listId: listId || null };
      if (script?.id) {
        await apiRequest("PATCH", `/api/scripts/${script.id}`, body);
        toast.success("Script updated");
      } else {
        await apiRequest("POST", "/api/scripts", body);
        toast.success("Script created");
      }
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save script");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!script?.id) return;
    if (!confirm("Archive this script? It can be restored later.")) return;
    try {
      await apiRequest("POST", `/api/scripts/${script.id}/archive`);
      toast.success("Script archived");
      onDeleted?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to archive script");
    }
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  };

  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t));

  const variableHelp = [
    { key: "firstName", desc: "Lead first name" },
    { key: "ownerName", desc: "Full owner name" },
    { key: "address", desc: "Property address" },
    { key: "city", desc: "City" },
    { key: "state", desc: "State" },
    { key: "phone", desc: "Owner phone" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{script?.id ? "Edit Script" : "New Script"}</DialogTitle>
          <DialogDescription>
            {script?.id ? "Update your calling script" : "Create a new script for your calls"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="script-name">Name *</Label>
            <Input
              id="script-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Intro Cold Call"
              maxLength={120}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="script-category">Category</Label>
              <select
                id="script-category"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="script-desc">Description</Label>
              <Input
                id="script-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1.5 mb-1">
              {tags.map((t) => (
                <Badge key={t} variant="secondary" className="cursor-pointer" onClick={() => removeTag(t)}>
                  {t} ×
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Add tag"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              />
              <Button variant="secondary" onClick={addTag} disabled={!tagInput.trim()}>Add</Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="script-content">Script Content *</Label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer shrink-0">
                <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
                Default for list
              </label>
            </div>
            <Textarea
              id="script-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Hello {{firstName}}, I'm calling about {{address}}..."
              className="min-h-[200px] font-mono text-sm"
            />
            <div className="flex flex-wrap gap-1.5">
              {variableHelp.map((v) => (
                <Badge
                  key={v.key}
                  variant="outline"
                  className="cursor-pointer text-xs"
                  onClick={() => { setContent((prev) => prev + ` {{${v.key}}}`); }}
                  title={`Insert {{${v.key}}} — ${v.desc}`}
                >
                  {`{{${v.key}}}`}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving || !name.trim()} className="flex-1 sm:flex-none">
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : script?.id ? "Update Script" : "Create Script"}
            </Button>
            {script?.id && (
              <Button variant="destructive" onClick={handleDelete} className="flex-1 sm:flex-none">
                <Trash2 className="h-4 w-4 mr-2" /> Archive
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
