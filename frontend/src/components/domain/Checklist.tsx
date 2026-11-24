import type { Criterion } from '../../types/contract';
import { useT } from '../../i18n';
export default function Checklist({ criteria }: { criteria: Criterion[] }) {
  const t = useT();
  return (
    <section>
      <h2>{t('checklist')}</h2>
      <p className="caption">{t('notice')}</p>
      {criteria.length ? (
        criteria.map((c) => (
          <label className="check-row" key={c.key}>
            <input type="checkbox" />
            <span>
              {c.text}
              <small>{c.source}</small>
            </span>
          </label>
        ))
      ) : (
        <p>{t('noCriteria')}</p>
      )}
    </section>
  );
}
