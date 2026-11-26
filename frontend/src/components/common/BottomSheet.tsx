import { useRef, useState, type ReactNode, type TouchEvent } from 'react';
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
  // 손가락으로 끌어 올리면 펴고, 내리면 접음(손잡이·위 가장자리). 2026-11-27: 탭만으로는 펴는 줄 몰랐음
  const startY = useRef<number | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    // 목록을 위아래로 스크롤하는 중이면(맨 위가 아니면) 시트를 움직이지 않음
    const scroller = (e.target as HTMLElement).closest('[data-sheet-scroll]') as HTMLElement | null;
    startY.current = scroller && scroller.scrollTop > 0 ? null : (e.touches[0]?.clientY ?? null);
  };
  const onTouchMove = (e: TouchEvent) => {
    if (startY.current == null) return;
    const dy = (e.touches[0]?.clientY ?? startY.current) - startY.current;
    if (dy < -24 && !expanded) {
      set(true);
      startY.current = null;
    } else if (dy > 24 && expanded) {
      set(false);
      startY.current = null;
    }
  };
  return (
    <section
      className={[s.sheet, className ?? ''].join(' ')}
      aria-label={label}
      data-expanded={expanded}
      style={style}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={() => (startY.current = null)}
      // 목록을 내리기 시작하면(시트 안 스크롤) 시트를 끝까지 폄
      onScrollCapture={(e) => {
        if (!expanded && (e.target as HTMLElement).scrollTop > 0) set(true);
      }}
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
