import { Link } from 'react-router-dom';
import BrandLayout from './BrandLayout';
import CountUp from './CountUp';
import FeatureVideo from './FeatureVideo';
import { APP_START, FACTS } from './facts';
import { useStartWeb } from './motion';
import b from './brand.module.css';
import m from './motion.module.css';
import s from './home.module.css';

/**
 * 소개 사이트 홈(2026-11-27 디자인 시안 index.html).
 * PC(1024px 이상)의 손님 주소(/)는 앱 대신 이 페이지(components/layout/desktopGate.ts),
 * /intro는 어느 폭에서나 이 페이지. 히어로 → 문제 → 해결 방법 → 솔루션 카드 4개 → 마무리.
 * 폰 화면은 지금 배포된 실제 화면 캡처(public/landing)예요.
 */
const PROBLEMS = [
  { tag: '적정가', q: '"바가지는 아닐까?"', a: '가격표는 있어도 견줄 기준이 없어요.' },
  { tag: '상태', q: '"상태는 괜찮을까?"', a: '무엇을 보고 골라야 하는지 몰라요.' },
  { tag: '가게', q: '"어느 가게에서 팔지?"', a: '시장 안 점포 정보는 온라인에 거의 없어요.' },
];

const BASES = [
  { no: '01', title: '가격', body: '오늘 기준시세보다 몇 % 높은지, 낮은지' },
  { no: '02', title: '품종 · 제철', body: '어떤 품종인지, 지금이 제철인지' },
  {
    no: '03',
    title: '상태 확인',
    body: '안심On이 품목마다 알려 주는 확인 포인트로 직접 체크',
  },
  { no: '04', title: '출처', body: '모든 숫자 아래 조사처와 조사일' },
  { no: '05', title: '파는 가게', body: '이 시장 안 어느 점포에서 파는지' },
];

const NOT_SAID = ['신선', '등급', '별점', '사지 마세요'];

const ANSHIMON_ALT =
  '안심On 카드 화면: 노지 귤 현장 가격 250원과 기준시세 279원, 기준시세보다 10% 낮아요, 비교 근거 4가지';

