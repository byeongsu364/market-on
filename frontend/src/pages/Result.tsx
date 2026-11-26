import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useResultFlow, useRequireMarket } from '../hooks/useFlows';
import DecisionCardSheet from '../components/domain/DecisionCardSheet';
import { buildCardData, type CardData } from '../utils/decisionCard';
import Resource from '../components/common/Resource';
import AskPanel from '../components/domain/AskPanel';
import Checklist from '../components/domain/Checklist';
import PriceCompare from '../components/domain/PriceCompare';
import StorePriceDisplay from '../components/domain/StorePriceDisplay';
import { unitLabel } from '../utils/convertUnit';
import { useT } from '../i18n';
export default function Result() {
  const f = useResultFlow();
  const [checks, setChecks] = useState<{ itemId: string; keys: string[] }>({
    itemId: '',
    keys: [],
  });
  if (checks.itemId !== f.itemId) setChecks({ itemId: f.itemId, keys: [] });
  const checked = checks.itemId === f.itemId ? checks.keys : [];
  const [card, setCard] = useState<CardData>();
  const closeCard = useCallback(() => setCard(undefined), []);
  const [expandedFor, setExpandedFor] = useState('');
  const listKey = `${f.itemId}:${f.map.data?.market_id}`;
  const selling = (f.map.data?.stores ?? [])
    .filter((s) => s.highlight)
    .sort(
      (a, b) =>
        Number(!!b.active_sale) - Number(!!a.active_sale) ||
        Number(!!b.price?.merchant_confirmed) - Number(!!a.price?.merchant_confirmed),
    );
  const visible = expandedFor === listKey ? selling : selling.slice(0, 5);
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
          <Checklist
            criteria={f.item.data.criteria}
            checked={checked}
            onToggle={(key) =>
              setChecks({
                itemId: f.itemId,
                keys: checked.includes(key) ? checked.filter((k) => k !== key) : [...checked, key],
              })
            }
          />
          <AskPanel key={`ask:${f.itemId}`} itemId={f.itemId} />
          <Link to={`/chat?item_id=${encodeURIComponent(f.itemId)}`}>대화로 더 묻기</Link>
          <section className="card" id="price-comparison">
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
              {f.price.data && (
                <PriceCompare price={f.price.data} onVarietyChange={f.setVarietyId} />
              )}
            </Resource>
          </section>
          <section id="selling-stores">
            <h2>이 시장 판매 점포</h2>
            <Resource state={f.map}>
              {visible.map((s) => (
                <article className="card" key={s.store_id}>
                  <h3>
                    <Link
                      to={`/s/${encodeURIComponent(s.store_id)}?item=${encodeURIComponent(f.itemId)}&unit=${encodeURIComponent(f.unit)}`}
                    >
                      {s.name}
                    </Link>
                  </h3>
                  <p>{f.map.data?.zones.find((z) => z.id === s.zone_id)?.name}</p>
                  {s.active_sale && <p>마감세일 · {s.active_sale.sale_price.toLocaleString()}원</p>}
                  {s.guessed_item_ids.includes(f.itemId) && (
                    <p className="caption">업종 기준 · 상인 확인 전</p>
                  )}
                  <StorePriceDisplay price={s.price} />
                </article>
              ))}
              {f.map.data?.stores.filter((s) => s.highlight).length === 0 && (
                <p>등록된 판매 점포가 없어요</p>
              )}
              {selling.length > 5 && expandedFor !== listKey && (
                <button className="secondary" onClick={() => setExpandedFor(listKey)}>
                  더 보기
                </button>
              )}
              <h3>{f.hasStoreContext ? '선택한 점포' : '어느 가게예요?'}</h3>
              <div className="chips">
                {visible.map((s) => (
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
          <button
            className="secondary wide"
            // 품목·시장 정보가 오기 전에 누르면 아무 일도 안 일어나던 문제 → 준비될 때까지 비활성
            disabled={!f.item.data || !f.market || f.price.loading || f.map.loading}
            onClick={() => {
              if (!f.item.data || !f.market) return;
              setCard(
                buildCardData({
                  item: f.item.data,
                  market: f.market,
                  checked,
                  photo: f.photo,
                  price: f.price.data,
                  value: f.value,
                  quantity: f.quantity,
                  unit: f.unit,
                  store: f.map.data?.stores.find((s) => s.store_id === f.storeId),
                  origin: window.location.origin,
                }),
              );
            }}
          >
            {t('decisionCardCreate')}
          </button>
          {card && <DecisionCardSheet data={card} onClose={closeCard} />}
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
