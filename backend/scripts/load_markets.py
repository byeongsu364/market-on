"""전국전통시장표준데이터 API 또는 CSV를 listed 시장으로 적재한다."""

import argparse
import csv
import hashlib
import math
from app.core import http
from app.core.config import settings
from app.core.errors import AppError
from app.db.pool import connection
from app.db.repositories import market_request_repo
from ._common import run

URL = 'https://api.data.go.kr/openapi/tn_pubr_public_trdit_mrkt_api'


def fetch_rows():
    if not settings.DATA_GO_KR_KEY:
        raise AppError('MARKETS_NOT_CONFIGURED', 'DATA_GO_KR_KEY가 필요합니다.', 503)
    result = []
    page = 1
    while True:
        try:
            payload = http.get_sync(
                URL,
                params=dict(
                    serviceKey=settings.DATA_GO_KR_KEY, pageNo=page, numOfRows=1000, type='json'
                ),
            ).json()
            # 키가 이 API에 활용신청되지 않으면 OpenAPI_ServiceResponse로 와요
            header = (payload.get('OpenAPI_ServiceResponse') or {}).get('cmmMsgHeader')
            if header:
                raise AppError(
                    'MARKETS_API_ERROR',
                    f'표준데이터 API 거절: {header.get("errMsg")} '
                    '(data.go.kr에서 전국전통시장표준데이터 활용신청 필요). CSV 적재도 가능합니다.',
                    502,
                )
            response = payload['response']
            if str(response['header']['resultCode']) not in ('0', '00'):
                raise ValueError()
            body = response['body']
            items = body.get('items') or []
            if isinstance(items, dict):
                items = items.get('item') or []
            if isinstance(items, dict):
                items = [items]
            result.extend(items)
            if len(result) >= int(body['totalCount']):
                return result
            if not items:
                raise ValueError()
            page += 1
        except AppError:
            raise
        except Exception as error:
            status = getattr(getattr(error, 'response', None), 'status_code', None)
            hint = ' — 키가 이 API에 활용신청되지 않았을 수 있어요' if status in (401, 403) else ''
            raise AppError(
                'MARKETS_API_ERROR',
                f'표준데이터 응답을 확인하세요 (HTTP {status or "?"}){hint}. CSV 적재도 가능합니다.',
                502,
            ) from None


def prepare(rows, sido=None):
    values, skipped = [], 0
    for row in rows:

        def field(api, csv_name):
            return str(row.get(api) or row.get(csv_name) or '').strip()

        name = field('mrktNm', '시장명')
        address = field('rdnmadr', '소재지도로명주소') or field('lnmadr', '소재지지번주소')
        if sido and not address.startswith(sido):
            continue
        try:
            lat, lng = float(field('latitude', '위도')), float(field('longitude', '경도'))
            if (
                not name
                or not all(map(math.isfinite, (lat, lng)))
                or not (-90 <= lat <= 90 and -180 <= lng <= 180)
            ):
                raise ValueError()
        except ValueError:
            skipped += 1
            continue
        code = field('mrktCd', '시장코드')
        identity = code or hashlib.sha256(f'{name}|{address}'.encode()).hexdigest()[:24]
        count = field('storNumber', '점포수').replace(',', '')
        values.append(
            dict(
                id=f'market:std-{identity}',
                name_ko=name,
                address=address,
                lat=lat,
                lng=lng,
                store_count=int(count) if count.isdecimal() else None,
            )
        )
    return values, skipped


def load_markets(conn, rows, sido=None):
    values, skipped = prepare(rows, sido)
    with conn.transaction():
        for value in values:
            market_request_repo.upsert_listed(conn, value)
    print(f'처리={len(values)} 좌표·필수값 없음={skipped}')
    return dict(processed=len(values), skipped=skipped)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sido')
    parser.add_argument('--csv')
    args = parser.parse_args()
    if args.csv:
        try:
            with open(args.csv, encoding='utf-8-sig', newline='') as file:
                rows = list(csv.DictReader(file))
        except UnicodeDecodeError:
            with open(args.csv, encoding='cp949', newline='') as file:
                rows = list(csv.DictReader(file))
    else:
        rows = fetch_rows()
    with connection() as conn:
        load_markets(conn, rows, args.sido)


if __name__ == '__main__':
    run(main)
