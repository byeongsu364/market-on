import { useEffect, useState, type ReactNode } from 'react';
import * as api from '../api/auth';
import { AuthContext } from './auth';
import type { User, AuthRequest } from '../types/contract';
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    if (user?.lang)
      window.dispatchEvent(new CustomEvent('language:account', { detail: user.lang }));
  }, [user]);
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
    const user = (await api.login(q)).user;
    if (!user) throw new Error('로그인이 필요해요');
    setUser(user);
    return user;
  };
  const signup = async (q: AuthRequest) => {
    setUser((await api.signup(q)).user);
  };
  const signupCustomer = async (q: AuthRequest) => {
    setUser((await api.signupCustomer(q)).user);
  };
  const logout = async () => {
    await api.logout();
    setUser(null);
  };
  return (
    <AuthContext.Provider value={{ user, loading, me, login, signup, signupCustomer, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
