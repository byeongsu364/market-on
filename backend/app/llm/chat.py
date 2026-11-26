"""One complete tool loop per routed provider, with a four-call hard limit."""

import json
from pathlib import Path

from .router import run

SYSTEM = Path(__file__).with_name('prompts').joinpath('chat.txt').read_text()


def generate(messages, tools, execute, finalize, context=''):
    def call(provider):
        history = [{'role': 'system', 'content': SYSTEM + context}, *messages]
        results = []
        count = 0
        while True:
            response = provider.chat(history, tools if count < 4 else [])
            calls = response.get('tool_calls') or []
            if not calls or count >= 4:
                return finalize(response.get('content') or '', results)
            calls = calls[: 4 - count]
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

    return run('chat', call, lambda v: None if v.reply else 'unsupported')
