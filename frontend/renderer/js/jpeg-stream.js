import { wsCameraUrl } from './api.js';

// Player JPEG-over-WebSocket -> canvas, dùng CHUNG cho card / phóng lớn / chi tiết bãi (nguồn
// HTTP-MJPEG, hoặc fallback khi WebRTC không khả dụng). Trước đây logic này bị lặp 3 nơi.
//
// Nguyên tắc latest-wins (chống delay tích luỹ): chỉ giữ frame MỚI NHẤT (pendingFrame ghi đè,
// không hàng đợi), decode qua requestAnimationFrame với cờ `decoding` chặn chồng lấn. Tự
// reconnect khi WS rớt. Tự chạy ngay khi tạo; gọi stop() để dừng hẳn.
//
// onFirstFrame: gọi 1 lần khi vẽ được frame đầu (để caller ẩn placeholder "đang chờ").
export function createJpegCanvasPlayer({ cameraId, canvas, onFirstFrame }) {
  const ctx = canvas.getContext('2d');
  let pendingFrame = null;
  let decoding = false;
  let rafId = null;
  let ws = null;
  let stopped = false;
  let gotFirstFrame = false;

  function scheduleDraw() {
    if (decoding || rafId !== null) return;
    rafId = requestAnimationFrame(() => draw().catch(() => {}));
  }

  async function draw() {
    rafId = null;
    if (decoding) return;
    decoding = true;

    const frame = pendingFrame;
    pendingFrame = null;
    if (frame) {
      try {
        const bitmap = await createImageBitmap(new Blob([frame], { type: 'image/jpeg' }));
        if (!gotFirstFrame) {
          gotFirstFrame = true;
          onFirstFrame?.();
        }
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
      } catch {
        // frame hỏng -> bỏ qua, không làm gãy vòng vẽ
      }
    }

    decoding = false;
    if (pendingFrame) scheduleDraw();
  }

  function connect() {
    ws = new WebSocket(wsCameraUrl(cameraId));
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (ev) => {
      pendingFrame = ev.data;
      scheduleDraw();
    };
    ws.onclose = () => {
      if (stopped) return;
      setTimeout(() => { if (!stopped) connect(); }, 1000);
    };
  }

  connect();

  return {
    stop() {
      stopped = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (ws) {
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
        ws = null;
      }
    }
  };
}
