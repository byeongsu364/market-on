"""Deterministic hash-feature vectors for offline plumbing tests, not semantic evaluation."""

import hashlib
import math
import re
from typing import Literal

from app.core.config import settings

from .base import LLMProvider


class FakeProvider(LLMProvider):
    def __init__(self, chat_responses=None):
        self.chat_responses = iter(chat_responses or [])

    def chat(self, messages, tools):
        return next(self.chat_responses)

    def generate(self, prompt, *, images=None, system=None):
        raise NotImplementedError

    def embed(self, texts: list[str], *, task: Literal['document', 'query']) -> list[list[float]]:
        if task not in ('document', 'query'):
            raise ValueError(task)
        result = []
        for text in texts:
            vector = [0.0] * settings.EMBEDDING_DIM
            # Character features give predictable lexical overlap without a network model.
            normalized = re.sub(r'\s+', '', text.lower())
            features = list(normalized) + [
                normalized[i : i + 2] for i in range(len(normalized) - 1)
            ]
            for feature in features or ['']:
                digest = hashlib.sha256(feature.encode()).digest()
                vector[int.from_bytes(digest[:4], 'big') % len(vector)] += 1.0
            norm = math.sqrt(sum(x * x for x in vector))
            result.append([x / norm for x in vector])
        return result
