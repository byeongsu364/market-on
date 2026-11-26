import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * 찍기 화면 안에서 바로 보이는 카메라(2026-11-27).
 * 셔터를 누르면 휴대폰 기본 카메라 앱으로 넘어가지 않고, 화면의 영상에서 그 장면을 사진(JPEG)으로 만듦.
 * - 영상은 이 기기 안에서만 보이고, 셔터를 누른 사진만 서버로 감(기존과 같음).
 * - https(또는 localhost)에서만 동작. 권한 거부·카메라 없음·지원 안 함이면 status로 알려 주고,
 *   화면은 기존 방식(파일 입력 capture)으로 돌아감.
 * - 화면을 떠나거나(언마운트) 앱이 뒤로 가면(visibilitychange) 카메라를 끔.
 */
export type LiveCameraStatus = 'off' | 'starting' | 'live' | 'denied' | 'unavailable';

export function useLiveCamera(video: RefObject<HTMLVideoElement | null>, enabled: boolean) {
  const [status, setStatus] = useState<LiveCameraStatus>('off');
  const stream = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, [video]);

  useEffect(() => {
    if (!enabled) {
      stop();
      setStatus('off');
      return;
    }
    const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!media?.getUserMedia) {
      setStatus('unavailable');
      return;
    }
    let active = true;
    const start = async () => {
      setStatus('starting');
      try {
        const s = await media.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (!active) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        const el = video.current;
        if (el) {
          el.srcObject = s;
          el.muted = true;
          el.playsInline = true;
          try {
            await el.play?.();
          } catch {
            /* 자동 재생이 막혀도 영상 요소는 다음 터치에 재생됨 */
          }
        }
        if (active) setStatus('live');
      } catch (error) {
        if (!active) return;
        const name = (error as { name?: string }).name;
        setStatus(
          name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable',
        );
      }
    };
    void start();
    // 다른 앱으로 가면 카메라를 끄고, 돌아오면 다시 켬
    const onVisible = () => {
      if (document.hidden) {
        stop();
        setStatus('off');
      } else if (!stream.current) void start();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
      stop();
    };
  }, [enabled, stop, video]);

  /** 지금 화면의 장면을 JPEG 파일로. 영상이 아직 없으면 null */
  const capture = useCallback(async (): Promise<File | null> => {
    const el = video.current;
    if (!el || !el.videoWidth || !el.videoHeight) return null;
    const canvas = document.createElement('canvas');
    canvas.width = el.videoWidth;
    canvas.height = el.videoHeight;
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.drawImage(el, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9),
    );
    return blob ? new File([blob], `scan-${Date.now()}.jpg`, { type: 'image/jpeg' }) : null;
  }, [video]);

  return { status, capture };
}
