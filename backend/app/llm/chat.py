"""대화 (040): plan(제미나이 → GPT)이 도구를 고르고 부르면, write(젬마 → 제미나이 → GPT)가 한국어 답을 써요.

- 도구 호출은 한 번의 대화에서 최대 4번
- write 답은 finalize(도구 결과와 대조)를 통과해야 받아요. 통과 못 하면 다음 write 모델
- write가 모두 안 되면 plan 모델이 쓴 답을 같은 검사로 확인해서 돌려줘요
"""

import json
import logging
from pathlib import Path

from app.core.errors import AppError

from .router import Routed, run

PROMPTS = Path(__file__).with_name('prompts')
SYSTEM = PROMPTS.joinpath('chat.txt').read_text(encoding='utf-8')
WRITE = PROMPTS.joinpath('chat_write.txt').read_text(encoding='utf-8')
MAX_TOOL_CALLS = 4
logger = logging.getLogger(__name__)


def _plan_loop(provider, history, tools, execute):
    results = []
    count = 0
    while True:
        response = provider.chat(history, tools if count < MAX_TOOL_CALLS else [])
        calls = response.get('tool_calls') or []
        if not calls or count >= MAX_TOOL_CALLS:
            return {'draft': response.get('content') or '', 'results': results}
        calls = calls[: MAX_TOOL_CALLS - count]
        history.append(
            {
                'role': 'assistant',
                'content': response.get('content'),
                'tool_calls': [
                    {
                        'id': c['id'],
                        'type': 'function',
                        'function': {
                            'name': c['name'],
                            'arguments': json.dumps(c['arguments'], ensure_ascii=False),
                        },
                    }
                    for c in calls
                ],
            }
        )
        for c in calls:
            value = execute(c['name'], c['arguments'])
            results.append((c['name'], c['arguments'], value))
            history.append(
                {
                    'role': 'tool',
                    'tool_call_id': c['id'],
                    'name': c['name'],
                    'content': json.dumps(value, ensure_ascii=False, default=str),
                }
            )
            count += 1


def write_prompt(messages, results, draft, context='') -> str:
    conversation = '\n'.join(
        f'{"손님" if m["role"] == "user" else "도우미"}: {m["content"]}' for m in messages[-6:]
    )
    tool_text = '\n'.join(
        f'- {name} {json.dumps(args, ensure_ascii=False, default=str)} → '
        + json.dumps(value, ensure_ascii=False, default=str)
        for name, args, value in results
    )
    return (
        f'{context.strip()}\n대화:\n{conversation}\n\n도구 결과:\n{tool_text or "(없음)"}\n\n'
        f'참고 초안(확인 전, 틀릴 수 있음):\n{draft.strip() or "(없음)"}'
    ).strip()


def _reply_text(text: str) -> str:
    # 모델이 따옴표·"답:" 같은 머리말을 붙이는 경우 정리
    text = (text or '').strip().strip('"').strip()
    for head in ('답:', '답변:', '도우미:'):
        if text.startswith(head):
            text = text[len(head) :].strip()
    return text


def generate(messages, tools, execute, finalize, context=''):
    """finalize(reply, results) → ChatResponse. 돌려주는 값은 Routed[ChatResponse]."""
    history = [{'role': 'system', 'content': SYSTEM + context}, *messages]
    try:
        planned = run(
            'plan',
            lambda provider: _plan_loop(provider, list(history), tools, execute),
            task='chat',
        )
        draft, results = planned.value['draft'], planned.value['results']
    except Exception:  # noqa: BLE001 - plan 모델이 모두 안 되면 도구 없이 write만 (인사·안내 정도)
        planned, draft, results = None, '', []
    steps = ['plan', *(['tools'] if results else []), 'write', 'check']
    prompt = write_prompt(messages, results, draft, context)

    def write(provider):
        value = finalize(_reply_text(provider.generate(prompt, system=WRITE)), results)
        value.steps = steps
        return value

    try:
        written = run('write', write, lambda v: None if v.reply else 'unsupported', task='chat')
        if written.value.reply:
            return written
    except Exception:  # noqa: BLE001 - 아래에서 plan 답으로 한 번 더
        logger.warning('대화 답 쓰기(write) 실패; plan 모델 답으로 확인합니다.')
    if planned is not None and draft.strip():
        value = finalize(draft, results)
        value.steps = steps
        if value.reply:
            return Routed(value, planned.provider, planned.model, True, 'write_failed')
    raise AppError(
        'ASK_UNAVAILABLE', '지금은 답변을 찾을 수 없어요. 잠시 뒤 다시 물어봐 주세요.', 503
    )
