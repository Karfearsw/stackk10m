import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Copy, Plus } from "lucide-react";

type Team = {
  id: number;
  name: string;
  description?: string | null;
  ownerId: number;
  joinCode: string;
  isActive?: boolean | null;
};

type TeamMember = {
  id: number;
  teamId: number;
  userId: number;
  role?: string | null;
  permissions?: string[] | null;
  status?: string | null;
  joinedAt?: string | null;
};

function isAdmin(user: any): boolean {
  return Boolean(user?.isSuperAdmin) || String(user?.role || "").toLowerCase() === "admin";
}

export default function TeamsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const admin = isAdmin(user);

  const [createOpen, setCreateOpen] = useState(false);
  const [newTeam, setNewTeam] = useState({ name: "", description: "", joinCode: "" });

  const teamsQuery = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const teams = Array.isArray(teamsQuery.data) ? teamsQuery.data : [];

  const teamsById = useMemo(() => new Map<number, Team>(teams.map((t) => [t.id, t])), [teams]);

  const createTeamMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: newTeam.name.trim(),
      };
      if (newTeam.description.trim()) payload.description = newTeam.description.trim();
      if (newTeam.joinCode.trim()) payload.joinCode = newTeam.joinCode.trim();
      const res = await apiRequest("POST", "/api/teams", payload);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      setNewTeam({ name: "", description: "", joinCode: "" });
      setCreateOpen(false);
      toast({ title: "Team created" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create team", description: String(err?.message || err), variant: "destructive" as any });
    },
  });

  const copy = async (value: string) => {
    const v = String(value || "").trim();
    if (!v) return;
    try {
      await navigator.clipboard.writeText(v);
      toast({ title: "Copied" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" as any });
    }
  };

  return (
    <Layout>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
          <p className="text-muted-foreground">Manage teams, join codes, and members.</p>
        </div>

        {admin && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-team">
                <Plus className="mr-2 h-4 w-4" />
                Create Team
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Team</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="team-name">Team Name</Label>
                  <Input
                    id="team-name"
                    value={newTeam.name}
                    onChange={(e) => setNewTeam((p) => ({ ...p, name: e.target.value }))}
                    placeholder="OceanLuxe Acquisitions"
                    data-testid="input-team-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="team-description">Description (optional)</Label>
                  <Input
                    id="team-description"
                    value={newTeam.description}
                    onChange={(e) => setNewTeam((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Main acquisitions team"
                    data-testid="input-team-description"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="team-join-code">Join Code (optional)</Label>
                  <Input
                    id="team-join-code"
                    value={newTeam.joinCode}
                    onChange={(e) => setNewTeam((p) => ({ ...p, joinCode: e.target.value }))}
                    placeholder="Leave blank to auto-generate"
                    data-testid="input-team-join-code"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => createTeamMutation.mutate()}
                  disabled={!newTeam.name.trim() || createTeamMutation.isPending}
                  data-testid="button-submit-create-team"
                >
                  Create
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Teams</CardTitle>
          <CardDescription>Admins see all teams. Non-admins see only teams they belong to.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Join Code</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="font-medium">{t.name}</div>
                    {t.description ? <div className="text-xs text-muted-foreground">{t.description}</div> : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-muted px-2 py-1 text-xs">{t.joinCode}</code>
                      <Button variant="ghost" size="icon" onClick={() => copy(t.joinCode)} data-testid={`button-copy-join-code-${t.id}`}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" data-testid={`button-view-members-${t.id}`}>
                          View Members
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>{teamsById.get(t.id)?.name || "Team Members"}</DialogTitle>
                        </DialogHeader>
                        <TeamMembers teamId={t.id} />
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
              {!teamsQuery.isLoading && teams.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No teams available.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Layout>
  );
}

function TeamMembers({ teamId }: { teamId: number }) {
  const membersQuery = useQuery<TeamMember[]>({
    queryKey: [`/api/teams/${teamId}/members`],
  });

  const members = Array.isArray(membersQuery.data) ? membersQuery.data : [];

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User ID</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => (
            <TableRow key={m.id}>
              <TableCell>{m.userId}</TableCell>
              <TableCell>{m.role || "member"}</TableCell>
              <TableCell>{m.status || "active"}</TableCell>
            </TableRow>
          ))}
          {!membersQuery.isLoading && members.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                No members.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

