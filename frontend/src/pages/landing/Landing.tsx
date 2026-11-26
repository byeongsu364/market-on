import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Icon from '../../components/common/Icon';
import { ButtonLink } from '../../components/common/Button';
import { useQrSvg } from '../../hooks/usePoster';
import { useMarket } from '../../hooks/useMarkets';
import { PC_APP_KEY } from '../../components/layout/desktopGate';
import BrandLayout from './BrandLayout';
import { FEATURES } from './features';
import s from './landing.module.css';

/**
 * PC(1024px 이상) 첫 화면: 서비스 소개와 브랜딩(2026-11-27).
 * 손님 화면은 시장에서 휴대폰으로 쓰는 앱이라, PC에서는 앱 대신 이 페이지를 보이고 휴대폰으로 여는 QR을 줌.
 * 상인·시장 관리자·운영자 화면은 PC에서 그대로 씀(components/layout/desktopGate.ts).
 * 화면의 숫자는 API에서만 가져오고(점포 수), 캡처는 실제 서비스 화면(public/landing)이에요.
 */
const STEPS = [
  {
    no: '01',
    title: '지도에서 찾기',
    body: '가까운 전통시장과 시장 안 점포를 업종별 핀으로 보여 드려요. 품목을 고르면 그 품목을 파는 점포만 남아요.',
    image: '/landing/market.webp',
    alt: '경동시장 지도에서 사과를 파는 점포를 핀으로 보여 주는 화면',
  },
  {
    no: '02',
    title: '찍어서 확인하기',
    body: '상품과 가격표를 찍으면 품목과 품종을 알아보고, aT 기준시세와 고를 때 볼 확인 포인트를 함께 보여 드려요.',
    image: '/landing/result.webp',
    alt: '사과 후지 1,500원을 기준시세 1,690원과 견준 결과 화면',
  },
  {
    no: '03',
    title: '직접 판단하기',
    body: '신선도에 등급을 매기지 않아요. 가격이 시세의 어디쯤인지와 확인할 점을 보여 드리고, 판단은 손님이 해요.',
    image: '/landing/map.webp',
    alt: '지도 홈에서 가까운 경동시장 카드와 둘러보기 버튼을 보여 주는 화면',
  },
];

const PRINCIPLES = [
  {
    title: '등급 대신 확인 포인트',
    body: '"신선함", "추천 구매" 같은 판정을 하지 않아요. 품목마다 눈·손·코로 확인할 점만 안내해요.',
  },
  {
    title: '숫자 아래에는 출처',
    body: '가격과 시세 바로 아래에 어디서, 언제 조사한 값인지 적어요.',
  },
  {
    title: '점포 가격은 확인한 순서대로',
    body: '상인이 확인한 가격, 손님이 제보한 가격, 시장 평균 순서로 보여 드리고 무엇인지 함께 적어요.',
  },
];

const SOURCES = [
  '한국농수산식품유통공사(aT) 농산물 가격정보',
  '소상공인시장진흥공단 상가(상권)정보',
  '농촌진흥청 이달의 식재료 (공공데이터포털)',
  '카카오맵 장소 (점포 위치, 상호·주소 대조)',
];

