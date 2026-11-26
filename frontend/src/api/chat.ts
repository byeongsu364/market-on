import { isMock, request } from './client';
import { chat as mockChat } from './mock';
import type { ChatRequest, ChatResponse } from '../types/contract';
export const chat = (data: ChatRequest): Promise<ChatResponse> =>
  isMock ? mockChat(data) : request('/chat', { method: 'POST', body: JSON.stringify(data) });
