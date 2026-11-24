import { useCallback, useEffect, useState } from 'react';
export function useResource<T>(load: () => Promise<T>) {
  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: string;
  }>({ data: null, loading: true, error: '' });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ data: null, loading: true, error: '' });
    load()
      .then((data) => {
        if (active) setState({ data, loading: false, error: '' });
      })
      .catch((e) => {
        if (active)
          setState({ data: null, loading: false, error: e.message ?? '다시 시도해 주세요.' });
      });
    return () => {
      active = false;
    };
  }, [load, version]);
  return { ...state, retry: useCallback(() => setVersion((v) => v + 1), []) };
}
export function useAction<T, A extends unknown[]>(action: (...args: A) => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const run = async (...args: A) => {
    setLoading(true);
    setError('');
    try {
      const result = await action(...args);
      setData(result);
      return result;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : (
              e as {
                message: string;
              }
            ).message,
      );
      return null;
    } finally {
      setLoading(false);
    }
  };
  return { data, loading, error, run };
}
