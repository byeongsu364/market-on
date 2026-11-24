import { useContext } from 'react';
import { AuthContext } from '../store/auth';
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthProvider required');
  return auth;
}
