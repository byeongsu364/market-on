import { useRef, useState } from 'react';
import { ask } from '../../api/ask';
import type { AskIntent, AskRequest, AskResponse } from '../../types/contract';
import { useSession } from '../../store/session';
import { useT, type Key } from '../../i18n';
import Button from '../common/Button';
import Card from '../common/Card';
import ChipGroup from '../common/ChipGroup';
import ErrorBox from '../common/ErrorBox';
import Loading from '../common/Loading';
import AskAnswer from './AskAnswer';
import { Field, SectionHeader } from '../common/parts';
import s from './domain.module.css';

const topics: AskIntent[] = ['select', 'store', 'prep', 'season'];
const labels: Partial<Record<AskIntent, Key>> = {
  select: 'askSelect',
  store: 'askStore',
  prep: 'askPrep',
  season: 'askSeason',
};
type Entry = { id: number; question: string; intent?: AskIntent; response: AskResponse };
export default function AskPanel({ itemId }: { itemId: string }) {
  const t = useT();
  const { market } = useSession();
  const [question, setQuestion] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; retry: boolean } | null>(null);
  const [selected, setSelected] = useState<AskIntent | ''>('');
  const busy = useRef(false);
  const sequence = useRef(0);
  const last = useRef<{ request: AskRequest; label: string } | null>(null);
  const nodes = useRef(new Map<number, HTMLDivElement>());
  async function submit(request: AskRequest, label: string) {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    last.current = { request, label };
    try {
      const response = await ask({ ...request, item_id: itemId, market_id: market?.market_id });
      const entry = { id: ++sequence.current, question: label, intent: request.intent, response };
      setEntries((current) => [entry, ...current].slice(0, 3));
    } catch (e) {
      const failure = e as { status?: number; message?: string };
      setError({
        message:
          failure.status === 503
            ? t('askUnavailable')
            : failure.status === 429
              ? t('askRateLimit')
              : failure.message || t('askError'),
        retry: failure.status === 503,
      });
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }
  function choose(intent: AskIntent) {
    setSelected(intent);
    const existing = entries.find((entry) => entry.intent === intent);
    if (existing) {
      const node = nodes.current.get(existing.id);
      node?.scrollIntoView({ block: 'nearest' });
      node?.focus({ preventScroll: true });
      return;
    }
    void submit({ intent }, t(labels[intent]!));
  }
  return (
    <section className={s.ask} aria-labelledby="ask-title">
      <SectionHeader id="ask-title" title={t('askTitle')} />
      <ChipGroup
        hideLegend
        label={t('askChips')}
        options={topics}
        value={selected}
        onChange={choose}
        display={(intent) => t(labels[intent]!)}
        disabled={loading}
      />
      <form
        className={s.askForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (question.trim() && question.length <= 200)
            void submit({ question: question.trim() }, question.trim());
        }}
      >
        <Field
          label={t('askQuestion')}
          value={question}
          placeholder={t('askPlaceholder')}
          hint={`${t('askLimit')} · ${question.length}/200`}
          disabled={loading}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <Button
          type="submit"
          size="md"
          disabled={loading || !question.trim() || question.length > 200}
        >
          {t('askSubmit')}
        </Button>
      </form>
      {loading && (
        <Card>
          <div aria-live="polite">
            <Loading message={t('askLoading')} />
          </div>
        </Card>
      )}
      {error && <ErrorBox message={error.message} />}
      {error?.retry && (
        <Button
          onClick={() => {
            if (last.current) void submit(last.current.request, last.current.label);
          }}
        >
          {t('askRetry')}
        </Button>
      )}
      {entries.map((entry) => (
        <div
          key={entry.id}
          tabIndex={-1}
          ref={(node) => {
            if (node) nodes.current.set(entry.id, node);
            else nodes.current.delete(entry.id);
          }}
        >
          <AskAnswer question={entry.question} response={entry.response} />
        </div>
      ))}
    </section>
  );
}
