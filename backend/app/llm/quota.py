"""외부 AI(제미나이·GPT) 사용 횟수 규칙. 우리 서버 모델(젬마)에는 적용하지 않아요.

- 모델별 하루 전체 상한: 누가 마구 써도 정해진 양 이상은 안 나감 (서울 날짜 기준)
- 손님별 1시간 상한: 기기 ID(없으면 접속 주소) 기준. 기기 ID는 바꿀 수 있어서 하루 상한이 최종 안전장치
- 한 번의 질문에서 외부 모델로 넘어갈 때마다 1회로 셈 (채팅 도구 반복은 1회)
- 기록은 서버 메모리에만 있어요 → 백엔드는 프로세스 1개로 실행 (보안_서버 체크리스트 1-2)
"""

import threading
import time
from collections import defaultdict, deque
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone

from app.core.config import settings

# 요청마다 미들웨어가 넣어 주는 손님 구분값 ('device:…' 또는 'ip:…')
client_key: ContextVar[str | None] = ContextVar('llm_client_key', default=None)

_SEOUL = timezone(timedelta(hours=9))
_lock = threading.Lock()
_daily: dict[tuple[str, str], int] = defaultdict(int)
_hourly: dict[str, deque] = defaultdict(deque)


def take(provider: str) -> str | None:
    """쓸 수 있으면 1회를 차감하고 None, 막히면 이유('daily_limit'·'client_limit')."""
    today = datetime.now(_SEOUL).date().isoformat()
    now = time.monotonic()
    client = client_key.get()
    with _lock:
        if _daily[(provider, today)] >= settings.EXTERNAL_LLM_DAILY_LIMIT:
            return 'daily_limit'
        if client:
            recent = _hourly[client]
            while recent and now - recent[0] > 3600:
                recent.popleft()
            if len(recent) >= settings.EXTERNAL_LLM_HOURLY_PER_CLIENT:
                return 'client_limit'
            recent.append(now)
            if len(_hourly) > 10_000:  # 기기 ID를 바꿔 가며 메모리를 채우는 것 방지
                for key in [k for k, v in _hourly.items() if not v or now - v[-1] > 3600]:
                    del _hourly[key]
        for key in [k for k in _daily if k[1] != today]:
            del _daily[key]
        _daily[(provider, today)] += 1
    return None


def reset() -> None:
    with _lock:
        _daily.clear()
        _hourly.clear()
