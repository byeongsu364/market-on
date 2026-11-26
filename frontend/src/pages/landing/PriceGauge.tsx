import { BAND_LABELS, diffMessage } from '../../utils/priceBand';
import m from './motion.module.css';
import s from './home.module.css';

/**
 * 홈 솔루션 카드의 가격 눈금(예시 값). 앱과 같은 칸 이름과 문장(utils/priceBand)을 써요.
 * 판정 문구 없이 숫자만: "기준시세보다 9% 낮아요". 움직임은 "낮음" 칸이 켜지는 반복.
 */
const FIELD_PRICE = 5000;
const REFERENCE = 5500;
const DIFF = Math.round(((FIELD_PRICE - REFERENCE) / REFERENCE) * 100);
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

export default function PriceGauge() {
  const message = diffMessage(DIFF);
  return (
    <div
      className={s.gauge}
      role="img"
      aria-label={`가격 눈금 예시: ${message}. 현장 가격 ${won(FIELD_PRICE)}, 기준시세 ${won(REFERENCE)}`}
    >
      <span className={s.gaugeTitle}>{message}</span>
      <div className={s.gaugeScale}>
        <span className={s.gaugeBar} />
        <div className={s.gaugeCells}>
          {BAND_LABELS.map((label, i) => (
            <div key={label} className={s.gaugeCell}>
              <span
                className={[s.cellBox, i === 0 ? m.cell1 : '', i === 1 ? m.cell2 : ''].join(' ')}
              />
              <span className={[s.cellText, i === 1 ? m.cellLabel : ''].join(' ')}>{label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className={s.gaugeRow}>
        <span>현장 가격</span>
        <strong>{won(FIELD_PRICE)}</strong>
      </div>
      <span className={s.gaugeSource}>
        기준시세 {won(REFERENCE)} · aT 농산물 가격정보 · 예시 값
      </span>
    </div>
  );
}
