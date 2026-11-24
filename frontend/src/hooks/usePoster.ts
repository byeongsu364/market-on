import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { getPoster } from '../api/merchant';
import { useResource } from './useResource';
export function usePoster() {
  const info = useResource(getPoster);
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
