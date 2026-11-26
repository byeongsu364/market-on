"""채팅 '이전 답변' 서명 (C-19).

서버는 대화를 저장하지 않고 손님 화면이 지난 대화를 다시 보내요. 그래서 도우미가 한 적 없는 말을
'이전 답변'으로 끼워 넣을 수 있었어요. 서버가 보낸 답에만 서명을 붙이고, 돌아온 도우미 메시지는
서명이 맞을 때만 대화에 넣어요. 서명이 없거나 틀리면 그 메시지만 빼요.
"""

import hashlib
import hmac

from app.core.config import settings

MAX_SIGNED_CHARS = 500  # 화면이 다시 보낼 때 500자로 자르므로 같은 범위에 서명


def _key() -> bytes:
    return hmac.new(
        settings.DEVICE_HASH_SALT.encode(), b'market-on chat reply v1', hashlib.sha256
    ).digest()


def sign(text: str) -> str:
    body = text[:MAX_SIGNED_CHARS].encode()
    return hmac.new(_key(), b'chat-reply\x00' + body, hashlib.sha256).hexdigest()[:32]


def verified(text: str, signature: str | None) -> bool:
    return bool(signature) and hmac.compare_digest(sign(text), signature)


def trusted_history(messages) -> tuple[list[dict], int]:
    """손님 말은 그대로, 도우미 말은 서명이 맞을 때만. (대화, 뺀 개수)"""
    kept, dropped = [], 0
    for m in messages:
        if m.role == 'assistant' and not verified(m.content, m.sig):
            dropped += 1
            continue
        kept.append({'role': m.role, 'content': m.content})
    return kept, dropped
