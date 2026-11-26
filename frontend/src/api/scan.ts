import { isMock, request } from './client';
import * as mock from './mock';
import type { RecognizeResponse } from '../types/contract';
// useLocation: 손님이 "촬영 위치를 시장 확인에 써요"에 동의했을 때만 true (기본 false)
export const recognize = (file: File, useLocation = false) => {
  const body = new FormData();
  body.append('photo', file);
  if (useLocation) body.append('use_location', 'true');
  return isMock
    ? mock.recognize(file)
    : request<RecognizeResponse>('/recognize', { method: 'POST', body });
};
