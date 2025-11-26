import { useState } from 'react';
import { useNavigate } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Signup() {
  const [, navigate] = useNavigate();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const VALID_EMPLOYEE_CODE = "3911";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate employee code
      if (employeeCode !== VALID_EMPLOYEE_CODE) {
        toast.error('Invalid employee code. Contact your manager for access.');
        setIsLoading(false);
        return;
      }

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

      // Create new employee account
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          password,
          role: 'employee',
          isSuperAdmin: false,
          isActive: true,
        }),
        credentials: 'include',
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Signup failed');
      }

      toast.success('Account created! Redirecting to login...');
      setTimeout(() => navigate('/login'), 1500);
    } catch (error: any) {
      toast.error(error.message || 'Signup failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <img 
              src="/flipstackk-logo.jpg" 
              alt="FlipStackk Logo" 
              className="h-24 w-auto object-contain"
            />
          </div>
          <CardTitle className="text-3xl font-bold">Join FlipStackk</CardTitle>
          <CardDescription>
            Create your employee account
          </CardDescription>
        </CardHeader>
        <CardContent>
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
              <Input
                id="employeeCode"
                type="password"
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
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
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
              <Input
                id="confirmPassword"
                type="password"
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
              className="w-full bg-primary hover:bg-primary/90 text-white"
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
            <p>© 2025 FlipStackk. All rights reserved.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
