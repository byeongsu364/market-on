import { useEffect, useState } from 'react';
import type { PosterInfo } from '../types/contract';
import QRCode from 'qrcode';
import { getPoster } from '../api/merchant';
import { getMarketPoster } from '../api/marketAdmin';
import { useResource } from './useResource';
/** 주소 하나를 QR SVG 문자열로 */
export function useQrSvg(url: string | null | undefined) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (url)
      QRCode.toString(url, { type: 'svg', margin: 4 })
        .then((s) => {
          if (active) {
            setSvg(s);
            setError('');
          }
        })
        .catch(() => {
          if (active) setError('qrError');
        });
    return () => {
      active = false;
    };
  }, [url]);
  return { svg, error };
}
export function usePoster(market = false) {
  const info = useResource<Omit<PosterInfo, 'store_name'> & { store_name?: string }>(
    market ? getMarketPoster : getPoster,
  );
  const { svg, error } = useQrSvg(info.data?.url);
  return { info, svg, error };
}
