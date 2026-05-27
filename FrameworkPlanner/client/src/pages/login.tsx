import { useState } from 'react';
import { Link } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
<<<<<<< HEAD
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
=======
import { AuthApiError } from '@/lib/authApiError';
import { getAuth503Guidance } from '@/lib/auth503Guidance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PasswordInput } from '@/components/ui/password-input';
>>>>>>> origin/main
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
<<<<<<< HEAD
  const { login, devBypass } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
=======
  const [apiError, setApiError] = useState<AuthApiError | null>(null);
  const { login, requestMagicLink, devBypass } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setApiError(null);
>>>>>>> origin/main

    try {
      await login(email, password);
      toast.success('Welcome back!');
    } catch (error: any) {
<<<<<<< HEAD
      toast.error(error.message || 'Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDevBypass = async () => {
    setIsLoading(true);
=======
      if (error instanceof AuthApiError && error.status === 503 && getAuth503Guidance(error.code, error.missing)) {
        setApiError(error);
      } else {
        toast.error(error.message || 'Invalid email or password');
      }
    } finally {
      setIsLoading(false);
    }
  }

  const handleDevBypass = async () => {
    setIsLoading(true);
    setApiError(null);
>>>>>>> origin/main
    try {
      await devBypass(email, employeeCode);
      toast.success('Dev bypass active');
    } catch (error: any) {
<<<<<<< HEAD
      toast.error(error.message || 'Dev bypass failed');
=======
      if (error instanceof AuthApiError && error.status === 503 && getAuth503Guidance(error.code, error.missing)) {
        setApiError(error);
      } else {
        toast.error(error.message || 'Dev bypass failed');
      }
>>>>>>> origin/main
    } finally {
      setIsLoading(false);
    }
  };

<<<<<<< HEAD
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
          <CardTitle className="text-3xl font-bold">Luxe RM</CardTitle>
          <CardDescription>
            Sign in to your account to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
=======
  const handleMagicLink = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      await requestMagicLink(email);
      toast.success('If an account exists, a sign-in link will arrive shortly.');
    } catch (error: any) {
      if (error instanceof AuthApiError && error.status === 503 && getAuth503Guidance(error.code, error.missing)) {
        setApiError(error);
      } else {
        toast.error(error.message || 'Magic link request failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const guidance = apiError ? getAuth503Guidance(apiError.code, apiError.missing) : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <img
              src="/logo.jpg"
              alt="Luxe RM Logo"
              className="h-16 w-16 object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
          <CardTitle className="text-2xl font-bold">Luxe RM</CardTitle>
          <CardDescription>Sign in to your account to continue</CardDescription>
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
>>>>>>> origin/main
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
<<<<<<< HEAD
                placeholder="bennyjelleh@icloud.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                data-testid="input-login-email"
=======
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
>>>>>>> origin/main
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
<<<<<<< HEAD
              <Input
                id="password"
                type="password"
=======
              <PasswordInput
                id="password"
>>>>>>> origin/main
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                data-testid="input-login-password"
              />
            </div>
<<<<<<< HEAD
=======
            <div className="flex items-center justify-end">
              <Link href="/forgot-password" className="text-sm text-primary hover:underline font-medium">
                Forgot password?
              </Link>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={isLoading || !email}
              onClick={handleMagicLink}
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Email me a sign-in link
            </Button>
>>>>>>> origin/main
            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={isLoading}
              data-testid="button-login"
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Sign In
            </Button>
          </form>

          {import.meta.env.DEV && (
            <div className="mt-4 space-y-3">
              <div className="space-y-2">
                <Label htmlFor="employeeCode">Employee Access Code</Label>
<<<<<<< HEAD
                <Input
                  id="employeeCode"
                  type="password"
=======
                <PasswordInput
                  id="employeeCode"
>>>>>>> origin/main
                  placeholder="Enter employee code"
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={isLoading || !email || !employeeCode}
                onClick={handleDevBypass}
              >
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Dev Bypass Sign In
              </Button>
            </div>
          )}
<<<<<<< HEAD
          
          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p>Luxe Relationship Management</p>
            <p className="mt-2">Don't have an account?</p>
            <Link href="/signup" className="text-primary hover:underline font-medium">
              Sign up as an employee
            </Link>
            <p className="mt-4 text-xs">© 2025 Luxe RM. All rights reserved.</p>
=======
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Luxe Relationship Management
          </div>
          <div className="mt-2 text-center text-sm">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-primary hover:underline">
              Sign up as an employee
            </Link>
          </div>
          <div className="mt-4 text-center text-xs text-muted-foreground">
            &copy; 2025 Luxe RM. All rights reserved.
>>>>>>> origin/main
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
