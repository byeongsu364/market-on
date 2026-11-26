"""켜 둔 백엔드(uvicorn)에 실제로 물어보기·대화를 보내서 걸린 시간을 재요 (작업 지시서 040 4장).

    python -m scripts.speed_check [--base http://localhost:8000] [--rounds 1]

- 물어보기 5개·대화 5개를 보내고 한 번마다 걸린 시간, 답한 모델, 거친 단계(steps)를 보여 줘요
- 저장된 답(cached)은 0초라 중앙값에서 빼요. 처음 재려면 response_cache를 비우고 돌려요
- 끝에 llm_calls에서 이번에 기록된 역할별·모델별 중앙값도 보여 줘요
- 기준(중앙값): 인식 2초 이하(vision_check로 잼) · 물어보기 7초 이하 · 대화 12초 이하
"""

import argparse
import statistics
import time
import uuid
from datetime import UTC, datetime

import httpx

from app.db.pool import connection

from ._common import run

# 시장은 DB에 있는 것 중 고름: 경동시장 → 시연 시장 → 아무거나 (--market로 지정 가능)
PREFERRED_MARKETS = ('market:gyeongdong', 'market:demo')
ASKS = [
    ('item:green_onion', 'store', '대파 오래 두려면 어떻게 보관해요?'),
    ('item:apple', 'select', '사과 고를 때 뭘 봐요?'),
    ('item:onion', 'prep', '양파 손질은 어떻게 해요?'),
    ('item:pear', 'store', '배는 어떻게 보관해요?'),
    ('item:sweet_persimmon', 'story', '단감은 어떤 품종이 있어요?'),
]
CHATS = [
    '대파 파는 가게 어디 있어?',
    '오늘 사과 시세 얼마야?',
    '양파 보관은 어떻게 해?',
    '4명이 먹을 장보기 3만원으로 짜 줘',
    '마감세일 하는 거 있어?',
]


def timed(client, path, body):
    start = time.monotonic()
    response = client.post(path, json=body)
    seconds = time.monotonic() - start
    data = (
        response.json()
        if response.headers.get('content-type', '').startswith('application/json')
        else {}
    )
    if response.status_code != 200 and isinstance(data.get('error'), dict):
        data = data | {'kind': data['error'].get('code', '')}
    return seconds, response.status_code, data


def pick_market(conn, wanted):
    from app.db.repositories import store_repo

    ids = [m['id'] for m in store_repo.list_markets(conn)]
    if wanted:
        if wanted not in ids:
            raise SystemExit(f'시장 {wanted}이 DB에 없어요. 있는 시장: {", ".join(ids) or "없음"}')
        return wanted
    for market_id in PREFERRED_MARKETS:
        if market_id in ids:
            return market_id
    if not ids:
        raise SystemExit('DB에 시장이 없어요. python -m scripts.seed_demo_market 먼저 실행해요.')
    return ids[0]


def embed_seconds(rounds=3):
    """물어보기에서 근거 찾기 전에 질문을 숫자로 바꾸는 시간 (bge-m3, 학교 서버)."""
    from app.llm.factory import get_embedder

    embedder = get_embedder()
    times = []
    for i in range(rounds):
        start = time.monotonic()
        embedder.embed([f'대파 보관 방법 {i}'], task='query')
        times.append(time.monotonic() - start)
    return statistics.median(times)


def median(values):
    return f'{statistics.median(values):.1f}초' if values else '-'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default='http://localhost:8000')
    parser.add_argument('--rounds', type=int, default=1)
    parser.add_argument('--market', help='시장 ID (비우면 DB에서 고름)')
    parser.add_argument('--skip-ask', action='store_true', help='대화만 재기')
    args = parser.parse_args()
    with connection() as conn:
        market = pick_market(conn, args.market)
    print(f'시장: {market}')
    started = datetime.now(UTC)
    headers = {'X-Requested-With': 'market-on', 'X-Device-Id': str(uuid.uuid4())}
    ask_times, chat_times = [], []
    with httpx.Client(base_url=args.base, headers=headers, timeout=120) as client:
        print('| 물어보기 | 시간 | 상태 | 모델 | 단계 | 저장된 답 |\n|---|---|---|---|---|---|')
        for _ in range(0 if args.skip_ask else args.rounds):
            for item_id, intent, question in ASKS:
                body = {
                    'question': question,
                    'intent': intent,
                    'item_id': item_id,
                    'market_id': market,
                }
                seconds, status, data = timed(client, '/ask', body)
                cached = bool(data.get('cached'))
                if status == 200 and not cached:
                    ask_times.append(seconds)
                print(
                    f'| {question} | {seconds:.1f}초 | {status} {data.get("kind", "")} | '
                    f'{data.get("model") or "-"} | {"→".join(data.get("steps") or []) or "-"} | '
                    f'{"예" if cached else ""} |'
                )
        print('\n| 대화 | 시간 | 상태 | 모델 | 단계 |\n|---|---|---|---|---|')
        for _ in range(args.rounds):
            for question in CHATS:
                body = {'messages': [{'role': 'user', 'content': question}], 'market_id': market}
                seconds, status, data = timed(client, '/chat', body)
                if status == 200:
                    chat_times.append(seconds)
                print(
                    f'| {question} | {seconds:.1f}초 | {status} {data.get("kind", "")} | '
                    f'{data.get("model") or "-"} | '
                    f'{"→".join(data.get("steps") or []) or "-"} |'
                )
    try:
        print(f'\n질문 임베딩(bge-m3) 중앙값 {embed_seconds():.1f}초 · 물어보기 시간에 포함')
    except Exception as exc:  # noqa: BLE001 - 측정 보조라 실패해도 계속
        print(f'\n질문 임베딩 시간을 재지 못했어요: {type(exc).__name__}')
    print(
        f'물어보기 중앙값 {median(ask_times)} (기준 7초) · 대화 중앙값 {median(chat_times)} (기준 12초)'
    )
    with connection() as conn:
        rows = conn.execute(
            """select task, role, provider, count(*), count(*) filter (where ok),
                      percentile_cont(0.5) within group (order by ms)
               from llm_calls where created_at >= %s
               group by task, role, provider order by task, role, provider""",
            (started,),
        ).fetchall()
    print('\n| 요청 | 역할 | 모델 | 호출 | 성공 | 중앙값 |\n|---|---|---|---|---|---|')
    for task, role, provider, total, ok, ms in rows:
        print(f'| {task} | {role or "-"} | {provider} | {total} | {ok} | {ms / 1000:.1f}초 |')


if __name__ == '__main__':
    run(main)
