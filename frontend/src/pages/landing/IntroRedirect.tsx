import { Navigate, useParams } from 'react-router-dom';

/**
 * 예전 기능별 소개 주소(/intro/map, /intro/scan …, 2026-11-27 첫 판)를 새 기능 페이지의 섹션으로.
 * 모르는 주소도 기능 페이지로 보냄.
 */
const OLD_SLUGS: Record<string, string> = {
  map: 'store',
  scan: 'anshimon',
  prices: 'before',
  card: 'anshimon',
  shop: 'after',
  merchants: 'merchant',
  data: 'trust',
};

export default function IntroRedirect() {
  const { slug } = useParams();
  const anchor = slug && Object.hasOwn(OLD_SLUGS, slug) ? OLD_SLUGS[slug] : undefined;
  return (
    <Navigate to={{ pathname: '/intro/features', hash: anchor ? `#${anchor}` : '' }} replace />
  );
}
