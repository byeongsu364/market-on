import type { PipelineReport } from '../admin';
import { mock } from './index';

/** 발표용 예시. 실제 실행 결과는 운영자 API에서 읽습니다. */
export const pipelineReport = () =>
  mock<PipelineReport>(() => ({
    load: {
      started_at: '2026-11-27T12:00:00+09:00',
      seconds: 0,
      results: { chunk: { chunks: 24, note: '샘플' }, load: { skipped: '샘플 · 실제 적재 아님' } },
      checks: [
        { name: '온톨로지 연결', ok: true, detail: '샘플 · 연결 확인' },
        { name: '출처·라이선스', ok: true, detail: '샘플 · 출처 확인' },
        { name: '중복', ok: true, detail: '샘플 · 중복 없음' },
        { name: '제보 가격 범위', ok: true, detail: '샘플 · 보류 0건 (0%)' },
      ],
    },
    eval: {
      started_at: '2026-11-27T12:00:00+09:00',
      metrics: {
        retrieval: { rate: null },
        citations: { rate: null },
        values: { rate: null },
        no_evidence: { rate: null },
        latency: { median: null, max: null },
      },
    },
  }));
