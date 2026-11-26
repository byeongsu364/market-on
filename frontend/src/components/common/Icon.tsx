import type { CSSProperties } from 'react';
import type { StoreCategory } from '../../types/contract';

// 선 아이콘: 24px 격자, 1.7px 선, 둥근 끝(디자인 시스템 "아이콘"). 경로는 화면 시안에서 그대로 가져옴.
const paths = {
  chevronRight: <path d="M9.5 6l6 6-6 6" />,
  back: <path d="M14.5 5.5L8 12l6.5 6.5" />,
  camera: (
    <>
      <path d="M4 8.5a2 2 0 012-2h1.6l1.2-1.8a1.5 1.5 0 011.2-.7h4a1.5 1.5 0 011.2.7l1.2 1.8H18a2 2 0 012 2V17a2 2 0 01-2 2H6a2 2 0 01-2-2z" />
      <circle cx="12" cy="12.5" r="3.3" />
    </>
  ),
  map: (
    <>
      <path d="M9 4.5L3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2-6-2z" />
      <path d="M9 4.5v13M15 6.5v13" />
    </>
  ),
  basket: (
    <>
      <path d="M4 10h16l-1.4 8.3a2 2 0 01-2 1.7H7.4a2 2 0 01-2-1.7L4 10z" />
      <path d="M8.5 10L12 4.5l3.5 5.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.8 2.8 2.8 13.2 0 16M12 4c-2.8 2.8-2.8 13.2 0 16" />
    </>
  ),
  locate: (
    <>
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5" />
    </>
  ),
  tag: (
    <>
      <path d="M4 12.5V5.5A1.5 1.5 0 015.5 4h7l8 8-8.5 8.5z" />
      <circle cx="8.5" cy="8.5" r="1.3" />
    </>
  ),
  navigate: <path d="M12 3.5l7 16.5-7-3.5-7 3.5z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  logout: (
    <>
      <path d="M10 4.5H6A1.5 1.5 0 004.5 6v12A1.5 1.5 0 006 19.5h4" />
      <path d="M14.5 8l4 4-4 4M18.5 12h-9" />
    </>
  ),
  download: <path d="M12 4v10.5M8 11l4 4 4-4M5 19.5h14" />,
  share: (
    <>
      <path d="M12 14.5V4M8 7.5L12 4l4 3.5" />
      <path d="M5.5 12.5V18a1.5 1.5 0 001.5 1.5h10a1.5 1.5 0 001.5-1.5v-5.5" />
    </>
  ),
  qr: (
    <>
      <path d="M4.5 4.5h5.5V10H4.5zM14 4.5h5.5V10H14zM4.5 14H10v5.5H4.5z" />
      <path d="M14 14h2v2h-2zM17.5 17.5h2v2h-2zM17.5 14h2M14 17.5v2" />
    </>
  ),
  refresh: (
    <>
      <path d="M19 12a7 7 0 11-2.05-4.95" />
      <path d="M19 4.5V9h-4.5" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s6.5-5.7 6.5-11a6.5 6.5 0 10-13 0c0 5.3 6.5 11 6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  store: (
    <>
      <path d="M4.5 10l1.3-5h12.4l1.3 5" />
      <path d="M5.5 10v9.5h13V10" />
      <path d="M10 19.5v-5h4v5" />
    </>
  ),
  image: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M4.5 17l4.5-4 3.5 3 2.5-2 4.5 4" />
    </>
  ),
  pencil: (
    <>
      <path d="M5 19h3.5L19 8.5 15.5 5 5 15.5z" />
      <path d="M13.5 7l3.5 3.5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.5l8.5 15h-17z" />
      <path d="M12 10v4.5M12 16.8v.2" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12c2.3-4 5.6-6 9.5-6s7.2 2 9.5 6c-2.3 4-5.6 6-9.5 6s-7.2-2-9.5-6z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  bookmark: <path d="M7 4.5h10a1 1 0 011 1V20l-6-4-6 4V5.5a1 1 0 011-1z" />,
  printer: (
    <>
      <path d="M7.5 9V4.5h9V9" />
      <path d="M7 17H4.5v-6.5A1.5 1.5 0 016 9h12a1.5 1.5 0 011.5 1.5V17H17" />
      <path d="M7.5 14h9v5.5h-9z" />
    </>
  ),
  card: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 10h8M8 14h5" />
    </>
  ),
  send: <path d="M4.5 11.5l15-7-5 15.5-3-6.5z" />,
  entrance: (
    <>
      <path d="M10.5 5H7A1.5 1.5 0 005.5 6.5v11A1.5 1.5 0 007 19h3.5" />
      <path d="M19 12h-8.5M14 8.5L10.5 12l3.5 3.5" />
    </>
  ),
  parking: <path d="M9 19V5.5h4.3a3.7 3.7 0 010 7.4H9" />,
  toilet: (
    <>
      <circle cx="8" cy="5.8" r="1.6" />
      <circle cx="16" cy="5.8" r="1.6" />
      <path d="M8 9.5v9.5M5.5 12.5L8 9.5l2.5 3M16 9.5v9.5M13.5 15l2.5-5.5 2.5 5.5z" />
    </>
  ),
  bell: (
    <>
      <path d="M6.5 16.5V11a5.5 5.5 0 0111 0v5.5l1.5 2h-14z" />
      <path d="M10 20.5a2 2 0 004 0" />
    </>
  ),
  heart: <path d="M12 19.5s-7-4.3-7-9.3A3.8 3.8 0 0112 8a3.8 3.8 0 017 2.2c0 5-7 9.3-7 9.3z" />,
  list: <path d="M8.5 7h11M8.5 12h11M8.5 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" />,
  filter: <path d="M4.5 6.5h15M7.5 12h9M10.5 17.5h3" />,
  external: (
    <>
      <path d="M13.5 4.5h6v6M19.5 4.5l-8 8" />
      <path d="M17.5 13.5v4.5a1.5 1.5 0 01-1.5 1.5H6A1.5 1.5 0 014.5 18V8A1.5 1.5 0 016 6.5h4.5" />
    </>
  ),
} as const;
export type IconName = keyof typeof paths;

