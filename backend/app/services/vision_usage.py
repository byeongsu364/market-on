"""구글 비전 사용 한도 (사진 수 기준). 무료 범위(기능별 월 1,000건)를 넘지 않게 막아요.

- 하루 상한 VISION_DAILY_LIMIT: 서버 메모리 (서울 날짜 기준)
- 한 달 상한 VISION_MONTHLY_LIMIT: llm_calls 기록(provider='vision')으로 세서 서버를 다시 켜도 유지
- 실제로 보낸 호출만 셈 (한도에 걸려 안 보낸 기록은 빼요)
"""

import logging
import threading
from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.db.repositories import llm_call_repo

_SEOUL = timezone(timedelta(hours=9))
_lock = threading.Lock()
_daily: dict[str, int] = {}
logger = logging.getLogger(__name__)


def take() -> str | None:
    """쓸 수 있으면 1장을 차감하고 None, 막히면 'daily_limit' 또는 'monthly_limit'."""
    now = datetime.now(_SEOUL)
    today = now.date().isoformat()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    try:
        used_month = llm_call_repo.count_since('vision', month_start)
    except Exception:  # noqa: BLE001 - 기록을 못 읽어도 하루 상한은 그대로 지켜요
        logger.warning('비전 한 달 사용량을 읽지 못했어요; 하루 상한만 적용합니다.')
        used_month = 0
    with _lock:
        for key in [k for k in _daily if k != today]:
            del _daily[key]
        if _daily.get(today, 0) >= settings.VISION_DAILY_LIMIT:
            return 'daily_limit'
        if used_month >= settings.VISION_MONTHLY_LIMIT:
            return 'monthly_limit'
        _daily[today] = _daily.get(today, 0) + 1
    return None


def reset() -> None:
    with _lock:
        _daily.clear()
