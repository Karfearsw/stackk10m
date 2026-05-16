import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { AuthApiError } from '@/lib/authApiError';
import { getAuth503Guidance } from '@/lib/auth503Guidance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PasswordInput } from '@/components/ui/password-input';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Signup() {
  const [, setLocation] = useLocation();
  const { signup } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [teamInviteCode, setTeamInviteCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<AuthApiError | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setApiError(null);

    try {
      // Validate passwords match
      if (password !== confirmPassword) {
        toast.error('Passwords do not match');
        setIsLoading(false);
        return;
      }

      // Validate password strength
      if (password.length < 8) {
        toast.error('Password must be at least 8 characters');
        setIsLoading(false);
        return;
      }

      await signup({ firstName, lastName, email, password, employeeCode, teamInviteCode: teamInviteCode.trim() || undefined });
      toast.success('Account created! Redirecting...');
      setTimeout(() => setLocation('/'), 500);
    } catch (error: any) {
      if (error instanceof AuthApiError && error.status === 503 && getAuth503Guidance(error.code, error.missing)) {
        setApiError(error);
      } else {
        toast.error(error.message || 'Signup failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const guidance = apiError ? getAuth503Guidance(apiError.code, apiError.missing) : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <img 
              src="/luxe-logo.png" 
              alt="Luxe RM Logo" 
              className="h-24 w-auto object-contain"
            />
          </div>
          <CardTitle className="text-3xl font-bold">Join Luxe RM</CardTitle>
          <CardDescription>
            Create your employee account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {apiError && guidance && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>{guidance.title}</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{guidance.description}</p>
                {guidance.steps?.length ? (
                  <ul className="list-disc ml-5 space-y-1">
                    {guidance.steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="text-xs text-muted-foreground space-y-1">
                  {apiError.code ? <p>Code: {apiError.code}</p> : null}
                  {apiError.requestId ? <p>Request ID: {apiError.requestId}</p> : null}
                </div>
              </AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  type="text"
                  placeholder="First Name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  disabled={isLoading}
                  data-testid="input-signup-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  type="text"
                  placeholder="Last Name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  disabled={isLoading}
                  data-testid="input-signup-last-name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                data-testid="input-signup-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="employeeCode">Employee Code</Label>
              <PasswordInput
                id="employeeCode"
                placeholder="Enter your employee code"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                required
                disabled={isLoading}
                data-testid="input-signup-employee-code"
              />
              <p className="text-xs text-muted-foreground">
                Ask your manager for the employee access code
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="teamInviteCode">Team Invite Code (optional)</Label>
              <Input
                id="teamInviteCode"
                type="text"
                placeholder="Enter invite code to join a team"
                value={teamInviteCode}
                onChange={(e) => setTeamInviteCode(e.target.value)}
                disabled={isLoading}
                data-testid="input-signup-team-invite-code"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                data-testid="input-signup-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <PasswordInput
                id="confirmPassword"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isLoading}
                data-testid="input-signup-confirm-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={isLoading}
              data-testid="button-signup"
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Account
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p>Already have an account?</p>
            <a href="/login" className="text-primary hover:underline font-medium">
              Sign in here
            </a>
          </div>

          <div className="mt-6 text-center text-xs text-muted-foreground">
            <p>© 2025 Luxe RM. All rights reserved.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
