import { Link } from 'react-router-dom';
import { useResultFlow, useRequireMarket } from '../hooks/useFlows';
import Resource from '../components/common/Resource';
import Checklist from '../components/domain/Checklist';
import PriceCompare from '../components/domain/PriceCompare';
import StorePriceDisplay from '../components/domain/StorePriceDisplay';
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
          {f.method !== 'manual' && (
            <small>
              {t('visionLabels')}
              {(f.labels.length ? f.labels : f.item.data.vision_labels).join(', ')}
            </small>
          )}
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
            {f.quantity !== 1 && (
              <p className="caption">
                입력한 가격의 수량: {f.quantity} · 기준시세는 1단위로 비교해요
              </p>
            )}
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
          <section>
            <h2>이 시장 판매 점포</h2>
            <Resource state={f.map}>
              {f.map.data?.stores
                .filter((s) => s.highlight)
                .map((s) => (
                  <article className="card" key={s.store_id}>
                    <h3>
                      <Link
                        to={`/s/${encodeURIComponent(s.store_id)}?item=${encodeURIComponent(f.itemId)}&unit=${encodeURIComponent(f.unit)}`}
                      >
                        {s.name}
                      </Link>
                    </h3>
                    <p>{f.map.data?.zones.find((z) => z.id === s.zone_id)?.name}</p>
                    {s.active_sale && (
                      <p>마감세일 · {s.active_sale.sale_price.toLocaleString()}원</p>
                    )}
                    <StorePriceDisplay price={s.price} />
                  </article>
                ))}
              {f.map.data?.stores.filter((s) => s.highlight).length === 0 && (
                <p>등록된 판매 점포가 없어요</p>
              )}
              <h3>{f.hasStoreContext ? '선택한 점포' : '어느 가게예요?'}</h3>
              <div className="chips">
                {f.map.data?.stores
                  .filter((s) => s.highlight)
                  .map((s) => (
                    <button
                      className="chip"
                      key={s.store_id}
                      aria-pressed={f.storeId === s.store_id}
                      onClick={() => f.setStoreId(s.store_id)}
                    >
                      {s.name}
                    </button>
                  ))}
                <button className="secondary" onClick={() => f.setStoreId(undefined)}>
                  건너뛰기
                </button>
              </div>
            </Resource>
          </section>
          {Number(f.value) > 0 && (
            <p className="caption">이 가격은 시장 가격표에 익명으로 더해져요</p>
          )}
          <div className="fixed-action">
            <Link
              className="button"
              to={`/map?item=${encodeURIComponent(f.itemId)}&unit=${encodeURIComponent(f.unit)}`}
            >
              {t('stores')}
            </Link>
          </div>
        </>
      )}
    </Resource>
  );
}
