FROM python:3.12-slim

# KHÔNG cài package "ffmpeg" hệ thống - opencv-python-headless đã đóng gói sẵn
# FFmpeg riêng (cv2.CAP_FFMPEG dùng qua OPENCV_FFMPEG_CAPTURE_OPTIONS). Cài thêm
# ffmpeg kéo theo ~200 package phụ thuộc (SDL2/ALSA/X11/Vulkan...) không cần cho
# service headless, cực nặng và chậm trên máy yếu (NUC).
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 libsm6 libxext6 libxrender1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
# --timeout/--retries cao hơn mặc định (15s/5 lần) - mạng máy build (đặc biệt NUC)
# có thể chậm/chập chờn giữa lúc tải package lớn (opencv/numpy/onnxruntime) gây
# ReadTimeoutError. --default-timeout của pip tính cho MỖI lần đọc, không phải
# tổng thời gian tải, nên set cao vẫn an toàn (không "treo" nếu mạng ổn).
RUN pip install --no-cache-dir --default-timeout=180 --retries 10 -r backend/requirements.txt

COPY backend/ backend/
COPY frontend/ frontend/

WORKDIR /app/backend

# SNAPSHOT_STORE_DIR / AI_MODELS_DIR không set ở đây -> lấy từ .env (env_file),
# trỏ vào backend/data/snapshots_store và backend/data/models_store trên host.
ENV LOG_DIR=/data/logs

EXPOSE 8010

CMD ["sh", "-c", "mkdir -p \"$LOG_DIR\" && exec uvicorn app.main:app --host 0.0.0.0 --port 8010 2>&1 | tee -a \"$LOG_DIR/backend.log\""]
