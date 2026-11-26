import { getPipelineReport } from '../../api/admin';
import { useResource } from '../../hooks/useResource';
import Resource from '../../components/common/Resource';
import { DataTable, Section } from '../merchant/parts';

const stepLabels: Record<string, string> = {
  collect: '수집',
  clean: '정리',
  normalize: '표준화',
  chunk: '조각 나누기',
  review: '검수',
  load: '적재',
  invalidate: '예전 답 지우기',
};
/** {"chunks":24,"note":"샘플"} → "chunks 24 · 샘플" (날것의 JSON 대신, 2026-11-27 다듬기) */
function describe(value: unknown): string {
  if (value == null) return '—';
  if (typeof value !== 'object') return String(value);
  return Object.entries(value as Record<string, unknown>)
    .map(([k, v]) =>
      k === 'note' || k === 'skipped'
        ? String(v)
        : `${k} ${typeof v === 'object' ? describe(v) : v}`,
    )
    .join(' · ');
}
/** 2026-11-27T12:00:00+09:00 → 2026-11-27 12:00 */
const when = (iso: string) => iso.replace('T', ' ').replace(/:\d{2}([+-]\d{2}:\d{2}|Z)?$/, '');

const labels: Record<string, string> = {
  retrieval: '검색 적중률',
  citations: '출처 표시율',
  values: '값 대조 통과율',
  no_evidence: '범위 밖 안전 응답률',
  latency: '응답 시간',
};

export default function PipelineReport() {
  const state = useResource(getPipelineReport);
  const report = state.data;
  return (
    <Section title="적재 리포트">
      <Resource state={state}>
        {!report?.load && !report?.eval && <p>적재 리포트가 아직 없어요.</p>}
        {report?.load && (
          <>
            <p>
              실행 시각:{' '}
              <time dateTime={report.load.started_at}>{when(report.load.started_at)}</time> ·{' '}
              {report.load.seconds}초
            </p>
            <DataTable
              minWidth={0}
              head={['단계', '처리 결과']}
              rows={Object.entries(report.load.results).map(([key, value]) => ({
                key,
                cells: [stepLabels[key] ?? key, describe(value)],
              }))}
            />
            <DataTable
              minWidth={0}
              head={['자동 검사', '결과', '내용']}
              rows={report.load.checks.map((c) => ({
                key: c.name,
                cells: [c.name, c.ok ? '✓ 통과' : '✕ 실패', c.detail],
              }))}
            />
          </>
        )}
        {report?.eval && (
          <>
            <p>
              평가 시각:{' '}
              <time dateTime={report.eval.started_at}>{when(report.eval.started_at)}</time>
            </p>
            <DataTable
              minWidth={0}
              head={['평가 지표', '결과']}
              rows={Object.entries(report.eval.metrics).map(([key, value]) => ({
                key,
                cells: [
                  labels[key] ?? key,
                  key === 'latency'
                    ? value.median == null
                      ? '측정 못 함'
                      : `중앙값 ${value.median.toFixed(2)}초 · 최대 ${value.max?.toFixed(2)}초`
                    : value.rate == null
                      ? '측정 못 함'
                      : `${value.passed}/${value.total} (${(value.rate * 100).toFixed(1)}%)`,
                ],
              }))}
            />
          </>
        )}
      </Resource>
    </Section>
  );
}
