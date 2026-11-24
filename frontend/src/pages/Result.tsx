import { Link } from 'react-router-dom';
import { useResultFlow, useRequireMarket } from '../hooks/useFlows';
import Resource from '../components/common/Resource';
import Checklist from '../components/domain/Checklist';
import PriceCompare from '../components/domain/PriceCompare';
import { unitLabel } from '../utils/convertUnit';
import { useT } from '../i18n';
export default function Result() {
  const f = useResultFlow();
  const ready = useRequireMarket();
  const t = useT();
  if (!ready) return null;
  return (
    <Resource state={f.item}>
      {f.item.data && (
        <>
          <h1>{f.item.data.name}</h1>
          <small>
            {t('visionLabels')}
            {(f.labels.length ? f.labels : f.item.data.vision_labels).join(', ')}
          </small>
          <Checklist key={f.itemId} criteria={f.item.data.criteria} />
          <section className="card">
            <h2>{t('priceComparison')}</h2>
            <label>
              {t('price')}
              <input
                aria-label={t('price')}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={f.value}
                onChange={(e) => f.setValue(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder={t('pricePlaceholder')}
              />
            </label>
            <div className="chips" aria-label={t('saleUnit')}>
              {f.item.data.units.map((u) => (
                <button
                  key={u}
                  className="chip"
                  aria-pressed={u === f.unit}
                  onClick={() => f.setSelected(u)}
                >
                  {unitLabel(u)}
                </button>
              ))}
            </div>
            <Resource state={f.price}>
              {f.price.data && <PriceCompare price={f.price.data} />}
            </Resource>
          </section>
          <div className="fixed-action">
            <Link className="button" to={`/map?item=${encodeURIComponent(f.itemId)}`}>
              {t('stores')}
            </Link>
          </div>
        </>
      )}
    </Resource>
  );
}
