import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import BrandLayout from './BrandLayout';
import { APP_START, SITE_HOST, SITE_START_URL, SITE_URL } from './facts';
import { useStartWeb } from './motion';
import b from './brand.module.css';
import m from './motion.module.css';
import d from './download.module.css';

/**
 * 다운로드(/intro/download) — 2026-11-27 디자인 시안 download.html을 지금 서비스에 맞춤.
 * App Store · Google Play 앱은 없어요(웹 앱, PWA). 스토어 배지 대신 홈 화면에 추가하는 법과
 * 웹으로 바로 시작, QR(발표 마지막에 청중이 직접 열어 보게 240px)을 보여 줘요.
 */
const INSTALL = [
  {
    label: 'iPhone · Safari',
    title: '공유 → 홈 화면에 추가',
    steps: [
      `Safari로 ${SITE_HOST}를 열어요.`,
      '아래쪽 공유 버튼(네모에 위쪽 화살표)을 눌러요.',
      '"홈 화면에 추가"를 고르고 "추가"를 눌러요.',
    ],
  },
  {
    label: 'Android · Chrome',
    title: '메뉴 → 앱 설치 · 홈 화면에 추가',
    steps: [
      `Chrome으로 ${SITE_HOST}를 열어요.`,
      '오른쪽 위 메뉴(⋮)를 눌러요.',
      '"앱 설치" 또는 "홈 화면에 추가"를 고르고 "설치"를 눌러요.',
    ],
  },
];

const COMPARE: { row: string; home: string; web: string }[] = [
  { row: '시작', home: '브라우저에서 한 번 홈 화면에 추가', web: '주소나 QR로 바로' },
  { row: '열기', home: '홈 화면 아이콘, 주소창 없이', web: '브라우저, PC에서도' },
  { row: '찍기 · 안심On', home: '같아요', web: '같아요' },
  {
    row: '단골 가게 바겐세일 알림',
    home: '웹 푸시로 받아요(로그인 필요). iPhone은 iOS 16.4 이상',
    web: 'Android · PC 브라우저에서 웹 푸시로 받아요(로그인 필요). iPhone은 홈 화면에 추가해야 받아요',
  },
];

const FAQ = [
  {
    q: '앱을 꼭 설치해야 하나요?',
    a: '아니요. 웹에서 같은 기능을 쓸 수 있어요. 시장에서 처음 써 본다면 QR로 웹을 열어 바로 써 보세요. 자주 쓴다면 홈 화면에 추가해 앱처럼 열 수 있어요.',
  },
  {
    q: 'App Store나 Google Play에서 받을 수 있나요?',
    a: '스토어에서 받는 앱은 따로 없어요. 웹 주소로 바로 쓰고, 홈 화면에 추가하면 아이콘으로 열려요.',
  },
  {
    q: '가입해야 하나요?',
    a: '손님은 가입 없이 써요. 단골 가게의 바겐세일 알림을 받으려면 로그인해요. 상인과 시장 관리자는 로그인해서 써요.',
  },
  {
    q: '찍은 사진은 어디에 쓰이나요?',
    a: '품목과 가격표 글자를 읽는 데만 쓰고, 사진의 위치 정보는 지운 뒤 저장해요.',
  },
  {
    q: '지금 어느 시장에서 쓸 수 있나요?',
    a: '서울 경동시장에서 써 볼 수 있어요. 다른 시장은 입점 신청을 받아 넓혀 가요.',
  },
];

/** 배포 주소로 가는 QR(오류 정정 M, 검정 ink) */
function useSiteQr() {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toString(SITE_URL, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 0,
      // QR 그림 파일 안의 색이라 토큰 대신 값(ink · canvas)
      color: { dark: '#171717', light: '#ffffff' },
    })
      .then((s) => alive && setSvg(s))
      .catch(() => {
        /* 못 만들면 주소 글자와 복사 버튼만 */
      });
    return () => {
      alive = false;
    };
  }, []);
  return svg;
}

