import { usePoster } from '../../hooks/usePoster';
import Resource from '../../components/common/Resource';
import { useT } from '../../i18n';
export default function Poster() {
  const f = usePoster();
  const t = useT();
  return (
    <Resource state={f.info}>
      {f.info.data && (
        <section className="poster">
          <p>{f.info.data.market_name}</p>
          <h1>{f.info.data.store_name}</h1>
          {f.svg && (
            <div
              className="poster-qr"
              role="img"
              aria-label={t('poster')}
              dangerouslySetInnerHTML={{ __html: f.svg }}
            />
          )}
          <p>{t('posterMessage')}</p>
          <p className="caption">{f.info.data.url}</p>
          {f.error && <p role="alert">{t('qrError')}</p>}
          <button className="button print-button" onClick={() => window.print()}>
            {t('print')}
          </button>
        </section>
      )}
    </Resource>
  );
}
