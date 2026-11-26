import { useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import BrandLayout from './BrandLayout';
import CountUp from './CountUp';
import FeatureVideo from './FeatureVideo';
import { APP_START, FACTS, STORE_SPLIT } from './facts';
import { ActiveStopContext, reducedMotion, useStartWeb } from './motion';
import b from './brand.module.css';
import m from './motion.module.css';
import f from './features.module.css';

/**
 * 기능(/intro/features) — 2026-11-27 디자인 시안 features.html, 발표는 이 페이지로 진행.
 * 목차 칩(#anshimon … #sources)은 머리말 아래에 붙어 따라오고, 지금 보이는 섹션을 표시해요.
 * 영상 자리 8개는 FeatureVideo(영상이 오기 전에는 실제 화면 캡처).
 * 숫자는 facts.ts, 기술 설명은 지금 서비스 기준(사진 인식 Google Cloud Vision, 답은 학교 서버 Gemma 먼저).
 */
const TOC = [
  { id: 'anshimon', label: '안심On' },
  { id: 'before', label: '방문 전 기준시세' },
  { id: 'store', label: '파는 가게' },
  { id: 'merchant', label: '소상공인 홍보' },
  { id: 'tools', label: '상인 도구' },
  { id: 'after', label: '레시피 · 관리법' },
  { id: 'why', label: '왜 경동시장' },
  { id: 'trust', label: '기술' },
  { id: 'proof', label: '검증' },
  { id: 'impact', label: '기대효과' },
  { id: 'sources', label: '출처' },
];

const FLOW = [
  { no: '방문 전', text: '살펴보고' },
  { no: '1', text: '사진 한 장으로 고르고' },
  { no: '2', text: '근거로 비교하고' },
  { no: '3', text: '안심On으로 납득하고', on: true },
  { no: '4', text: '파는 가게에서 삽니다' },
];

const ANSHIMON_STEPS = [
  {
    title: '가격 눈금',
    text: '현장 가격을 기준시세와 같은 단위로 맞춰, 노지 귤 1개 250원이면 기준시세 279원과 비교해 "기준시세보다 10% 낮아요"처럼 알려 드려요.',
  },
  { title: '비교 근거 4가지', text: '가격, 품종, 제철, 상태를 공식 문서를 근거로 설명해요.' },
  {
    title: '내가 확인한 것',
    text: '판정하지 않고, 손님이 체크한 확인 포인트만 세요. 귤은 확인 포인트 4개 중 체크한 만큼 "4개 중 2개 확인"처럼 적어요.',
  },
  { title: '저장 · 공유', text: '카드 한 장으로 저장하고 친구에게 보내요.' },
];

const LOOP = [
  { title: '안심하고 산 손님이', text: '안심On 카드를 친구에게 공유해요.' },
  { title: '가게가 노출되고', text: '카드와 지도에 상호가 함께 표시돼요.' },
  { title: '새 손님이 찾아와요', text: '공유를 받은 친구가 같은 가게로 와요.', key: true },
  { title: '매출과 재고 소진', text: '바겐세일 정보로 남은 재고까지 팔아요.' },
];

const MERCHANT_TOOLS = [
  '바겐세일 정보 제공',
  '가게 노출 · 취급 품목 소개',
  '손님 가격 확인',
  '단골 손님에게 바겐세일 알림',
];

const TECH = [
  {
    no: '1 · 찍기',
    title: '사진 한 장',
    text: 'Google Cloud Vision이 상품과 가격표 글자를 함께 읽어요.',
  },
  {
    no: '2 · 온톨로지',
    title: '품목 · 품종 맞추기',
    text: `품목 ${FACTS.items}개, 품종 ${FACTS.varieties}개, 확인 포인트 ${FACTS.checkpoints}개를 aT 코드에 연결해요.`,
  },
  {
    no: '3 · RAG',
    title: '공식 문서에서 근거 찾기',
    text: `근거 문서 ${FACTS.documents}개, 출처 ${FACTS.sources}곳에서 찾아요.`,
  },
  {
    no: '4 · 계산',
    title: '숫자는 코드가',
    text: '단위를 맞춰 기준시세 대비 %를 코드로 계산해요.',
  },
  {
    no: '5 · 생성형 AI',
    title: '근거 안에서만 설명',
    text: '학교 서버 Gemma가 먼저 답하고, 답하지 못할 때만 Gemini · GPT가 대신해요.',
  },
];

type SourceRow = { kind: string; name: string; by: string; use: string; url: string };
const SOURCES: SourceRow[] = [
  {
    kind: '공공데이터',
    name: 'aT 기간별 소매가격 API',
    by: '한국농수산식품유통공사(aT) · KAMIS',
    use: '기준시세, 전통시장 · 대형마트 가격 비교',
    url: 'https://www.kamis.or.kr',
  },
  {
    kind: '공공데이터',
    name: '상가(상권)정보 API',
    by: '소상공인시장진흥공단 · 공공데이터포털',
    use: `시장 안 식품 점포 ${FACTS.stores}곳의 상호와 업종`,
    url: 'https://www.data.go.kr',
  },
  {
    kind: '공공데이터',
    name: '이달의 식재료',
    by: '농촌진흥청 · 공공데이터포털',
    use: '제철 품목, 레시피',
    url: 'https://www.data.go.kr',
  },
  {
    kind: '공공데이터',
    name: '조리식품의 레시피 DB',
    by: '식품의약품안전처 · 식품안전나라',
    use: '레시피 원문과 재료',
    url: 'https://www.foodsafetykorea.go.kr',
  },
  {
    kind: '공공데이터',
    name: '농사로 농업기술 정보',
    by: '농촌진흥청',
    use: '손질법 · 보관법 근거 문서',
    url: 'https://www.nongsaro.go.kr',
  },
  {
    kind: '지도',
    name: '카카오 로컬 API',
    by: '카카오',
    use: '점포 위치 찾기, 상호 · 주소 대조',
    url: 'https://developers.kakao.com',
  },
  {
    kind: '지도',
    name: '네이버 지도 API',
    by: '네이버클라우드',
    use: '시장 지도와 점포 핀',
    url: 'https://www.ncloud.com',
  },
  {
    kind: 'AI',
    name: 'Google Cloud Vision',
    by: 'Google',
    use: '사진 속 품목과 가격표 글자 읽기',
    url: 'https://cloud.google.com/vision',
  },
  {
    kind: 'AI',
    name: 'Gemma',
    by: 'Google · 학교 서버',
    use: '근거 안에서 답변 · 번역 (먼저 사용)',
    url: 'https://ai.google.dev/gemma',
  },
  {
    kind: 'AI',
    name: 'GPT',
    by: 'OpenAI API',
    use: 'Gemma가 답하지 못할 때 대신 답변 (Gemini 포함)',
    url: 'https://platform.openai.com',
  },
  {
    kind: 'AI',
    name: 'bge-m3 임베딩 · pgvector',
    by: 'BAAI · PostgreSQL',
    use: '근거 문서 검색(RAG)',
    url: 'https://huggingface.co/BAAI/bge-m3',
  },
];
const hostOf = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '');

