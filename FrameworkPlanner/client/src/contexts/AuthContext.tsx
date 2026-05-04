import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLocation } from 'wouter';

interface User {
  id: number;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  companyName?: string;
  licenseNumber?: string;
  role: string;
  isSuperAdmin: boolean;
  avatarUrl?: string;
  isActive: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  devBypass: (email: string, employeeCode: string) => Promise<void>;
  signup: (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    roleCode: string;
    teamCode: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();

  const postTimeclock = async (path: string) => {
    const payload = {
      clientNow: new Date().toISOString(),
      tzOffsetMinutes: new Date().getTimezoneOffset(),
    };
    await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      credentials: 'include',
    });
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me', {
        credentials: 'include',
      });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
      } else {
        setUser(null);
      }
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include',
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Login failed');
    }

    const { user: userData } = await res.json();
    setUser(userData);
    try {
      await postTimeclock('/api/timeclock/auto-start');
    } catch {}
    setLocation('/');
  };

  const devBypass: AuthContextType['devBypass'] = async (email, employeeCode) => {
    const res = await fetch('/api/auth/dev-bypass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, employeeCode }),
      credentials: 'include',
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error((error as any).message || 'Dev bypass failed');
    }

    const { user: userData } = await res.json();
    setUser(userData);
    try {
      await postTimeclock('/api/timeclock/auto-start');
    } catch {}
    setLocation('/');
  };

  const signup: AuthContextType['signup'] = async ({ firstName, lastName, email, password, roleCode, teamCode }) => {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        password,
        roleCode,
        teamCode,
      }),
      credentials: 'include',
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || 'Signup failed');
    }

    const { user: userData } = await res.json();
    setUser(userData);
    try {
      await postTimeclock('/api/timeclock/auto-start');
    } catch {}
    setLocation('/');
  };

  const logout = async () => {
    try {
      await postTimeclock('/api/timeclock/auto-stop');
    } catch {}
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {}
    setUser(null);
    setLocation('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, devBypass, signup, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
