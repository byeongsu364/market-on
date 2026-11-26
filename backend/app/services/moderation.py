"""Deterministic review moderation; no AI calls."""

from pathlib import Path
import re
import unicodedata
from app.core.errors import AppError

WORDS = Path(__file__).resolve().parents[3] / 'data/moderation/banned_words.txt'


def normalize(text):
    return ''.join(c for c in unicodedata.normalize('NFKC', text).casefold() if c.isalnum())


def check(body):
    normalized = normalize(body)
    words = [
        normalize(line.strip())
        for line in WORDS.read_text().splitlines()
        if line.strip() and not line.lstrip().startswith('#')
    ]
    if (
        any(word in normalized for word in words)
        or re.search(r'01\d\d{7,8}', normalized)
        or re.search(r'https?\s*[:：]|www\s*\.', unicodedata.normalize('NFKC', body), re.I)
    ):
        raise AppError('REVIEW_BLOCKED', '이 표현은 쓸 수 없어요.', 422)