export default function Landing() {
  const url = typeof window !== 'undefined' ? window.location.origin + '/' : '/';
  const qr = useQrSvg(url);
  const market = useMarket('market:gyeongdong');
  const { hash } = useLocation();
  // 기능 페이지의 "휴대폰으로 열기"(/#open)로 오면 QR 자리로
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView?.();
  }, [hash]);
  const stores = market.data?.store_count;
  const openOnPc = () => {
    try {
      sessionStorage.setItem(PC_APP_KEY, '1');
    } catch {
      /* 저장이 안 되면 이번 화면만 */
    }
    window.location.assign('/');
  };

  return (
    <BrandLayout>
      <main id="main">
        <section className={s.hero} aria-labelledby="hero-title">
          <div className={s.heroText}>
            <p className={s.kicker}>전통시장 장보기 도우미</p>
            <h1 id="hero-title" className={s.title}>
              시장 안에서,
              <br />이 상품을,
              <br />
              <span className={s.titleMark}>내가 판단해요.</span>
            </h1>
            <p className={s.lead}>
              찍으면 품목과 오늘의 기준시세, 고를 때 볼 점을 보여 드려요. 시장 안 점포는 업종별
              지도로 찾아요. 신선도 판단은 손님이 직접 해요.
            </p>
            <div className={s.openCard} id="open">
              <div
                className={s.qr}
                role="img"
                aria-label={`휴대폰으로 여는 QR 코드: ${url}`}
                dangerouslySetInnerHTML={qr.svg ? { __html: qr.svg } : undefined}
              />
              <div className={s.openText}>
                <strong>휴대폰 카메라로 찍으면 바로 열려요</strong>
                <span>시장에서 한 손으로 쓰도록 만든 모바일 웹이에요. 앱 설치는 필요 없어요.</span>
                <span className={s.url}>{url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
              </div>
            </div>
            <button type="button" className={s.pcLink} onClick={openOnPc}>
              PC에서 그대로 써 보기
              <Icon name="chevronRight" size={16} />
            </button>
          </div>
          <div className={s.phones} aria-hidden="true">
            <img className={`${s.phone} ${s.phoneBack}`} src="/landing/map.webp" alt="" />
            <img className={`${s.phone} ${s.phoneFront}`} src="/landing/market.webp" alt="" />
          </div>
        </section>

        <section className={s.now} aria-label="지금 쓸 수 있는 곳">
          <span className={s.nowDot} aria-hidden="true" />
          <p>
            지금은 <strong>서울 경동시장</strong>에서 써 볼 수 있어요
            {stores ? (
              <>
                {' '}
                · 식품 점포 <strong className={s.num}>{stores.toLocaleString()}</strong>곳
              </>
            ) : null}
          </p>
        </section>

        <section id="how" className={s.section} aria-labelledby="how-title">
          <h2 id="how-title" className={s.h2}>
            이렇게 써요
          </h2>
          <ol className={s.steps}>
            {STEPS.map((step) => (
              <li key={step.no} className={s.step}>
                <img className={s.stepShot} src={step.image} alt={step.alt} loading="lazy" />
                <span className={s.stepNo}>{step.no}</span>
                <h3 className={s.h3}>{step.title}</h3>
                <p className={s.body}>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="principles" className={s.sectionSoft} aria-labelledby="principles-title">
          <div className={s.inner}>
            <h2 id="principles-title" className={s.h2}>
              판단은 손님이, 근거는 함께
            </h2>
            <ul className={s.principles}>
              {PRINCIPLES.map((p) => (
                <li key={p.title}>
                  <h3 className={s.h3}>{p.title}</h3>
                  <p className={s.body}>{p.body}</p>
                </li>
              ))}
            </ul>
            <div className={s.sources}>
              <h3 className={s.label}>쓰는 자료</h3>
              <ul>
                {SOURCES.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className={s.section} aria-labelledby="features-title">
          <h2 id="features-title" className={s.h2}>
            기능 둘러보기
          </h2>
          <ul className={s.featureGrid}>
            {FEATURES.map((f) => (
              <li key={f.slug}>
                <Link to={`/intro/${f.slug}`} className={s.featureTile}>
                  <span className={s.label}>{f.menu}</span>
                  <strong>{f.title}</strong>
                  <span className={s.body}>{f.lead}</span>
                  <span className={s.more}>
                    자세히 보기 <Icon name="chevronRight" size={16} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section id="merchants" className={s.section} aria-labelledby="merchants-title">
          <h2 id="merchants-title" className={s.h2}>
            상인과 시장을 위해
          </h2>
          <div className={s.cards}>
            <article className={s.card}>
              <Icon name="store" size={28} />
              <h3 className={s.h3}>상인</h3>
              <p className={s.body}>
                내 점포를 고르고 가게 위치·영업 정보를 맞춰요. 마감세일을 올리고, 손님이 찍어 갈
                점포 QR 포스터를 받아요.
              </p>
              <div className={s.cardActions}>
                <ButtonLink to="/signup/merchant" variant="primary" size="md">
                  상인으로 시작하기
                </ButtonLink>
                <Link to="/login" className="text-link">
                  로그인
                </Link>
              </div>
            </article>
            <article className={s.card}>
              <Icon name="map" size={28} />
              <h3 className={s.h3}>시장</h3>
              <p className={s.body}>
                우리 시장도 쓰고 싶다면 입점을 신청해 주세요. 시장 관리자는 상인 가입을 승인하고
                시장 입구 QR 포스터를 받아요.
              </p>
              <div className={s.cardActions}>
                <ButtonLink to="/join" variant="surface" size="md">
                  우리 시장 입점 신청
                </ButtonLink>
              </div>
            </article>
          </div>
        </section>
      </main>
    </BrandLayout>
  );
}
