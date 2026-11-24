import type { ButtonHTMLAttributes } from 'react';
export default function Button({
  loading,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
}) {
  return (
    <button {...props} disabled={props.disabled || loading} aria-busy={loading}>
      {loading ? '•••' : children}
    </button>
  );
}
