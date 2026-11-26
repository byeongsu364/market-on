import { useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { recognize } from '../../api/scan';
import { useCamera } from '../../hooks/useCamera';
import { useAction } from '../../hooks/useResource';
import { useRequireMarket } from '../../hooks/useFlows';
import { useMarketMap } from '../../hooks/useMarketMap';
import { useShoppingContext } from '../../hooks/useShoppingContext';
import { useStoreId } from '../../hooks/useResult';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import Icon from '../../components/common/Icon';
import { buttonClass } from '../../components/common/buttonClass';
import { useT } from '../../i18n';
import ScanConfirm from './ScanConfirm';
import ScanManual from './ScanManual';
import s from './scan.module.css';

/** 지금 맥락 점포의 이름(점포 QR이나 지도에서 골라 왔을 때) */
function useStoreName(marketId: string | undefined, storeId: string | undefined) {
  const map = useMarketMap(storeId ? (marketId ?? '') : '');
  return map.data?.stores.find((st) => st.store_id === storeId)?.name;
}

function Camera() {
  const t = useT();
  const ctx = useShoppingContext();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const camera = useCamera();
  const storeId = useStoreId();
  const storeName = useStoreName(ctx.marketId, storeId);
  const [recognized, setRecognized] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const action = useAction(async (file: File) => {
    try {
      const result = await recognize(file);
      setRecognized(file);
      return result;
    } catch (error) {
      if ((error as { status?: number }).status === 503) {
        // 사진 인식이 안 되면 직접 입력으로(같은 주소의 mode=manual)
        navigate(ctx.href('/scan', {}, { mode: 'manual' }), {
          replace: true,
          state: { notice: t('scanUnavailable') },
        });
        throw new Error(t('scanUnavailable'));
      }
      throw error;
    }
  });
  const pick = (file: File | null | undefined) => {
    if (!file) return;
    camera.setFile(file);
    void action.run(file);
  };
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    pick(e.target.files?.[0]);
    e.target.value = '';
  };
  const result = action.data && recognized && recognized === camera.file ? action.data : null;
  const manualHref = ctx.href('/scan', {}, { mode: 'manual' });
  const status = action.loading ? (
    <p role="status" className={s.status}>
      {t('scanRecognizing')}
    </p>
  ) : action.error ? (
    <p role="alert" className={s.status}>
      {action.error}
    </p>
  ) : null;

  if (desktop)
    return (
      <div className={s.web}>
        <div className={s.webPhotoCol}>
          <div
            className={s.webPhoto}
            data-drag={drag}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              pick(e.dataTransfer.files?.[0]);
            }}
          >
            {camera.preview ? (
              <img src={camera.preview} alt={t('scanPhotoAlt')} />
            ) : (
              <div className={s.webEmpty}>
                <Icon name="camera" size={40} />
                <span>{t('scanHint')}</span>
              </div>
            )}
          </div>
          <div className={s.webUploadRow}>
            <label
              className={`${buttonClass({ variant: 'surface', size: 'md' })} ${s.uploadLabel}`}
            >
              <Icon name="image" size={20} />
              {camera.preview ? t('scanUploadAgain') : t('scanUpload')}
              <input
                className={s.fileInput}
                type="file"
                accept="image/*"
                aria-label={t('scanUpload')}
                onChange={onFile}
              />
            </label>
            <p className={s.note}>{t('scanWebPrivacy')}</p>
          </div>
        </div>
        <div className={s.webSide}>
          {result && camera.file ? (
            <ScanConfirm
              key={camera.preview + result.media_id}
              result={result}
              photo={camera.file}
              storeName={storeName}
              storeId={storeId}
              web
            />
          ) : (
            <>
              <h1 className={s.webTitle}>{t('scanTitle')}</h1>
              <p className={s.note}>{t('scanHint')}</p>
              {status}
              <Link className={s.smallLink} to={manualHref}>
                {t('scanManual')}
                <Icon name="chevronRight" size={18} />
              </Link>
            </>
          )}
        </div>
      </div>
    );

  return (
    <section className={s.camera} aria-labelledby="scan-title">
      <h1 className="sr-only" id="scan-title">
        {t('scanTitle')}
      </h1>
      <div className={s.photo}>
        {camera.preview && <img src={camera.preview} alt={t('scanPhotoAlt')} />}
      </div>
      <span className={s.shade} aria-hidden="true" />
      {result ? (
        <button
          type="button"
          className={s.round}
          aria-label={t('scanRetake')}
          onClick={() => camera.setFile(null)}
        >
          <Icon name="back" size={22} />
        </button>
      ) : (
        <Link to={ctx.href('/')} className={s.round} aria-label={t('close')}>
          <Icon name="close" size={22} />
        </Link>
      )}
      {storeName && !result && (
        <div className={s.pillRow} style={{ top: 'calc(var(--safe-top) + 52px)' }}>
          <span className={s.pill}>
            <span className={s.pillDot} />
            {t('scanAtStoreNow').replace('{store}', storeName)}
          </span>
        </div>
      )}
      {!result && (
        <>
          <span className={s.corner} style={{ left: 24, top: 124 }} aria-hidden="true" />
          <span
            className={s.corner}
            style={{ right: 24, top: 124, transform: 'rotate(90deg)' }}
            aria-hidden="true"
          />
          <span
            className={s.corner}
            style={{ right: 24, bottom: 250, transform: 'rotate(180deg)' }}
            aria-hidden="true"
          />
          <span
            className={s.corner}
            style={{ left: 24, bottom: 250, transform: 'rotate(270deg)' }}
            aria-hidden="true"
          />
          <div className={s.pillRow} style={{ bottom: 200 }}>
            <span className={`${s.pill} ${s.hint}`}>{status ?? t('scanHint')}</span>
          </div>
          <div className={s.shutterBar}>
            <div className={s.shutterRow}>
              <label className={s.side}>
                <Icon name="image" size={26} />
                {t('scanAlbum')}
                <input className={s.fileInput} type="file" accept="image/*" onChange={onFile} />
              </label>
              <label className={s.shutter}>
                <span />
                <input
                  className={s.fileInput}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  aria-label={t('scanShutter')}
                  onChange={onFile}
                />
              </label>
              <Link className={s.side} to={manualHref}>
                <Icon name="pencil" size={26} />
                {t('scanManual')}
              </Link>
            </div>
            <span className={s.privacy}>{t('photoPurpose')}</span>
          </div>
        </>
      )}
      {result && camera.file && (
        <div className={s.confirmSheet}>
          <span className={s.grabber} aria-hidden="true" />
          <ScanConfirm
            key={camera.preview + result.media_id}
            result={result}
            photo={camera.file}
            storeName={storeName}
            storeId={storeId}
          />
        </div>
      )}
    </section>
  );
}

/** /scan: 찍기 → 확인(같은 주소의 다음 단계), mode=manual이면 직접 입력 */
export default function Scan() {
  const ctx = useShoppingContext();
  const ready = useRequireMarket();
  if (!ready) return null;
  return ctx.params.get('mode') === 'manual' ? <ScanManual /> : <Camera />;
}
