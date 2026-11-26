import type { Criterion } from '../../types/contract';
import { useT } from '../../i18n';
export default function Checklist({
  criteria,
  checked,
  onToggle,
}: {
  criteria: Criterion[];
  checked: string[];
  onToggle: (key: string) => void;
}) {
  const t = useT();
  return (
    <section>
      <h2>{t('checklist')}</h2>
      <p className="caption">{t('notice')}</p>
      {criteria.length ? (
        criteria.map((c) => (
          <label className="check-row" key={c.key}>
            <input
              checked={checked.includes(c.key)}
              onChange={() => onToggle(c.key)}
              type="checkbox"
            />
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
