"""적재 파이프라인 7단계 (작업 지시서 044, 기획서 v1 4장).

collect → clean → normalize → chunk → review → load → invalidate
단계마다 다음 단계가 읽는 파일을 남겨서 중간에 멈춰도 그 단계부터 다시 시작할 수 있어요.

    python -m scripts.pipeline                      # 처음부터 끝까지
    python -m scripts.pipeline --from chunk --to review --offline
    python -m scripts.pipeline --offline --no-embed --eval

- collect: 이용 조건이 확인된 API만 원문 수집 (지금은 「농식품 이달의 식재료」)
- review: 청크 숫자·단위가 수집한 원문에 있는지 자동 대조 (사람 검수는 RAG_REVIEW.md)
- 리포트: data/build/load_report.json · .md (자동 검사 4개 포함)
"""

import argparse
import html
import json
import re
import time
from collections import Counter
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path

import yaml

from app.knowledge.fact_check import extract_numbers, normalize_values
from app.knowledge.ingest import _hash, chunk_document, tag_entities
from app.knowledge.intents import DOC_TYPE_TO_INTENT
from app.knowledge.ontology import normalize as normalize_label
from app.knowledge.recipes import metadata as recipe_metadata

from ._common import DATA, run

STAGES = ('collect', 'clean', 'normalize', 'chunk', 'review', 'load', 'invalidate')
MONTH_FOOD_URL = 'https://apis.data.go.kr/1390803/allbaroFoodMonth/foodCont'
# 원문 필드 → 제목 (API 응답 이름, docs/data/API_데이터확인.md 5장)
MONTH_FOOD_FIELDS = {
    'ctvtIndcDtl': '재배·특성',
    'prchCheatDtl': '품종 특성·구입 요령',
    'cstdyMthDtl': '보관법·손질법',
    'etcInfoDtl': '기타',
    'ntkMthDtl': '먹는 법',
    'ntrIrdntEfcyDtl': '영양·효능',
}
OPEN_LICENSE = ('제한 없음', '제1유형')
STRUCTURAL_PREDICATES = {'isA', 'hasGrade', 'soldBy'}


def paths(data_dir: Path = DATA) -> dict[str, Path]:
    return {
        'raw': data_dir / 'raw',
        'clean': data_dir / 'raw' / 'clean',
        'build': data_dir / 'build',
        'docs': data_dir / 'rag_docs',
        'ontology': data_dir / 'ontology',
        'sources': data_dir / 'sources.yaml',
    }


# ── 1. collect ──────────────────────────────────────────────


def month_food_sources(sources_path: Path) -> dict[str, dict]:
    """sources.yaml의 `# fdmtSn N` 주석(바로 아래 출처 키) → {source_key: {sn, license, title}}."""
    sources = yaml.safe_load(sources_path.read_text())
    found, pending = {}, None
    for line in sources_path.read_text().splitlines():
        comment = re.match(r'\s*#\s*fdmtSn\s+(\d+)\s*$', line)
        if comment:
            pending = comment[1]
            continue
        key = re.match(r'^(src:[^:\s]+):(?:\s.*)?$', line)
        if key and pending:
            meta = sources.get(key[1]) or {}
            found[key[1]] = {
                'sn': pending,
                'license': meta.get('license') or '',
                'title': meta.get('title') or key[1],
            }
            pending = None
        elif line.strip() and not line.lstrip().startswith('#'):
            pending = None
    return found


def license_ok(license_text: str) -> bool:
    return '확인 필요' not in license_text and any(word in license_text for word in OPEN_LICENSE)


def fetch_month_food(sn: str) -> dict:
    from app.core import http
    from app.core.config import settings

    if not settings.DATA_GO_KR_KEY:
        raise RuntimeError('DATA_GO_KR_KEY가 필요합니다.')
    response = http.get_sync(
        MONTH_FOOD_URL,
        params={'serviceKey': settings.DATA_GO_KR_KEY, 'format': 'json', 'srchFdmtSn': sn},
    )
    return response.json()


