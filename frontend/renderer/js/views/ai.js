// Trang AI Center: upload model, test camera trực tiếp (live), danh sách model.
import { api, wsCameraUrl } from '../api.js';
import { appState } from '../state.js';
import { els } from '../dom.js';
import { notify } from '../ui.js';

// Đổ option camera cho select test AI (gọi khi danh sách camera đổi).
export function renderAiCameraOptions() {
  const selected = els.aiCameraSelect.value;
  els.aiCameraSelect.innerHTML = '';
  if (!appState.cameras.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Chưa có camera';
    els.aiCameraSelect.appendChild(option);
    return;
  }
  for (const camera of appState.cameras) {
    const option = document.createElement('option');
    option.value = String(camera.id);
    option.textContent = `${camera.name} (#${camera.id})`;
    els.aiCameraSelect.appendChild(option);
  }
  if (selected && appState.cameras.some((x) => String(x.id) === selected)) {
    els.aiCameraSelect.value = selected;
  }
}

export async function refreshAiStatus() {
  try {
    const data = await api('/api/v1/ai/status');
    els.aiModelsList.innerHTML = '';
    if (!data.uploaded_models.length) {
      const li = document.createElement('li');
      li.textContent = 'Chưa có model nào được upload';
      els.aiModelsList.appendChild(li);
      return;
    }
    for (const model of data.uploaded_models) {
      const li = document.createElement('li');
      li.textContent = model;
      els.aiModelsList.appendChild(li);
    }
  } catch (err) {
    els.aiStatusText.textContent = `AI API chưa sẵn sàng: ${err.message}`;
    els.aiModelsList.innerHTML = '';
    const li = document.createElement('li');
    li.textContent = 'Không thể tải danh sách model';
    els.aiModelsList.appendChild(li);
  }
}

// ---- Test camera AI trực tiếp: chọn camera -> Bắt đầu -> vẽ box + biển số nhận diện
// liên tục lên đúng video đang stream, tới khi bấm Dừng hoặc rời khỏi trang AI. Chỉ
// chạy khi người dùng chủ động bắt đầu - không tự chạy nền khi chưa ai bấm Start.
const liveState = {
  ws: null,
  pollTimer: null,
  polling: false,
  detections: [],
  pendingFrame: null,
  decoding: false,
  animFrame: null,
};

// Khoảng nghỉ giữa lúc 1 lần gọi AI test-camera XONG và lần kế tiếp bắt đầu - không
// phải khoảng cố định giữa 2 lần BẮT ĐẦU (xem pollLoop bên dưới).
const AI_POLL_INTERVAL_MS = 800;

function drawLiveOverlay(bitmap) {
  const canvas = els.aiLiveCanvas;
  if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
  }
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);

  for (const det of liveState.detections) {
    if (!det.box) continue;
    const [x1, y1, x2, y2] = det.box;
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

    const label = det.confidence != null ? `${det.plate} (${Math.round(det.confidence * 100)}%)` : det.plate;
    ctx.font = 'bold 22px sans-serif';
    const textWidth = ctx.measureText(label).width;
    const labelTop = y1 - 28 > 0 ? y1 - 28 : y2 + 2;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(x1, labelTop, textWidth + 10, 26);
    ctx.fillStyle = '#22d3ee';
    ctx.fillText(label, x1 + 5, labelTop + 20);
  }
}

function consumeLiveFrame() {
  if (liveState.decoding) return;
  liveState.decoding = true;
  const frame = liveState.pendingFrame;
  liveState.pendingFrame = null;
  if (!frame) {
    liveState.decoding = false;
    return;
  }
  const blob = new Blob([frame], { type: 'image/jpeg' });
  createImageBitmap(blob)
    .then((bitmap) => {
      drawLiveOverlay(bitmap);
      bitmap.close();
    })
    .catch(() => {})
    .finally(() => {
      liveState.decoding = false;
      if (liveState.pendingFrame) {
        if (liveState.animFrame) cancelAnimationFrame(liveState.animFrame);
        liveState.animFrame = requestAnimationFrame(consumeLiveFrame);
      }
    });
}

