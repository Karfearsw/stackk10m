import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { UnderwritingBookmark, UnderwritingSection } from "@/utils/playgroundPersistence";

export function UnderwritingBookmarks(props: {
  bookmarks: UnderwritingBookmark[];
  sections: UnderwritingSection[];
  onJump: (sectionId: string) => void;
  onRename: (bookmarkId: string, nextLabel: string) => void;
  onDelete: (bookmarkId: string) => void;
}) {
  const sectionTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of props.sections) m.set(s.id, s.title);
    return m;
  }, [props.sections]);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameId, setRenameId] = useState<string>("");
  const [renameLabel, setRenameLabel] = useState<string>("");

  const openRename = (id: string, currentLabel: string) => {
    setRenameId(id);
    setRenameLabel(currentLabel);
    setRenameOpen(true);
  };

  return (
    <>
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bookmarks</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {props.bookmarks.length ? (
            <div className="flex flex-col gap-2">
              {props.bookmarks.map((b) => (
                <div key={b.id} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left"
                    onClick={() => props.onJump(b.sectionId)}
                  >
                    <div className="text-sm font-medium truncate">{b.label}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <Badge variant="secondary" className="h-5">
                        {sectionTitleById.get(b.sectionId) || "Section"}
                      </Badge>
                      <span className="truncate">Click to jump</span>
                    </div>
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" aria-label="Bookmark actions">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openRename(b.id, b.label)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => props.onDelete(b.id)} className="text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No bookmarks yet. Add one from a section header.</div>
          )}
        </CardContent>
      </Card>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename bookmark</DialogTitle>
          </DialogHeader>
          <Input value={renameLabel} onChange={(e) => setRenameLabel(e.target.value)} placeholder="Bookmark label" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const next = renameLabel.trim();
                if (!renameId || !next) return;
                props.onRename(renameId, next);
                setRenameOpen(false);
              }}
              disabled={!renameLabel.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

