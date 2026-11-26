"""One routed call for all composition reasons."""

import json
from pathlib import Path

from .ask import parse
from .router import run


def generate(context, accept):
    prompt = Path(__file__).with_name('prompts').joinpath('recommend.txt').read_text()
    prompt += '\n데이터: ' + json.dumps(context, ensure_ascii=False)
    return run('recommend', lambda provider: parse(provider.generate(prompt)), accept)
