import { useT } from '../../i18n';
import type { Language } from '../../types/contract';

export default function TranslationNotice({
  translated,
  original,
  lang,
}: {
  translated?: boolean;
  original?: string | null;
  lang?: Language;
}) {
  const t = useT();
  if (!original || !lang || lang === 'ko') return null;
  return translated ? (
    <details>
      <summary>
        {t('machineTranslation')} · {t('viewOriginal')}
      </summary>
      <p lang="ko">{original}</p>
    </details>
  ) : (
    <small>{t('translationUnavailable')}</small>
  );
}