def collect(p: dict, fetch=fetch_month_food) -> dict:
    out = p['raw'] / 'nics'
    out.mkdir(parents=True, exist_ok=True)
    report = {'collected': [], 'skipped': [], 'failed': []}
    rows = []
    for key, meta in sorted(month_food_sources(p['sources']).items()):
        if not license_ok(meta['license']):
            report['skipped'].append({'source': key, 'reason': '이용 조건 미확인'})
            continue
        try:
            data = fetch(meta['sn'])
            body = (data.get('response') or {}).get('body') or {}
            if not any(body.get(section) for section in ('stdInfo', 'ntkInfo')):
                raise ValueError('원문 내용 없는 응답')
        except Exception as error:  # noqa: BLE001 - 한 출처가 실패해도 나머지는 계속
            # 오류 문구에 요청 주소(키 포함)가 섞일 수 있어 종류만 남김
            report['failed'].append({'source': key, 'reason': type(error).__name__})
            continue
        (out / f'{meta["sn"]}.json').write_text(json.dumps(data, ensure_ascii=False, indent=1))
        report['collected'].append(key)
        rows.append((key, meta))
    stamp = datetime.now(UTC).astimezone().date().isoformat()
    lines = [
        '# 수집한 원문의 출처와 이용 조건',
        '',
        '> `python -m scripts.pipeline`이 만들어요. 이용 조건이 확인된 출처만 원문을 저장해요.',
        '',
        '| 출처 키 | 제목 | 원문 파일 | 이용 조건 | 받은 날 |',
        '|---|---|---|---|---|',
    ]
    previous = p['raw'] / 'LICENSES.md'
    if previous.exists():
        collected = {key for key, _ in rows}
        lines += [
            line
            for line in previous.read_text().splitlines()
            if line.startswith('| `src:') and line.split('`')[1] not in collected
        ]
    lines += [
        f'| `{key}` | {meta["title"]} | `nics/{meta["sn"]}.json` | {meta["license"]} | {stamp} |'
        for key, meta in rows
    ]
    (p['raw'] / 'LICENSES.md').write_text('\n'.join(lines) + '\n')
    return report


# ── 2. clean ────────────────────────────────────────────────


