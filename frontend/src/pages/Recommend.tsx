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
      <h1>{t('recommendTitle')}</h1>
      <p>{t('recommendPrompt')}</p>
      <ChipGroup
        label={t('purpose')}
        options={['집밥', '선물', '모임']}
        value={f.purpose}
        onChange={f.setPurpose}
      />
      <ChipGroup
        label={t('relation')}
        options={['가족', '친구', '나']}
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
      {f.action.error && <ErrorBox message={f.action.error} />}
      <div aria-live="polite">
        {f.action.data?.items.map((i) => (
          <article className="card" key={i.item_id}>
            <h2>{i.name}</h2>
            <p>{i.reason}</p>
            <small>{i.sources.join(' · ')}</small>
            <Link to={`/map?item=${encodeURIComponent(i.item_id)}`}>{t('viewStores')}</Link>
          </article>
        ))}
      </div>
    </>
  );
}
