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

# Ghi đè bằng biến môi trường/volume khi chạy container; đường dẫn tuyệt đối
# ở đây khiến app bỏ qua backend_root và dùng thẳng các thư mục này.
ENV SNAPSHOT_STORE_DIR=/data/snapshots \
    AI_MODELS_DIR=/data/models \
    LOG_DIR=/data/logs

EXPOSE 8010

CMD ["sh", "-c", "mkdir -p \"$SNAPSHOT_STORE_DIR\" \"$AI_MODELS_DIR\" \"$LOG_DIR\" && exec uvicorn app.main:app --host 0.0.0.0 --port 8010 2>&1 | tee -a \"$LOG_DIR/backend.log\""]
