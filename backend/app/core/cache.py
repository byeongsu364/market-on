"""메모리 TTL 캐시 데코레이터. 허용 의존성: 표준 라이브러리."""
from functools import wraps
from inspect import iscoroutinefunction
from time import monotonic

def ttl_cache(seconds: float = 60):
    def decorate(func):
        cache = {}
        def key_for(args, kwargs):
            return (args, tuple(sorted(kwargs.items())))
        if iscoroutinefunction(func):
            @wraps(func)
            async def async_wrapper(*args, **kwargs):
                key = key_for(args, kwargs)
                if key in cache and cache[key][0] > monotonic():
                    return cache[key][1]
                value = await func(*args, **kwargs)
                cache[key] = (monotonic() + seconds, value)
                return value
            return async_wrapper
        @wraps(func)
        def wrapper(*args, **kwargs):
            key = key_for(args, kwargs)
            if key in cache and cache[key][0] > monotonic():
                return cache[key][1]
            value = func(*args, **kwargs)
            cache[key] = (monotonic() + seconds, value)
            return value
        return wrapper
    return decorate
