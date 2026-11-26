import type { HTMLAttributes, ReactNode } from 'react';
import s from './ui.module.css';
// 묶음 면: 테두리 없이 surface-strong 면. tone=dark 는 판단 카드·QR 면, signal 은 강조 점포·한 줄 요약
export default function Card({
  children,
  tone,
  className,
  as: Tag = 'section',
  ...props
}: HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  tone?: 'dark' | 'signal';
  as?: 'section' | 'div' | 'article';
}) {
  return (
    <Tag
      {...props}
      className={[
        s.card,
        tone === 'dark' ? s.cardDark : tone === 'signal' ? s.cardSignal : '',
        className ?? '',
      ].join(' ')}
    >
      {children}
    </Tag>
  );
}
