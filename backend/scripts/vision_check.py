"""실제 구글 비전으로 사진 폴더를 확인해요 (작업 지시서 040 1-2·4장).

    python -m scripts.vision_check 사진폴더 [--save-fixtures]

- 사진마다 비전 라벨(점수 순)·글자를 받고, 서버와 같은 방법으로 품목 후보·가격표를 만들어 표로 보여 줘요
- 파일 이름 앞부분을 정답 품목으로 봐요 (apple-1.jpg → apple). tag-로 시작하면 가격표 사진
- --save-fixtures: 비전 응답(라벨·점수·글자)을 backend/tests/fixtures/vision/<이름>.json으로 저장
  (사진·키는 저장하지 않아요. 저장된 라벨만 온톨로지 vision 라벨 후보로 써요)
- 비전 호출은 사진 1장 = 2건(라벨+글자)으로 무료 한도에 들어가요. 하루·한 달 상한은 서버와 같아요
"""

import argparse
import json
import statistics
import time
from pathlib import Path

from app.clients import vision
from app.db.pool import connection
from app.services import scan_service

from ._common import run

PHOTOS = ('.jpg', '.jpeg', '.png', '.webp')
FIXTURES = Path(__file__).resolve().parents[1] / 'tests' / 'fixtures' / 'vision'


def check(folder: Path, save: bool) -> None:
    if not vision.configured():
        raise SystemExit('GOOGLE_VISION_API_KEY가 .env에 없어요.')
    photos = sorted(p for p in folder.iterdir() if p.suffix.lower() in PHOTOS)
    if not photos:
        raise SystemExit(f'사진이 없어요: {folder}')
    rows, times, saved = [], [], 0
    with connection() as conn:
        for path in photos:
            raw = path.read_bytes()
            ext, _ = scan_service.image_format(raw)
            image, _ = scan_service.clean_photo(raw, ext)  # 서버와 같이 메타데이터를 지운 뒤 보냄
            # 서버와 같은 길로 부름: 하루·한 달 한도 확인 + llm_calls 기록(한 달 한도 계산에 들어감)
            start = time.monotonic()
            result = scan_service.call_vision(image)
            seconds = time.monotonic() - start
            if result is None:
                rows.append(f'| {path.name} | 비전 실패 또는 한도 | - | - | - | {seconds:.2f}초 |')
                continue
            times.append(seconds)
            found = scan_service.interpret(conn, result)  # 서버와 같은 방법
            candidates, tag = found['candidates'], found['price_tag']
            if save:
                FIXTURES.mkdir(parents=True, exist_ok=True)
                (FIXTURES / f'{path.stem}.json').write_text(
                    json.dumps(
                        {'labels': result['labels'], 'text': result['text']},
                        ensure_ascii=False,
                        indent=2,
                    ),
                    encoding='utf-8',
                )
                saved += 1
            top = ', '.join(f'{c["name"]}({c["confidence"]:.2f})' for c in candidates) or '-'
            scored = ', '.join(f'{label}({score:.2f})' for label, score in result['labels'][:6])
            text = ' / '.join(result['text'].split('\n'))[:40]
            price = f'{int(tag["price"]):,}원' if tag and tag['price'] else '가격 못 읽음'
            tag_text = f'{price} · {tag["unit_text"] or "-"}' if tag else '-'
            if found['variety_id']:
                tag_text += f' · 품종 {found["variety_id"]}'
            rows.append(
                f'| {path.name} | {scored} | {top} | {text or "-"} | {tag_text} | {seconds:.2f}초 |'
            )
    print('| 사진 | 비전 라벨(점수) | 후보(확신도) | 사진 속 글자 | 가격표 | 비전 시간 |')
    print('|---|---|---|---|---|---|')
    print('\n'.join(rows))
    if times:
        print(f'\n비전 호출 {len(times)}장 · 중앙값 {statistics.median(times):.2f}초')
    if saved:
        print(f'비전 응답 {saved}개 저장: {FIXTURES}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder', type=Path)
    parser.add_argument('--save-fixtures', action='store_true')
    args = parser.parse_args()
    check(args.folder, args.save_fixtures)


if __name__ == '__main__':
    run(main)
