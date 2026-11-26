import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import PipelineReport from '../pages/admin/PipelineReport';
import { SessionProvider } from '../store/SessionProvider';
import * as api from '../api/admin';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('적재 단계, 검사, 평가 지표와 미측정을 표시한다', async () => {
  vi.spyOn(api, 'getPipelineReport').mockResolvedValue({
    load: {
      started_at: '2026-11-27',
      seconds: 2,
      results: { chunk: { chunks: 24 } },
      checks: [
        { name: '온톨로지 연결', ok: true, detail: '연결됨' },
        { name: '출처·라이선스', ok: false, detail: '누락' },
      ],
    },
    eval: {
      started_at: '2026-11-27',
      metrics: {
        retrieval: { passed: 25, total: 25, rate: 1 },
        citations: { rate: null },
        values: { rate: null },
        no_evidence: { passed: 4, total: 5, rate: 0.8 },
        latency: { median: null, max: null },
      },
    },
  });
  render(
    <SessionProvider>
      <PipelineReport />
    </SessionProvider>,
  );
  expect(await screen.findByText('온톨로지 연결')).toBeInTheDocument();
  expect(screen.getByText('✓ 통과')).toBeInTheDocument();
  expect(screen.getByText('✕ 실패')).toBeInTheDocument();
  expect(screen.getByText('25/25 (100.0%)')).toBeInTheDocument();
  expect(screen.getAllByText('측정 못 함')).toHaveLength(3);
  expect(screen.getByText('응답 시간')).toBeInTheDocument();
});
it('아직 실행하지 않은 리포트를 표시한다', async () => {
  vi.spyOn(api, 'getPipelineReport').mockResolvedValue({ load: null, eval: null });
  render(
    <SessionProvider>
      <PipelineReport />
    </SessionProvider>,
  );
  expect(await screen.findByText('적재 리포트가 아직 없어요.')).toBeInTheDocument();
});
