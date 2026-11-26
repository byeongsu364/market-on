import { useEffect, useState } from 'react';
import { useSession } from '../../store/session';
import { useT } from '../../i18n';
import { LANGUAGE_NAMES } from '../me/languages';
import Button from '../../components/common/Button';
import type { Language } from '../../types/contract';
import s from './welcome.module.css';

/**
 * 처음 들어온 손님: ① 언어 고르기 → ② 단계별 안내 3장(2026-11-27).
 * 언어는 세션 설정(내 정보 > 언어와 화면)과 같은 값이고, 안내는 실제 앱 화면 캡처(public/landing)를 씀.
 */
const LANGS = Object.keys(LANGUAGE_NAMES) as Language[];
// 언어를 고르기 전이라 제목은 다섯 언어로 함께 보여 줌
const PICK_TITLES: Record<Language, string> = {
  ko: '언어를 골라 주세요',
  en: 'Choose your language',
  zh: '请选择语言',
  ja: '言語を選んでください',
  vi: 'Chọn ngôn ngữ',
};
function deviceLanguage(): Language {
  const tag = (typeof navigator !== 'undefined' ? navigator.language : 'ko').toLowerCase();
  return LANGS.find((l) => tag.startsWith(l)) ?? 'ko';
}
const STEPS = [
  { image: '/landing/map.webp', title: 'welcomeStep1Title', body: 'welcomeStep1Body' },
  { image: '/landing/market.webp', title: 'welcomeStep2Title', body: 'welcomeStep2Body' },
  { image: '/landing/result.webp', title: 'welcomeStep3Title', body: 'welcomeStep3Body' },
] as const;

export default function Welcome({ onDone }: { onDone: () => void }) {
  const session = useSession();
  const t = useT();
  const [step, setStep] = useState(-1); // -1: 언어 고르기, 0~2: 안내
  const [picked, setPicked] = useState<Language>(() => {
    try {
      return localStorage.getItem('language') ? session.language : deviceLanguage();
    } catch {
      return session.language;
    }
  });

  // 기기 언어로 미리 고른 값을 바로 적용(버튼·안내 글자도 그 언어로)
  useEffect(() => {
    if (picked !== session.language) session.setLanguage(picked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (step < 0)
    return (
      <section className={s.page} aria-labelledby="welcome-lang">
        <img className={s.logo} src="/brand/logo-light.svg" alt="Market-On" />
        <h1 id="welcome-lang" className={s.pickTitle}>
          <span lang={picked}>{PICK_TITLES[picked]}</span>
        </h1>
        <p className={s.pickOthers} aria-hidden="true">
          {LANGS.filter((l) => l !== picked)
            .map((l) => PICK_TITLES[l])
            .join(' · ')}
        </p>
        <fieldset className={s.langs}>
          <legend className="sr-only">{PICK_TITLES[picked]}</legend>
          {LANGS.map((l) => (
            <label key={l} className={s.lang} data-checked={picked === l} lang={l}>
              <input
                type="radio"
                name="welcome-language"
                value={l}
                checked={picked === l}
                onChange={() => {
                  setPicked(l);
                  session.setLanguage(l);
                }}
              />
              <span>{LANGUAGE_NAMES[l]}</span>
            </label>
          ))}
        </fieldset>
        <div className={s.bottom}>
          <Button
            variant="primary"
            wide
            onClick={() => {
              session.setLanguage(picked);
              setStep(0);
            }}
          >
            {t('welcomeContinue')}
          </Button>
        </div>
      </section>
    );

  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <section className={s.page} aria-labelledby="welcome-step" aria-roledescription="안내">
      <div className={s.topRow}>
        <span className={s.counter}>
          {step + 1} / {STEPS.length}
        </span>
        <button type="button" className={s.skip} onClick={onDone}>
          {t('welcomeSkip')}
        </button>
      </div>
      <div className={s.shot}>
        <img src={current.image} alt="" />
      </div>
      <h1 id="welcome-step" className={s.title}>
        {t(current.title)}
      </h1>
      <p className={s.body}>{t(current.body)}</p>
      <ol className={s.dots} aria-hidden="true">
        {STEPS.map((x, i) => (
          <li key={x.title} data-on={i === step} />
        ))}
      </ol>
      <div className={s.bottom}>
        {step > 0 && (
          <Button variant="surface" onClick={() => setStep(step - 1)}>
            {t('welcomeBack')}
          </Button>
        )}
        <Button variant="primary" grow onClick={() => (last ? onDone() : setStep(step + 1))}>
          {last ? t('welcomeStart') : t('welcomeNext')}
        </Button>
      </div>
    </section>
  );
}
