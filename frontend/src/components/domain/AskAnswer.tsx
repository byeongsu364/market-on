import type { AskResponse } from '../../types/contract';
import { useT } from '../../i18n';
import { unitLabel } from '../../utils/convertUnit';
import Card from '../common/Card';
import ModelLabel from './ModelLabel';

export default function AskAnswer({
  question,
  response,
}: {
  question: string;
  response: AskResponse;
}) {
  const t = useT();
  return (
    <Card>
      <h3>{question}</h3>
      {response.kind === 'answer' && (
        <>
          <p>{response.answer}</p>
          <h4>{t('askSources')}</h4>
          <ul>
            {response.citations.map((source, index) => (
              <li key={index}>
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noopener noreferrer">
                    {source.title}
                  </a>
                ) : (
                  source.title
                )}
                {source.publisher && <> · {source.publisher}</>}
                {source.draft && <small className="caption"> · {t('askDraft')}</small>}
              </li>
            ))}
          </ul>
          <small>{t('askEvidence')}</small>
          <ModelLabel
            model={response.model}
            cachedLabel={response.cached ? t('askCached') : undefined}
          />
        </>
      )}
      {response.kind === 'no_evidence' && (
        <>
          <p>{response.answer}</p>
          <p>{t('askOther')}</p>
        </>
      )}
      {response.kind === 'price' && (
        <>
          <p>
            {response.price
              ? t('askPrice')
                  .replace('{price}', response.price.reference_price.toLocaleString('ko-KR'))
                  .replace('{unit}', unitLabel(response.price.unit))
              : t('askNoPrice')}
          </p>
          <a href="#price-comparison">{t('askPriceLink')}</a>
        </>
      )}
      {response.kind === 'where' && (
        <>
          <p>{t('askWhere').replace('{count}', String(response.stores?.length ?? 0))}</p>
          <a href="#selling-stores">{t('askStoresLink')}</a>
        </>
      )}
      {response.kind === 'out_of_scope' && <p>{t('askScope')}</p>}
    </Card>
  );
}