async function pollLiveDetections(cameraId) {
  try {
    const result = await api('/api/v1/ai/test-camera', {
      method: 'POST',
      body: JSON.stringify({ camera_id: cameraId }),
    });
    liveState.detections = result.detections || [];
    if (!result.frame_available) {
      els.aiLiveStatus.textContent = 'Đang chạy - camera chưa có frame để nhận diện';
    } else if (!liveState.detections.length) {
      els.aiLiveStatus.textContent = 'Đang chạy - chưa phát hiện biển số nào';
    } else {
      const plates = liveState.detections.map((d) => d.plate).join(', ');
      els.aiLiveStatus.textContent = `Đang chạy - phát hiện: ${plates}`;
    }
  } catch (err) {
    els.aiLiveStatus.textContent = `Lỗi test AI: ${err.message}`;
  }
}

// Vòng lặp TỰ LÊN LỊCH (setTimeout sau khi lần trước XONG) thay vì setInterval (bắn cố
// định mỗi 800ms bất kể lần trước đã xong chưa). Trên máy yếu (NUC), 1 lần inference
// YOLO 2 giai đoạn có thể mất LÂU HƠN 800ms - setInterval cũ sẽ bắn thêm request MỚI
// trong khi request TRƯỚC còn đang chạy, dồn nhiều lượt inference chạy chồng lấn cùng
// lúc, càng làm CPU (vốn đã yếu) chậm thêm - vừa làm AI giật, vừa làm cả stream video
// (chạy chung 1 CPU/process) giật theo. Vòng lặp mới tự thích ứng: máy càng chậm, phản
// hồi càng lâu, khoảng nghỉ thực tế giữa 2 lần gọi càng dài ra - không bao giờ chồng lấn.
async function pollLoop(cameraId) {
  if (!liveState.polling) return;
  await pollLiveDetections(cameraId);
  if (!liveState.polling) return;
  liveState.pollTimer = setTimeout(() => pollLoop(cameraId), AI_POLL_INTERVAL_MS);
}

function setLiveControlsRunning(running) {
  els.aiLiveStartBtn.disabled = running;
  els.aiLiveStopBtn.disabled = !running;
  els.aiCameraSelect.disabled = running;
  els.aiLiveCanvas.style.display = running ? 'block' : 'none';
  els.aiLivePlaceholder.style.display = running ? 'none' : 'block';
}

export function startAiLiveTest() {
  if (liveState.ws) return;
  const cameraId = Number(els.aiCameraSelect.value || 0);
  if (!cameraId) {
    notify('Chọn camera trước khi bắt đầu', 'warn');
    return;
  }

  liveState.detections = [];
  setLiveControlsRunning(true);
  els.aiLiveStatus.textContent = 'Đang kết nối camera...';

  const ws = new WebSocket(wsCameraUrl(cameraId));
  ws.binaryType = 'arraybuffer';
  ws.onmessage = (ev) => {
    liveState.pendingFrame = ev.data;
    consumeLiveFrame();
  };
  ws.onclose = () => {
    if (liveState.ws === ws) {
      els.aiLiveStatus.textContent = 'Mất kết nối video camera';
    }
  };
  ws.onerror = () => {};
  liveState.ws = ws;

  liveState.polling = true;
  pollLoop(cameraId);
}

export function stopAiLiveTest() {
  liveState.polling = false;
  if (liveState.pollTimer) {
    clearTimeout(liveState.pollTimer);
    liveState.pollTimer = null;
  }
  if (liveState.ws) {
    liveState.ws.onmessage = null;
    liveState.ws.onclose = null;
    liveState.ws.onerror = null;
    liveState.ws.close();
    liveState.ws = null;
  }
  if (liveState.animFrame) {
    cancelAnimationFrame(liveState.animFrame);
    liveState.animFrame = null;
  }
  liveState.pendingFrame = null;
  liveState.decoding = false;
  liveState.detections = [];

  if (els.aiLiveCanvas) {
    const ctx = els.aiLiveCanvas.getContext('2d');
    ctx.clearRect(0, 0, els.aiLiveCanvas.width, els.aiLiveCanvas.height);
  }
  if (els.aiLiveStatus) els.aiLiveStatus.textContent = '';
  setLiveControlsRunning(false);
}

export function initAi() {
  els.aiUploadForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const file = els.aiModelFile.files?.[0];
    if (!file) return;
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await api('/api/v1/ai/models', { method: 'POST', body: form });
      notify(`Upload model thành công: ${result.filename}`, 'success');
      els.aiUploadForm.reset();
      await refreshAiStatus();
    } catch (err) {
      notify(`Upload model lỗi: ${err.message}`, 'error');
    }
  });

  els.aiLiveStartBtn.addEventListener('click', startAiLiveTest);
  els.aiLiveStopBtn.addEventListener('click', stopAiLiveTest);
}
