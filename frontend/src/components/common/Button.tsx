import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { buttonClass, type ButtonVariant, type ButtonSize } from './buttonClass';
export type { ButtonVariant, ButtonSize };
type Look = { variant?: ButtonVariant; size?: ButtonSize; wide?: boolean; grow?: boolean };

export default function Button({
  loading,
  children,
  variant,
  size,
  wide,
  grow,
  icon,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  Look & {
    loading?: boolean;
    icon?: ReactNode;
  }) {
  return (
    <button
      type="button"
      {...props}
      className={buttonClass({ variant, size, wide, grow }, className)}
      disabled={props.disabled || loading}
      aria-busy={loading}
    >
      {loading ? (
        '•••'
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  wide,
  grow,
  icon,
  children,
  className,
  ...props
}: LinkProps & Look & { icon?: ReactNode }) {
  return (
    <Link {...props} className={buttonClass({ variant, size, wide, grow }, className)}>
      {icon}
      {children}
    </Link>
  );
}