def clean_text(value: str) -> str:
    text = html.unescape(value or '')
    text = re.sub(
        r'<(?:script|style)\b[^>]*>.*?</(?:script|style)>',
        '',
        text,
        flags=re.DOTALL | re.IGNORECASE,
    )
    text = re.sub(r'<(?:br\s*/?|/p|/div|/li)>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = text.replace('■', '\n').replace('¶', ' ')
    text = re.sub(r'\s*-\s+(?=\S)', '\n- ', text)
    text = text.replace('°C', '℃').replace('㎏', 'kg').replace('～', '~')
    text = text.replace('∼', '~')
    text = re.sub(r'(\d)\s*(?:킬로그램|KG)\b', r'\1kg', text)
    text = re.sub(r'(\d)\s*도', r'\1℃', text)
    lines = [re.sub(r'[ \t]+', ' ', line).strip() for line in text.split('\n')]
    return normalize_values('\n'.join(line for line in lines if line))


def month_food_markdown(data: dict, title: str) -> str:
    body = (data.get('response') or {}).get('body') or {}
    parts = [f'# {title}', '']
    for section in ('stdInfo', 'ntkInfo'):
        info = body.get(section) or {}
        info = info[0] if isinstance(info, list) and info else info
        if not isinstance(info, dict):
            continue
        for field, label in MONTH_FOOD_FIELDS.items():
            if info.get(field):
                parts += [f'## {label}', '', clean_text(info[field]), '']
    return '\n'.join(parts).strip() + '\n'


def clean(p: dict) -> dict:
    p['clean'].mkdir(parents=True, exist_ok=True)
    report = {'cleaned': [], 'missing_raw': []}
    for key, meta in sorted(month_food_sources(p['sources']).items()):
        raw = p['raw'] / 'nics' / f'{meta["sn"]}.json'
        if not raw.exists():
            report['missing_raw'].append(key)
            continue
        if not license_ok(meta['license']):
            continue
        text = month_food_markdown(json.loads(raw.read_text()), meta['title'])
        (p['clean'] / f'{key.removeprefix("src:")}.md').write_text(text)
        report['cleaned'].append(key)
    return report


# ── 3. normalize ────────────────────────────────────────────


def ontology_index(ontology_dir: Path) -> dict:
    from .load_ontology import ontology_ids

    entities = {
        e['id']: e
        for path in sorted(ontology_dir.glob('*.yaml'))
        for e in yaml.safe_load(path.read_text()).get('entities', [])
    }
    for path in sorted(ontology_dir.glob('*.yaml')):
        for relation in yaml.safe_load(path.read_text()).get('relations', []):
            if relation.get('s') not in entities:
                raise ValueError(f'{path}: 알 수 없는 주어 {relation.get("s")}')
            entities[relation['s']].setdefault('relations', []).append(relation)
    varieties = {}
    for e in entities.values():
        for relation in e.get('relations', []):
            if relation.get('p') == 'hasGrade':
                varieties.setdefault(e['id'], []).append(relation['o'])
    return {'ids': ontology_ids(ontology_dir), 'entities': entities, 'varieties': varieties}


def normalize(p: dict, index: dict | None = None) -> tuple[list, dict]:
    from .load_documents import read_document

    index = index or ontology_index(p['ontology'])
    sources = yaml.safe_load(p['sources'].read_text())
    docs, excluded = [], []
    for path in sorted(p['docs'].rglob('*.md')):
        try:
            doc = read_document(path, p['docs'])
            meta = yaml.safe_load(path.read_text().split('---\n', 2)[1])
            if not isinstance(doc.entities, list) or not all(
                isinstance(e, str) for e in doc.entities
            ):
                raise ValueError('entities는 ID 목록이어야 합니다.')
            if not isinstance(doc.varieties, list) or not all(
                isinstance(v, str) for v in doc.varieties
            ):
                raise ValueError('varieties는 ID 목록이어야 합니다.')
        except (ValueError, KeyError, TypeError, yaml.YAMLError) as exc:
            excluded.append(
                {'doc': path.relative_to(p['docs']).as_posix(), 'problems': [type(exc).__name__]}
            )
            continue
        problems = []
        if not doc.entities:
            problems.append('entities 없음')
        unknown = [e for e in doc.entities if e not in index['ids']]
        if unknown:
            problems.append(f'온톨로지에 없는 ID: {", ".join(unknown)}')
        if doc.source_key not in sources:
            problems.append(f'sources.yaml에 없는 출처: {doc.source_key}')
        if meta.get('intent') and meta['intent'] != DOC_TYPE_TO_INTENT.get(doc.doc_type):
            problems.append('doc_type과 intent 불일치')
        if doc.doc_type not in DOC_TYPE_TO_INTENT:
            problems.append(f'알 수 없는 doc_type: {doc.doc_type}')
        if doc.review_status not in {'draft', 'reviewed', 'rejected'}:
            problems.append('알 수 없는 review_status')
        allowed = {v for e in doc.entities for v in index['varieties'].get(e, [])}
        if set(doc.varieties) - allowed:
            problems.append('연결되지 않은 varieties')
        if problems:
            excluded.append({'doc': doc.doc_key, 'problems': problems})
        else:
            docs.append(doc)
    return docs, {'documents': len(docs), 'excluded': excluded}


# ── 4. chunk ────────────────────────────────────────────────


def _labels(entity: dict) -> list[str]:
    labels = (entity.get('labels') or {}).get('ko') or []
    return [entity.get('name_ko'), *labels]


def chunk_rows(docs: list, index: dict) -> list[dict]:
    rows = []
    for doc in docs:
        names = [index['entities'].get(e, {}).get('name_ko', e) for e in doc.entities]
        allowed = {v for e in doc.entities for v in index['varieties'].get(e, [])}
        for chunk in chunk_document(replace(doc, entity_names=names)):
            candidates = set(doc.varieties) if doc.varieties else allowed
            matches = candidates & {
                v
                for v in candidates
                for label in _labels(index['entities'].get(v, {}))
                if label
                if tag_entities(chunk.content, [(normalize_label(label), v, label)])
            }
            if len(doc.varieties) == 1:
                matches = set(doc.varieties)
            rows.append(
                {
                    'doc_key': doc.doc_key,
                    'chunk_index': chunk.chunk_index,
                    'item_ids': sorted(e for e in doc.entities if e.startswith('item:')),
                    'node_type': doc.doc_type,
                    'intent': DOC_TYPE_TO_INTENT[doc.doc_type],
                    'variety_id': next(iter(matches)) if len(matches) == 1 else None,
                    'numbers': extract_numbers(chunk.content),
                    'review_status': doc.review_status,
                    'source_key': doc.source_key,
                    'chunk_hash': _hash(doc.doc_key, chunk.chunk_index, chunk.content),
                    'content': chunk.content,
                    'props': recipe_metadata(
                        doc,
                        {
                            eid: [
                                int(r['o'].split(':')[-1])
                                for r in entity.get('relations', [])
                                if r['p'] == 'inSeason'
                            ]
                            for eid, entity in index['entities'].items()
                        },
                    )
                    if doc.doc_type == 'recipe'
                    else {},
                }
            )
    return rows


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows))


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


