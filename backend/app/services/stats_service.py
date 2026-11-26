"""Seoul calendar statistics and process-local anonymous direction deduplication."""

from datetime import datetime, time, timedelta
from threading import Lock
from time import monotonic

from app.core.errors import AppError
from app.db.repositories import stats_repo as repo
from app.db.repositories import store_repo
from app.db.repositories._operational import rows

from .auth_service import now
from .price_report_service import hash_device
from .sale_service import SEOUL

_seen = {}
_lock = Lock()


def record_direction(conn, store_id, device):
    if not store_repo.get_store(conn, store_id):
        raise AppError('STORE_NOT_FOUND', '점포를 찾을 수 없습니다.', 404)
    key = (store_id, hash_device(device))
    with _lock:
        instant = monotonic()
        for old in [k for k, expiry in _seen.items() if expiry <= instant]:
            del _seen[old]
        if key in _seen:
            return
        with conn.transaction():
            repo.directions(conn, store_id, now().astimezone(SEOUL).date())
        _seen[key] = instant + 600


def merchant(conn, user, days):
    today = now().astimezone(SEOUL).date()
    start = today - timedelta(days=days - 1)
    values = {v['day']: v for v in repo.daily(conn, user['store_id'], start, today)}
    series = []
    for offset in range(days):
        day = start + timedelta(days=offset)
        series.append(values.get(day, {'day': day, 'views': 0, 'directions': 0}))
    return {
        'today': {k: series[-1][k] for k in ('views', 'directions')},
        'days': series,
        'favorites': rows(
            conn, 'select count(*) as n from favorites where store_id=%s', (user['store_id'],)
        )[0]['n'],
    }


def market(conn, user):
    today = now().astimezone(SEOUL).date()
    start = today - timedelta(days=6)
    return repo.market(conn, user['market_id'], start, today) | {
        'recent': repo.recent(
            conn,
            user['market_id'],
            datetime.combine(start, time(), SEOUL),
            datetime.combine(today + timedelta(days=1), time(), SEOUL),
        )
    }


def markets(conn, status):
    today = now().astimezone(SEOUL).date()
    return repo.markets(conn, status, today - timedelta(days=6), today)
