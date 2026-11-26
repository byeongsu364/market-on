import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import Sheet from '../common/Sheet';
import ErrorBox from '../common/ErrorBox';
import Button from '../common/Button';
import Icon from '../common/Icon';
import { buttonClass } from '../common/buttonClass';
import { drawCard, type CardData } from '../../utils/decisionCard';
import s from './domain.module.css';

export default function DecisionCardSheet({
  data,
  onClose,
}: {
  data: CardData;
  onClose: () => void;
}) {
  const t = useT();
  const [image, setImage] = useState<{ url: string; file: File }>();
  const [error, setError] = useState<'' | 'decisionCardError' | 'decisionCardShareError'>('');
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    drawCard(document.createElement('canvas'), data)
      .then((blob) => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        setImage({ url, file: new File([blob], data.filename, { type: 'image/png' }) });
      })
      .catch(() => {
        if (active) setError('decisionCardError');
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [data]);
  const canShare =
    image &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [image.file] });
  return (
    <Sheet title={t('decisionCardTitle')} onClose={onClose}>
      {!image && !error && (
        <p role="status" aria-busy="true">
          {t('decisionCardLoading')}
        </p>
      )}
      {error && <ErrorBox message={t(error)} />}
      {image && (
        <>
          <img className={s.cardPreview} src={image.url} alt={data.alt} />
          <div className={s.cardActions}>
            <a
              className={buttonClass({ variant: 'primary', grow: true })}
              href={image.url}
              download={data.filename}
            >
              <Icon name="download" size={20} />
              {t('decisionCardSave')}
            </a>
            {canShare && (
              <Button
                grow
                icon={<Icon name="share" size={20} />}
                onClick={async () => {
                  try {
                    await navigator.share({ files: [image.file] });
                  } catch (cause) {
                    if (!(cause instanceof Error && cause.name === 'AbortError'))
                      setError('decisionCardShareError');
                  }
                }}
              >
                {t('decisionCardShare')}
              </Button>
            )}
          </div>
        </>
      )}
      <p className="caption">{t('decisionCardPrivacy')}</p>
    </Sheet>
  );
}
