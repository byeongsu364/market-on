import type { ReactNode } from 'react';
import Loading from './Loading';
import ErrorBox from './ErrorBox';
export default function Resource({
  state,
  children,
}: {
  state: {
    loading: boolean;
    error: string;
    retry?: () => void;
  };
  children: ReactNode;
}) {
  return state.loading ? (
    <Loading />
  ) : state.error ? (
    <ErrorBox message={state.error} retry={state.retry} />
  ) : (
    <>{children}</>
  );
}
