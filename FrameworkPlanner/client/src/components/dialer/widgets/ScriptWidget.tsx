import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { renderDialerScript } from "./dialerUtils";
import { apiRequest } from "@/lib/queryClient";
import { useDialerWorkspace } from "./DialerWorkspaceContext";

/** Script — extracted verbatim from the old dialer-workspace page. */
export function ScriptWidget() {
  const { scriptId, setScriptId, scripts, scriptName, setScriptName, scriptContent, setScriptContent, scriptIsDefault, setScriptIsDefault, scriptSaving, setScriptSaving, setNote, lead, activeItem, queryClient, state } = useDialerWorkspace();
  return (
    <div className="h-full overflow-auto rounded-lg border border-border bg-card">
      <div className="dialer-widget-drag-handle flex cursor-move items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">Script</span>
      </div>
      <div className="space-y-3 p-3">
    <div className="grid gap-2">
      <Label>Script</Label>
      <div className="flex gap-2">
        <select
          className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
          value={scriptId ? String(scriptId) : ""}
          onChange={(e) => {
            const raw = String(e.target.value || "").trim();
            if (!raw) {
              setScriptId(null);
              setScriptName("");
              setScriptContent("");
              setScriptIsDefault(false);
              return;
            }
            const nextId = parseInt(raw, 10);
            if (!Number.isFinite(nextId)) return;
            const next = scripts.find((s: any) => s?.id === nextId);
            setScriptId(nextId);
            setScriptName(String(next?.name || ""));
            setScriptContent(String(next?.content || ""));
            setScriptIsDefault(Boolean(next?.isDefault));
          }}
        >
          <option value="">New script</option>
          {scripts.map((s: any) => (
            <option key={s.id} value={String(s.id)}>
              {String(s.name || "Untitled")}
              {s.isDefault ? " (default)" : ""}
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          onClick={() => {
            setScriptId(null);
            setScriptName("");
            setScriptContent("");
            setScriptIsDefault(false);
          }}
        >
          New
        </Button>
      </div>
      <Input value={scriptName} onChange={(e) => setScriptName(e.target.value)} placeholder="Script name" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={scriptIsDefault} onChange={(e) => setScriptIsDefault(e.target.checked)} />
        Default for this list
      </label>
      <Textarea
        value={scriptContent}
        onChange={(e) => setScriptContent(e.target.value)}
        placeholder="Use {{firstName}}, {{ownerName}}, {{address}}, {{city}}, {{state}}, {{phone}}"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={async () => {
            if (scriptSaving) return;
            const name = String(scriptName || "").trim();
            if (!name) return;
            setScriptSaving(true);
            try {
              if (typeof scriptId === "number") {
                await apiRequest("PATCH", `/api/dialer/scripts/${scriptId}`, {
                  name,
                  content: String(scriptContent || ""),
                  listId: state.listId,
                  isDefault: Boolean(scriptIsDefault),
                }).then((r: any) => r.json());
              } else {
                const created = await apiRequest("POST", `/api/dialer/scripts`, {
                  name,
                  content: String(scriptContent || ""),
                  listId: state.listId,
                  isDefault: Boolean(scriptIsDefault),
                }).then((r: any) => r.json());
                if (created?.id) setScriptId(Number(created.id));
              }
              queryClient.invalidateQueries({ queryKey: ["/api/dialer/scripts", state.listId] });
            } finally {
              setScriptSaving(false);
            }
          }}
          disabled={!String(scriptName || "").trim() || scriptSaving}
        >
          {scriptSaving ? "Saving…" : "Save Script"}
        </Button>
        {typeof scriptId === "number" ? (
          <Button
            variant="outline"
            onClick={async () => {
              if (!confirm("Delete this script?")) return;
              try {
                await apiRequest("DELETE", `/api/dialer/scripts/${scriptId}`);
              } catch {
                return;
              }
              setScriptId(null);
              setScriptName("");
              setScriptContent("");
              setScriptIsDefault(false);
              queryClient.invalidateQueries({ queryKey: ["/api/dialer/scripts", state.listId] });
            }}
          >
            Delete
          </Button>
        ) : null}
        <Button
          variant="outline"
          onClick={async () => {
            const rendered = renderDialerScript(scriptContent, lead, activeItem);
            const text = String(rendered || "").trim();
            if (!text) return;
            try {
              await navigator.clipboard.writeText(text);
            } catch {}
          }}
          disabled={!String(scriptContent || "").trim()}
        >
          Copy
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const rendered = renderDialerScript(scriptContent, lead, activeItem);
            const text = String(rendered || "").trim();
            if (!text) return;
            setNote((prev) => (prev ? `${prev}\n\n${text}` : text));
          }}
          disabled={!String(scriptContent || "").trim()}
        >
          Insert into Note
        </Button>
      </div>
      <div className="rounded-md border border-border p-2 text-sm whitespace-pre-wrap">
        {renderDialerScript(scriptContent, lead, activeItem) || <span className="text-muted-foreground">Script preview</span>}
      </div>
    </div>
      </div>
    </div>
  );
}