/** 목차 칩 줄이 머리말 아래에 붙었는지(붙으면 아래 선) */
function useStuck() {
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver !== 'function') return;
    // 머리말 높이(brand.module.css의 --brand-head)
    const head = parseFloat(getComputedStyle(el).getPropertyValue('--brand-head')) || 72;
    const io = new IntersectionObserver(
      ([e]) => setStuck(!!e && !e.isIntersecting && e.boundingClientRect.top < head + 1),
      { rootMargin: `-${Math.round(head) + 1}px 0px 0px 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [sentinel, stuck] as const;
}

export default function FeaturesPage() {
  return (
    <BrandLayout page="features">
      <Features />
    </BrandLayout>
  );
}

function Features() {
  const active = useContext(ActiveStopContext);
  const startWeb = useStartWeb();
  const [sentinel, stuck] = useStuck();
  const tocRow = useRef<HTMLDivElement>(null);

  // 지금 섹션 칩이 칩 줄 밖에 있으면 옆으로 밀어 보이게
  useEffect(() => {
    const row = tocRow.current;
    const chip = active ? row?.querySelector<HTMLElement>(`a[href="#${active}"]`) : null;
    if (!row || !chip) return;
    const r = row.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    if (c.left < r.left + 16 || c.right > r.right - 16)
      row.scrollBy?.({ left: c.left - r.left - 40, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [active]);

  return (
    <div className={f.page}>
      <section id="features" data-stop className={b.stop} aria-labelledby="features-title">
        <div className={f.intro}>
          <p className={b.kicker}>기능 · 솔루션 자세히 보기</p>
          <h1 id="features-title" className={b.h1}>
            살펴보고, 고르고, 납득하고, 삽니다.
          </h1>
          <p className={b.lead}>기능마다 실제 화면을 붙였어요.</p>
        </div>
      </section>
      <div ref={sentinel} aria-hidden="true" className={f.sentinel} />
      <nav aria-label="기능 목차" className={f.toc} data-stuck={stuck}>
        <div ref={tocRow} className={f.tocRow}>
          {TOC.map((t) => {
            const on = active === t.id;
            return (
              <a
                key={t.id}
                href={`#${t.id}`}
                className={`${b.chip} ${f.tocChip}`}
                aria-current={on ? 'location' : undefined}
              >
                {on && <span className={b.dot} aria-hidden="true" />}
                {t.label}
              </a>
            );
          })}
        </div>
      </nav>

      <div className={f.body}>
        <ol className={`${f.flow} ${m.reveal}`} aria-label="장보기 순서">
          {FLOW.map((x, i) => (
            <FlowStep key={x.no} {...x} last={i === FLOW.length - 1} />
          ))}
        </ol>

        <article
          id="anshimon"
          data-stop
          className={`${b.stop} ${f.row}`}
          aria-labelledby="anshimon-title"
        >
          <div className={`${f.copy} ${f.copyWide} ${m.reveal}`}>
            <p className={`${b.kicker} ${b.kickerSignal}`}>핵심 기능 · 안심On</p>
            <h2 id="anshimon-title" className={f.h3main}>
              사진 한 장이면,
              <br />
              사도 될 근거가 한 화면에.
            </h2>
            <p className={b.leadSm}>
              상품과 가격표를 찍으면 품목과 품종을 알아보고, 안심On 카드로 구매 결정에 필요한 자료를
              모아 보여 드려요.
            </p>
            <ol className={f.steps}>
              {ANSHIMON_STEPS.map((x, i) => (
                <li key={x.title}>
                  <span className={f.stepNo} aria-hidden="true">
                    {i + 1}
                  </span>
                  <div className={f.stepText}>
                    <strong>{x.title}</strong>
                    <span>{x.text}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <figure className={`${f.figure} ${m.reveal}`}>
            {/* 영상: /landing/video/anshimon.mp4 (+ .webm), 세로 720×1800 약 10초 */}
            <FeatureVideo
              shape="phoneLg"
              src="/landing/video/anshimon.mp4"
              webm="/landing/video/anshimon.webm"
              poster="/landing/video/anshimon.webp"
              label="가게에서 노지 귤과 가격표를 찍으면 귤을 알아보고, 기준시세보다 10% 낮다는 결과와 안심On 카드가 열리는 장면"
              alt="안심On 카드 화면: 노지 귤 현장 가격 250원과 기준시세 279원, 비교 근거 4가지"
            />
          </figure>
        </article>

        <article
          id="before"
          data-stop
          className={`${b.stop} ${f.row} ${f.rowReverse}`}
          aria-labelledby="before-title"
        >
          <figure className={`${f.figure} ${m.reveal}`}>
            {/* 영상: /landing/video/before.mp4 (+ .webm), 세로 약 6초 */}
            <FeatureVideo
              src="/landing/video/before.mp4"
              webm="/landing/video/before.webm"
              poster="/landing/video/before.webp"
              label="가까운 경동시장을 둘러보고 제철과 시세 탭에서 오늘의 기준시세를 보는 장면"
              alt="오늘 기준시세 화면: 귤·배·단감·대파·사과의 전통시장과 대형마트 가격"
            />
          </figure>
          <div className={`${f.copy} ${m.reveal}`}>
            <p className={b.kicker}>방문 전 · 오늘의 기준시세</p>
            <h2 id="before-title" className={f.h3}>
              가기 전에, 오늘 시세부터.
            </h2>
            <p className={b.leadSm}>
              전통시장과 대형마트 가격을 나란히 보여 드리고, 지금 제철인 품목을 먼저 올려요. 손님이
              스스로 시장을 찾아오게 하는 첫 화면이에요.
            </p>
            <div className={b.chipRow}>
              <span className={b.tag}>aT 농산물 가격정보</span>
              <span className={b.tag}>농촌진흥청 이달의 식재료</span>
            </div>
          </div>
        </article>

        <article
          id="store"
          data-stop
          className={`${b.stop} ${f.row}`}
          aria-labelledby="store-title"
        >
          <div className={`${f.copy} ${m.reveal}`}>
            <p className={b.kicker}>구매 · 파는 가게 안내</p>
            <h2 id="store-title" className={f.h3}>
              납득했다면, 파는 가게로 바로.
            </h2>
            <p className={b.leadSm}>
              품목을 고르면 시장 지도에 그 품목을 파는 점포만 남아요. 경동시장에서 사과를 고르면
              실제 상호 {FACTS.appleStores}곳이 표시돼요.
            </p>
            <div className={b.chipRow}>
              <span className={b.tag}>소상공인시장진흥공단 상가정보</span>
              <span className={b.tag}>업종 기준 · 상인 확인 전</span>
            </div>
          </div>
          <figure className={`${f.figure} ${m.reveal}`}>
            {/* 영상: /landing/video/store.mp4 (+ .webm), 세로 약 6초 */}
            <FeatureVideo
              src="/landing/video/store.mp4"
              webm="/landing/video/store.webm"
              poster="/landing/video/store.webp"
              label={`사과를 검색하면 지도에 사과 파는 점포 ${FACTS.appleStores}곳이 남고, 점포를 고르는 장면`}
              alt={`경동시장 지도에서 사과 파는 점포 ${FACTS.appleStores}곳을 핀과 목록으로 보여 주는 화면`}
            />
          </figure>
        </article>
      </div>

      <section
        id="merchant"
        data-stop
        className={`${b.stop} ${b.soft}`}
        aria-labelledby="merchant-title"
      >
        <div className={b.inner}>
          <div className={b.headBlock}>
            <p className={b.kicker}>소상공인 홍보</p>
            <h2 id="merchant-title" className={`${b.h2} ${m.reveal}`}>
              광고비 없이,
              <br />
              손님이 손님을 데려와요.
            </h2>
            <p className={b.lead}>
              상인도 관리자도 가격을 입력하지 않아요. 손님이 비교하려고 찍은 사진 한 장이 쌓여
              시장의 가격표가 돼요.
            </p>
          </div>
          <ol className={`${f.loop} ${m.reveal}`}>
            {LOOP.map((x, i) => (
              <li
                key={x.title}
                className={`${m.scan} ${x.key ? f.loopKey : ''}`}
                style={{ animationDelay: `${i * 1.5}s` }}
              >
                <span className={`${b.mono} ${f.loopNo}`}>{i + 1}</span>
                <span className={f.loopTitle}>{x.title}</span>
                <span className={f.loopText}>{x.text}</span>
              </li>
            ))}
          </ol>
          <figure className={`${b.bare} ${m.reveal}`}>
            {/* 영상: /landing/video/merchant.mp4 (+ .webm), 가로 1280×960 */}
            <FeatureVideo
              shape="panel"
              ratio="16 / 9"
              fit="contain"
              src="/landing/video/merchant.mp4"
              webm="/landing/video/merchant.webm"
              poster="/landing/video/merchant.webp"
              label="안심On 카드에 가게 이름이 함께 담기고, 그 가게 화면에서 파는 품목과 길 안내를 보는 장면"
              alt="안심On 카드와 그 가게의 점포 화면"
            />
          </figure>
          <div className={f.noRank}>
            <strong>순위는 매기지 않아요</strong>
            <span>
              가게 순위나 리더보드 대신, 정직한 시세가 바가지를 줄이고 공정한 경쟁을 만들어요.
            </span>
          </div>
        </div>
      </section>

      <section className={b.white}>
        <div className={`${b.inner} ${f.bodyPlain}`}>
          <article
            id="tools"
            data-stop
            className={`${b.stop} ${f.row} ${f.rowReverse}`}
            aria-labelledby="tools-title"
          >
            <figure className={`${f.figureHalf} ${m.reveal}`}>
              {/* 영상: /landing/video/tools.mp4 (+ .webm), 가로 1280×960 */}
              <FeatureVideo
                shape="panel"
                ratio="4 / 3"
                fit="contain"
                src="/landing/video/tools.mp4"
                webm="/landing/video/tools.webm"
                poster="/landing/video/tools.webp"
                label="상인 화면에서 양파 바겐세일 정보를 올리는 장면(시연 모드)"
                alt="상인 홈: 바겐세일 정보 올리기와 오늘 올린 세일"
              />
            </figure>
            <div className={`${f.copy} ${f.copyHalf} ${m.reveal}`}>
              <p className={b.kicker}>상인 도구</p>
              <h2 id="tools-title" className={f.h3}>
                가게에서는, 오늘의 바겐세일까지.
              </h2>
              <p className={b.leadSm}>
                상인이 바겐세일 정보를 올리면 파는 가게 목록과 지도에 함께 보여요. 상인도 관리자도
                가격을 따로 입력하지 않아요.
              </p>
              <ul className={`${b.chipRow} ${b.bare}`}>
                {MERCHANT_TOOLS.map((x) => (
                  <li key={x} className={b.chip}>
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          </article>

          <article
            id="after"
            data-stop
            className={`${b.stop} ${f.afterArticle}`}
            aria-labelledby="after-title"
          >
            <div className={`${f.afterTop} ${m.reveal}`}>
              <div className={f.afterHead}>
                <p className={b.kicker}>구매 후 · 장바구니와 물어보기</p>
                <h2 id="after-title" className={f.h3}>
                  사고 나서도, 끝까지 쓰게.
                </h2>
                <p className={b.leadSm}>
                  레시피는 장바구니에서 이달 제철 재료로 골라요. 손질법과 보관법은 결과 화면에서
                  손질 · 보관을 누르거나 대화로 물어보면, 근거 문서와 출처를 붙여 답해요. 근거에
                  없는 내용은 지어내지 않고 "적혀 있지 않아요"라고 답해요.
                </p>
              </div>
            </div>
            <div className={`${f.afterGrid} ${m.reveal}`}>
              <figure>
                {/* 영상: /landing/video/recipe.mp4 (+ .webm), 세로 */}
                <FeatureVideo
                  shape="panel"
                  height={360}
                  frame
                  src="/landing/video/recipe.mp4"
                  webm="/landing/video/recipe.webm"
                  poster="/landing/video/recipe.webp"
                  label="장바구니에서 레시피에서 고르기를 누르고, 제철 레시피 과일겉절이의 재료와 만드는 법을 보는 장면"
                  alt="레시피 화면: 과일겉절이 재료마다 이 시장에서 파는 점포 수와 만드는 법"
                />
                <figcaption>
                  <strong>레시피 추천</strong>
                  <span>
                    장바구니에서 "레시피에서 고르기"를 누르면 이달 제철 재료로 만드는 레시피를 골라
                    드려요. 재료마다 이 시장에서 파는 점포 수를 알려 드리고, 시장 밖 재료는 따로
                    표시해요.
                  </span>
                </figcaption>
              </figure>
              <figure>
                {/* 영상: /landing/video/prep.mp4 (+ .webm), 세로 */}
                <FeatureVideo
                  shape="panel"
                  height={360}
                  frame
                  src="/landing/video/prep.mp4"
                  webm="/landing/video/prep.webm"
                  poster="/landing/video/prep.webp"
                  label="대파 결과 화면에서 손질을 누르면 근거 문서와 출처가 붙은 손질법이 나오는 장면"
                />
                <figcaption>
                  <strong>손질법</strong>
                  <span>
                    결과 화면에서 손질을 누르면 그 품목의 손질법을 근거 문서의 출처, 답한 모델과
                    함께 보여 드려요. 고르는 법 · 보관 · 제철도 같은 방법으로 물어봐요.
                  </span>
                </figcaption>
              </figure>
              <figure>
                {/* 영상: /landing/video/storage.mp4 (+ .webm), 세로 */}
                <FeatureVideo
                  shape="panel"
                  height={360}
                  frame
                  src="/landing/video/storage.mp4"
                  webm="/landing/video/storage.webm"
                  poster="/landing/video/storage.webp"
                  label='"대파 냉동해도 돼요?" 질문과 근거가 붙은 답'
                  alt="물어보기 화면: 대파 보관 방법과 출처(농촌진흥청 이달의 식재료)"
                />
                <figcaption>
                  <strong>보관법</strong>
                  <span>
                    "대파 냉동해도 돼요?"처럼 대화로 물어보면 농촌진흥청 이달의 식재료 같은 공식
                    자료를 근거로 답해요.
                  </span>
                </figcaption>
              </figure>
            </div>
          </article>
        </div>
      </section>

      <section id="why" data-stop className={`${b.stop} ${b.white}`} aria-labelledby="why-title">
        <div className={b.inner}>
          <div className={f.whyTop}>
            <div className={f.whyHead}>
              <p className={b.kicker}>왜 경동시장인가</p>
              <h2 id="why-title" className={`${b.h2} ${m.reveal}`}>
                실제 데이터가 있는 시장에서,
                <br />
                비어 있는 칸을 채웁니다.
              </h2>
              <p className={b.lead}>
                경동시장에는 이 시장의 실제 시세와 점포 목록이 공공데이터로 있어요. 그런데 상품
                앞에서 비교할 화면도, 시장 안 위치도 없어요.
              </p>
            </div>
            <div className={f.whyCard}>
              <strong>상가정보 식품 점포</strong>
              <CountUp value={FACTS.stores} suffix="곳" className={b.stat} />
              <span className={f.whyCardSub}>이름은 있는데, 시장 안 위치는 없어요</span>
              <span className={b.source}>소상공인시장진흥공단 상가(상권)정보 · 팀 API 확인</span>
            </div>
          </div>
          <div className={b.tableWrap}>
            <table className={`${b.table} ${f.whyTable} ${m.reveal}`}>
              <caption className="sr-only">경동시장에 있는 것, 비어 있는 것, 채우는 것</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">구분</span>
                  </th>
                  <th scope="col">경동시장에 있는 것</th>
                  <th scope="col">비어 있는 것</th>
                  <th scope="col">Market-On이 채우는 것</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">시세</th>
                  <td>
                    <span className={f.cellTitle}>aT 소매가격 조사처</span>
                    <span className={f.cellText}>
                      이 시장 가격이 공공데이터로 나와요. 대파 1단 경동시장 2,128원, 대형유통 평균
                      2,319원
                    </span>
                    <span className={f.cellSource}>aT 기간별 소매가격</span>
                  </td>
                  <td>상품 앞에서 비교할 화면</td>
                  <td className={f.fill}>기준시세 대비 ±%</td>
                </tr>
                <tr>
                  <th scope="row">점포</th>
                  <td>
                    <span className={f.cellTitle}>상가정보 식품 점포 {FACTS.stores}곳</span>
                    <span className={f.cellText}>
                      {STORE_SPLIT.map(([name, n]) => `${name} ${n}`).join(', ')}
                    </span>
                  </td>
                  <td>시장 안 위치. 대부분이 시장 건물 하나의 같은 좌표이고 호수도 비어 있어요.</td>
                  <td className={f.fill}>업종별 점포 지도 · 파는 점포 강조</td>
                </tr>
                <tr>
                  <th scope="row">손님</th>
                  <td>
                    <span className={f.cellTitle}>처음 오는 젊은 손님</span>
                    <span className={f.cellText}>
                      2022년 말 경동1960 이후 시장을 처음 찾는 젊은 층이 늘었어요.
                    </span>
                    <span className={f.cellSource}>서울신문 · 내 손안에 서울</span>
                  </td>
                  <td>무엇을 보고 골라야 하는지에 대한 기준</td>
                  <td className={f.fill}>확인 포인트 + 출처</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className={f.darkNote}>
            <p>
              판단 근거는 Market-On이,
              <br />
              선택은 사용자가.
            </p>
            <span>살까 말까, 이유를 켜 드릴게요.</span>
          </div>
        </div>
      </section>

      <section id="trust" data-stop className={`${b.stop} ${b.soft}`} aria-labelledby="trust-title">
        <div className={b.inner}>
          <div className={b.headBlock}>
            <p className={b.kicker}>믿을 수 있는 이유</p>
            <h2 id="trust-title" className={`${b.h2} ${m.reveal}`}>
              숫자는 코드가,
              <br />
              설명은 근거 안에서만.
            </h2>
          </div>
          <ol className={`${f.tech} ${m.reveal}`}>
            {TECH.map((x, i) => (
              <li key={x.no} className={m.scanSlow} style={{ animationDelay: `${i * 1.2}s` }}>
                <span className={`${b.mono} ${f.techNo}`}>{x.no}</span>
                <span className={f.techTitle}>{x.title}</span>
                <span className={f.techText}>{x.text}</span>
              </li>
            ))}
            <li className={`${f.techLast} ${m.pulse}`}>
              <span className={`${b.mono} ${f.techNo}`}>6 · 검증</span>
              <span className={f.techTitle}>값 대조</span>
              <span className={f.techText}>
                숫자, 단위, 문구를 근거와 대조해 틀린 문장을 지우고 출처를 붙여요.
              </span>
            </li>
          </ol>
          <a href="#sources" className={f.inkLink}>
            쓰는 자료와 API 출처 전체 보기
          </a>
        </div>
      </section>

      <section
        id="proof"
        data-stop
        className={`${b.stop} ${b.white}`}
        aria-labelledby="proof-title"
      >
        <div className={b.inner}>
          <div className={b.headBlock}>
            <p className={b.kicker}>검증</p>
            <h2 id="proof-title" className={`${b.h2} ${m.reveal}`}>
              정말 될까요? 직접 재 봤어요.
            </h2>
          </div>
          <div className={f.proof}>
            <div>
              <span className={b.stat}>0.6초</span>
              <span className={f.proofLabel}>사진 한 장으로 품목 · 품종 · 가격</span>
              <span className={f.proofText}>
                "노지 귤 1개 250원" 가격표 → 귤(확신도 1.00) · 노지 · 250원
              </span>
            </div>
            <div>
              <span className={`${b.stat} ${f.signalText}`}>
                ▲18% <span className={f.dotSep}>·</span> ▼23%
              </span>
              <span className={f.proofLabel}>같은 2,000원도 품종 따라 달라요</span>
              <span className={f.proofText}>후지 1,690원 대비, 홍로 2,590원 대비</span>
            </div>
            <div>
              <span className={b.stat}>0</span>
              <span className={f.proofLabel}>지어낸 답</span>
              <span className={f.proofText}>
                "단감 몇 달 보관?" → 근거 없음 → "적혀 있지 않아요"
              </span>
            </div>
            <div>
              <span className={b.stat}>{FACTS.appleStores}곳</span>
              <span className={f.proofLabel}>사과 파는 점포</span>
              <span className={f.proofText}>경동시장에서 열면 실제 상호로 표시</span>
            </div>
            <div>
              <span className={b.stat}>8초 → 0초</span>
              <span className={f.proofLabel}>"대파 냉동해도 돼요?"</span>
              <span className={f.proofText}>농사로 출처로 답하고, 같은 질문은 캐시로 바로</span>
            </div>
            <div>
              <CountUp value={FACTS.tests} suffix="개" className={b.stat} />
              <span className={f.proofLabel}>자동 테스트 통과</span>
              <span className={f.proofText}>검수 중 발견한 문제 7개 수정</span>
            </div>
          </div>
          <p className={b.note}>팀 개발 검증 기록</p>
        </div>
      </section>

      <section
        id="impact"
        data-stop
        className={`${b.stop} ${b.white}`}
        aria-labelledby="impact-title"
      >
        <div className={b.inner}>
          <div className={b.headBlock}>
            <p className={b.kicker}>기대효과 · 지속성</p>
            <h2 id="impact-title" className={`${b.h2} ${m.reveal}`}>
              대회가 끝나도 계속 켜져 있도록.
            </h2>
          </div>
          <div className={f.impact}>
            <div>
              <CountUp value={FACTS.stores} suffix="곳" className={f.bigStat} />
              <span className={f.proofLabel}>경동시장 점포 온라인 지도 연결</span>
              <span className={b.source}>소상공인 상가정보 식품 점포를 업종별 지도에 연결</span>
            </div>
            <div>
              <span className={f.bigStat}>연 600만 원</span>
              <span className={f.proofLabel}>시장 한 곳 운영 비용</span>
              <span className={b.source}>디지털전통시장 2년 최대 4억 원 대비 연 비용 약 1/33</span>
            </div>
            <div>
              <span className={f.bigStat}>27개 시장</span>
              <span className={f.proofLabel}>손익분기</span>
              <span className={b.source}>연 운영비 1.6억 원 ÷ 시장당 연 600만 원</span>
            </div>
          </div>
          <ol className={`${f.phases} ${m.reveal}`}>
            <li>
              <span className={b.mono}>단기</span>
              <strong>국고사업 연계</strong>
              <span>시장경영지원 예산으로 시장 단위 도입</span>
            </li>
            <li>
              <span className={b.mono}>중기</span>
              <strong>시장 · 상인 홍보</strong>
              <span>바겐세일 정보와 가게 노출로 홍보 채널화</span>
            </li>
            <li>
              <span className={b.mono}>장기</span>
              <strong>시세 데이터</strong>
              <span>손님이 쌓은 현장 시세를 데이터로</span>
            </li>
          </ol>
        </div>
      </section>

      <section
        id="sources"
        data-stop
        className={`${b.stop} ${b.soft}`}
        aria-labelledby="sources-title"
      >
        <div className={`${b.inner} ${f.innerTight}`}>
          <div className={`${b.headTight} ${f.sourceHead}`}>
            <p className={b.kicker}>쓰는 자료와 출처</p>
            <h2 id="sources-title" className={`${b.h2sm} ${m.reveal}`}>
              모든 숫자와 근거는 어디서 왔는지 밝혀요.
            </h2>
            <p className={b.leadSm}>
              화면의 가격과 지식 아래에는 항상 출처와 조사일을 함께 적어요.
            </p>
          </div>
          <div className={b.tableWrap}>
            <table className={`${b.table} ${f.sourceTable} ${m.reveal}`}>
              <caption className="sr-only">쓰는 자료와 API</caption>
              <thead>
                <tr>
                  <th scope="col">구분</th>
                  <th scope="col">자료 · API</th>
                  <th scope="col">제공</th>
                  <th scope="col">쓰는 곳</th>
                  <th scope="col">출처</th>
                </tr>
              </thead>
              <tbody>
                {SOURCES.map((x) => (
                  <tr key={x.name}>
                    <td>
                      <span className={b.tag}>{x.kind}</span>
                    </td>
                    <th scope="row">{x.name}</th>
                    <td>{x.by}</td>
                    <td>{x.use}</td>
                    <td>
                      <a href={x.url} target="_blank" rel="noopener noreferrer">
                        {hostOf(x.url)}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={b.note}>
            각 자료의 이용 조건(공공누리 유형, API 이용약관)에 따라 표시해요.
          </p>
        </div>
      </section>

      <section data-stop className={`${b.stop} ${b.closing}`} aria-label="마무리">
        <div className={`${b.inner} ${b.closingInner}`}>
          <p className={b.closingTitle}>
            사진 한 장이면,
            <br />
            이유가 켜져요.
          </p>
          <p className={b.closingLead}>
            경동시장 식품 점포 {FACTS.stores}곳에서 지금 바로 써 볼 수 있어요.
          </p>
          <div className={b.btnRowWide}>
            <a href={APP_START} className={`${b.btn} ${b.btnOnDark}`} onClick={startWeb}>
              웹페이지로 시작하기
            </a>
            <Link to="/intro/team" className={`${b.btn} ${b.btnDarkSoft}`}>
              만든 사람들 보기
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function FlowStep({
  no,
  text,
  on,
  last,
}: {
  no: string;
  text: string;
  on?: boolean;
  last: boolean;
}) {
  return (
    <>
      <li className={`${f.flowStep} ${on ? f.flowOn : ''}`}>
        <span className={`${b.mono} ${f.flowNo}`}>{no}</span>
        {text}
      </li>
      {!last && (
        <li aria-hidden="true" className={f.flowArrow}>
          →
        </li>
      )}
    </>
  );
}