export default function Landing() {
  const startWeb = useStartWeb();
  return (
    <BrandLayout page="home">
      <section id="top" data-stop className={`${b.stop} ${s.hero}`} aria-labelledby="hero-title">
        <div className={s.awning} aria-hidden="true">
          <span className={`${s.slat} ${m.drop}`} />
          <span className={`${s.slat} ${m.drop}`} />
          <span className={`${s.slat} ${m.drop}`} />
          <span className={`${s.slat} ${m.drop}`} />
        </div>
        <div className={s.heroInner}>
          <div className={s.heroText}>
            <p className={b.kicker}>전통시장 장보기 도우미</p>
            <h1 id="hero-title" className={s.heroTitle}>
              시장 안에서,
              <br />이 상품을,
              <br />
              <span className={`${s.heroMark} ${m.mark}`}>내가 판단해요.</span>
            </h1>
            <p className={`${b.lead} ${s.heroLead}`}>
              찍으면 품목과 오늘의 기준시세, 고를 때 볼 점을 보여 드려요. 시장 안 점포는 업종별
              지도로 찾아요. 신선도 판단은 손님이 직접 해요.
            </p>
            <div className={`${b.btnRow} ${s.heroCtas}`}>
              <a href={APP_START} className={`${b.btn} ${b.btnPrimary}`} onClick={startWeb}>
                웹페이지로 시작하기
              </a>
              <Link to="/intro/download" className={`${b.btn} ${b.btnSurface}`}>
                휴대폰에 설치하기
              </Link>
            </div>
          </div>
          <div className={s.phones}>
            <div className={`${s.phoneBack} ${m.float}`}>
              <img
                src="/landing/map.webp"
                alt="지도 홈 화면: 가까운 경동시장과 둘러보기 버튼"
                width={780}
                height={1688}
              />
            </div>
            <div className={`${s.phoneFront} ${m.floatLate}`}>
              {/* 안심On을 쓰는 화면(노지 귤 가격표를 찍은 실제 서비스 화면, 2026-11-27 요청) */}
              <img
                src="/landing/anshimon-mandarin.webp"
                alt={ANSHIMON_ALT}
                width={780}
                height={1688}
              />
            </div>
          </div>
          <p className={s.now}>
            <span className={s.nowDot} aria-hidden="true" />
            <span>
              지금은 <strong>서울 경동시장</strong>에서 써 볼 수 있어요 · 식품 점포{' '}
              <strong>{FACTS.stores}곳</strong>
            </span>
          </p>
        </div>
      </section>

      <section
        id="problem"
        data-stop
        className={`${b.stop} ${b.white}`}
        aria-labelledby="problem-title"
      >
        <div className={`${b.inner} ${s.inner56}`}>
          <div className={s.problemTop}>
            <div className={s.problemHead}>
              <p className={b.kicker}>문제</p>
              <h2 id="problem-title" className={`${b.h2} ${m.reveal}`}>
                시장이 더 싼데,
                <br />왜 마트 앱을 열까요?
              </h2>
              <p className={b.lead}>
                판단할 근거가 없어서예요. 가격도, 상태도, 가게도 혼자 판단해야 하니 2030은 시장을
                피하고, 상인은 손님을 잃어요.
              </p>
            </div>
            <ol className={`${s.problemList} ${m.reveal}`}>
              {PROBLEMS.map((p) => (
                <li key={p.tag}>
                  <span className={`${b.mono} ${s.problemTag}`}>{p.tag}</span>
                  <div className={s.problemQ}>
                    <strong>{p.q}</strong>
                    <span>{p.a}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className={s.statBox}>
            <div className={s.statCol}>
              <span className={s.statLabel}>차례상 한 번, 전통시장이 이만큼 싸요</span>
              <CountUp value={79509} suffix="원" className={b.stat} />
              <span className={b.source}>
                소상공인시장진흥공단 추석 차례상 비용 조사 · 전통시장 35.3만 원, 대형마트 43.2만 원
              </span>
            </div>
            <div className={s.statCol}>
              <span className={s.statLabel}>그런데 경동시장 점포의 온라인 지도 등록률은</span>
              <span className={b.stat}>12% 미만</span>
              <span className={b.source}>서울시 분석 · 전통시장 점포 디지털 지도 등록률</span>
            </div>
          </div>
        </div>
      </section>

      <section
        id="solution-way"
        data-stop
        className={`${b.stop} ${b.soft}`}
        aria-labelledby="way-title"
      >
        <div className={b.inner}>
          <div className={b.headBlock}>
            <p className={b.kicker}>해결 방법</p>
            <h2 id="way-title" className={`${b.h2} ${m.reveal}`}>
              안심하고 살 수 있는 시장을 만듭니다.
            </h2>
            <p className={b.lead}>
              AI가 대신 고르면 생각이 멈춰요. Market-On은 사기 직전에 필요한 근거 다섯 가지를 켜고,
              선택은 손님에게 남겨요.
            </p>
          </div>
          <ol className={`${s.bases} ${m.reveal}`}>
            {BASES.map((x) => (
              <li key={x.no}>
                <span className={b.mono}>{x.no}</span>
                <span className={s.baseTitle}>{x.title}</span>
                <span className={s.baseBody}>{x.body}</span>
              </li>
            ))}
          </ol>
          <div className={s.principle}>
            <p>
              판단 근거는 Market-On이,
              <br />
              선택은 손님이.
            </p>
            <div className={s.notSaid}>
              <span className={s.notSaidLabel} id="not-said">
                그래서 쓰지 않는 말
              </span>
              <ul aria-labelledby="not-said">
                {NOT_SAID.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section
        id="solution"
        data-stop
        className={`${b.stop} ${b.white}`}
        aria-labelledby="solution-title"
      >
        <div className={`${b.inner} ${s.inner56}`}>
          <div className={s.solutionTop}>
            <div className={s.solutionHead}>
              <p className={b.kicker}>솔루션</p>
              <h2 id="solution-title" className={`${b.h2} ${m.reveal}`}>
                사진 한 장으로,
                <br />
                사기 전부터 산 뒤까지.
              </h2>
            </div>
            <Link to="/intro/features" className={`${b.btn} ${b.btnPrimary}`}>
              솔루션 자세히 보기 <span aria-hidden="true">→</span>
            </Link>
          </div>
          <ol className={`${s.cards} ${m.reveal}`}>
            <li>
              <FeatureVideo
                shape="panel"
                className={s.shot}
                poster="/landing/prices.webp"
                label="오늘 기준시세 화면: 품목마다 전통시장과 대형마트 가격"
              />
              <span className={s.cardLabel}>방문 전</span>
              <h3 className={s.cardTitle}>오늘의 기준시세</h3>
              <p className={s.cardBody}>
                전통시장과 대형마트 가격, 이번 달 제철을 먼저 보여 드려요.
              </p>
            </li>
            <li>
              <FeatureVideo
                shape="panel"
                className={s.shot}
                poster="/landing/anshimon-mandarin.webp"
                label={ANSHIMON_ALT}
              />
              <span className={`${s.cardLabel} ${s.cardLabelSignal}`}>시장 안 · 핵심 기능</span>
              <h3 className={s.cardTitle}>안심On</h3>
              <p className={s.cardBody}>
                찍으면 가격 눈금, 비교 근거 4가지, 내가 확인한 것을 카드 한 장에 모아요.
              </p>
            </li>
            <li>
              <FeatureVideo
                shape="panel"
                className={s.shot}
                poster="/landing/market.webp"
                label={`파는 가게 안내 화면: 시장 지도에 사과 파는 점포 ${FACTS.appleStores}곳`}
              />
              <span className={s.cardLabel}>구매</span>
              <h3 className={s.cardTitle}>파는 가게 안내</h3>
              <p className={s.cardBody}>그 품목을 파는 시장 안 점포만 지도에 남겨 길을 안내해요.</p>
            </li>
            <li>
              <FeatureVideo
                shape="panel"
                className={s.shot}
                poster="/landing/recipes.webp"
                label="레시피 화면: 이달 제철 재료로 만드는 요리와 재료를 파는 점포 수"
              />
              <span className={s.cardLabel}>구매 후</span>
              <h3 className={s.cardTitle}>레시피 · 손질 · 보관</h3>
              <p className={s.cardBody}>
                산 품목으로 만들 요리와 손질법, 보관법을 근거와 함께 알려 드려요.
              </p>
            </li>
          </ol>
          <div className={s.merchantNote}>
            <strong>그리고 소상공인에게는, 광고비 없는 홍보</strong>
            <span>
              손님이 공유한 안심On에 가게가 함께 표시되고, 그 공유가 다음 손님을 시장으로 데려와요.
            </span>
          </div>
        </div>
      </section>

      <section data-stop className={`${b.stop} ${b.closing}`} aria-label="마무리">
        <div className={`${b.inner} ${b.closingInner}`}>
          <p className={b.closingTitle}>
            판단 근거는 Market-On이,
            <br />
            선택은 손님이.
          </p>
          <p className={b.closingLead}>앱 설치 없이 지금 바로 경동시장에서 써 볼 수 있어요.</p>
          <div className={b.btnRowWide}>
            <a href={APP_START} className={`${b.btn} ${b.btnOnDark}`} onClick={startWeb}>
              웹페이지로 시작하기
            </a>
            <Link to="/intro/download" className={`${b.btn} ${b.btnDarkSoft}`}>
              휴대폰에 설치하기
            </Link>
          </div>
        </div>
      </section>
    </BrandLayout>
  );
}
