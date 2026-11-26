import { useState, type ReactNode } from 'react';
import s from './ui.module.css';
// 지도 위 바텀시트(모달 아님). 손잡이를 눌러 펴고 접음. 탭은 화면이 Tabs로 넣음.
export default function BottomSheet({
  label,
  children,
  expanded: controlled,
  onExpandedChange,
  className,
  style,
}: {
  label: string;
  children: ReactNode;
  expanded?: boolean;
  onExpandedChange?: (v: boolean) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [own, setOwn] = useState(false);
  const expanded = controlled ?? own;
  const set = (v: boolean) => (onExpandedChange ? onExpandedChange(v) : setOwn(v));
  return (
    <section
      className={[s.sheet, className ?? ''].join(' ')}
      aria-label={label}
      data-expanded={expanded}
      style={style}
    >
      <button
        type="button"
        className={s.sheetToggle}
        aria-expanded={expanded}
        aria-label={expanded ? `${label} 접기` : `${label} 펴기`}
        onClick={() => set(!expanded)}
      >
        <span className={s.grabber} />
      </button>
      {children}
    </section>
  );
}
