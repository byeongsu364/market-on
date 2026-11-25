import { Link } from 'react-router-dom';
import { usePoster } from '../../hooks/usePoster';
import Resource from '../../components/common/Resource';
import { useT } from '../../i18n';
export default function Poster({ market = false }: { market?: boolean }) {
  const f = usePoster(market);
  const t = useT();
  return (
    <Resource state={f.info}>
      {f.info.data && (
        <section className="poster">
          <p>{f.info.data.market_name}</p>
          <h1>
            {market ? (
              <>
                사진 한 장으로
                <br /> 어디서 파는지 바로
              </>
            ) : 'store_name' in f.info.data ? (
              f.info.data.store_name
            ) : (
              ''
            )}
          </h1>
          {f.svg && (
            <div
              className="poster-qr"
              role="img"
              aria-label={t('poster')}
              dangerouslySetInnerHTML={{ __html: f.svg }}
            />
          )}
          <p>{market ? '찍으면 이 시장을 둘러볼 수 있어요' : t('posterMessage')}</p>
          <p className="caption">{f.info.data.url}</p>
          {market && <Link to="/join">우리 시장도 입점 신청하기</Link>}
          {f.error && <p role="alert">{t('qrError')}</p>}
          <button className="button print-button" onClick={() => window.print()}>
            {t('print')}
          </button>
        </section>
      )}
    </Resource>
  );
}