# ── 5. review ───────────────────────────────────────────────


def _compact(text: str) -> str:
    text = normalize_values(text)
    text = re.sub(r'°c', '℃', text, flags=re.IGNORECASE)
    text = re.sub(r'(?<=\d)\s*도', '℃', text)
    text = re.sub(r'(?<=\d)\s*달', '개월', text)
    return re.sub(r'\s+', '', text).replace('～', '~').replace('∼', '~')


def review_rows(rows: list[dict], clean_dir: Path) -> list[dict]:
    """청크의 숫자·단위마다 출처 원문(clean)에 있는지: found / missing / no_source."""
    cache: dict[str, str | None] = {}
    result = []
    for row in rows:
        key = row['source_key']
        if key not in cache:
            path = clean_dir / f'{key.removeprefix("src:")}.md'
            cache[key] = _compact(path.read_text()) if path.exists() else None
        source = cache[key]
        for number in row['numbers']:
            status = (
                'no_source'
                if source is None
                else (
                    'found'
                    if re.search(r'(?<![\d.\-])' + re.escape(_compact(number)) + r'(?!\d)', source)
                    else 'missing'
                )
            )
            result.append(
                {
                    'doc_key': row['doc_key'],
                    'chunk_index': row['chunk_index'],
                    'number': number,
                    'source_key': key,
                    'status': status,
                }
            )
    return result


def review_markdown(checks: list[dict], rows: list[dict]) -> str:
    counts = Counter(c['status'] for c in checks)
    status = Counter(r['review_status'] for r in rows)
    lines = [
        '# 숫자·단위 원문 대조표 (자동)',
        '',
        '> `python -m scripts.pipeline`이 만들어요. 사람 검수는 `data/RAG_REVIEW.md`.',
        (
            '> found = 수집한 원문에 있음 · missing = 수집한 원문에 없음(문서 끝 다른 출처 확인 필요) · '
            'no_source = 원문을 수집하지 않은 출처'
        ),
        '',
        (
            f'- 대조한 숫자 {len(checks)}개: found {counts["found"]} · missing {counts["missing"]} · '
            f'no_source {counts["no_source"]}'
        ),
        '- 청크 검수 상태: ' + ' · '.join(f'{k} {v}' for k, v in sorted(status.items())),
        '',
        '| 문서 | 청크 | 숫자 | 출처 | 결과 |',
        '|---|---|---|---|---|',
    ]
    lines += [
        f'| `{c["doc_key"]}` | {c["chunk_index"]} | {c["number"]} | `{c["source_key"]}` | {c["status"]} |'
        for c in checks
    ]
    lines += [
        '',
        '## 문서별 요약',
        '',
        '| 문서 | 검수 상태 | 있음 | 없음 | 원문 없음 |',
        '|---|---|---|---|---|',
    ]
    for doc_key in sorted({r['doc_key'] for r in rows}):
        counts = Counter(c['status'] for c in checks if c['doc_key'] == doc_key)
        status = next(r['review_status'] for r in rows if r['doc_key'] == doc_key)
        lines.append(
            f'| `{doc_key}` | {status} | {counts["found"]} | {counts["missing"]} | {counts["no_source"]} |'
        )
    return '\n'.join(lines) + '\n'


# ── 자동 검사 4개 ───────────────────────────────────────────


