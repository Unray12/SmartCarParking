FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 libsm6 libxext6 libxrender1 libgomp1 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ backend/
COPY frontend/ frontend/

WORKDIR /app/backend

# SNAPSHOT_STORE_DIR / AI_MODELS_DIR không set ở đây -> dùng đúng default của app
# ("snapshots_store" / "models_store", tương đối theo backend root) để tên thư mục
# giống hệt lúc chạy không-Docker; volume ngoài mount thẳng vào 2 thư mục đó.
ENV LOG_DIR=/data/logs

EXPOSE 8010

CMD ["sh", "-c", "mkdir -p \"$LOG_DIR\" && exec uvicorn app.main:app --host 0.0.0.0 --port 8010 2>&1 | tee -a \"$LOG_DIR/backend.log\""]
