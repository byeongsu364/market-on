import { Link } from 'react-router-dom';
import BrandLayout from './BrandLayout';
import { APP_START, FACTS } from './facts';
import { useStartWeb } from './motion';
import b from './brand.module.css';
import m from './motion.module.css';
import t from './team.module.css';

/**
 * 팀 소개(/intro/team) — 2026-11-27 디자인 시안 team.html.
 * 팀원 카드는 넣지 않음(개발 전달 메모). 팀 소개 · 지도교수, 역할 분담, 바이브코딩 도구, 개발 과정.
 */
const ROLES = [
  { title: '온톨로지 · RAG', text: '품목, 품종, 확인 포인트의 관계와 근거 문서' },
  { title: '사진 인식 · 확인 포인트', text: '찍은 사진에서 품목과 가격표 글자 읽기' },
  { title: '시세 · 안심On', text: 'aT 기준시세 계산과 안심On 카드' },
  { title: '화면 · 지도 · 발표', text: '모바일 웹, 시장 점포 지도, 홈페이지' },
];

const TOOLS = ['Claude Code', 'Cursor', 'ChatGPT'];

const TIMELINE = [
  {
    when: '대회 전',
    title: '설계와 데이터 조사',
    text: '화면 초안, 온톨로지 설계, 공공데이터 확인',
  },
  {
    when: '14:30 – 24:00',
    title: '1 · 2차 개발',
    text: '품목 인식, 기준시세 비교, 근거 문서 검색 연결',
  },
  { when: '00:00 – 05:00', title: '3차 개발', text: '점포 지도, 안심On, 상인 도구' },
  {
    when: '05:00 – 08:00',
    title: '점검과 배포',
    text: `자동 테스트 ${FACTS.tests}개 통과, 문제 7개 수정`,
  },
  { when: '08:00', title: '제출', text: 'marketon.laea.io 배포', last: true },
];

export default function TeamPage() {
  const startWeb = useStartWeb();
  return (
    <BrandLayout page="team">
      <section data-stop className={`${b.stop} ${b.white}`} aria-labelledby="team-title">
        <div className={`${b.inner} ${t.heroInner}`}>
          <div className={t.heroRow}>
            <div className={t.heroHead}>
              <p className={b.kicker}>팀 소개</p>
              <h1 id="team-title" className={b.h1}>
                전통시장에 불을 켜는
                <br />네 사람
              </h1>
              <p className={b.lead}>
                경복대학교 소프트웨어융합학과 학생들이 바이브코딩으로 설계부터 배포까지 직접
                만들었어요.
              </p>
            </div>
            <p className={t.advisor}>
              <span>지도교수</span>
              <strong>신효영</strong>
            </p>
          </div>
        </div>
      </section>

      <section id="roles" data-stop className={`${b.stop} ${b.soft}`} aria-labelledby="roles-title">
        <div className={b.inner}>
          <div className={b.headTight}>
            <p className={b.kicker}>함께 만든 방식</p>
            <h2 id="roles-title" className={`${b.h2sm} ${m.reveal}`}>
              기반 기술 단위로 나눠서, 한 번에 이었어요.
            </h2>
          </div>
          <ul className={`${b.bare} ${t.roles}`}>
            {ROLES.map((x) => (
              <li key={x.title}>
                <strong>{x.title}</strong>
                <span>{x.text}</span>
              </li>
            ))}
          </ul>
          <div className={t.tools}>
            <span className={t.toolsLabel} id="vibe-tools">
              바이브코딩 도구
            </span>
            <ul className={`${b.bare} ${b.chipRow}`} aria-labelledby="vibe-tools">
              {TOOLS.map((x) => (
                <li key={x} className={`${b.chip} ${b.chipWhite}`}>
                  {x}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section
        id="timeline"
        data-stop
        className={`${b.stop} ${b.white}`}
        aria-labelledby="timeline-title"
      >
        <div className={b.inner}>
          <div className={b.headTight}>
            <p className={b.kicker}>개발 과정</p>
            <h2 id="timeline-title" className={`${b.h2sm} ${m.reveal}`}>
              하룻밤 사이, 설계에서 배포까지.
            </h2>
          </div>
          <ol className={`${b.bare} ${t.timeline} ${m.reveal}`}>
            {TIMELINE.map((x) => (
              <li key={x.title} className={x.last ? t.lastStep : undefined}>
                <span className={t.node} aria-hidden="true" />
                <span className={b.mono}>{x.when}</span>
                <strong>{x.title}</strong>
                <span className={t.stepText}>{x.text}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section data-stop className={`${b.stop} ${b.closing}`} aria-label="마무리">
        <div className={`${b.inner} ${b.closingInner}`}>
          <p className={b.closingTitle}>
            전통시장에 불을 켜다,
            <br />
            Market-On.
          </p>
          <p className={b.closingLead}>판단 근거는 Market-On이, 선택은 손님이.</p>
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
