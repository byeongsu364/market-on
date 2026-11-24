import { useEffect, useState } from 'react';
export function useGeolocation() {
  const [state, setState] = useState<{
    data: {
      lat: number;
      lng: number;
    } | null;
    loading: boolean;
    error: string;
  }>({ data: null, loading: true, error: '' });
  useEffect(() => {
    if (!navigator.geolocation) {
      setState({
        data: null,
        loading: false,
        error: '위치를 사용할 수 없어 목록 순서로 보여 드려요.',
      });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        setState({
          data: { lat: p.coords.latitude, lng: p.coords.longitude },
          loading: false,
          error: '',
        }),
      () =>
        setState({ data: null, loading: false, error: '위치 확인 없이 목록 순서로 보여 드려요.' }),
      { timeout: 5000 },
    );
  }, []);
  return state;
}
