import { Layout } from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Bell, Trash2, CheckCircle2, AlertCircle, Info, Loader2, AlertOctagon, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import React from "react";
import { useLocation } from "wouter";

interface Notification {
  id: number;
  userId: number;
  type: string;
  severity: string;
  title: string;
  description: string | null;
  read: boolean;
  relatedId: number | null;
  relatedType: string | null;
  linkPath: string | null;
  createdAt: string;
}

type SeverityFilter = "all" | "info" | "warning" | "urgent";
type ReadFilter = "unread" | "all";

export default function Notifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [readFilter, setReadFilter] = React.useState<ReadFilter>("unread");
  const [severityFilter, setSeverityFilter] = React.useState<SeverityFilter>("all");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");

  const invalidateNotifications = React.useCallback(() => {
    const base = `/api/users/${user?.id}/notifications`;
    queryClient.invalidateQueries({
      predicate: (q) => typeof q.queryKey?.[0] === "string" && String(q.queryKey[0]).startsWith(base),
    });
  }, [queryClient, user?.id]);

  const canNavigateTo = (linkPath: unknown) => {
    const s = typeof linkPath === "string" ? linkPath.trim() : "";
    if (!s) return false;
    if (!s.startsWith("/")) return false;
    if (s.startsWith("//")) return false;
    if (s.toLowerCase().startsWith("/http")) return false;
    return true;
  };

  const buildNotificationsUrl = React.useCallback(
    (input: { limit?: number; includeReadFilter?: boolean }) => {
      const limit = typeof input.limit === "number" ? input.limit : 200;
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (input.includeReadFilter && readFilter === "unread") params.set("read", "false");
      if (severityFilter !== "all") params.set("severity", severityFilter);
      if (typeFilter !== "all" && typeFilter.trim()) params.set("type", typeFilter.trim());
      const qs = params.toString();
      return `/api/users/${user?.id}/notifications${qs ? `?${qs}` : ""}`;
    },
    [readFilter, severityFilter, typeFilter, user?.id],
  );

  const { data: anyNotifications = [], isLoading: isLoadingAny } = useQuery<Notification[]>({
    queryKey: [`/api/users/${user?.id}/notifications?limit=1`],
    enabled: !!user?.id,
  });

  const notificationsUrl = React.useMemo(() => buildNotificationsUrl({ limit: 200, includeReadFilter: true }), [buildNotificationsUrl]);
  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: [notificationsUrl],
    enabled: !!user?.id,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: 'PATCH',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to mark as read');
      return res.json();
    },
    onSuccess: () => {
      invalidateNotifications();
      toast.success('Marked as read');
    },
    onError: () => {
      toast.error('Failed to mark as read');
    },
  });

  const markAsReadSilentMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to mark as read");
      return res.json();
    },
    onSuccess: () => {
      invalidateNotifications();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/notifications/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    },
    onSuccess: () => {
      invalidateNotifications();
      toast.success('Notification deleted');
    },
    onError: () => {
      toast.error('Failed to delete notification');
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/users/${user?.id}/notifications/read-all`, {
        method: 'PATCH',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to mark all as read');
      return res.json();
    },
    onSuccess: () => {
      invalidateNotifications();
      toast.success('All notifications marked as read');
    },
    onError: () => {
      toast.error('Failed to mark all as read');
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/users/${user?.id}/notifications`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to clear all');
      return res.json();
    },
    onSuccess: () => {
      invalidateNotifications();
      toast.success('All notifications cleared');
    },
    onError: () => {
      toast.error('Failed to clear notifications');
    },
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const getNotificationIcon = (type: string) => {
    const normalized = String(type || "").toLowerCase();
    if (normalized.includes("lead")) return <Info className="w-5 h-5 text-blue-500" />;
    if (normalized.includes("contract")) return <AlertCircle className="w-5 h-5 text-orange-500" />;
    if (normalized.includes("deal") || normalized.includes("opportunity")) return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    if (normalized.includes("task")) return <Bell className="w-5 h-5 text-purple-500" />;
    return <Bell className="w-5 h-5 text-gray-500" />;
  };

  const getSeverityMeta = (severity: unknown) => {
    const s = String(severity || "").toLowerCase();
    if (s === "urgent") {
      return {
        label: "Urgent",
        icon: <AlertOctagon className="w-3.5 h-3.5" />,
        badgeClass: "border-red-500/20 bg-red-500/10 text-red-700",
        accentClass: "border-l-red-500",
      };
    }
    if (s === "warning") {
      return {
        label: "Warning",
        icon: <AlertTriangle className="w-3.5 h-3.5" />,
        badgeClass: "border-amber-500/20 bg-amber-500/10 text-amber-700",
        accentClass: "border-l-amber-500",
      };
    }
    return {
      label: "Info",
      icon: <Info className="w-3.5 h-3.5" />,
      badgeClass: "border-blue-500/20 bg-blue-500/10 text-blue-700",
      accentClass: "border-l-blue-500",
    };
  };

  const formatTypeLabel = (type: string) => {
    const raw = String(type || "").trim();
    if (!raw) return "System";
    const parts = raw.replaceAll("-", "_").split("_").filter(Boolean);
    return parts.map((p) => p.slice(0, 1).toUpperCase() + p.slice(1)).join(" ");
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (isLoading || isLoadingAny) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  const hasAny = anyNotifications.length > 0;
  const isFilteredEmpty = notifications.length === 0 && hasAny;

  const typeOptions = React.useMemo(() => {
    const options = new Set<string>();
    for (const n of notifications) {
      const v = String(n.type || "").trim();
      if (v) options.add(v);
    }
    if (typeFilter !== "all") options.add(typeFilter);
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [notifications, typeFilter]);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
            <p className="text-muted-foreground">
              {unreadCount > 0 ? `You have ${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}` : 'All caught up!'}
            </p>
          </div>
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending}
                data-testid="button-mark-all-read"
              >
                {markAllAsReadMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Mark all as read
              </Button>
            )}
            {notifications.length > 0 && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => clearAllMutation.mutate()}
                disabled={clearAllMutation.isPending}
                className="text-destructive hover:text-destructive"
                data-testid="button-clear-all"
              >
                {clearAllMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Clear all
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <ToggleGroup
            type="single"
            value={readFilter}
            onValueChange={(v) => {
              const next = v === "all" || v === "unread" ? v : null;
              if (!next) return;
              setReadFilter(next);
            }}
            className="justify-start"
          >
            <ToggleGroupItem value="unread" aria-label="Unread">
              Unread
            </ToggleGroupItem>
            <ToggleGroupItem value="all" aria-label="All">
              All
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="flex gap-3 flex-1">
            <div className="w-full md:w-52">
              <Select value={severityFilter} onValueChange={(v) => setSeverityFilter((v as SeverityFilter) || "all")}>
                <SelectTrigger>
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All severity</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-full md:w-72">
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v || "all")}>
                <SelectTrigger>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {typeOptions.map((t) => (
                    <SelectItem key={t} value={t}>
                      {formatTypeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(readFilter !== "unread" || severityFilter !== "all" || typeFilter !== "all") && (
              <Button
                variant="outline"
                onClick={() => {
                  setReadFilter("unread");
                  setSeverityFilter("all");
                  setTypeFilter("all");
                }}
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {notifications.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Bell className="w-12 h-12 text-muted-foreground/50 mb-3" />
                {isFilteredEmpty ? (
                  <>
                    <p className="text-muted-foreground">No notifications match your filters</p>
                    <p className="text-sm text-muted-foreground">
                      Try switching to All, or reset filters to see your full history.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-muted-foreground">No notifications yet</p>
                    <p className="text-sm text-muted-foreground">
                      You&apos;ll see alerts here for task reminders, lead assignments, contract milestones, and system updates.
                    </p>
                    <p className="text-sm text-muted-foreground mt-3 max-w-md text-center">
                      Setup hint: create a task with a due date (or mark one overdue) to generate the first reminder notification.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            notifications.map((notification) => (
              (() => {
                const severityMeta = getSeverityMeta(notification.severity);
                const isClickable = canNavigateTo(notification.linkPath);
                return (
              <Card 
                key={notification.id} 
                className={cn(
                  "transition-all border-l-4",
                  severityMeta.accentClass,
                  !notification.read ? "bg-primary/5 border-primary/30" : "",
                  isClickable ? "cursor-pointer hover:bg-muted/40" : "",
                )}
                data-testid={`notification-${notification.id}`}
                role={isClickable ? "button" : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onClick={() => {
                  if (!isClickable) return;
                  if (!notification.read) markAsReadSilentMutation.mutate(notification.id);
                  setLocation(String(notification.linkPath));
                }}
                onKeyDown={(e) => {
                  if (!isClickable) return;
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  if (!notification.read) markAsReadSilentMutation.mutate(notification.id);
                  setLocation(String(notification.linkPath));
                }}
              >
                <CardContent className="p-4">
                  <div className="flex gap-4 items-start">
                    <div className="mt-1">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={cn("text-xs gap-1", severityMeta.badgeClass)}>
                              {severityMeta.icon}
                              {severityMeta.label}
                            </Badge>
                            <h4 className="font-semibold text-sm leading-tight">
                              {notification.title}
                            </h4>
                          </div>
                          {notification.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {notification.description}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-2">
                            {formatTime(notification.createdAt)}
                          </p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          {!notification.read && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                markAsReadMutation.mutate(notification.id);
                              }}
                              disabled={markAsReadMutation.isPending}
                              data-testid={`button-mark-read-${notification.id}`}
                              className="h-8 w-8 p-0"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMutation.mutate(notification.id);
                            }}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-notif-${notification.id}`}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Badge variant="outline" className="text-xs capitalize">
                          {formatTypeLabel(notification.type)}
                        </Badge>
                        {!notification.read && (
                          <Badge className="bg-primary text-white text-xs">
                            New
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
                );
              })()
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
