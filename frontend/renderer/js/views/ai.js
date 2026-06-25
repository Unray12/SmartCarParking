// Trang AI Center: upload model, test camera, danh sách model.
import { api } from '../api.js';
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
    els.aiStatusText.textContent = `Recognizer: ${data.recognizer_name} | Models dir: ${data.models_dir}`;
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

  els.aiTestForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const cameraId = Number(els.aiCameraSelect.value || 0);
    if (!cameraId) {
      notify('Chọn camera trước khi test AI', 'warn');
      return;
    }
    try {
      const result = await api('/api/v1/ai/test-camera', {
        method: 'POST',
        body: JSON.stringify({ camera_id: cameraId })
      });
      els.aiTestResult.textContent = JSON.stringify(result, null, 2);
      if (!result.frame_available) notify('Camera chưa có frame để test', 'warn');
      else notify(`AI test xong. Số detection: ${result.detections.length}`, 'success');
    } catch (err) {
      notify(`AI test lỗi: ${err.message}`, 'error');
      els.aiTestResult.textContent = `Lỗi: ${err.message}`;
    }
  });
}
