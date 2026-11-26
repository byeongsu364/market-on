import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useWaitSteps, WAIT_STEP_MS } from '../hooks/useWaitSteps';
import ModelLabel from '../components/domain/ModelLabel';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function Probe({ active }: { active: boolean }) {
  const labels = ['근거 찾는 중', '정리 중', '답 쓰는 중'];
  return <p>{labels[useWaitSteps(active, labels.length)]}</p>;
}

test('기다리는 동안 단계 문구가 차례로 바뀌고 마지막에서 멈춰요', () => {
  const { rerender } = render(<Probe active />);
  expect(screen.getByText('근거 찾는 중')).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(WAIT_STEP_MS));
  expect(screen.getByText('정리 중')).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(WAIT_STEP_MS * 5));
  expect(screen.getByText('답 쓰는 중')).toBeInTheDocument();
  rerender(<Probe active={false} />);
  expect(screen.getByText('근거 찾는 중')).toBeInTheDocument();
});

test('답한 모델 이름: 젬마·제미나이·GPT·구글 비전', () => {
  const names = [
    'gemma4:e4b',
    'gemini:gemini-flash-lite-latest',
    'openai:gpt-5.4-mini',
    'google-vision',
  ];
  render(
    <>
      {names.map((model) => (
        <ModelLabel key={model} model={model} />
      ))}
    </>,
  );
  for (const label of ['Gemma', 'Gemini', 'GPT', 'Google Vision'])
    expect(screen.getByText(label)).toBeInTheDocument();
});
