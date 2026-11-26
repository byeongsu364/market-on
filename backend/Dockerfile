FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
# 적재 스크립트가 ../data(온톨로지·시장·KAMIS)를 읽어요
COPY data/ /srv/data/
RUN useradd -u 10001 -m app && mkdir -p /srv/backend/storage && chown app /srv/backend/storage
USER app
EXPOSE 8000
# 시작할 때 미적용 마이그레이션을 먼저 적용해요
CMD ["sh", "-c", "python -m scripts.migrate && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'"]
