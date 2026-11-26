import { useCountUp } from './motion';
import s from './brand.module.css';

/**
 * 화면에 들어오면 0부터 세어 올라가는 숫자(1.2초 한 번). 움직임을 줄인 설정이면 바로 최종 값.
 * 자리 폭은 최종 값으로 미리 잡아 두고, 화면 읽기는 최종 값만 읽어요.
 */
export default function CountUp({
  value,
  suffix = '',
  className,
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  const [ref, shown] = useCountUp(value);
  const final = `${value.toLocaleString('ko-KR')}${suffix}`;
  return (
    <span className={[s.count, className].join(' ')}>
      <span className={s.countGhost} aria-hidden="true">
        {final}
      </span>
      <span ref={ref} className={s.countLive} aria-hidden="true">
        {shown.toLocaleString('ko-KR')}
        {suffix}
      </span>
      <span className="sr-only">{final}</span>
    </span>
  );
}
