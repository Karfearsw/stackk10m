// M15: full lead-notes lifecycle — list, expand, edit, delete.
// The lead sheet previously rendered only the legacy `notes` text field.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Trash2, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type Note = { id: number; body: string; createdAt: string | null; createdBy: number | null };

export function LeadNotesList({ leadId }: { leadId: number }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [addText, setAddText] = useState("");

  const notesKey = [`/api/leads/notes`, leadId];
  const { data, isLoading } = useQuery<{ items: Note[] }>({
    queryKey: notesKey,
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}/notes`);
      if (!res.ok) throw new Error("Failed to load notes");
      return res.json();
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: notesKey });
    queryClient.invalidateQueries({ queryKey: ["leads"] });
  };

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: string }) => {
      const res = await apiRequest("PATCH", `/api/leads/notes/${id}`, { body });
      return res.json();
    },
    onSuccess: () => { setEditingId(null); refresh(); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/leads/notes/${id}`);
    },
    onSuccess: () => { setDeleteId(null); refresh(); },
  });

  const addMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await apiRequest("POST", `/api/leads/${leadId}/notes`, { body });
      return res.json();
    },
    onSuccess: () => { setAdding(false); setAddText(""); refresh(); },
  });

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const items = data?.items || [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">Notes ({items.length})</div>
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)} data-testid="add-note-inline">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>

      {adding ? (
        <div className="space-y-2 border rounded-md p-3">
          <Textarea value={addText} onChange={(e) => setAddText(e.target.value)} placeholder="Type a note…" rows={3} />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => { setAdding(false); setAddText(""); }}>Cancel</Button>
            <Button
              size="sm"
              disabled={!addText.trim() || addMutation.isPending}
              onClick={() => addMutation.mutate(addText.trim())}
            >
              {addMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading notes…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground border rounded-md p-3 bg-muted/30">No notes yet.</div>
      ) : (
        items.map((n) => {
          const isOpen = expanded.has(n.id);
          const isEditing = editingId === n.id;
          const confirmingDelete = deleteId === n.id;
          return (
            <div key={n.id} className="border rounded-md p-3 bg-muted/30">
              {isEditing ? (
                <div className="space-y-2">
                  <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                    <Button
                      size="sm"
                      disabled={!editText.trim() || updateMutation.isPending}
                      onClick={() => updateMutation.mutate({ id: n.id, body: editText.trim() })}
                    >
                      {updateMutation.isPending ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={`whitespace-pre-wrap text-sm ${isOpen ? "" : "line-clamp-3"}`}>{n.body}</div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
                    </span>
                    <div className="flex gap-1">
                      {n.body.split("\n").length > 3 || n.body.length > 200 ? (
                        <Button size="sm" variant="ghost" onClick={() => toggle(n.id)} title={isOpen ? "Collapse" : "Expand"}>
                          {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Edit note"
                        onClick={() => { setEditingId(n.id); setEditText(n.body); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {confirmingDelete ? (
                        <span className="flex gap-1 items-center">
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(n.id)}
                          >
                            Delete
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
                        </span>
                      ) : (
                        <Button size="sm" variant="ghost" title="Delete note" onClick={() => setDeleteId(n.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
