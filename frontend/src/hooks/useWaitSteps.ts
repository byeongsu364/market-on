import { useEffect, useState } from 'react';

// 040: 답은 사실 확인을 마친 뒤 한 번에 와요. 기다리는 동안 단계 문구를 차례로 보여 줘요.
// 서버는 실제로 거친 단계를 응답의 steps로 돌려줘요 (search·extract·write·check / plan·tools·write·check).
export const WAIT_STEP_MS = 2500;

export function useWaitSteps(active: boolean, count: number) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    if (!active) return undefined;
    const timer = window.setInterval(
      () => setStep((current) => Math.min(current + 1, count - 1)),
      WAIT_STEP_MS,
    );
    return () => window.clearInterval(timer);
  }, [active, count]);
  return step;
}
