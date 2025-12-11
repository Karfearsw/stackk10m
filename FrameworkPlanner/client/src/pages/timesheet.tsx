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
import { Clock, Plus, Trash2, Loader2 } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    employee: "",
    task: "",
    startTime: "09:00",
    endTime: "17:00",
    hourlyRate: 50,
  });

  const { data: entries = [], isLoading } = useQuery<TimeEntry[]>({
    queryKey: [`/api/users/${user?.id}/timesheet`],
    enabled: !!user?.id,
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
          hourlyRate: parseFloat(data.hourlyRate),
        }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create entry");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user?.id}/timesheet`] });
      toast.success("Time entry added");
      setOpenDialog(false);
      setFormData({
        date: new Date().toISOString().split("T")[0],
        employee: "",
        task: "",
        startTime: "09:00",
        endTime: "17:00",
        hourlyRate: 50,
      });
    },
    onError: () => {
      toast.error("Failed to add time entry");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/timesheet/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user?.id}/timesheet`] });
      toast.success("Entry deleted");
    },
    onError: () => {
      toast.error("Failed to delete entry");
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

  return (
    <Layout>
      <div className="space-y-1 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Team Timesheet</h1>
        <p className="text-muted-foreground">Track team member hours and labor costs.</p>
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
                      onChange={(e) => setFormData({ ...formData, hourlyRate: parseFloat(e.target.value) })}
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
          <h2 className="text-lg font-semibold">Employee Summary</h2>
          {employees.length === 0 ? (
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">No employees yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {employees.map((emp) => {
                const empTotal = getEmployeeTotal(emp);
                const empCost = entries
                  .filter((e) => e.employee === emp)
                  .reduce((sum, e) => sum + parseFloat(e.hours.toString()) * parseFloat(e.hourlyRate.toString()), 0);
                const maxHours = Math.max(...employees.map(getEmployeeTotal), 1);
                return (
                  <Card key={emp} data-testid={`card-employee-${emp}`}>
                    <CardContent className="pt-4">
                      <div className="space-y-2">
                        <p className="font-medium text-sm">{emp}</p>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Hours:</span>
                          <span className="font-medium">{empTotal.toFixed(1)}h</span>
                        </div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-muted-foreground">Est. Cost:</span>
                          <span className="font-medium text-primary">${empCost.toFixed(2)}</span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${(empTotal / maxHours) * 100}%` }} />
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
    </Layout>
  );
}
