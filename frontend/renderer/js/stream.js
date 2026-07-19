import { startWhep } from './webrtc.js';
import { api, buildWhepUrl } from './api.js';

// Điều phối 1 luồng hiển thị camera theo kiến trúc HYBRID:
//  - Camera rtsp:// (webrtc-info trả available=true): THUẦN WebRTC, KHÔNG dùng JPEG. Nếu
//    WebRTC lỗi/quá hạn -> tự thử lại WebRTC (không rơi về JPEG). AI cũng đọc từ chính nguồn
//    MediaMTX này ở backend.
//  - Camera HTTP/MJPEG (available=false): MediaMTX không ingest được -> dùng JPEG-over-WS
//    (đường duy nhất khả thi cho loại nguồn này).
//
// Tham số:
//  - cameraId
//  - video, canvas: <video> (WebRTC) + <canvas> (JPEG cho nguồn non-RTSP)
//  - showVideo()/showCanvas(): đổi element đang hiện (ẩn cái kia)
//  - startJpeg(): mở luồng JPEG-WS, trả { stop } (chỉ dùng cho nguồn non-RTSP)
//  - stopJpeg(): đóng luồng JPEG-WS (nếu startJpeg không trả stop riêng)
//  - connectTimeoutMs: chờ WebRTC 'connected' bao lâu trước khi coi là lỗi & thử lại
//  - retryMs: khoảng chờ giữa 2 lần thử lại WebRTC
export function createStreamSession({
  cameraId,
  video,
  canvas,
  showVideo,
  showCanvas,
  startJpeg,
  stopJpeg,
  connectTimeoutMs = 6000,
  retryMs = 3000
}) {
  let whep = null;
  let jpeg = null;
  let stopped = false;
  let connectTimer = null;
  let retryTimer = null;

  // Gắn mode hiển thị vào element cha của <video> (.preview / .focus-stage) để CSS vẽ badge
  // góc khung: 'connecting' | 'webrtc' (xanh) | 'jpeg' (vàng) | 'error' (đỏ). Chỉ 1 attribute
  // + CSS dùng chung, không cần thêm element ở từng nơi gọi. Xoá khi dừng để badge biến mất.
  function setMode(mode) {
    const host = video?.parentElement;
    if (!host) return;
    if (mode) host.dataset.streamMode = mode;
    else delete host.dataset.streamMode;
  }

  function clearTimers() {
    if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  }

  function teardownWhep() {
    if (whep) { whep.close(); whep = null; }
  }

  // ---- Nhánh JPEG (chỉ cho nguồn non-RTSP) ----
  function runJpeg() {
    if (stopped || jpeg) return;
    showCanvas?.();
    setMode('jpeg');
    jpeg = startJpeg?.() || { stop: () => stopJpeg?.() };
  }

  // ---- Nhánh WebRTC thuần (cho rtsp://) - lỗi thì THỬ LẠI WebRTC, không dùng JPEG ----
  function scheduleWebRtcRetry(info) {
    if (stopped || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connectWebRtc(info);
    }, retryMs);
  }

  function connectWebRtc(info) {
    if (stopped) return;
    // Trong lúc bắt tay: ẩn video, hiện khung chờ (canvas trống) + badge 'connecting'.
    showCanvas?.();
    setMode('connecting');

    if (connectTimer) clearTimeout(connectTimer);
    connectTimer = setTimeout(() => {
      connectTimer = null;
      if (stopped) return;
      teardownWhep();
      setMode('error');
      scheduleWebRtcRetry(info);
    }, connectTimeoutMs);

    whep = startWhep({
      url: buildWhepUrl(info),
      video,
      onConnected: () => {
        if (stopped) return;
        clearTimers();
        showVideo?.();
        setMode('webrtc');
      },
      onFailed: () => {
        if (stopped) return;
        clearTimers();
        teardownWhep();
        setMode('error');
        scheduleWebRtcRetry(info);
      }
    });
  }

  async function start() {
    stopped = false;

    let info = null;
    if (video) {
      try {
        info = await api(`/api/v1/cameras/${cameraId}/webrtc`);
      } catch {
        info = null;
      }
    }
    if (stopped) return;

    if (info && info.available) {
      // rtsp:// -> thuần WebRTC (không bao giờ mở JPEG-WS, backend nhờ đó không chạy vòng
      // capture+encode JPEG cho camera này; hình đi thẳng browser <-> MediaMTX).
      connectWebRtc(info);
    } else {
      // HTTP/MJPEG hoặc không xác định -> JPEG-over-WS.
      runJpeg();
    }
  }

  function stop() {
    stopped = true;
    clearTimers();
    teardownWhep();
    if (jpeg) {
      try { (jpeg.stop || stopJpeg)?.(); } catch { /* ignore */ }
      jpeg = null;
    }
    setMode(null);
  }

  return { start, stop };
}
