import { useEffect, useState, type ReactNode } from 'react';
import * as api from '../api/auth';
import { AuthContext } from './auth';
import type { User, AuthRequest } from '../types/contract';
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const me = async () => {
    try {
      setUser((await api.me()).user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void me();
    const clear = () => setUser(null);
    window.addEventListener('auth:unauthorized', clear);
    return () => window.removeEventListener('auth:unauthorized', clear);
  }, []);
  const login = async (q: AuthRequest) => {
    setUser((await api.login(q)).user);
  };
  const signup = async (q: AuthRequest) => {
    setUser((await api.signup(q)).user);
  };
  const logout = async () => {
    await api.logout();
    setUser(null);
  };
  return (
    <AuthContext.Provider value={{ user, loading, me, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
