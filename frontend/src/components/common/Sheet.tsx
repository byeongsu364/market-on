import { useEffect, useRef, type ReactNode } from 'react';
export default function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
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
      const nodes = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]');
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
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <div className="sheet" ref={ref} role="dialog" aria-modal="true" aria-label={title}>
        <button className="secondary close" onClick={onClose}>
          닫기
        </button>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