export default function DownloadPage() {
  const startWeb = useStartWeb();
  const qr = useSiteQr();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SITE_START_URL);
      setCopied(true);
    } catch {
      window.prompt('주소를 복사하세요', SITE_START_URL);
    }
  };

  return (
    <BrandLayout page="download">
      <section data-stop className={`${b.stop} ${d.hero}`} aria-labelledby="download-title">
        <div className={d.heroInner}>
          <div className={d.heroText}>
            <p className={b.kicker}>다운로드</p>
            <h1 id="download-title" className={b.h1}>
              홈 화면에 추가해도,
              <br />
              웹으로 바로 써도.
            </h1>
            <p className={b.lead}>
              스토어에서 받는 앱은 따로 없어요. 웹 주소 하나로 바로 쓰고, 자주 간다면 휴대폰 홈
              화면에 추가해 앱처럼 열어요.
            </p>
            <div className={b.btnRow}>
              <a href={APP_START} className={`${b.btn} ${b.btnPrimary}`} onClick={startWeb}>
                웹으로 바로 시작하기
              </a>
              <a href="#install" className={`${b.btn} ${b.btnSurface}`}>
                홈 화면에 추가하는 법
              </a>
            </div>
            <ul className={`${b.chipRow} ${b.bare}`} aria-label="쓰는 조건">
              {['무료', '손님은 가입 없음', 'iPhone · Android · PC'].map((x) => (
                <li key={x} className={`${b.chip} ${b.chipWhite}`}>
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <div className={d.qrCard}>
            <div
              className={d.qr}
              role="img"
              aria-label={`${SITE_HOST}로 가는 QR 코드`}
              dangerouslySetInnerHTML={qr ? { __html: qr } : undefined}
            />
            <strong className={d.qrTitle}>휴대폰 카메라로 찍어 주세요</strong>
            <span className={d.qrText}>
              찍으면 휴대폰에서 Market-On이 바로 열려요. 그대로 쓰거나 홈 화면에 추가할 수 있어요.
            </span>
            <span className={d.qrHost}>{SITE_HOST}</span>
            <button type="button" className={d.copy} onClick={copy}>
              {copied ? '복사했어요' : '웹 주소 복사하기'}
            </button>
            <span className="sr-only" aria-live="polite">
              {copied ? '웹 주소를 복사했어요' : ''}
            </span>
          </div>
        </div>
      </section>

      <section
        id="install"
        data-stop
        className={`${b.stop} ${b.white}`}
        aria-labelledby="install-title"
      >
        <div className={b.inner}>
          <div className={b.headTight}>
            <p className={b.kicker}>홈 화면에 추가(설치)</p>
            <h2 id="install-title" className={`${b.h2sm} ${m.reveal}`}>
              설치는 홈 화면에 추가하면 끝이에요.
            </h2>
            <p className={b.leadSm}>
              스토어를 거치지 않아요. 브라우저 메뉴에서 한 번 추가하면 홈 화면 아이콘으로, 주소창
              없이 앱처럼 열려요.
            </p>
          </div>
          <div className={d.installGrid}>
            {INSTALL.map((x) => (
              <article key={x.label} className={`${d.installCard} ${m.reveal}`}>
                <p className={d.cardLabel}>{x.label}</p>
                <h3 className={d.cardTitle}>{x.title}</h3>
                <ol className={d.installSteps}>
                  {x.steps.map((step, i) => (
                    <li key={step}>
                      <span className={d.stepNo} aria-hidden="true">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="compare"
        data-stop
        className={`${b.stop} ${b.soft}`}
        aria-labelledby="compare-title"
      >
        <div className={`${b.inner} ${d.split}`}>
          <div className={`${b.headTight} ${d.splitHead}`}>
            <p className={b.kicker}>홈 화면 설치와 웹</p>
            <h2 id="compare-title" className={`${b.h2sm} ${m.reveal}`}>
              기능은 같아요.
              <br />
              여는 방법만 달라요.
            </h2>
            <p className={b.leadSm}>
              시장에서 처음 써 본다면 웹으로 바로, 자주 간다면 홈 화면에 추가해 두세요.
            </p>
          </div>
          <div className={`${b.tableWrap} ${d.splitTable}`}>
            <table className={`${b.table} ${d.compare} ${m.reveal}`}>
              <caption className="sr-only">홈 화면 설치와 웹 비교</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">구분</span>
                  </th>
                  <th scope="col">홈 화면 설치</th>
                  <th scope="col">웹</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((x) => (
                  <tr key={x.row}>
                    <th scope="row">{x.row}</th>
                    <td>{x.home}</td>
                    <td>{x.web}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section
        id="merchants"
        data-stop
        className={`${b.stop} ${b.white}`}
        aria-labelledby="merchants-title"
      >
        <div className={`${b.inner} ${d.innerMid}`}>
          <div className={b.headTight}>
            <p className={b.kicker}>상인과 시장 관리자</p>
            <h2 id="merchants-title" className={`${b.h2sm} ${m.reveal}`}>
              상인과 시장 관리자도 함께 써요
            </h2>
          </div>
          <div className={d.roleGrid}>
            <article className={`${d.roleCard} ${m.reveal}`}>
              <p className={d.cardLabel}>상인</p>
              <h3 className={d.cardTitle}>내 점포 관리</h3>
              <p className={d.roleText}>
                웹에서 내 점포를 고르고 로그인하면, 가게 위치와 영업 정보, 바겐세일 정보를 직접 맞출
                수 있어요.
              </p>
              <Link to="/signup/merchant" className={d.roleLink}>
                상인으로 시작하기
              </Link>
            </article>
            <article className={`${d.roleCard} ${m.reveal}`}>
              <p className={d.cardLabel}>시장 관리자</p>
              <h3 className={d.cardTitle}>시장 입구 QR 포스터</h3>
              <p className={d.roleText}>
                입구에 붙이면 손님이 시장 지도부터 열어요. 상인 가입 승인도 관리자 화면에서 해요.
              </p>
              <Link to="/join" className={d.roleLink}>
                우리 시장 입점 신청
              </Link>
            </article>
          </div>
        </div>
      </section>

      <section id="faq" data-stop className={`${b.stop} ${b.soft}`} aria-labelledby="faq-title">
        <div className={`${b.inner} ${d.split} ${d.faqSplit}`}>
          <div className={`${b.headTight} ${d.faqHead}`}>
            <p className={b.kicker}>자주 묻는 질문</p>
            <h2 id="faq-title" className={`${b.h2sm} ${m.reveal}`}>
              받기 전에 궁금한 것
            </h2>
          </div>
          <div className={d.faq}>
            {FAQ.map((x) => (
              <details key={x.q}>
                <summary>{x.q}</summary>
                <p>{x.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </BrandLayout>
  );
}
