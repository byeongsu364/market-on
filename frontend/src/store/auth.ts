import { createContext } from 'react';
import type { User, AuthRequest } from '../types/contract';
export type AuthState = {
  user: User | null;
  loading: boolean;
  me: () => Promise<void>;
  login: (q: AuthRequest) => Promise<void>;
  signup: (q: AuthRequest) => Promise<void>;
  logout: () => Promise<void>;
};
export const AuthContext = createContext<AuthState | null>(null);
