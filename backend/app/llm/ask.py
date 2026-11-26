"""물어보기 모델 호출. 역할(040): route(의도 나누기) · extract(긴 근거에서 사실 뽑기) · write(최종 답)."""

import json
from pathlib import Path

from .router import run

PROMPTS = Path(__file__).with_name('prompts')
# 근거가 이만큼 길거나 많으면 write 전에 extract로 필요한 사실만 뽑아요
EXTRACT_MIN_CHUNKS = 4
EXTRACT_MIN_CHARS = 2000


def parse(text):
    try:
        value = json.loads(text[text.index('{') : text.rindex('}') + 1])
        return value if isinstance(value, dict) else None
    except (ValueError, TypeError):
        return None


def classify(question):
    """규칙으로 못 나눈 질문만 여기로 와요 (route = 젬마)."""
    prompt = (
        '다음 질문의 의도를 select, store, prep, season, story, price, where, recipe 중 하나로 분류하세요. 해당 없으면 out_of_scope. JSON만: {"intent":"..."}\n질문: '
        + json.dumps(question, ensure_ascii=False)
    )
    routed = run(
        'route',
        lambda provider: parse(provider.generate(prompt)),
        lambda v: None if v and isinstance(v.get('intent'), str) else 'invalid_json',
        task='ask',
    )
    return (routed.value or {}).get('intent')


def needs_extract(chunks) -> bool:
    return len(chunks) >= EXTRACT_MIN_CHUNKS or sum(map(len, chunks)) >= EXTRACT_MIN_CHARS


def extract(question, chunks) -> list[str]:
    """근거 번호는 그대로 두고, 각 근거에서 질문에 필요한 문장만 남겨요.
    실패하면 원래 근거를 그대로 돌려줘요 (답 확인은 언제나 원래 근거로 해요)."""
    prompt = PROMPTS.joinpath('extract.txt').read_text(encoding='utf-8')
    prompt += '\n질문: ' + json.dumps(question, ensure_ascii=False)
    prompt += '\n근거:\n' + '\n'.join(f'[{i}] {text}' for i, text in enumerate(chunks, 1))

    def accept(value):
        facts = value.get('facts') if isinstance(value, dict) else None
        if not isinstance(facts, list) or not facts:
            return 'invalid_json'
        for fact in facts:
            if (
                not isinstance(fact, dict)
                or type(fact.get('n')) is not int
                or not 1 <= fact['n'] <= len(chunks)
                or not isinstance(fact.get('text'), str)
            ):
                return 'invalid_json'
        return None

    try:
        routed = run(
            'extract', lambda provider: parse(provider.generate(prompt)), accept, task='ask'
        )
    except Exception:  # noqa: BLE001 - 뽑기는 속도·정리용이라 실패하면 원래 근거로
        return list(chunks)
    if accept(routed.value):
        return list(chunks)
    picked = {}
    for fact in routed.value['facts']:
        picked.setdefault(fact['n'], []).append(fact['text'].strip())
    # 뽑지 않은 근거는 빈칸으로 둬서 번호(used)가 원래 근거와 같게
    return [' '.join(picked.get(i, [])) for i in range(1, len(chunks) + 1)]


def generate(question, chunks, accept):
    """최종 한국어 답 (write = 젬마 → 제미나이 → GPT). accept가 사실 확인을 해요."""
    prompt = PROMPTS.joinpath('ask.txt').read_text(encoding='utf-8')
    prompt += '\n질문: ' + json.dumps(question, ensure_ascii=False)
    prompt += '\n근거:\n' + '\n'.join(
        f'[{i}] {text}' for i, text in enumerate(chunks, 1) if text.strip()
    )
    return run('write', lambda provider: parse(provider.generate(prompt)), accept, task='ask')
