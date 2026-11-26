import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import s from './ui.module.css';
// 칩: 보이는 높이 38px, 터치 영역 44px. 선택되면 ink 면. float=지도 위에 뜬 칩
export function Chip({
  pressed,
  float,
  icon,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  pressed?: boolean;
  float?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      {...props}
      aria-pressed={pressed}
      className={[s.chipHit, float ? s.chipFloat : '', className ?? ''].join(' ')}
    >
      <span className={s.chip}>
        {icon}
        {children}
      </span>
    </button>
  );
}
export function ChipLink({
  current,
  float,
  icon,
  children,
  ...props
}: LinkProps & { current?: boolean; float?: boolean; icon?: ReactNode }) {
  return (
    <Link
      {...props}
      aria-current={current ? 'true' : undefined}
      className={[s.chipHit, float ? s.chipFloat : ''].join(' ')}
    >
      <span className={s.chip}>
        {icon}
        {children}
      </span>
    </Link>
  );
}
export function ChipRow({
  children,
  label,
  wrap,
  className,
}: {
  children: ReactNode;
  label?: string;
  wrap?: boolean;
  className?: string;
}) {
  return (
    <div
      role={label ? 'group' : undefined}
      aria-label={label}
      className={[wrap ? s.chipWrap : s.chipRow, className ?? ''].join(' ')}
    >
      {children}
    </div>
  );
}
/** 꼬리표: 높이 24px. todo=상인이 할 일이 남았을 때만 */
export function Tag({
  children,
  tone,
  icon,
}: {
  children: ReactNode;
  tone?: 'todo' | 'dark';
  icon?: ReactNode;
}) {
  return (
    <span
      className={[s.tag, tone === 'todo' ? s.tagTodo : tone === 'dark' ? s.tagDark : ''].join(' ')}
    >
      {icon}
      {children}
    </span>
  );
}
