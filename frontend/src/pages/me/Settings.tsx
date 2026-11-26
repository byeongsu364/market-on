import { useSession, type TextSize } from '../../store/session';
import AppHeader from '../../components/layout/AppHeader';
import Icon from '../../components/common/Icon';
import { Chip, ChipRow } from '../../components/common/Chip';
import { LANGUAGE_NAMES } from './languages';
import { useT } from '../../i18n';
import type { Language } from '../../types/contract';
import s from './me.module.css';

// Settings: 언어, 글자 크기, 화면 테마. 번역은 한국어만(다른 언어는 한국어로 대신 보임).
export default function Settings() {
  const t = useT();
  const session = useSession();
  const languages = Object.keys(LANGUAGE_NAMES) as Language[];
  const sizes: { value: TextSize; label: string }[] = [
    { value: 'normal', label: t('meTextNormal') },
    { value: 'large', label: t('meTextLarge') },
    { value: 'xlarge', label: t('meTextXLarge') },
  ];
  const themes = [
    { value: 'system', label: t('system') },
    { value: 'light', label: t('light') },
    { value: 'dark', label: t('dark') },
  ] as const;
  return (
    <>
      <AppHeader back="/me" />
      <div className={`${s.main} ${s.settings}`}>
        <h1 className={s.title}>{t('meSettings')}</h1>
        <fieldset className={s.group}>
          <legend className={s.groupHead}>{t('meLanguage')}</legend>
          <div className={s.radios}>
            {languages.map((l) => (
              <div key={l}>
                <label className={s.radio} lang={l}>
                  <span className={s.radioName}>{LANGUAGE_NAMES[l]}</span>
                  {l !== 'ko' && <span className={s.radioNote}>{t('meTranslationPending')}</span>}
                  <input
                    type="radio"
                    name="language"
                    value={l}
                    checked={session.language === l}
                    onChange={() => session.setLanguage(l)}
                  />
                  <span className={s.radioMark} aria-hidden="true">
                    {session.language === l && <Icon name="check" size={16} strokeWidth={2.4} />}
                  </span>
                </label>
              </div>
            ))}
          </div>
        </fieldset>
        <div className={s.group}>
          <h2 className={s.groupHead}>{t('meTextSize')}</h2>
          <ChipRow label={t('meTextSize')} wrap>
            {sizes.map((o) => (
              <Chip
                key={o.value}
                pressed={session.textSize === o.value}
                onClick={() => session.setTextSize(o.value)}
              >
                {o.label}
              </Chip>
            ))}
          </ChipRow>
          <p className={s.help}>{t('meTextSizeHelp')}</p>
        </div>
        <div className={s.group}>
          <h2 className={s.groupHead}>{t('meTheme')}</h2>
          <ChipRow label={t('meTheme')} wrap>
            {themes.map((o) => (
              <Chip
                key={o.value}
                pressed={session.theme === o.value}
                onClick={() => session.setTheme(o.value)}
              >
                {o.label}
              </Chip>
            ))}
          </ChipRow>
        </div>
      </div>
    </>
  );
}
