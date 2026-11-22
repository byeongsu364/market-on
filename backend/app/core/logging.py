"""기본 로깅 설정. 허용 의존성: 표준 라이브러리."""
import logging

def setup_logging() -> None:
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(name)s %(message)s')
