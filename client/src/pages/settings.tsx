import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Shield, Users, Bell, Target, FileText, User, Loader2, Clock, ImageIcon, Camera, Upload, X, Trash2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";

function SettingsContent() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("account");
  const [showCreateGoal, setShowCreateGoal] = useState(false);
  const [passwordData, setPasswordData] = useState({
    current: "",
    new: "",
    confirm: "",
  });
  const { user } = useAuth();

  // Hardcoded team ID for now - would come from user's team membership
  const CURRENT_TEAM_ID = 1;

  // Fetch user data
  const { data: userData, isLoading: userLoading } = useQuery<any>({
    queryKey: [`/api/users/${user.id}`],
  });

  // Fetch 2FA status
  const { data: twoFactorData } = useQuery<any>({
    queryKey: [`/api/users/${user.id}/2fa`],
  });

  // Fetch notification preferences
  const { data: notificationPrefs, isLoading: notifsLoading } = useQuery<any>({
    queryKey: [`/api/users/${user.id}/notification-preferences`],
  });

  // Fetch team members
  const { data: teamMembers = [], isLoading: teamLoading } = useQuery<any[]>({
    queryKey: [`/api/teams/${CURRENT_TEAM_ID}/members`],
  });

  // Fetch goals
  const { data: goals = [], isLoading: goalsLoading } = useQuery<any[]>({
    queryKey: [`/api/users/${user.id}/goals`],
  });

  // Fetch offers
  const { data: offers = [], isLoading: offersLoading } = useQuery<any[]>({
    queryKey: [`/api/offers`],
    queryFn: async () => {
      const res = await fetch(`/api/offers?userId=${user.id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch offers');
      return res.json();
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/users/${user!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to update profile');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user!.id}`] });
      toast.success('Profile updated successfully');
    },
    onError: () => {
      toast.error('Failed to update profile');
    },
  });

  // Update notifications mutation
  const updateNotificationsMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/users/${user!.id}/notification-preferences`, {
        method: notificationPrefs ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to update notifications');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user!.id}/notification-preferences`] });
      toast.success('Notification preferences updated');
    },
    onError: () => {
      toast.error('Failed to update notification preferences');
    },
  });

  // Create goal mutation
  const createGoalMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/users/${user!.id}/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to create goal');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user!.id}/goals`] });
      toast.success('Goal created successfully');
      setShowCreateGoal(false);
    },
    onError: () => {
      toast.error('Failed to create goal');
    },
  });

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const res = await fetch(`/api/users/${user!.id}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to change password');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Password updated successfully');
      setPasswordData({ current: "", new: "", confirm: "" });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update password');
    },
  });

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.new !== passwordData.confirm) {
      toast.error("New passwords don't match");
      return;
    }
    if (passwordData.new.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    changePasswordMutation.mutate({
      currentPassword: passwordData.current,
      newPassword: passwordData.new,
    });
  };

  // Toggle 2FA mutation
  const toggle2FAMutation = useMutation({
    mutationFn: async (enable: boolean) => {
      if (enable) {
        // In production, this would generate a secret and return QR code data
        const secret = Math.random().toString(36).substring(7);
        const res = await fetch(`/api/users/${user!.id}/2fa`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret, isEnabled: true, method: 'totp' }),
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to enable 2FA');
        return res.json();
      } else {
        const res = await fetch(`/api/users/${user!.id}/2fa`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to disable 2FA');
        return null;
      }
    },
    onSuccess: (_, enable) => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user!.id}/2fa`] });
      toast.success(enable ? '2FA enabled successfully' : '2FA disabled successfully');
    },
    onError: () => {
      toast.error('Failed to toggle 2FA');
    },
  });

  // Handle profile form submission
  const handleProfileSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    updateUserMutation.mutate({
      firstName: formData.get('firstName'),
      lastName: formData.get('lastName'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      companyName: formData.get('companyName'),
      licenseNumber: formData.get('licenseNumber'),
    });
  };

  if (userLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-1 mb-6">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="page-title">Settings</h1>
        <p className="text-muted-foreground">Manage your account and application preferences.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="border-b rounded-none bg-transparent p-0 h-auto flex-wrap">
          <TabsTrigger value="account" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">
            <User className="w-4 h-4 mr-2" />
            Account
          </TabsTrigger>
          <TabsTrigger value="security" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">
            <Shield className="w-4 h-4 mr-2" />
            Security
          </TabsTrigger>
          <TabsTrigger value="notifications" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">
            <Bell className="w-4 h-4 mr-2" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="team" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">
            <Users className="w-4 h-4 mr-2" />
            Team
          </TabsTrigger>
          <TabsTrigger value="goals" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">
            <Target className="w-4 h-4 mr-2" />
            Goals
          </TabsTrigger>
          <TabsTrigger value="offers" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">
            <FileText className="w-4 h-4 mr-2" />
            Offers
          </TabsTrigger>
          <TabsTrigger value="appearance" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">
            <ImageIcon className="w-4 h-4 mr-2" />
            Appearance
          </TabsTrigger>
        </TabsList>

        {/* ACCOUNT TAB */}
        <TabsContent value="account" className="mt-6 space-y-6">
          <form onSubmit={handleProfileSubmit}>
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>Update your personal details and contact information.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input 
                      id="firstName" 
                      name="firstName"
                      placeholder="First Name" 
                      defaultValue={userData?.firstName || ''} 
                      data-testid="input-first-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input 
                      id="lastName" 
                      name="lastName"
                      placeholder="Last Name" 
                      defaultValue={userData?.lastName || ''} 
                      data-testid="input-last-name"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input 
                    id="email" 
                    name="email"
                    type="email" 
                    placeholder="email@example.com" 
                    defaultValue={userData?.email || ''} 
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input 
                    id="phone" 
                    name="phone"
                    placeholder="(555) 123-4567" 
                    defaultValue={userData?.phone || ''} 
                    data-testid="input-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input 
                    id="companyName" 
                    name="companyName"
                    placeholder="Company Name" 
                    defaultValue={userData?.companyName || ''} 
                    data-testid="input-company"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="licenseNumber">License Number</Label>
                  <Input 
                    id="licenseNumber" 
                    name="licenseNumber"
                    placeholder="FL-123456" 
                    defaultValue={userData?.licenseNumber || ''} 
                    data-testid="input-license"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="bg-primary hover:bg-primary/90 text-white"
                  disabled={updateUserMutation.isPending}
                  data-testid="button-save-profile"
                >
                  {updateUserMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </CardContent>
            </Card>
          </form>
        </TabsContent>

        {/* SECURITY TAB */}
        <TabsContent value="security" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Password</CardTitle>
              <CardDescription>Change your password to keep your account secure.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current">Current Password</Label>
                  <Input 
                    id="current" 
                    type="password" 
                    placeholder="••••••••" 
                    value={passwordData.current}
                    onChange={(e) => setPasswordData({ ...passwordData, current: e.target.value })}
                    required
                    data-testid="input-current-password" 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new">New Password</Label>
                  <Input 
                    id="new" 
                    type="password" 
                    placeholder="••••••••" 
                    value={passwordData.new}
                    onChange={(e) => setPasswordData({ ...passwordData, new: e.target.value })}
                    required
                    minLength={8}
                    data-testid="input-new-password" 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm Password</Label>
                  <Input 
                    id="confirm" 
                    type="password" 
                    placeholder="••••••••" 
                    value={passwordData.confirm}
                    onChange={(e) => setPasswordData({ ...passwordData, confirm: e.target.value })}
                    required
                    minLength={8}
                    data-testid="input-confirm-password" 
                  />
                </div>
                <Button 
                  type="submit"
                  className="bg-primary hover:bg-primary/90 text-white" 
                  disabled={changePasswordMutation.isPending}
                  data-testid="button-update-password"
                >
                  {changePasswordMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Update Password
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Two-Factor Authentication (2FA)</CardTitle>
              <CardDescription>Add an extra layer of security using time-based one-time passwords (TOTP).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">
                    Status: {twoFactorData?.isEnabled ? 
                      <span className="text-green-600">Enabled</span> : 
                      <span className="text-muted-foreground">Disabled</span>
                    }
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {twoFactorData?.isEnabled ? 
                      'Your account is protected with 2FA' : 
                      'Enhance your account security with 2FA'
                    }
                  </p>
                  {twoFactorData?.isEnabled && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Method: {twoFactorData.method === 'totp' ? 'Authenticator App' : 'SMS'}
                    </p>
                  )}
                </div>
                <Button 
                  onClick={() => toggle2FAMutation.mutate(!twoFactorData?.isEnabled)}
                  variant={twoFactorData?.isEnabled ? "destructive" : "default"}
                  className={!twoFactorData?.isEnabled ? "bg-primary hover:bg-primary/90 text-white" : ""}
                  disabled={toggle2FAMutation.isPending}
                  data-testid="button-toggle-2fa"
                >
                  {toggle2FAMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {twoFactorData?.isEnabled ? 'Disable 2FA' : 'Enable 2FA'}
                </Button>
              </div>

              {twoFactorData?.isEnabled && (
                <div className="border-t pt-4 space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Backup Codes</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Generate backup codes to use if you lose access to your authenticator app
                    </p>
                    <Button variant="outline" size="sm" data-testid="button-generate-backup-codes">
                      Generate Backup Codes
                    </Button>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Fallback Options</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>SMS Backup</span>
                        <Switch data-testid="switch-sms-backup" />
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span>Email Backup</span>
                        <Switch data-testid="switch-email-backup" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* NOTIFICATIONS TAB */}
        <TabsContent value="notifications" className="mt-6 space-y-6">
          {notifsLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Notification Channels</CardTitle>
                  <CardDescription>Choose how you want to receive notifications.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { key: 'emailEnabled', label: 'Email Notifications', desc: 'Receive notifications via email' },
                    { key: 'pushEnabled', label: 'Push Notifications', desc: 'Browser push notifications' },
                    { key: 'inAppEnabled', label: 'In-App Notifications', desc: 'Notifications within the application' },
                  ].map((channel) => (
                    <div key={channel.key} className="flex items-center justify-between py-2">
                      <div>
                        <p className="font-medium">{channel.label}</p>
                        <p className="text-sm text-muted-foreground">{channel.desc}</p>
                      </div>
                      <Switch 
                        checked={notificationPrefs?.[channel.key] ?? true}
                        onCheckedChange={(checked) => {
                          updateNotificationsMutation.mutate({ [channel.key]: checked });
                        }}
                        data-testid={`switch-${channel.key}`}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Notification Types</CardTitle>
                  <CardDescription>Control which events trigger notifications.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { key: 'newLeads', label: 'New Leads', desc: 'Get notified when new leads are added' },
                    { key: 'dealUpdates', label: 'Deal Updates', desc: 'Updates on deals in progress' },
                    { key: 'contractAlerts', label: 'Contract Alerts', desc: 'Important contract updates' },
                    { key: 'weeklySummary', label: 'Weekly Summary', desc: 'Weekly performance summary' },
                  ].map((type) => (
                    <div key={type.key} className="flex items-center justify-between py-2">
                      <div>
                        <p className="font-medium">{type.label}</p>
                        <p className="text-sm text-muted-foreground">{type.desc}</p>
                      </div>
                      <Switch 
                        checked={notificationPrefs?.[type.key] ?? true}
                        onCheckedChange={(checked) => {
                          updateNotificationsMutation.mutate({ [type.key]: checked });
                        }}
                        data-testid={`switch-${type.key}`}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Notification Frequency</CardTitle>
                  <CardDescription>Control how often you receive notifications.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="frequency">Delivery Frequency</Label>
                    <Select 
                      value={notificationPrefs?.frequency || 'instant'}
                      onValueChange={(value) => {
                        updateNotificationsMutation.mutate({ frequency: value });
                      }}
                    >
                      <SelectTrigger data-testid="select-frequency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="instant">Instant</SelectItem>
                        <SelectItem value="hourly">Hourly Digest</SelectItem>
                        <SelectItem value="daily">Daily Digest</SelectItem>
                        <SelectItem value="weekly">Weekly Digest</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Do Not Disturb Schedule</CardTitle>
                  <CardDescription>Set quiet hours when you don't want to receive notifications.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Enable Do Not Disturb</p>
                      <p className="text-sm text-muted-foreground">Mute notifications during specified hours</p>
                    </div>
                    <Switch 
                      checked={notificationPrefs?.dndEnabled ?? false}
                      onCheckedChange={(checked) => {
                        updateNotificationsMutation.mutate({ dndEnabled: checked });
                      }}
                      data-testid="switch-dnd-enabled"
                    />
                  </div>

                  {notificationPrefs?.dndEnabled && (
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                      <div className="space-y-2">
                        <Label htmlFor="dndStart">Start Time</Label>
                        <Input 
                          id="dndStart" 
                          type="time" 
                          defaultValue={notificationPrefs?.dndStartTime || '22:00'}
                          onChange={(e) => {
                            updateNotificationsMutation.mutate({ dndStartTime: e.target.value });
                          }}
                          data-testid="input-dnd-start"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="dndEnd">End Time</Label>
                        <Input 
                          id="dndEnd" 
                          type="time" 
                          defaultValue={notificationPrefs?.dndEndTime || '08:00'}
                          onChange={(e) => {
                            updateNotificationsMutation.mutate({ dndEndTime: e.target.value });
                          }}
                          data-testid="input-dnd-end"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* TEAM TAB */}
        <TabsContent value="team" className="mt-6 space-y-6">
          {teamLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Team Members</CardTitle>
                  <CardDescription>Manage your team and their permissions.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {teamMembers.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No team members yet</p>
                      <p className="text-sm mt-1">Start by inviting your first team member</p>
                    </div>
                  ) : (
                    teamMembers.map((member, index) => (
                      <div key={member.id} className="flex items-center justify-between border rounded p-3" data-testid={`team-member-${index}`}>
                        <div>
                          <p className="font-medium">Team Member {member.userId}</p>
                          <p className="text-sm text-muted-foreground">
                            {member.role || 'Member'} • {member.status || 'Active'}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" data-testid={`button-remove-member-${index}`}>
                          Remove
                        </Button>
                      </div>
                    ))
                  )}
                  <Button className="w-full bg-primary hover:bg-primary/90 text-white mt-4" data-testid="button-add-team-member">
                    Add Team Member
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Team Activity</CardTitle>
                  <CardDescription>Recent team activity and changes.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">No recent activity</p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* GOALS TAB */}
        <TabsContent value="goals" className="mt-6 space-y-6">
          {goalsLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Current Goals</CardTitle>
                  <CardDescription>Track your progress towards sales and performance goals.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {goals.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No goals set yet</p>
                      <p className="text-sm mt-1">Create your first goal to start tracking progress</p>
                    </div>
                  ) : (
                    goals.map((goal, index) => {
                      const progress = goal.targetValue > 0 ? (goal.currentValue / goal.targetValue) * 100 : 0;
                      return (
                        <div key={goal.id} className="space-y-3" data-testid={`goal-${index}`}>
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-medium">{goal.title}</h4>
                              <p className="text-sm text-muted-foreground">{goal.description}</p>
                            </div>
                            <span className="text-sm font-medium">
                              {goal.currentValue}/{goal.targetValue} {goal.unit}
                            </span>
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-muted-foreground">{progress.toFixed(0)}% Complete</span>
                              <span className="text-xs text-muted-foreground">{goal.period}</span>
                            </div>
                            <Progress value={progress} className="h-2" />
                          </div>
                        </div>
                      );
                    })
                  )}
                  
                  {showCreateGoal && <GoalCreator onClose={() => setShowCreateGoal(false)} onSubmit={createGoalMutation} />}
                  
                  <Button 
                    className="w-full bg-primary hover:bg-primary/90 text-white" 
                    data-testid="button-add-goal"
                    onClick={() => setShowCreateGoal(!showCreateGoal)}
                  >
                    {showCreateGoal ? 'Cancel' : 'Create New Goal'}
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* OFFERS TAB */}
        <TabsContent value="offers" className="mt-6 space-y-6">
          {offersLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Sent Offers</CardTitle>
                  <CardDescription>Track all offers you've sent to sellers.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {offers.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No offers sent yet</p>
                      <p className="text-sm mt-1">Your sent offers will appear here</p>
                    </div>
                  ) : (
                    offers.map((offer, index) => (
                      <div key={offer.id} className="border rounded-lg p-4" data-testid={`offer-${index}`}>
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-medium">Offer #{offer.id}</p>
                            <p className="text-sm text-muted-foreground">
                              {offer.buyerName} → {offer.sellerName}
                            </p>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            offer.status === 'accepted' ? 'bg-green-100 text-green-800' :
                            offer.status === 'rejected' ? 'bg-red-100 text-red-800' :
                            offer.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {offer.status}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-semibold text-lg">
                            ${parseFloat(offer.offerAmount).toLocaleString()}
                          </span>
                          {offer.sentDate && (
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(offer.sentDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {offer.notes && (
                          <p className="text-xs text-muted-foreground mt-2">{offer.notes}</p>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Offer Statistics</CardTitle>
                  <CardDescription>Overview of your offer performance.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold">{offers.length}</p>
                      <p className="text-xs text-muted-foreground">Total Sent</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-600">
                        {offers.filter(o => o.status === 'accepted').length}
                      </p>
                      <p className="text-xs text-muted-foreground">Accepted</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-yellow-600">
                        {offers.filter(o => o.status === 'pending').length}
                      </p>
                      <p className="text-xs text-muted-foreground">Pending</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* APPEARANCE TAB */}
        <TabsContent value="appearance" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="w-5 h-5" />
                Profile Picture
              </CardTitle>
              <CardDescription>Upload a profile picture that will be displayed in the app.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full overflow-hidden bg-muted flex items-center justify-center border-2 border-border">
                    {userData?.profilePicture ? (
                      <img 
                        src={userData.profilePicture} 
                        alt="Profile" 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="w-10 h-10 text-muted-foreground" />
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              const base64 = event.target?.result as string;
                              updateUserMutation.mutate({ profilePicture: base64 });
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        data-testid="input-profile-picture"
                      />
                      <Button type="button" variant="outline" asChild>
                        <span>
                          <Upload className="w-4 h-4 mr-2" />
                          Upload Photo
                        </span>
                      </Button>
                    </label>
                    {userData?.profilePicture && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => updateUserMutation.mutate({ profilePicture: null })}
                        data-testid="button-remove-profile-picture"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Recommended: Square image, at least 200x200 pixels
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                Motivational Banner
              </CardTitle>
              <CardDescription>Customize the motivational banner on your dashboard.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Show Motivational Quotes</Label>
                  <p className="text-sm text-muted-foreground">Display inspiring quotes above the banner images</p>
                </div>
                <Switch
                  checked={userData?.showBannerQuotes !== false}
                  onCheckedChange={(checked) => updateUserMutation.mutate({ showBannerQuotes: checked })}
                  data-testid="switch-show-quotes"
                />
              </div>

              <div className="space-y-3">
                <Label>Custom Banner Images</Label>
                <p className="text-sm text-muted-foreground">Add your own motivational images to the banner carousel</p>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {(userData?.customBannerImages || []).map((img: string, index: number) => (
                    <div key={index} className="relative group">
                      <img
                        src={img}
                        alt={`Custom banner ${index + 1}`}
                        className="w-full h-24 object-cover rounded-lg border"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = (userData?.customBannerImages || []).filter((_: string, i: number) => i !== index);
                          updateUserMutation.mutate({ customBannerImages: updated });
                        }}
                        className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        data-testid={`button-remove-banner-${index}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const base64 = event.target?.result as string;
                            const currentImages = userData?.customBannerImages || [];
                            updateUserMutation.mutate({ customBannerImages: [...currentImages, base64] });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      data-testid="input-banner-image"
                    />
                    <div className="w-full h-24 border-2 border-dashed border-muted-foreground/30 rounded-lg flex flex-col items-center justify-center gap-1 hover:border-primary hover:bg-accent/10 transition-colors">
                      <Upload className="w-5 h-5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Add Image</span>
                    </div>
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Layout>
  );
}

// Goal Creator Component
function GoalCreator({ onClose, onSubmit }: { onClose: () => void, onSubmit: any }) {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    targetValue: "",
    currentValue: "",
    unit: "deals",
    period: "month",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit.mutate({
      ...formData,
      targetValue: parseFloat(formData.targetValue),
      currentValue: parseFloat(formData.currentValue) || 0,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-accent/5 rounded-lg mb-4">
      <h3 className="font-semibold text-lg">Create New Goal</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="goal-title">Goal Title</Label>
          <Input
            id="goal-title"
            data-testid="input-goal-title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="e.g., Close 12 deals"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="goal-period">Period</Label>
          <Select value={formData.period} onValueChange={(value) => setFormData({ ...formData, period: value })}>
            <SelectTrigger data-testid="select-goal-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
              <SelectItem value="quarter">Quarter</SelectItem>
              <SelectItem value="year">Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="goal-description">Description</Label>
        <Input
          id="goal-description"
          data-testid="input-goal-description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Brief description of your goal"
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="goal-target">Target Value</Label>
          <Input
            id="goal-target"
            data-testid="input-goal-target"
            type="number"
            value={formData.targetValue}
            onChange={(e) => setFormData({ ...formData, targetValue: e.target.value })}
            placeholder="12"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="goal-current">Current Value</Label>
          <Input
            id="goal-current"
            data-testid="input-goal-current"
            type="number"
            value={formData.currentValue}
            onChange={(e) => setFormData({ ...formData, currentValue: e.target.value })}
            placeholder="0"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="goal-unit">Unit</Label>
          <Select value={formData.unit} onValueChange={(value) => setFormData({ ...formData, unit: value })}>
            <SelectTrigger data-testid="select-goal-unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="deals">Deals</SelectItem>
              <SelectItem value="dollars">Dollars</SelectItem>
              <SelectItem value="leads">Leads</SelectItem>
              <SelectItem value="contracts">Contracts</SelectItem>
              <SelectItem value="properties">Properties</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-3">
        <Button type="submit" data-testid="button-save-goal" disabled={onSubmit.isPending}>
          {onSubmit.isPending ? "Creating..." : "Create Goal"}
        </Button>
        <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-goal">
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function Settings() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">Please log in to access settings.</p>
        </div>
      </Layout>
    );
  }

  return <SettingsContent />;
}
