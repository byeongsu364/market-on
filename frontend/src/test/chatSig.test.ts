import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { SessionProvider } from '../store/SessionProvider';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/chat';
import { useChat } from '../hooks/useChat';
import type { ChatResponse } from '../types/contract';

const reply = (text: string, sig?: string): ChatResponse => ({
  reply: text,
  citations: [],
  tools: [],
  items: [],
  model: 'gemma',
  removed: 0,
  reply_sig: sig,
});

describe('채팅 이전 답변 서명', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });
  it('서버가 준 서명을 도우미 메시지와 함께 돌려보내요', async () => {
    const chat = vi
      .spyOn(api, 'chat')
      .mockResolvedValueOnce(reply('대파는 잎을 봐요.', 'sig-1'))
      .mockResolvedValueOnce(reply('양파는 단단한 걸요.'));
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(SessionProvider, null, children);
    const { result } = renderHook(() => useChat('market:demo'), { wrapper });
    await act(() => result.current.send('대파?'));
    await act(() => result.current.send('양파는?'));
    expect(chat.mock.calls[1][0].messages).toEqual([
      { role: 'user', content: '대파?' },
      { role: 'assistant', content: '대파는 잎을 봐요.', sig: 'sig-1' },
      { role: 'user', content: '양파는?' },
    ]);
  });
});
