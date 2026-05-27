import { useState } from 'react';
import { Link } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
<<<<<<< HEAD
import { Loader2 } from 'lucide-react';
=======
import { Loader2, Eye, EyeOff } from 'lucide-react';
>>>>>>> origin/main
import { toast } from 'sonner';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
<<<<<<< HEAD
=======
  const [showPassword, setShowPassword] = useState(false);
>>>>>>> origin/main
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
<<<<<<< HEAD

=======
>>>>>>> origin/main
    try {
      await login(email, password);
      toast.success('Welcome back!');
    } catch (error: any) {
      toast.error(error.message || 'Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
<<<<<<< HEAD
            <img 
              src="/flipstackk-logo.jpg" 
              alt="FlipStackk Logo" 
              className="h-24 w-auto object-contain"
            />
          </div>
          <CardTitle className="text-3xl font-bold">FlipStackk 6.0</CardTitle>
=======
            <img
              src="/flipstackk-logo.jpg"
              alt="FlipStackk Logo"
              className="h-24 w-auto object-contain"
            />
          </div>
          <CardTitle className="text-3xl font-bold">Luxe RM</CardTitle>
>>>>>>> origin/main
          <CardDescription>
            Sign in to your account to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="bennyjelleh@icloud.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                data-testid="input-login-email"
              />
            </div>
            <div className="space-y-2">
<<<<<<< HEAD
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                data-testid="input-login-password"
              />
=======
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  data-testid="input-login-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
>>>>>>> origin/main
            </div>
            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-white"
              disabled={isLoading}
              data-testid="button-login"
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Sign In
            </Button>
          </form>
<<<<<<< HEAD
          
          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p>Real Estate Wholesaling CRM</p>
=======

          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p>Luxe Relationship Management</p>
>>>>>>> origin/main
            <p className="mt-2">Don't have an account?</p>
            <Link href="/signup" className="text-primary hover:underline font-medium">
              Sign up as an employee
            </Link>
<<<<<<< HEAD
            <p className="mt-4 text-xs">© 2025 FlipStackk. All rights reserved.</p>
=======
            <p className="mt-4 text-xs">© 2025 Luxe RM. All rights reserved.</p>
>>>>>>> origin/main
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