export default function Icon({
  name,
  size = 24,
  strokeWidth = 1.7,
  color = 'currentColor',
  label,
  style,
  className,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  color?: string;
  /** 있으면 role="img"와 이름을 붙이고, 없으면 장식으로 숨김 */
  label?: string;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: 'none', ...style }}
      className={className}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {paths[name]}
    </svg>
  );
}

// 카테고리 아이콘 여섯 개: 면을 채운 아이콘(16px에서도 읽히게). fg = 아이콘 색, hole = 안쪽 구멍 색
export function CategoryGlyph({
  category,
  size = 24,
  color = 'currentColor',
  hole = 'var(--color-canvas)',
}: {
  category: StoreCategory;
  size?: number;
  color?: string;
  hole?: string;
}) {
  const shapes: Record<StoreCategory, React.ReactNode> = {
    produce: (
      <>
        <path
          fill={color}
          d="M12 8.3c-1.7-1.5-5.7-1.2-5.7 3.4 0 3.9 2.9 7.8 5.7 6.6 2.8 1.2 5.7-2.7 5.7-6.6 0-4.6-4-4.9-5.7-3.4z"
        />
        <path fill={color} d="M12.2 7.2c-.2-2.1 1.2-3.7 3.5-3.9.2 2.2-1.2 3.8-3.5 3.9z" />
      </>
    ),
    dried: (
      <>
        <path
          fill={color}
          d="M8.2 3.8h7.6a.9.9 0 01.9.9v1.5a.9.9 0 01-.9.9H8.2a.9.9 0 01-.9-.9V4.7a.9.9 0 01.9-.9z"
        />
        <path
          fill={color}
          d="M7.6 8.5h8.8c1.3 0 2.3 1 2.3 2.3v7.1c0 1.3-1 2.3-2.3 2.3H7.6c-1.3 0-2.3-1-2.3-2.3v-7.1c0-1.3 1-2.3 2.3-2.3z"
        />
        <path fill={hole} d="M8 12.2h8v3.6H8z" />
      </>
    ),
    seafood: (
      <>
        <path
          fill={color}
          d="M2.8 12c2.1-3.3 5.2-5 8.4-5 2.9 0 5.4 1.5 6.9 3.3l3.1-2.7v8.8l-3.1-2.7c-1.5 1.8-4 3.3-6.9 3.3-3.2 0-6.3-1.7-8.4-5z"
        />
        <circle fill={hole} cx="7.6" cy="11.2" r="1.15" />
      </>
    ),
    side: (
      <>
        <path fill={color} d="M3.5 11.5h17c0 4.4-3.5 8-8.5 8s-8.5-3.6-8.5-8z" />
        <path
          fill="none"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          d="M8.5 8.5c0-1.5 1.2-1.5 1.2-3M13.3 8.5c0-1.5 1.2-1.5 1.2-3"
        />
      </>
    ),
    meat: (
      <>
        <circle fill={color} cx="10" cy="9.8" r="6.3" />
        <path
          fill="none"
          stroke={color}
          strokeWidth="2.8"
          strokeLinecap="round"
          d="M13.5 13.3l4.7 4.7"
        />
        <circle fill={color} cx="19.7" cy="17.3" r="1.9" />
        <circle fill={color} cx="17.3" cy="19.7" r="1.9" />
        <path
          fill="none"
          stroke={hole}
          strokeWidth="1.5"
          strokeLinecap="round"
          d="M7 8.4c.6-1.3 1.7-2.1 3.1-2.3"
        />
      </>
    ),
    ricecake: (
      <>
        <path fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" d="M4 20L20 4" />
        <circle fill={color} cx="8" cy="16" r="3.3" />
        <circle fill={color} cx="12.2" cy="11.8" r="3.3" />
        <circle fill={color} cx="16.4" cy="7.6" r="3.3" />
      </>
    ),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}>
      {shapes[category]}
    </svg>
  );
}
