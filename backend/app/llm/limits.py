"""Generation deadlines shared by providers and routing."""

PROVIDER_TIMEOUTS = {'gemma': 45.0, 'ollama': 45.0, 'gemini': 30.0, 'openai': 30.0}

# 우리 서버 밖으로 나가는 모델 (사용 횟수 규칙 적용)
EXTERNAL_PROVIDERS = frozenset({'gemini', 'openai'})

# 서버가 꺼져 있으면(예: Tailscale 끔) 연결 단계에서 빨리 포기하고 다음 모델로 넘어가요
CONNECT_TIMEOUT = 5.0


def http_timeout(name, total=None):
    import httpx

    return httpx.Timeout(total or PROVIDER_TIMEOUTS[name], connect=CONNECT_TIMEOUT)
