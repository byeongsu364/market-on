import s from './ui.module.css';
// 버튼 네 가지(주요, 면, 외곽선, 밑줄 글자)와 높이 54/48/38. 주요(검정)는 한 화면에 하나.
export type ButtonVariant = 'primary' | 'surface' | 'outline' | 'text';
export type ButtonSize = 'lg' | 'md' | 'sm';
export type Look = { variant?: ButtonVariant; size?: ButtonSize; wide?: boolean; grow?: boolean };
export const buttonClass = ({ variant = 'surface', size = 'lg', wide, grow }: Look, extra = '') =>
  [
    s.button,
    variant === 'text' ? s.textButton : s[variant],
    variant === 'text' ? '' : s[size],
    wide ? s.wide : '',
    grow ? s.grow : '',
    extra,
  ]
    .filter(Boolean)
    .join(' ');
