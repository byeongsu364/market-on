import ManualInput from '../components/domain/ManualInput';
import ModelLabel from '../components/domain/ModelLabel';
import Loading from '../components/common/Loading';
import { useT } from '../i18n';
import { Link } from 'react-router-dom';
import { useRecommendFlow, useRequireMarket } from '../hooks/useFlows';
import ChipGroup from '../components/common/ChipGroup';
import Button from '../components/common/Button';
import ErrorBox from '../components/common/ErrorBox';
import { formatPrice } from '../utils/formatPrice';
export default function Recommend() {
  const t = useT();
  const f = useRecommendFlow();
  const ready = useRequireMarket();
  if (!ready) return null;
  return (
    <>
      <h1>장보기 구성</h1>
      <p>장보기 조건을 골라 주세요.</p>
      <ChipGroup
        label={t('purpose')}
        options={['집밥', '선물', '모임'] as const}
        value={f.purpose}
        onChange={f.setPurpose}
      />
      <ChipGroup
        label={t('relation')}
        options={['가족', '친구', '나'] as const}
        value={f.relation}
        onChange={f.setRelation}
      />
      <ChipGroup
        label={t('budget')}
        options={[10000, 20000, 30000]}
        value={f.budget}
        onChange={f.setBudget}
        display={formatPrice}
      />
      <ChipGroup
        label={t('headcount')}
        options={[1, 2, 4]}
        value={f.headcount}
        onChange={f.setHeadcount}
        display={(v) => `${v}명`}
      />
      <Button className="wide" loading={f.action.loading} onClick={f.submit}>
        {t('viewComposition')}
      </Button>
      {f.action.error && (
        <>
          <ErrorBox message={f.action.error} />
          <ManualInput />
        </>
      )}
      <div aria-live="polite">
        {f.action.loading && <Loading message="구성을 만들고 있어요 (5~15초)" />}
        {f.action.data?.items.map((i) => (
          <article className="card" key={i.item_id}>
            <h2>{i.name}</h2>
            <p>
              <strong>
                {i.quantity}
                {i.unit_label}
              </strong>{' '}
              · 예상가 {i.subtotal === null ? '시세 없음' : formatPrice(i.subtotal)}
            </p>
            <p>{i.reason}</p>
            <ul>
              {i.sources.map((source, index) => (
                <li key={index}>
                  {source.url ? (
                    <a href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.title}
                    </a>
                  ) : (
                    source.title
                  )}
                  {source.publisher && ` · ${source.publisher}`}
                  {source.draft && <small> · 검수 전</small>}
                </li>
              ))}
            </ul>
            <div className="chips">
              {i.stores.map((store) => (
                <Link
                  className="chip"
                  key={store.store_id}
                  to={`/map?item=${encodeURIComponent(i.item_id)}&store=${encodeURIComponent(store.store_id)}`}
                >
                  {store.name}
                </Link>
              ))}
            </div>
            <p>
              <Link to={`/map?item=${encodeURIComponent(i.item_id)}`}>{t('viewStores')}</Link>
            </p>
          </article>
        ))}
        {f.action.data && (
          <>
            <p>
              예상 합계 {formatPrice(f.action.data.total)} / 예산{' '}
              {formatPrice(f.action.data.budget)} ({formatPrice(f.action.data.left)} 남음)
            </p>
            <p>{f.action.data.note}</p>
            <ModelLabel model={f.action.data.model} />
          </>
        )}
      </div>
    </>
  );
}
