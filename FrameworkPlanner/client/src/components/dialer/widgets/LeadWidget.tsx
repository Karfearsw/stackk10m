import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatBuyerStatus, buyerStatusColor } from "@/lib/dispositions";
import { formatCurrencyRange } from "./dialerUtils";
import { useDialerWorkspace } from "./DialerWorkspaceContext";

/** Lead / buyer detail + SMS — extracted verbatim from the old dialer-workspace page. */
export function LeadWidget() {
  const { buyerMode, buyerCtx, buyerDnc, lead, activeItem, patchLead, tagInput, setTagInput, smsBody, setSmsBody, sendSms } = useDialerWorkspace();
  const title = buyerMode ? "Buyer" : "Lead";
  return (
    <div className="h-full overflow-auto rounded-lg border border-border bg-card">
      <div className="dialer-widget-drag-handle flex cursor-move items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <div className="space-y-3 p-3">
        {/* buyer / empty / lead branches — verbatim from the old page */}
                {buyerMode ? (
                      <div className="space-y-3">
                        <div>
                          <div className="text-lg font-semibold">{buyerCtx?.name}</div>
                          <div className="text-sm text-muted-foreground">{buyerCtx?.company || ""}</div>
                          <div className="text-sm text-muted-foreground">{buyerCtx?.phone}</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge className={buyerStatusColor(buyerCtx?.buyerStatus)}>{formatBuyerStatus(buyerCtx?.buyerStatus)}</Badge>
                          {buyerDnc ? <Badge variant="destructive">DNC</Badge> : null}
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Budget</p>
                            <p className="font-medium">{formatCurrencyRange(buyerCtx?.minPrice || buyerCtx?.minBudget, buyerCtx?.maxPrice || buyerCtx?.maxBudget)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Deals/Month</p>
                            <p className="font-medium">{buyerCtx?.dealsPerMonth || "—"}</p>
                          </div>
                        </div>
                        {(buyerCtx?.preferredAreas || []).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {buyerCtx.preferredAreas.map((a: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-xs">{a}</Badge>
                            ))}
                          </div>
                        )}
                        {buyerCtx?.nextAction ? (
                          <div className="rounded-md border border-border p-2 text-sm">
                            <p className="text-xs text-muted-foreground">Next action</p>
                            <p className="font-medium">{buyerCtx.nextAction}</p>
                            {buyerCtx?.nextActionAt ? (
                              <p className="text-xs text-muted-foreground">Due {new Date(buyerCtx.nextActionAt).toLocaleString()}</p>
                            ) : null}
                          </div>
                        ) : null}
                        {buyerDnc ? (
                          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                            Do-Not-Contact buyer — dialing is blocked until an admin opts them back in.
                          </div>
                        ) : null}
                      </div>
                ) : !activeItem ? (
                    <div className="space-y-4">
                      <div className="text-sm text-muted-foreground">Select a lead from the queue</div>
                      <div className="grid gap-2 opacity-50 pointer-events-none">
                        <Label>Script Preview</Label>
                        <div className="flex gap-2">
                          <select className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm" disabled>
                            <option>Select a lead to view scripts</option>
                          </select>
                        </div>
                        <div className="rounded-md border border-border p-2 text-sm whitespace-pre-wrap min-h-[100px] flex items-center justify-center">
                          <span className="text-muted-foreground">Load queue and select a lead to see the script</span>
                        </div>
                      </div>
                    </div>
                ) : (
                  <>
                        <div>
                          <div className="text-lg font-semibold">{lead?.ownerName || activeItem.ownerName}</div>
                          <div className="text-sm text-muted-foreground">{lead?.address || activeItem.address}</div>
                          <div className="text-sm text-muted-foreground">{lead?.ownerPhone || activeItem.ownerPhone}</div>
                        </div>

                        <div className="grid gap-3">
                          <div className="grid gap-2">
                            <Label>Stage</Label>
                            <select
                              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                              value={String(lead?.status || "")}
                              onChange={(e) => patchLead.mutate({ status: e.target.value })}
                            >
                              {["new", "contacted", "qualified", "negotiation", "under_contract", "closed", "lost"].map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="grid gap-2">
                            <Label>Flags</Label>
                            <div className="flex flex-col gap-2">
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={Boolean(lead?.doNotCall)}
                                  onChange={(e) => patchLead.mutate({ doNotCall: e.target.checked })}
                                />
                                Do Not Call
                              </label>
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={Boolean(lead?.doNotText)}
                                  onChange={(e) => patchLead.mutate({ doNotText: e.target.checked })}
                                />
                                Do Not Text
                              </label>
                            </div>
                          </div>

                          <div className="grid gap-2">
                            <Label>Tags</Label>
                            <div className="flex flex-wrap gap-2">
                              {(Array.isArray(lead?.tags) ? lead.tags : []).map((t: string) => (
                                <button
                                  key={t}
                                  className="rounded-md border px-2 py-1 text-xs hover:bg-muted/50"
                                  onClick={() => {
                                    const existing = Array.isArray(lead?.tags) ? lead.tags : [];
                                    patchLead.mutate({ tags: existing.filter((x: string) => x !== t) });
                                  }}
                                >
                                  {t}
                                </button>
                              ))}
                              {!((Array.isArray(lead?.tags) ? lead.tags : []).length) ? (
                                <div className="text-sm text-muted-foreground">No tags</div>
                              ) : null}
                            </div>
                            <div className="flex gap-2">
                              <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Add tag" />
                              <Button
                                variant="secondary"
                                onClick={() => {
                                  const next = String(tagInput || "").trim();
                                  if (!next) return;
                                  const existing = Array.isArray(lead?.tags) ? lead.tags : [];
                                  const merged = Array.from(new Set([...existing, next]));
                                  patchLead.mutate({ tags: merged });
                                  setTagInput("");
                                }}
                              >
                                Add
                              </Button>
                            </div>
                          </div>
                    <div className="grid gap-2">
                      <Label>SMS</Label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setSmsBody(`Hi ${lead?.ownerName || activeItem.ownerName}, are you open to an offer on ${lead?.address || activeItem.address}?`)}
                        >
                          Intro
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setSmsBody(`Following up on ${lead?.address || activeItem.address}. Is this a good time to chat?`)}
                        >
                          Follow-up
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setSmsBody(`Thanks for your time. If you’re open to it, I can put together an offer for ${lead?.address || activeItem.address}.`)}
                        >
                          Offer
                        </Button>
                      </div>
                      <Textarea value={smsBody} onChange={(e) => setSmsBody(e.target.value)} placeholder="Write a text…" />
                      <Button onClick={() => sendSms.mutate()} disabled={!smsBody.trim() || sendSms.isPending || Boolean(lead?.doNotText)}>
                        Send SMS
                      </Button>
                    </div>
                  </div>
                  </>
                )}
      </div>
    </div>
  );
}
