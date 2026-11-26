import { useEffect, useRef, type ReactNode } from 'react';
import Icon from './Icon';
import s from './ui.module.css';
// 모달 시트(아래에서 올라옴, PC는 가운데 창). Esc로 닫고 포커스를 안에 가둠.
export default function Sheet({
  title,
  onClose,
  children,
  hideTitle = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  hideTitle?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector('button')?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab') return;
      const nodes = ref.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),a[href],input:not(:disabled),select,textarea',
      );
      if (!nodes?.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handle);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener('keydown', handle);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className={s.backdrop}
      onClick={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <div className={s.modal} ref={ref} role="dialog" aria-modal="true" aria-label={title}>
        <span className={s.grabber} aria-hidden="true" />
        <div className={s.modalHead}>
          <h2 className={hideTitle ? 'sr-only' : s.modalTitle}>{title}</h2>
          {hideTitle && <span style={{ flex: 1 }} />}
          <button className={s.iconButton} onClick={onClose} aria-label="닫기">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
