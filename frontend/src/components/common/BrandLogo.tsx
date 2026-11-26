/**
 * Market-On 로고(글자 로고 logo, 막대만 mark). 밝은 화면은 검은 막대, 어두운 화면은 흰 막대로 바꿔 보임
 * (2026-11-27: 휴대폰 다크 모드에서 검은 로고가 바탕에 묻혀 안 보였음). 보이는 쪽은 app.css의 theme-*-only.
 */
export default function BrandLogo({
  kind = 'logo',
  className,
  alt = 'Market-On',
}: {
  kind?: 'logo' | 'mark';
  className?: string;
  alt?: string;
}) {
  const light = kind === 'logo' ? '/brand/logo-light.svg' : '/brand/mark-tight.svg';
  const dark = kind === 'logo' ? '/brand/logo-dark.svg' : '/brand/mark-tight-dark.svg';
  return (
    <>
      <img className={`${className ?? ''} theme-light-only`} src={light} alt={alt} />
      <img className={`${className ?? ''} theme-dark-only`} src={dark} alt={alt} />
    </>
  );
}
