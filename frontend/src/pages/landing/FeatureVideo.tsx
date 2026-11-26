import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { VIDEO_VERSION } from './facts';
import v from './video.module.css';

/**
 * 기능 영상 자리(개발 전달 메모 "3. 기능 영상").
 * - 영상이 있으면 muted · loop · playsinline으로, 화면에 들어올 때만 재생하고 나가면 멈춤.
 * - prefers-reduced-motion이면 자동 재생 대신 포스터와 재생 버튼.
 * - 영상이 아직 없으면 실제 화면 캡처(poster)를 폰 틀에 보여 줌. 캡처도 없으면 영상 자리 표시.
 *
 * 영상 파일은 public/landing/video/<이름>.mp4 (+ 같은 이름 .webm)에 두고 src·webm에 주소를 넣어요.
 * 규격: 세로 720×1800(폰 화면 녹화) · 가로 1280×960, 6~10초, MP4(H.264) + WebM, 각 2MB 이하.
 */
type Shape = 'phone' | 'phoneLg' | 'panel';

type Props = {
  /** 영상 한 줄 설명(aria-label) */
  label: string;
  /** 예: /landing/video/anshimon.mp4 */
  src?: string;
  /** 예: /landing/video/anshimon.webm */
  webm?: string;
  /** 영상 첫 화면이자 영상이 없을 때 보이는 실제 화면 캡처(여러 장이면 나란히) */
  poster?: string | readonly string[];
  /** 포스터(캡처)의 설명. 없으면 label */
  alt?: string;
  /** phone: 세로 폰 틀 · phoneLg: 큰 폰 틀 · panel: 가로 면(캡처는 폰 틀로 아래가 잘려 보임) */
  shape?: Shape;
  /** panel의 비율(예: '21 / 9') */
  ratio?: string;
  /** panel의 높이(px) */
  height?: number;
  /** panel 바탕: 회색 면(surface) · 흰 면 + 테두리(card) */
  tone?: 'surface' | 'card';
  /** 영상도 캡처도 없을 때 자리 안내 글 */
  placeholder?: string;
  /** panel 안의 세로 영상을 폰 틀에 넣어 보여 줌(위가 보이고 아래는 잘림) */
  frame?: boolean;
  /** 가로 영상을 자르지 않고 면 안에 다 보이게 */
  fit?: 'cover' | 'contain';
  className?: string;
};

function PlayIcon({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M10 8l6 4-6 4z" />
    </svg>
  );
}

/** 영상·포스터 주소에 판(version)을 붙여 Cloudflare·브라우저에 남은 예전 파일을 쓰지 않게(2026-11-27) */
const versioned = (url?: string) =>
  url && url.startsWith('/landing/video/') ? `${url}?v=${VIDEO_VERSION}` : url;

const safePlay = (el: HTMLVideoElement) => {
  try {
    void el.play()?.catch(() => {});
  } catch {
    /* 재생할 수 없으면 포스터 그대로 */
  }
};

export default function FeatureVideo({
  label,
  src,
  webm,
  poster,
  alt,
  shape = 'phone',
  ratio,
  height,
  tone = 'surface',
  placeholder,
  frame,
  fit = 'cover',
  className,
}: Props) {
  const posters = (poster == null ? [] : typeof poster === 'string' ? [poster] : [...poster]).map(
    (p) => versioned(p) as string,
  );
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  // 화면에 들어올 때만 재생, 나가면 멈춤
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    // Safari는 muted 속성(attribute)이 있어야 자동 재생을 허용해요
    video.muted = true;
    video.setAttribute('muted', '');
    if (reduced) {
      video.pause();
      return;
    }
    if (typeof IntersectionObserver !== 'function') {
      safePlay(video);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) safePlay(video);
        else video.pause();
      },
      { threshold: 0.2 },
    );
    io.observe(video);
    return () => {
      io.disconnect();
      video.pause();
    };
  }, [src, reduced]);

  const video = src ? (
    <>
      <video
        ref={ref}
        className={v.video}
        data-fit={fit}
        muted
        loop
        playsInline
        autoPlay={!reduced}
        preload="auto"
        poster={posters[0]}
        aria-label={label}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      >
        {webm && <source src={versioned(webm)} type="video/webm" />}
        <source src={versioned(src)} type="video/mp4" />
      </video>
      {reduced && (
        <button
          type="button"
          className={v.play}
          aria-label={playing ? '영상 멈추기' : '영상 재생'}
          onClick={() => {
            const el = ref.current;
            if (!el) return;
            if (el.paused) safePlay(el);
            else el.pause();
          }}
        >
          <PlayIcon size={28} />
        </button>
      )}
    </>
  ) : null;

  const empty = (
    <div className={v.placeholder} role="img" aria-label={label}>
      <PlayIcon />
      <span>{placeholder ?? '영상'}</span>
    </div>
  );

  if (shape === 'panel') {
    const style: CSSProperties = { aspectRatio: ratio, height };
    const showShots = !src && posters.length > 0;
    return (
      <div
        className={[v.panel, tone === 'card' ? v.panelCard : '', className].join(' ')}
        style={style}
        role={showShots ? 'img' : undefined}
        aria-label={showShots ? (alt ?? label) : undefined}
      >
        {video && frame ? (
          <div className={v.peekRow} data-count={1}>
            <div className={v.peekPhone}>{video}</div>
          </div>
        ) : (
          video
        )}
        {!video &&
          (showShots ? (
            <div className={v.peekRow} data-count={posters.length}>
              {posters.map((p) => (
                <div key={p} className={v.peekPhone}>
                  <img src={p} alt="" loading="lazy" width={780} height={1688} />
                </div>
              ))}
            </div>
          ) : (
            empty
          ))}
      </div>
    );
  }

  return (
    <div className={[shape === 'phoneLg' ? v.phoneLg : v.phone, className].join(' ')}>
      {video ??
        (posters.length ? <img src={posters[0]} alt={alt ?? label} loading="lazy" /> : empty)}
    </div>
  );
}