def check_ontology(rows: list[dict], excluded: list[dict], index: dict) -> dict:
    bad = [
        r['doc_key']
        for r in rows
        if not r['item_ids']
        or r['node_type'] not in DOC_TYPE_TO_INTENT
        or set(r['item_ids']) - index['ids']
    ]
    return {
        'name': '온톨로지 연결',
        'ok': not bad,
        'blocking': True,
        'detail': f'청크 {len(rows)}개 중 연결 안 됨 {len(bad)}개 · 제외한 문서 {len(excluded)}개',
        'failures': sorted(set(bad)),
    }


def check_sources(p: dict, docs: list, index: dict) -> dict:
    sources = yaml.safe_load(p['sources'].read_text())
    used = {d.source_key for d in docs}
    absent = []
    for entity in index['entities'].values():
        # 구조 관계(분류·품종 연결·판매 단위)는 팀이 정하는 틀이라 출처를 요구하지 않고,
        # 사실 관계(제철·수확·산지·보관·레시피 재료 등)만 출처가 있어야 해요
        absent.extend(
            f'{entity["id"]}:{r.get("p", "?")}'
            for r in entity.get('relations', [])
            if not r.get('source') and r.get('p') not in STRUCTURAL_PREDICATES
        )
        absent.extend(
            f'{entity["id"]}:criterion:{c.get("key", "?")}'
            for c in entity.get('criteria', [])
            if not c.get('source', entity.get('source'))
        )
        used |= {c['source'] for c in entity.get('criteria', []) if c.get('source')}
        used |= {r['source'] for r in entity.get('relations', []) if r.get('source')}
        if entity.get('source'):
            used.add(entity['source'])
        attrs = entity.get('attrs') or {}
        if attrs.get('description_source'):
            used.add(attrs['description_source'])
    missing = sorted(k for k in used if k not in sources)
    no_license = sorted(
        k for k in used if k in sources and not str((sources[k] or {}).get('license') or '').strip()
    )
    return {
        'name': '출처·라이선스',
        'ok': not missing and not no_license and not absent,
        'blocking': True,
        'detail': f'쓰는 출처 {len(used)}개 · 없는 출처 {len(missing)}개 · 라이선스 빈 출처 {len(no_license)}개 · 출처 없는 관계 {len(absent)}개',
        'failures': missing + no_license + absent,
    }


def check_duplicates(rows: list[dict]) -> dict:
    counts = Counter(r['chunk_hash'] for r in rows)
    same_text = Counter(re.sub(r'^\[[^\]]*\]\s*', '', r['content']) for r in rows)
    dup_hash = [h for h, n in counts.items() if n > 1]
    dup_text = [t[:40] for t, n in same_text.items() if n > 1]
    return {
        'name': '중복',
        'ok': not dup_hash,
        'blocking': False,
        'detail': f'같은 chunk_hash {len(dup_hash)}개 · 같은 본문 {len(dup_text)}개',
        'failures': dup_text,
    }


def check_reports(conn) -> dict:
    if conn is None:
        return {
            'name': '제보 가격 범위',
            'ok': True,
            'blocking': False,
            'detail': 'DB 없이 실행해 확인하지 않음',
            'failures': [],
        }
    total, held = conn.execute(
        "select count(*), count(*) filter (where status='held') from price_reports"
    ).fetchone()
    share = f'{held / total:.0%}' if total else '0%'
    return {
        'name': '제보 가격 범위',
        'ok': True,
        'blocking': False,
        'detail': f'제보 {total}건 중 aT 0.3~3배 밖 보류 {held}건 ({share})',
        'failures': [],
    }


# ── 7. invalidate ───────────────────────────────────────────


