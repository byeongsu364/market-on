import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePoster, useQrSvg } from '../../hooks/usePoster';
import { useAuth } from '../../hooks/useAuth';
import Resource from '../../components/common/Resource';
import Button from '../../components/common/Button';
import Icon from '../../components/common/Icon';
import AppHeader from '../../components/layout/AppHeader';
import { useT } from '../../i18n';
import { Footer } from './parts';
import a from '../account/account.module.css';
import s from './merchant.module.css';

type Kind = 'store' | 'market';

// Poster: 점포 QR(상인) · 시장 입구 QR(상인 탭, 시장 관리자 /market-admin/poster).
export default function Poster({ market = false }: { market?: boolean }) {
  const f = usePoster(market);
  const t = useT();
  const { user } = useAuth();
  const [kind, setKind] = useState<Kind>(market ? 'market' : 'store');
  const info = f.info.data;
  // 상인의 "시장 입구 QR"은 시장 관리자 포스터와 같은 주소(/?market=)를 이 기기에서 만듦
  const marketId = user?.store?.market_id;
  const marketUrl =
    !market && marketId
      ? `${window.location.origin}/?market=${encodeURIComponent(marketId)}`
      : null;
  const other = useQrSvg(kind === 'market' && !market ? marketUrl : null);
  const showMarket = market || kind === 'market';
  const svg = showMarket && !market ? other.svg : f.svg;
  const url = showMarket && !market ? marketUrl : info?.url;
  const saveImage = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    link.download = showMarket ? 'market-on-market-qr.svg' : 'market-on-store-qr.svg';
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <div className={s.posterPage}>
      <div className="no-print">
        <AppHeader title={t('poster')} back={market ? '/market-admin' : '/merchant'} />
      </div>
      <div className={s.posterMain}>
        {!market && (
          <div
            className={`${a.seg} no-print`}
            role="radiogroup"
            aria-label={t('merchantPosterKind')}
          >
            {(['store', 'market'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
              >
                {t(k === 'store' ? 'merchantPosterStore' : 'merchantPosterMarket')}
              </button>
            ))}
          </div>
        )}
        <Resource state={f.info}>
          {info && (
            <section className={`poster ${s.posterCard}`} data-theme="light">
              <div className={s.awning} aria-hidden="true">
                <span />
                <span className={s.awningCells}>
                  {Array.from({ length: 7 }, (_, i) => (
                    <span key={i} />
                  ))}
                </span>
              </div>
              <div className={s.posterBody}>
                <div className={s.titleBlock}>
                  {showMarket ? (
                    <h2 className={s.posterName}>
                      사진 한 장으로
                      <br /> 어디서 파는지 바로
                    </h2>
                  ) : (
                    <h2 className={s.posterName}>{info.store_name}</h2>
                  )}
                  <span className={s.posterSub}>{info.market_name}</span>
                </div>
                {svg && (
                  <div
                    className={`poster-qr ${s.posterQr}`}
                    role="img"
                    aria-label={t('poster')}
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />
                )}
                <div className={s.titleBlock}>
                  <span className={s.posterMsg}>
                    {showMarket ? t('merchantPosterMarketMsg') : t('posterMessage')}
                  </span>
                  <span className={s.posterMsgSub}>{t('merchantPosterSub')}</span>
                </div>
                <img className={s.posterLogo} src="/brand/logo-light.svg" alt="Market-On" />
              </div>
            </section>
          )}
          {url && <p className={s.posterUrl}>{url}</p>}
          {(f.error || other.error) && <p role="alert">{t('qrError')}</p>}
          <p className={`${s.help} ${s.center} no-print`}>
            {t(showMarket ? 'merchantPosterMarketHelp' : 'merchantPosterHelp')}
          </p>
          {market && (
            <p className={`${s.center} no-print`}>
              <Link to="/join" className="text-link">
                {t('merchantPosterJoin')}
              </Link>
            </p>
          )}
        </Resource>
      </div>
      <Footer className={`${s.posterFooter} no-print`}>
        <Button
          variant="primary"
          grow
          icon={<Icon name="printer" />}
          onClick={() => window.print()}
        >
          {t('print')}
        </Button>
        <Button
          variant="outline"
          grow
          icon={<Icon name="download" />}
          disabled={!svg}
          onClick={saveImage}
        >
          {t('merchantPosterSave')}
        </Button>
      </Footer>
    </div>
  );
}
