import { isMock, request } from './client';
import * as mock from './mock';
import type { RecognizeResponse } from '../types/contract';
export const recognize = (file: File) => {
  const body = new FormData();
  body.append('photo', file);
  return isMock
    ? mock.recognize(file)
    : request<RecognizeResponse>('/recognize', { method: 'POST', body });
};