def stale_cache_rows(conn) -> int:
    """문서 버전이 바뀐 품목의 예전 캐시 행을 지워요 (지금 버전·다른 품목·사용량 기록은 그대로).

    적재할 때(ingest.upsert_document) 바뀐 품목 캐시를 이미 지우지만, 그 뒤 남은 행을 한 번 더 정리해요.
    """
    from app.db.repositories import ask_repo, store_repo
    from app.knowledge.answer_cache import document_digest

    deleted = 0
    for (key,) in conn.execute(
        "select cache_key from response_cache where cache_key like 'ask:%%' or cache_key like 'recommend:%%'"
    ).fetchall():
        parts = key.split(':')
        stale = False
        if len(parts) == 8 and parts[:2] == ['ask', 'item']:
            item = ':'.join(parts[1:3])
            stale = parts[6] != document_digest(ask_repo.document_version(conn, item))
        elif len(parts) in (10, 11) and parts[:2] == ['recommend', 'v2']:
            # market IDs contain a colon; the v2 suffix has a fixed shape.
            market = ':'.join(parts[2:4])
            ids = sorted({r['item_id'] for r in store_repo.market_items(conn, market)})
            version = document_digest([(i, ask_repo.document_version(conn, i)) for i in ids])
            stale = parts[9] != version
        if stale:
            deleted += conn.execute(
                'delete from response_cache where cache_key=%s', (key,)
            ).rowcount

    return deleted


# ── 실행 ───────────────────────────────────────────────────


def report_markdown(report: dict) -> str:
    lines = [
        '# 적재 리포트',
        '',
        f'- 실행: {report["started_at"]} · {report["seconds"]}초 · 단계 {", ".join(report["stages"])}',
        '',
        '## 자동 검사',
        '',
        '| 검사 | 결과 | 내용 |',
        '|---|---|---|',
    ]
    lines += [
        f'| {c["name"]} | {"통과" if c["ok"] else "실패"} | {c["detail"]} |'
        for c in report.get('checks', [])
    ]
    lines += [
        '',
        '## 숫자 대조와 검수 상태',
        '',
        json.dumps(report.get('number_review', {}), ensure_ascii=False),
        '',
        json.dumps(report.get('review_status', {}), ensure_ascii=False),
    ]
    lines += [
        '',
        '## 제외 문서',
        '',
        json.dumps(report.get('excluded_documents', []), ensure_ascii=False),
    ]
    lines += ['', '## 단계', '']
    for stage, value in report['results'].items():
        lines.append(f'- **{stage}**: {json.dumps(value, ensure_ascii=False)}')
    return '\n'.join(lines) + '\n'


