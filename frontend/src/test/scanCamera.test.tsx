import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import * as scanApi from '../api/scan';

// 찍기 화면 안에서 바로 켜지는 카메라(2026-11-27). jsdom에는 카메라·영상·캔버스가 없어 가짜로 둠
vi.setConfig({ testTimeout: 20000 });

const show = (path = '/scan?market=market:demo') => {
  const [pathname, search = ''] = path.split('?');
  return render(
    <MemoryRouter initialEntries={[{ pathname, search: search && `?${search}` }]}>
      <App />
    </MemoryRouter>,
  );
};

function fakeCamera(fail?: string) {
  const stop = vi.fn();
  const getUserMedia = vi.fn(async () => {
    if (fail) throw Object.assign(new Error(fail), { name: fail });
    return { getTracks: () => [{ stop }] } as unknown as MediaStream;
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  return { getUserMedia, stop };
}

afterEach(() => {
  cleanup();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  vi.restoreAllMocks();
});

it('찍기에 들어가면 후면 카메라를 화면 안에서 켜고, 셔터로 그 장면을 찍어 인식에 보낸다', async () => {
  const cam = fakeCamera();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
    configurable: true,
    get: () => 1280,
  });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
    configurable: true,
    get: () => 720,
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb) {
    cb(new Blob(['jpg'], { type: 'image/jpeg' }));
  });
  const recognize = vi.spyOn(scanApi, 'recognize');
  const view = show();
  // 셔터가 파일 입력(기본 카메라 앱)이 아니라 화면 안 버튼
  const shutter = await screen.findByRole('button', { name: '사진 찍기' });
  expect(cam.getUserMedia).toHaveBeenCalledWith(
    expect.objectContaining({
      audio: false,
      video: expect.objectContaining({ facingMode: { ideal: 'environment' } }),
    }),
  );
  expect(screen.getByLabelText('카메라 화면').tagName).toBe('VIDEO');
  fireEvent.click(shutter);
  await waitFor(() => expect(recognize).toHaveBeenCalled());
  const file = recognize.mock.calls[0][0] as File;
  expect(file.type).toBe('image/jpeg');
  // 화면을 떠나면 카메라를 끔
  view.unmount();
  expect(cam.stop).toHaveBeenCalled();
});

it('카메라 권한을 거부하면 안내하고 셔터는 기본 카메라 앱(파일 입력)으로 돌아간다', async () => {
  fakeCamera('NotAllowedError');
  show();
  expect(
    await screen.findByText('카메라를 켤 수 없어요. 셔터를 누르면 기본 카메라로 찍어요.'),
  ).toBeInTheDocument();
  const input = screen.getByLabelText('사진 찍기');
  expect(input.tagName).toBe('INPUT');
  expect(input).toHaveAttribute('capture', 'environment');
});
