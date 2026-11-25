import { useEffect, useState } from 'react';
import type { PosterInfo } from '../types/contract';
import QRCode from 'qrcode';
import { getPoster } from '../api/merchant';
import { getMarketPoster } from '../api/marketAdmin';
import { useResource } from './useResource';
export function usePoster(market = false) {
  const info = useResource<Omit<PosterInfo, 'store_name'> & { store_name?: string }>(
    market ? getMarketPoster : getPoster,
  );
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (info.data)
      QRCode.toString(info.data.url, { type: 'svg', margin: 4 })
        .then((s) => {
          if (active) setSvg(s);
        })
        .catch(() => {
          if (active) setError('qrError');
        });
    return () => {
      active = false;
    };
  }, [info.data]);
  return { info, svg, error };
}
