import type { ReactNode } from 'react';
import { SessionContext, useSessionState } from './session';
export function SessionProvider({ children }: { children: ReactNode }) {
  const value = useSessionState();
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
