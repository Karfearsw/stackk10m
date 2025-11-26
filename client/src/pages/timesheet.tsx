import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Clock, Plus } from "lucide-react";
import { useState } from "react";

interface TimeEntry {
  id: string;
  date: string;
  employee: string;
  task: string;
  startTime: string;
  endTime: string;
  hours: number;
}

const initialTimesheets: TimeEntry[] = [
  {
    id: "1",
    date: "2024-11-20",
    employee: "Kevin Brown",
    task: "Lead calls and follow-ups",
    startTime: "09:00",
    endTime: "13:00",
    hours: 4
  },
  {
    id: "2",
    date: "2024-11-20",
    employee: "Sarah Martinez",
    task: "Property inspections",
    startTime: "10:00",
    endTime: "17:00",
    hours: 7
  },
  {
    id: "3",
    date: "2024-11-20",
    employee: "Michael Johnson",
    task: "Contract negotiations",
    startTime: "14:00",
    endTime: "18:00",
    hours: 4
  },
  {
    id: "4",
    date: "2024-11-19",
    employee: "Kevin Brown",
    task: "Marketing and outreach",
    startTime: "08:00",
    endTime: "12:00",
    hours: 4
  },
];

export default function Timesheet() {
  const [entries, setEntries] = useState<TimeEntry[]>(initialTimesheets);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const totalHoursThisWeek = entries.reduce((sum, e) => sum + e.hours, 0);
  const uniqueEmployees = new Set(entries.map(e => e.employee)).size;

  const calculateHours = (start: string, end: string): number => {
    if (!start || !end) return 0;
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;
    return (endTotal - startTotal) / 60;
  };

  const handleAddEntry = () => {
    const newEntry: TimeEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      employee: "",
      task: "",
      startTime: "09:00",
      endTime: "17:00",
      hours: 8
    };
    setEntries([newEntry, ...entries]);
  };

  const handleDeleteEntry = (id: string) => {
    setEntries(entries.filter(e => e.id !== id));
  };

  const getEmployeeTotal = (employee: string) => {
    return entries.filter(e => e.employee === employee).reduce((sum, e) => sum + e.hours, 0);
  };

  const employees = Array.from(new Set(entries.map(e => e.employee)));

  return (
    <Layout>
      <div className="space-y-1 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Team Timesheet</h1>
        <p className="text-muted-foreground">Track team member hours and labor costs.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Hours (Week)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalHoursThisWeek}h</div>
            <p className="text-xs text-muted-foreground mt-1">tracked this week</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Team Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{uniqueEmployees}</div>
            <p className="text-xs text-muted-foreground mt-1">actively logging hours</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Est. Labor Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">${(totalHoursThisWeek * 50).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">@$50/hr avg</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Entries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{entries.length}</div>
            <p className="text-xs text-muted-foreground mt-1">time entries logged</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Timesheet Entries */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Time Entries</h2>
            <Button onClick={handleAddEntry} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Log Time
            </Button>
          </div>

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
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id} className="hover:bg-muted/50">
                    <TableCell className="text-sm">{entry.date}</TableCell>
                    <TableCell className="font-medium">{entry.employee}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{entry.task}</TableCell>
                    <TableCell className="text-sm">{entry.startTime}</TableCell>
                    <TableCell className="text-sm">{entry.endTime}</TableCell>
                    <TableCell className="text-right font-medium">{entry.hours}h</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteEntry(entry.id)}
                        className="text-destructive hover:bg-destructive/10"
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Employee Summary */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Employee Summary</h2>
          <div className="space-y-3">
            {employees.map((emp) => {
              const empTotal = getEmployeeTotal(emp);
              const laborCost = empTotal * 50;
              return (
                <Card key={emp}>
                  <CardContent className="pt-4">
                    <div className="space-y-2">
                      <p className="font-medium text-sm">{emp}</p>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Hours:</span>
                        <span className="font-medium">{empTotal}h</span>
                      </div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Est. Cost:</span>
                        <span className="font-medium text-primary">${laborCost.toLocaleString()}</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${(empTotal / Math.max(...employees.map(getEmployeeTotal), 1)) * 100}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </Layout>
  );
}
