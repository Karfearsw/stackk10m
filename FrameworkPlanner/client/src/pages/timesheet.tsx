import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PomodoroTimer } from "@/components/timesheet/PomodoroTimer";
import { Clock, Plus, Trash2, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { addWeeks, endOfWeek, format, startOfWeek } from "date-fns";

interface TimeEntry {
  id: number;
  userId: number;
  date: string;
  employee: string;
  task: string;
  categoryId?: number | null;
  linkedEntityType?: string | null;
  linkedEntityId?: number | null;
  startTime: string;
  endTime: string;
  hours: number;
  payableHours?: number | null;
  hourlyRate: number;
  status?: string | null;
  anomalyFlags?: string[] | null;
  approvedByUserId?: number | null;
  approvedAt?: string | null;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WorkCategory {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  defaultHourlyRate?: string | null;
}

export default function Timesheet() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("time");
  const isManager = useMemo(() => {
    const role = String(user?.role || "").toLowerCase();
    return !!user?.isSuperAdmin || role === "admin" || role === "manager" || role === "owner";
  }, [user?.isSuperAdmin, user?.role]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart]);
  const from = useMemo(() => format(weekStart, "yyyy-MM-dd"), [weekStart]);
  const to = useMemo(() => format(weekEnd, "yyyy-MM-dd"), [weekEnd]);
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    employee: "",
    task: "",
    categoryId: "",
    linkedEntityType: "",
    linkedEntityId: "",
    startTime: "09:00",
    endTime: "17:00",
    hourlyRate: 50,
  });

  useEffect(() => {
    if (!user?.id) return;
    const employee =
      user.firstName || user.lastName
        ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
        : user.email || "";
    setFormData((prev) => (prev.employee ? prev : { ...prev, employee }));
  }, [user?.id, user?.email, user?.firstName, user?.lastName]);

  const { data: allUsers = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    enabled: !!user?.id && isManager,
  });

  const timesheetUrl = useMemo(() => {
    const params = new URLSearchParams({ from, to });
    if (isManager && selectedUserId !== "all") params.set("userId", selectedUserId);
    return `/api/timesheet?${params.toString()}`;
  }, [from, to, isManager, selectedUserId]);

  const { data: entries = [], isLoading } = useQuery<TimeEntry[]>({
    queryKey: [timesheetUrl],
    enabled: !!user?.id,
  });

  const { data: categories = [] } = useQuery<WorkCategory[]>({
    queryKey: ["/api/work-categories"],
    enabled: !!user?.id,
  });

  const { data: activeSession } = useQuery<any>({
    queryKey: ["/api/timeclock/current"],
    enabled: !!user?.id,
    refetchInterval: 10_000,
  });

  const [clockNow, setClockNow] = useState(() => Date.now());
  useEffect(() => {
    if (!activeSession?.id) return;
    const id = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activeSession?.id]);

  const [activeTask, setActiveTask] = useState("");
  useEffect(() => {
    if (!activeSession?.id) return;
    setActiveTask(String(activeSession.task || ""));
  }, [activeSession?.id]);

  const updateTaskMutation = useMutation({
    mutationFn: async (task: string) => {
      const res = await fetch("/api/timeclock/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update task");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timeclock/current"] });
      toast.success("Active task updated");
    },
    onError: () => {
      toast.error("Failed to update task");
    },
  });

  const stopClockMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/timeclock/auto-stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientNow: new Date().toISOString(),
          tzOffsetMinutes: new Date().getTimezoneOffset(),
        }),
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to stop time clock");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timeclock/current"] });
      queryClient.invalidateQueries({ queryKey: [timesheetUrl] });
      toast.success("Clocked out");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to stop time clock");
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/users/${user?.id}/timesheet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: data.date,
          employee: data.employee,
          task: data.task,
          startTime: data.startTime,
          endTime: data.endTime,
          hourlyRate: String(data.hourlyRate || 0),
          categoryId: data.categoryId ? parseInt(String(data.categoryId)) : null,
          linkedEntityType: data.linkedEntityType ? String(data.linkedEntityType) : null,
          linkedEntityId: data.linkedEntityId ? parseInt(String(data.linkedEntityId)) : null,
        }),
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to create entry");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [timesheetUrl] });
      toast.success("Time entry added");
      setOpenDialog(false);
      setFormData((prev) => ({
        date: new Date().toISOString().split("T")[0],
        employee: prev.employee,
        task: "",
        categoryId: prev.categoryId,
        linkedEntityType: "",
        linkedEntityId: "",
        startTime: "09:00",
        endTime: "17:00",
        hourlyRate: 50,
      }));
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to add time entry");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/timesheet/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to delete entry");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [timesheetUrl] });
      toast.success("Entry deleted");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete entry");
    },
  });

  const totalHours = entries.reduce((sum, e) => sum + parseFloat(e.hours.toString()), 0);
  const uniqueEmployees = new Set(entries.map((e) => e.employee)).size;
  const totalCost = entries.reduce((sum, e) => sum + parseFloat(e.hours.toString()) * parseFloat(e.hourlyRate.toString()), 0);

  const getEmployeeTotal = (employee: string) => {
    return entries
      .filter((e) => e.employee === employee)
      .reduce((sum, e) => sum + parseFloat(e.hours.toString()), 0);
  };

  const employees = Array.from(new Set(entries.map((e) => e.employee)));
  const maxHours = Math.max(...employees.map(getEmployeeTotal), 1);

  const weeklyRows = useMemo(() => {
    return employees
      .map((employee) => {
        const hours = getEmployeeTotal(employee);
        const cost = entries
          .filter((e) => e.employee === employee)
          .reduce((sum, e) => sum + parseFloat(e.hours.toString()) * parseFloat(e.hourlyRate.toString()), 0);
        return { employee, hours, cost };
      })
      .sort((a, b) => b.hours - a.hours);
  }, [employees, entries]);

  const clockInMs = activeSession?.clockInAt ? new Date(activeSession.clockInAt).getTime() : 0;
  const elapsedSeconds = clockInMs ? Math.max(0, Math.floor((clockNow - clockInMs) / 1000)) : 0;
  const elapsedLabel = useMemo(() => {
    const h = Math.floor(elapsedSeconds / 3600);
    const m = Math.floor((elapsedSeconds % 3600) / 60);
    const s = elapsedSeconds % 60;
    const pad2 = (n: number) => String(n).padStart(2, "0");
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }, [elapsedSeconds]);

  const approvalsUrl = useMemo(() => {
    const params = new URLSearchParams({ from, to });
    return `/api/approvals/timesheet?${params.toString()}`;
  }, [from, to]);

  const { data: approvalRows = [], isLoading: approvalsLoading } = useQuery<TimeEntry[]>({
    queryKey: [approvalsUrl],
    enabled: !!user?.id && isManager,
  });

  const approveTimesheetMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/timesheet/${id}/approve`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed to approve entry");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [approvalsUrl] });
      queryClient.invalidateQueries({ queryKey: [timesheetUrl] });
      toast.success("Approved");
    },
    onError: () => toast.error("Failed to approve"),
  });

  const disputeTimesheetMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/timesheet/${id}/dispute`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed to dispute entry");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [approvalsUrl] });
      queryClient.invalidateQueries({ queryKey: [timesheetUrl] });
      toast.success("Disputed");
    },
    onError: () => toast.error("Failed to dispute"),
  });

  const markPaidTimesheetMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/timesheet/${id}/mark-paid`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed to mark paid");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [approvalsUrl] });
      queryClient.invalidateQueries({ queryKey: [timesheetUrl] });
      toast.success("Marked paid");
    },
    onError: () => toast.error("Failed to mark paid"),
  });

  const payrollUrl = useMemo(() => {
    const params = new URLSearchParams({ from, to });
    return `/api/payroll/summary?${params.toString()}`;
  }, [from, to]);

  const { data: payrollSummary } = useQuery<any>({
    queryKey: [payrollUrl],
    enabled: !!user?.id && isManager,
  });

  const workerProfilesUrl = useMemo(() => "/api/worker-profiles", []);
  const { data: workerProfiles = [] } = useQuery<any[]>({
    queryKey: [workerProfilesUrl],
    enabled: !!user?.id && isManager,
  });

  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<any>(null);
  const [profileForm, setProfileForm] = useState<any>({ payType: "hourly", defaultHourlyRate: "" });

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      const userId = editingProfile?.user?.id;
      const res = await fetch(`/api/worker-profiles/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payType: profileForm.payType,
          defaultHourlyRate: profileForm.defaultHourlyRate === "" ? null : profileForm.defaultHourlyRate,
        }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save profile");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [workerProfilesUrl] });
      toast.success("Profile saved");
      setEditProfileOpen(false);
    },
    onError: () => toast.error("Failed to save profile"),
  });

  const commissionLedgerUrl = useMemo(() => "/api/commissions/ledger?limit=200&offset=0", []);
  const { data: commissionLedger = [] } = useQuery<any[]>({
    queryKey: [commissionLedgerUrl],
    enabled: !!user?.id && isManager,
  });

  const approveCommissionMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/commissions/ledger/${id}/approve`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [commissionLedgerUrl] });
      toast.success("Approved");
    },
    onError: () => toast.error("Failed to approve"),
  });

  const markPaidCommissionMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/commissions/ledger/${id}/mark-paid`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [commissionLedgerUrl] });
      toast.success("Marked paid");
    },
    onError: () => toast.error("Failed to mark paid"),
  });

  const nameByUserId = useMemo(() => {
    const m = new Map<number, string>();
    for (const u of allUsers) {
      const name = u?.firstName || u?.lastName ? `${u?.firstName || ""} ${u?.lastName || ""}`.trim() : u?.email || `User ${u?.id}`;
      m.set(Number(u.id), name);
    }
    return m;
  }, [allUsers]);

  return (
    <Layout>
      <div className="space-y-1 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Team Pay + Productivity</h1>
        <p className="text-muted-foreground">Track time, approvals, commissions, and payroll visibility.</p>
      </div>

      <div className="flex flex-col gap-3 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart((d) => addWeeks(d, -1))} data-testid="button-week-prev">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium">
            Week: {from} – {to}
          </div>
          <Button variant="outline" size="sm" onClick={() => setWeekStart((d) => addWeeks(d, 1))} data-testid="button-week-next">
            <ChevronRight className="h-4 w-4" />
          </Button>

          {isManager && (
            <div className="w-full sm:w-auto sm:ml-auto flex items-center gap-2">
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="w-full sm:w-[240px]" data-testid="select-timesheet-employee">
                  <SelectValue placeholder="All employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All employees</SelectItem>
                  {allUsers.map((u) => {
                    const name = u?.firstName || u?.lastName ? `${u?.firstName || ""} ${u?.lastName || ""}`.trim() : u?.email || `User ${u?.id}`;
                    return (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="time">Time</TabsTrigger>
          {isManager && <TabsTrigger value="approvals">Approvals</TabsTrigger>}
          {isManager && <TabsTrigger value="payroll">Payroll</TabsTrigger>}
          {isManager && <TabsTrigger value="commissions">Commissions</TabsTrigger>}
          {isManager && <TabsTrigger value="profiles">Profiles</TabsTrigger>}
        </TabsList>

        <TabsContent value="time" className="mt-6">
          <div className="grid gap-4 md:grid-cols-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Hours</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{totalHours.toFixed(1)}h</div>
                <p className="text-xs text-muted-foreground mt-1">tracked</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Team Members</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{uniqueEmployees}</div>
                <p className="text-xs text-muted-foreground mt-1">actively logging</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Est. Labor Cost</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">${totalCost.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>
                <p className="text-xs text-muted-foreground mt-1">total</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Entries</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{entries.length}</div>
                <p className="text-xs text-muted-foreground mt-1">time entries</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Time Entries</h2>
                <Dialog open={openDialog} onOpenChange={setOpenDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm" data-testid="button-log-time">
                      <Plus className="mr-2 h-4 w-4" />
                      Log Time
                    </Button>
                  </DialogTrigger>
                  <DialogContent data-testid="dialog-add-timesheet">
                    <DialogHeader>
                      <DialogTitle>Log Time Entry</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="date">Date</Label>
                        <Input
                          id="date"
                          type="date"
                          value={formData.date}
                          onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                          data-testid="input-date"
                        />
                      </div>
                      <div>
                        <Label htmlFor="employee">Employee Name</Label>
                        <Input
                          id="employee"
                          value={formData.employee}
                          onChange={(e) => setFormData({ ...formData, employee: e.target.value })}
                          placeholder="Enter employee name"
                          data-testid="input-employee"
                        />
                      </div>
                      <div>
                        <Label htmlFor="category">Work Category</Label>
                        <Select value={formData.categoryId} onValueChange={(v) => setFormData({ ...formData, categoryId: v })}>
                          <SelectTrigger data-testid="select-category">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Uncategorized</SelectItem>
                            {categories.map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="task">Task</Label>
                        <Input
                          id="task"
                          value={formData.task}
                          onChange={(e) => setFormData({ ...formData, task: e.target.value })}
                          placeholder="Enter task description"
                          data-testid="input-task"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label htmlFor="startTime">Start Time</Label>
                          <Input
                            id="startTime"
                            type="time"
                            value={formData.startTime}
                            onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                            data-testid="input-start-time"
                          />
                        </div>
                        <div>
                          <Label htmlFor="endTime">End Time</Label>
                          <Input
                            id="endTime"
                            type="time"
                            value={formData.endTime}
                            onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                            data-testid="input-end-time"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label htmlFor="linkedEntityType">Link Type</Label>
                          <Select value={formData.linkedEntityType} onValueChange={(v) => setFormData({ ...formData, linkedEntityType: v })}>
                            <SelectTrigger data-testid="select-link-type">
                              <SelectValue placeholder="None" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">None</SelectItem>
                              <SelectItem value="lead">Lead</SelectItem>
                              <SelectItem value="property">Opportunity</SelectItem>
                              <SelectItem value="contract">Contract</SelectItem>
                              <SelectItem value="deal_assignment">Deal Assignment</SelectItem>
                              <SelectItem value="task">Task</SelectItem>
                              <SelectItem value="call_log">Call</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="linkedEntityId">Link ID</Label>
                          <Input
                            id="linkedEntityId"
                            type="number"
                            value={formData.linkedEntityId}
                            onChange={(e) => setFormData({ ...formData, linkedEntityId: e.target.value })}
                            placeholder="123"
                            data-testid="input-link-id"
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="hourlyRate">Hourly Rate ($)</Label>
                        <Input
                          id="hourlyRate"
                          type="number"
                          value={formData.hourlyRate}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setFormData({ ...formData, hourlyRate: Number.isNaN(val) ? 0 : val });
                          }}
                          placeholder="50"
                          data-testid="input-hourly-rate"
                        />
                      </div>
                      <Button
                        onClick={() => createMutation.mutate(formData)}
                        disabled={createMutation.isPending || !formData.employee || !formData.task}
                        className="w-full"
                        data-testid="button-add-entry"
                      >
                        {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Add Entry
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : entries.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Clock className="w-12 h-12 text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">No time entries yet</p>
                    <p className="text-sm text-muted-foreground">Click "Log Time" to add your first entry</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="rounded-md border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Task</TableHead>
                        <TableHead>Start</TableHead>
                        <TableHead>End</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((entry) => {
                        const cat = categories.find((c) => c.id === entry.categoryId) || null;
                        const status = String(entry.status || "draft");
                        const flags = Array.isArray(entry.anomalyFlags) ? entry.anomalyFlags : [];
                        return (
                          <TableRow key={entry.id} className="hover:bg-muted/50" data-testid={`row-timesheet-${entry.id}`}>
                            <TableCell className="text-sm">{entry.date}</TableCell>
                            <TableCell className="font-medium">{entry.employee}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{cat ? cat.name : "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{entry.task}</TableCell>
                            <TableCell className="text-sm">{entry.startTime}</TableCell>
                            <TableCell className="text-sm">{entry.endTime}</TableCell>
                            <TableCell className="text-right font-medium">{parseFloat(entry.hours.toString()).toFixed(2)}h</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                <Badge variant={status === "approved" || status === "paid" ? "default" : status === "disputed" ? "destructive" : "secondary"}>
                                  {status}
                                </Badge>
                                {flags.slice(0, 2).map((f) => (
                                  <Badge key={f} variant="outline">
                                    {f}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              ${(parseFloat(entry.hours.toString()) * parseFloat(entry.hourlyRate.toString())).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteMutation.mutate(entry.id)}
                                disabled={deleteMutation.isPending}
                                className="text-destructive hover:bg-destructive/10"
                                data-testid={`button-delete-timesheet-${entry.id}`}
                              >
                                {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <Card data-testid="card-timeclock">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Time Clock</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {activeSession?.id ? (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Clocked in</span>
                        <span className="font-medium tabular-nums">{elapsedLabel}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Started: {new Date(activeSession.clockInAt).toLocaleString()}
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="active-task">Active Task</Label>
                        <div className="flex gap-2">
                          <Input
                            id="active-task"
                            value={activeTask}
                            onChange={(e) => setActiveTask(e.target.value)}
                            placeholder="General"
                            data-testid="input-active-task"
                          />
                          <Button
                            size="sm"
                            onClick={() => updateTaskMutation.mutate(activeTask.trim())}
                            disabled={updateTaskMutation.isPending || !activeTask.trim()}
                            data-testid="button-save-active-task"
                          >
                            {updateTaskMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save
                          </Button>
                        </div>
                      </div>
                      <Button
                        variant="destructive"
                        onClick={() => stopClockMutation.mutate()}
                        disabled={stopClockMutation.isPending}
                        data-testid="button-clock-out"
                      >
                        {stopClockMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Stop
                      </Button>
                    </>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Not clocked in right now.</p>
                      <p className="text-xs text-muted-foreground">Auto clock-in starts on login. Stop is manual in this workspace.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <PomodoroTimer />

              <div className="space-y-2">
                <h2 className="text-lg font-semibold">Weekly Summary</h2>
                {weeklyRows.length === 0 ? (
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">No entries for this week</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {weeklyRows.map((row) => {
                      const overtime = row.hours > 40;
                      return (
                        <Card key={row.employee} data-testid={`card-weekly-${row.employee}`}>
                          <CardContent className="pt-4">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="font-medium text-sm">{row.employee}</p>
                                {overtime && <p className="text-xs font-medium text-primary">OT</p>}
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Hours:</span>
                                <span className="font-medium">{row.hours.toFixed(1)}h</span>
                              </div>
                              <div className="flex justify-between text-sm mb-2">
                                <span className="text-muted-foreground">Est. Cost:</span>
                                <span className="font-medium text-primary">${row.cost.toFixed(2)}</span>
                              </div>
                              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                                <div className="h-full bg-primary" style={{ width: `${(row.hours / maxHours) * 100}%` }} />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {isManager && (
          <TabsContent value="approvals" className="mt-6">
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Manager Review Queue</h2>
              {approvalsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : approvalRows.length === 0 ? (
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">No items to review for this week</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="rounded-md border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Task</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {approvalRows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-sm">{r.date}</TableCell>
                          <TableCell className="text-sm">{nameByUserId.get(Number(r.userId)) || r.employee}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{r.task}</TableCell>
                          <TableCell className="text-right">{parseFloat(r.hours.toString()).toFixed(2)}h</TableCell>
                          <TableCell>
                            <Badge variant={String(r.status) === "disputed" ? "destructive" : "secondary"}>{String(r.status || "draft")}</Badge>
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button size="sm" onClick={() => approveTimesheetMutation.mutate(r.id)} disabled={approveTimesheetMutation.isPending}>
                              Approve
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => disputeTimesheetMutation.mutate(r.id)} disabled={disputeTimesheetMutation.isPending}>
                              Dispute
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => markPaidTimesheetMutation.mutate(r.id)} disabled={markPaidTimesheetMutation.isPending}>
                              Paid
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </TabsContent>
        )}

        {isManager && (
          <TabsContent value="payroll" className="mt-6">
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Payroll Summary</h2>
              {!payrollSummary?.rows?.length ? (
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">No payroll data for this week</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="rounded-md border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead className="text-right">Tracked</TableHead>
                        <TableHead className="text-right">Payable</TableHead>
                        <TableHead className="text-right">Approved</TableHead>
                        <TableHead className="text-right">Hourly $</TableHead>
                        <TableHead className="text-right">Approved $</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payrollSummary.rows.map((r: any) => (
                        <TableRow key={r.userId}>
                          <TableCell className="text-sm">{nameByUserId.get(Number(r.userId)) || `User ${r.userId}`}</TableCell>
                          <TableCell className="text-right">{Number(r.trackedHours || 0).toFixed(2)}h</TableCell>
                          <TableCell className="text-right">{Number(r.payableHours || 0).toFixed(2)}h</TableCell>
                          <TableCell className="text-right">{Number(r.approvedPayableHours || 0).toFixed(2)}h</TableCell>
                          <TableCell className="text-right">${Number(r.hourlyAmount || 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right">${Number(r.hourlyApprovedAmount || 0).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </TabsContent>
        )}

        {isManager && (
          <TabsContent value="commissions" className="mt-6">
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Commission Ledger</h2>
              {commissionLedger.length === 0 ? (
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">No commission entries yet</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="rounded-md border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {commissionLedger.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-sm">{nameByUserId.get(Number(r.userId)) || `User ${r.userId}`}</TableCell>
                          <TableCell className="text-right">${Number(r.amount || 0).toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant={String(r.status) === "paid" ? "default" : String(r.status) === "disputed" ? "destructive" : "secondary"}>
                              {String(r.status || "draft")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button size="sm" onClick={() => approveCommissionMutation.mutate(r.id)} disabled={approveCommissionMutation.isPending}>
                              Approve
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => markPaidCommissionMutation.mutate(r.id)} disabled={markPaidCommissionMutation.isPending}>
                              Paid
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </TabsContent>
        )}

        {isManager && (
          <TabsContent value="profiles" className="mt-6">
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Worker Profiles</h2>
              {workerProfiles.length === 0 ? (
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">No profiles yet</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="rounded-md border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Pay Type</TableHead>
                        <TableHead className="text-right">Base Rate</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workerProfiles.map((row) => {
                        const u = row.user;
                        const p = row.profile;
                        const name = u?.firstName || u?.lastName ? `${u?.firstName || ""} ${u?.lastName || ""}`.trim() : u?.email || `User ${u?.id}`;
                        return (
                          <TableRow key={u.id}>
                            <TableCell className="text-sm">{name}</TableCell>
                            <TableCell className="text-sm">{p?.payType || "—"}</TableCell>
                            <TableCell className="text-right">{p?.defaultHourlyRate ? `$${p.defaultHourlyRate}` : "—"}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingProfile(row);
                                  setProfileForm({ payType: p?.payType || "hourly", defaultHourlyRate: p?.defaultHourlyRate ?? "" });
                                  setEditProfileOpen(true);
                                }}
                              >
                                Edit
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <Dialog open={editProfileOpen} onOpenChange={setEditProfileOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Worker Profile</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Pay Type</Label>
                    <Select value={profileForm.payType} onValueChange={(v) => setProfileForm((p: any) => ({ ...p, payType: v }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hourly">hourly</SelectItem>
                        <SelectItem value="salary_shadow">salary_shadow</SelectItem>
                        <SelectItem value="commission">commission</SelectItem>
                        <SelectItem value="hybrid">hybrid</SelectItem>
                        <SelectItem value="flat_task">flat_task</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Default Hourly Rate</Label>
                    <Input
                      type="number"
                      value={profileForm.defaultHourlyRate}
                      onChange={(e) => setProfileForm((p: any) => ({ ...p, defaultHourlyRate: e.target.value }))}
                      placeholder="50"
                    />
                  </div>
                  <Button onClick={() => saveProfileMutation.mutate()} disabled={saveProfileMutation.isPending || !editingProfile?.user?.id}>
                    {saveProfileMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>
        )}
      </Tabs>
    </Layout>
  );
}
