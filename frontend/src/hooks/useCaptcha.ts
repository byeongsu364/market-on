import { useCallback, useEffect, useState } from 'react';
import { getCaptcha } from '../api/auth';
import type { Captcha } from '../types/contract';

// 자동입력 방지 숫자. 서버가 그린 그림(data URL)을 그대로 보여 주고, 손님이 읽은 숫자를 받음.
// mock은 캡차가 없어서(null) 아무것도 그리지 않음.
export function useCaptcha() {
  const [data, setData] = useState<Captcha | null>(null);
  const [answer, setAnswer] = useState('');
  const refresh = useCallback(() => {
    setAnswer('');
    getCaptcha()
      .then(setData)
      .catch(() => setData(null));
  }, []);
  useEffect(refresh, [refresh]);
  return {
    data,
    answer,
    setAnswer,
    refresh,
    fields: data ? { captcha_id: data.captcha_id, captcha_answer: answer } : {},
  };
}