def run_pipeline(
    *,
    data_dir: Path = DATA,
    start: str = 'collect',
    end: str = 'invalidate',
    offline: bool = False,
    embed: bool = True,
    conn=None,
    fetch=fetch_month_food,
) -> dict:
    p = paths(data_dir)
    p['build'].mkdir(parents=True, exist_ok=True)
    if STAGES.index(start) > STAGES.index(end):
        raise ValueError('--from이 --to보다 뒤예요.')
    selected = STAGES[STAGES.index(start) : STAGES.index(end) + 1]
    began = time.monotonic()
    report = {
        'started_at': datetime.now(UTC).astimezone().isoformat(timespec='seconds'),
        'stages': list(selected),
        'results': {},
        'checks': [],
    }
    index = ontology_index(p['ontology'])
    docs, excluded, rows = None, [], None
    chunks_path = p['build'] / 'chunks.jsonl'

    for stage in selected:
        stage_began = time.monotonic()
        if stage == 'collect':
            report['results']['collect'] = (
                {'skipped': 'offline'} if offline else collect(p, fetch=fetch)
            )
        elif stage == 'clean':
            report['results']['clean'] = clean(p)
        elif stage == 'normalize':
            docs, info = normalize(p, index)
            excluded = info['excluded']
            report['results']['normalize'] = info
        elif stage == 'chunk':
            if docs is None:
                docs, info = normalize(p, index)
                excluded = info['excluded']
            rows = chunk_rows(docs, index)
            write_jsonl(chunks_path, rows)
            report['results']['chunk'] = {
                'chunks': len(rows),
                'with_variety': sum(1 for r in rows if r['variety_id']),
                'with_numbers': sum(1 for r in rows if r['numbers']),
            }
        elif stage == 'review':
            rows = rows if rows is not None else read_jsonl(chunks_path)
            checks = review_rows(rows, p['clean'])
            (p['build'] / 'review.md').write_text(review_markdown(checks, rows))
            report['results']['review'] = dict(Counter(c['status'] for c in checks))
        elif stage == 'load':
            if docs is None:
                docs, info = normalize(p, index)
                excluded = info['excluded']
            rows = rows if rows is not None else chunk_rows(docs, index)
            report['checks'] = [
                check_ontology(rows, excluded, index),
                check_sources(p, docs, index),
                check_duplicates(rows),
                check_reports(conn),
            ]
            blocked = [c['name'] for c in report['checks'] if c['blocking'] and not c['ok']]
            if blocked:
                report['results']['load'] = {'blocked_by': blocked}
                report['failed'] = True
                report['results']['load']['seconds'] = round(time.monotonic() - stage_began, 3)
                break
            if conn is None:
                report['results']['load'] = {'skipped': 'DB 연결 없음'}
            else:
                from .load_all import load_all

                try:
                    with conn.transaction():
                        counts = load_all(conn, data_dir=data_dir, embed=embed, documents=docs)
                    report['results']['load'] = dict(counts)
                except Exception as exc:  # noqa: BLE001 -- persist a sanitized failure report
                    report['results']['load'] = {'failed': type(exc).__name__}
                    report['failed'] = True
                    report['results']['load']['seconds'] = round(time.monotonic() - stage_began, 3)
                    break
        elif stage == 'invalidate':
            report['results']['invalidate'] = (
                {'deleted': stale_cache_rows(conn)}
                if conn is not None
                else {'skipped': 'DB 연결 없음'}
            )

        report['results'][stage]['seconds'] = round(time.monotonic() - stage_began, 3)

    if 'invalidate' in report['results'] and conn is not None:
        docs, info = normalize(p, index)
        rows = chunk_rows(docs, index)
        report['checks'] = [
            check_ontology(rows, info['excluded'], index),
            check_sources(p, docs, index),
            check_duplicates(rows),
            check_reports(conn),
        ]
    if not report['checks']:
        docs, info = normalize(p, index)
        rows = rows if rows is not None else chunk_rows(docs, index)
        report['checks'] = [
            check_ontology(rows, info['excluded'], index),
            check_sources(p, docs, index),
            check_duplicates(rows),
            check_reports(conn),
        ]
    if rows is not None:
        report['number_review'] = dict(Counter(c['status'] for c in review_rows(rows, p['clean'])))
        counts = Counter(r['review_status'] for r in rows)
        report['review_status'] = {
            k: {'count': v, 'ratio': v / len(rows)} for k, v in counts.items()
        }
    report['excluded_documents'] = info['excluded']
    report['seconds'] = round(time.monotonic() - began, 1)
    (p['build'] / 'load_report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1))
    (p['build'] / 'load_report.md').write_text(report_markdown(report))
    return report


def main():
    parser = argparse.ArgumentParser(description='적재 파이프라인 7단계')
    parser.add_argument('--from', dest='start', choices=STAGES, default='collect')
    parser.add_argument('--to', dest='end', choices=STAGES, default='invalidate')
    parser.add_argument('--offline', action='store_true', help='collect(네트워크)를 건너뜀')
    parser.add_argument('--embed', action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument('--eval', action='store_true', help='끝나고 시연 질문 30개 평가')
    args = parser.parse_args()
    if args.eval and args.end != 'invalidate':
        parser.error('--eval은 invalidate 단계까지 실행할 때만 쓸 수 있어요.')
    if STAGES.index(args.start) > STAGES.index(args.end):
        parser.error('--from이 --to보다 뒤예요.')
    needs_db = STAGES.index(args.end) >= STAGES.index('load')
    if needs_db:
        from app.db.pool import connection

        with connection() as conn:
            report = run_pipeline(
                start=args.start, end=args.end, offline=args.offline, embed=args.embed, conn=conn
            )
            if args.eval and 'invalidate' in report['results']:
                from .evaluate import evaluate

                evaluate(conn)
    else:
        report = run_pipeline(
            start=args.start, end=args.end, offline=args.offline, embed=args.embed
        )
    for check in report['checks']:
        print(f'[{"통과" if check["ok"] else "실패"}] {check["name"]}: {check["detail"]}')
    print(f'리포트: {paths()["build"] / "load_report.md"}')
    if report.get('failed'):
        raise SystemExit(1)


if __name__ == '__main__':
    run(main)
