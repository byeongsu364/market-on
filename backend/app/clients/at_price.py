"""aT 기간별 소매가격. 전송은 core.http에서만 수행한다."""

from datetime import date
from threading import Lock
import time
from app.core import http
from app.core.config import settings
from app.core.errors import AppError

URL = 'https://apis.data.go.kr/B552845/periodRetail/price'
_last_call = None
_lock = Lock()
LIMIT = 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR'


def require_key():
    if not settings.DATA_GO_KR_KEY:
        raise AppError('AT_NOT_CONFIGURED', 'AT_NOT_CONFIGURED: DATA_GO_KR_KEY가 필요합니다.', 503)


def fetch_period_retail(ctgry_cd, item_cd, vrty_cd=None, *, start: date, end: date) -> list[dict]:
    require_key()
    if start > end:
        raise ValueError('시작일은 종료일 이하여야 합니다.')
    params = {
        'serviceKey': settings.DATA_GO_KR_KEY,
        'returnType': 'JSON',
        'pageNo': 1,
        'numOfRows': 1000,
        'cond[exmn_ymd::GTE]': start.strftime('%Y%m%d'),
        'cond[exmn_ymd::LTE]': end.strftime('%Y%m%d'),
        'cond[ctgry_cd::EQ]': ctgry_cd,
        'cond[item_cd::EQ]': item_cd,
        'cond[se_cd::EQ]': '01',
        'cond[grd_cd::EQ]': '04',
    }
    if vrty_cd is not None:
        params['cond[vrty_cd::EQ]'] = vrty_cd
    result = []
    global _last_call
    while True:
        for attempt in range(3):
            with _lock:
                if _last_call is not None:
                    time.sleep(max(0, 1.1 - (time.monotonic() - _last_call)))
                _last_call = time.monotonic()
                try:
                    payload = http.get_sync(URL, params=dict(params)).json()
                except Exception:
                    raise AppError('AT_API_ERROR', 'aT 응답을 가져오지 못했습니다.', 502) from None
            error = payload.get('OpenAPI_ServiceResponse', {}).get('cmmMsgHeader', {}).get('errMsg')
            if error == LIMIT and attempt < 2:
                time.sleep(30)
                continue
            if error:
                raise AppError(
                    'AT_API_ERROR', str(error).replace(settings.DATA_GO_KR_KEY, '***'), 502
                )
            break
        response = payload.get('response', {})
        if str(response.get('header', {}).get('resultCode', '0')) not in ('0', '00'):
            raise AppError('AT_API_ERROR', 'aT API가 오류를 반환했습니다.', 502)
        body = response.get('body')
        if not isinstance(body, dict):
            raise AppError('AT_API_ERROR', 'aT 응답 형식이 올바르지 않습니다.', 502)
        rows = (body.get('items') or {}).get('item') or []
        if isinstance(rows, dict):
            rows = [rows]
        result.extend(rows)
        if len(result) >= int(body.get('totalCount', len(result))):
            return result
        if not rows:
            raise AppError('AT_API_ERROR', 'aT 페이지가 비어 있습니다.', 502)
        params['pageNo'] += 1
