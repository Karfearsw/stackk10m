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
  startTime: string;
  endTime: string;
  hours: number;
  hourlyRate: number;
  createdAt: string;
  updatedAt: string;
}

export default function Timesheet() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);
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

  const { data: activeSession } = useQuery<any>({
    queryKey: ["/api/timeclock/current"],
    enabled: !!user?.id,
    refetchInterval: 60_000,
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

  const calculateHours = (start: string, end: string): number => {
    if (!start || !end) return 0;
    const [startH, startM] = start.split(":").map(Number);
    const [endH, endM] = end.split(":").map(Number);
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;
    return (endTotal - startTotal) / 60;
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const hours = calculateHours(data.startTime, data.endTime);
      const res = await fetch(`/api/users/${user?.id}/timesheet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          hours: hours.toFixed(2),
          hourlyRate: String(data.hourlyRate || 0),
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

  return (
    <Layout>
      <div className="space-y-1 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Team Timesheet</h1>
        <p className="text-muted-foreground">Track team member hours and labor costs.</p>
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
                    <TableHead>Task</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id} className="hover:bg-muted/50" data-testid={`row-timesheet-${entry.id}`}>
                      <TableCell className="text-sm">{entry.date}</TableCell>
                      <TableCell className="font-medium">{entry.employee}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{entry.task}</TableCell>
                      <TableCell className="text-sm">{entry.startTime}</TableCell>
                      <TableCell className="text-sm">{entry.endTime}</TableCell>
                      <TableCell className="text-right font-medium">{parseFloat(entry.hours.toString()).toFixed(2)}h</TableCell>
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
                  ))}
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
                </>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Not clocked in right now.</p>
                  <p className="text-xs text-muted-foreground">Auto clock-in starts on login and stops on logout.</p>
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
    </Layout>
  );
}
