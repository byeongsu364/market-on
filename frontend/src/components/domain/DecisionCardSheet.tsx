import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import Sheet from '../common/Sheet';
import ErrorBox from '../common/ErrorBox';
import Icon from '../common/Icon';
import { drawCard, type CardData } from '../../utils/decisionCard';
import { getInSeason } from '../../api/items';
import { seoulDay } from '../../utils/sale';
import s from './domain.module.css';

/**
 * 판단 카드 시트(2026-11-27 시안): 머리에 이름·저장·공유·닫기, 가운데 카드 이미지(레시피 보기는 요청으로 뺌).
 * 카드는 이 기기에서 PNG로 그림(사진은 서버로 다시 보내지 않음). 제철은 이달의 식재료 응답으로 채움.
 */
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
    const season = getInSeason(Number(seoulDay().slice(5, 7)))
      .then((list) => list.find((x) => x.item_id === data.itemId)?.label ?? null)
      .catch(() => undefined);
    season
      .then((value) => drawCard(document.createElement('canvas'), { ...data, season: value }))
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
  const share = async () => {
    if (!image) return;
    try {
      await navigator.share({ files: [image.file] });
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === 'AbortError'))
        setError('decisionCardShareError');
    }
  };
  return (
    <Sheet
      title={t('decisionCardTitle')}
      heading={
        <span className={s.cardBrand}>
          안심<span>On</span>
        </span>
      }
      onClose={onClose}
      actions={
        image && (
          <div className={s.cardHeadActions}>
            <a className={s.pillButton} href={image.url} download={data.filename}>
              <Icon name="download" size={18} />
              {t('decisionCardSave')}
            </a>
            {canShare && (
              <button type="button" className={s.pillButton} onClick={() => void share()}>
                <Icon name="share" size={18} />
                {t('decisionCardShare')}
              </button>
            )}
          </div>
        )
      }
    >
      {!image && !error && (
        <p role="status" aria-busy="true">
          {t('decisionCardLoading')}
        </p>
      )}
      {error && <ErrorBox message={t(error)} />}
      {image && <img className={s.cardPreview} src={image.url} alt={data.alt} />}
      <p className="caption">{t('decisionCardPrivacy')}</p>
    </Sheet>
  );
}
