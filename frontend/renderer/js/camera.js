import { wsCameraUrl } from './api.js';
import { createStreamSession } from './stream.js';
import { setStreamStatusChip, withButtonBusy } from './ui.js';
import { loadNav, saveNav } from './state.js';

export function createCameraModule({ els, state, api, notify, onCameraMutated, onCamerasUpdated }) {
  const cameraViews = new Map();
  const focusRuntime = {
    cameraId: null,
    session: null,
    ws: null,
    pendingFrame: null,
    decoding: false
  };
  let editingCameraId = null;

  function findCameraById(cameraId) {
    return state.cameras.find((cam) => cam.id === cameraId) || null;
  }

  // Đóng luồng JPEG-WS fallback (không đụng session/WebRTC).
  function closeFocusJpeg() {
    if (focusAnimFrame) {
      cancelAnimationFrame(focusAnimFrame);
      focusAnimFrame = null;
    }
    if (focusRuntime.ws) {
      focusRuntime.ws.onmessage = null;
      focusRuntime.ws.onclose = null;
      focusRuntime.ws.onerror = null;
      focusRuntime.ws.close();
      focusRuntime.ws = null;
    }
    focusRuntime.pendingFrame = null;
  }

  // Đóng cả phiên hiển thị camera phóng lớn (WebRTC + JPEG fallback).
  function closeFocusSocket() {
    if (focusRuntime.session) {
      focusRuntime.session.stop();
      focusRuntime.session = null;
    }
    closeFocusJpeg();
    focusRuntime.cameraId = null;
    if (els.focusVideo) els.focusVideo.classList.remove('is-live');
    if (els.focusCanvas) els.focusCanvas.style.display = '';
    setStreamStatusChip(els.focusStreamStatus, null);
  }

  function renderFocusHeader() {
    const camera = findCameraById(state.focusedCameraId);
    if (!camera) {
      els.focusPanel.classList.add('is-hidden');
      els.focusTitle.textContent = 'Camera phóng lớn';
      els.focusMeta.textContent = 'Chọn camera để phóng lớn';
      els.focusPlaceholder.textContent = 'Chưa chọn camera';
      els.focusPlaceholder.style.display = 'block';
      return;
    }

    els.focusPanel.classList.remove('is-hidden');
    els.focusTitle.textContent = `${camera.name} (#${camera.id})`;
    els.focusMeta.textContent = `${camera.enabled ? 'Đang bật' : 'Đang tắt'} | ${camera.source_url}`;
  }

  let focusAnimFrame = null;
  async function consumeFocusFrame() {
    if (focusRuntime.decoding) return;
    focusRuntime.decoding = true;

    const ctx = els.focusCanvas.getContext('2d');
    const frame = focusRuntime.pendingFrame;
    focusRuntime.pendingFrame = null;

    if (frame) {
      const blob = new Blob([frame], { type: 'image/jpeg' });
      const bitmap = await createImageBitmap(blob);
      els.focusPlaceholder.style.display = 'none';
      ctx.drawImage(bitmap, 0, 0, els.focusCanvas.width, els.focusCanvas.height);
      bitmap.close();
    }

    focusRuntime.decoding = false;

    if (focusRuntime.pendingFrame && !focusRuntime.decoding) {
      if (focusAnimFrame) cancelAnimationFrame(focusAnimFrame);
      focusAnimFrame = requestAnimationFrame(() => consumeFocusFrame().catch(console.error));
    }
  }

  // Fallback JPEG-over-WebSocket cho camera phóng lớn (được stream.js gọi khi WebRTC không
  // khả dụng/lỗi). Tự mở lại nếu WS rớt bất ngờ trong lúc vẫn đang phóng lớn.
  function openFocusJpeg(cameraId) {
    closeFocusJpeg();
    const ws = new WebSocket(wsCameraUrl(cameraId));
    ws.binaryType = 'arraybuffer';

    ws.onmessage = (ev) => {
      focusRuntime.pendingFrame = ev.data;
      consumeFocusFrame().catch(console.error);
    };

    ws.onclose = () => {
      const stillFocused = state.focusedCameraId === cameraId;
      const latest = findCameraById(cameraId);
      if (stillFocused && latest && latest.enabled && state.currentView === 'cameras') {
        setTimeout(() => {
          if (state.focusedCameraId === cameraId) openFocusJpeg(cameraId);
        }, 1000);
      }
    };

    focusRuntime.ws = ws;
  }

  function openFocusSocket(cameraId) {
    if (focusRuntime.session && focusRuntime.cameraId === cameraId) return;

    closeFocusSocket();
    const camera = findCameraById(cameraId);
    if (!camera || !camera.enabled || state.currentView !== 'cameras') {
      els.focusPlaceholder.textContent = camera && !camera.enabled ? 'Camera đang tắt' : 'Đang chờ camera...';
      els.focusPlaceholder.style.display = 'block';
      return;
    }

    focusRuntime.cameraId = cameraId;
    focusRuntime.session = createStreamSession({
      cameraId,
      video: els.focusVideo,
      canvas: els.focusCanvas,
      showVideo: () => {
        els.focusVideo.classList.add('is-live');
        els.focusCanvas.style.display = 'none';
        els.focusPlaceholder.style.display = 'none';
      },
      showCanvas: () => {
        els.focusVideo.classList.remove('is-live');
        els.focusCanvas.style.display = '';
      },
      startJpeg: () => {
        openFocusJpeg(cameraId);
        return { stop: closeFocusJpeg };
      },
      onMode: (mode) => setStreamStatusChip(els.focusStreamStatus, mode)
    });
    focusRuntime.session.start();
  }

  function syncFocusedCamera() {
    for (const [id, view] of cameraViews.entries()) {
      view.setFocused(state.focusedCameraId === id);
      view.setFocusStreamPaused(state.focusedCameraId === id && state.currentView === 'cameras');
    }

    const focused = findCameraById(state.focusedCameraId);
    if (!focused) {
      renderFocusHeader();
      closeFocusSocket();
      return;
    }

    renderFocusHeader();
    if (state.currentView === 'cameras') {
      openFocusSocket(focused.id);
    } else {
      closeFocusSocket();
    }
  }

  function setFocusedCamera(cameraId) {
    state.focusedCameraId = cameraId;
    saveNav({ focusedCameraId: cameraId });  // giữ phiên: refresh vẫn phóng lớn đúng camera
    syncFocusedCamera();
  }

  function clearFocusedCamera(message = null) {
    state.focusedCameraId = null;
    saveNav({ focusedCameraId: null });
    closeFocusSocket();
    syncFocusedCamera();
    if (message) {
      notify(message, 'warn');
    }
  }

  function closeEditModal() {
    editingCameraId = null;
    els.cameraEditModal.classList.add('is-hidden');
    els.cameraEditForm.reset();
  }

  function openEditModal(camera) {
    editingCameraId = camera.id;
    els.cameraEditCameraId.textContent = `#${camera.id}`;
    els.cameraEditName.value = camera.name;
    els.cameraEditUrl.value = camera.source_url;
    els.cameraEditEnabled.checked = Boolean(camera.enabled);
    els.cameraEditModal.classList.remove('is-hidden');
    els.cameraEditName.focus();
  }

  async function submitEditModal(ev) {
    ev.preventDefault();
    if (!editingCameraId) return;

    const name = els.cameraEditName.value.trim();
    const sourceUrl = els.cameraEditUrl.value.trim();
    const enabled = els.cameraEditEnabled.checked;

    if (!name || !sourceUrl) {
      notify('Vui lòng nhập đầy đủ tên và URL camera', 'warn');
      return;
    }

    const submitBtn = ev.submitter || els.cameraEditForm.querySelector('[type="submit"]');
    try {
      await withButtonBusy(submitBtn, 'Đang lưu…', () => api(`/api/v1/cameras/${editingCameraId}`, {
        method: 'PUT',
        body: JSON.stringify({ name, source_url: sourceUrl, enabled })
      }));

      closeEditModal();
      await loadCameras();
      await onCameraMutated();
      notify('Cập nhật camera thành công', 'success');
    } catch (err) {
      notify(`Không thể cập nhật camera: ${err.message}`, 'error');
    }
  }

  function createCameraCard(camera) {
    const card = document.createElement('article');
    card.className = 'camera-card';
    card.dataset.id = String(camera.id);

    card.innerHTML = `
      <div class="camera-head">
        <div>
          <div class="name"></div>
          <div class="status"></div>
        </div>
        <div class="head-right">
          <span class="stream-status mode-none"></span>
          <button class="toggle"></button>
        </div>
      </div>
      <div class="preview">
        <video class="stream-video" autoplay muted playsinline></video>
        <canvas></canvas>
        <span class="placeholder">Đang chờ video...</span>
      </div>
      <div class="camera-actions">
        <span class="url"></span>
        <div class="camera-btns">
          <button class="mini-btn focus" type="button">Phóng lớn</button>
          <button class="mini-btn edit" type="button">Sửa</button>
          <button class="mini-btn danger" type="button">Xóa</button>
        </div>
      </div>
    `;

    const nameEl = card.querySelector('.name');
    const statusEl = card.querySelector('.status');
    const streamStatusEl = card.querySelector('.stream-status');
    const toggleBtn = card.querySelector('.toggle');
    const urlEl = card.querySelector('.url');
    const focusBtn = card.querySelector('.mini-btn.focus');
    const editBtn = card.querySelector('.mini-btn.edit');
    const deleteBtn = card.querySelector('.mini-btn.danger');
    const canvas = card.querySelector('canvas');
    const video = card.querySelector('video');
    const placeholder = card.querySelector('.placeholder');
    const ctx = canvas.getContext('2d');

    canvas.width = 1280;
    canvas.height = 720;

    const local = {
      session: null,
      ws: null,
      pendingFrame: null,
      decoding: false,
      paused: false,
      pausedForFocus: false
    };

    function renderHeader(next) {
      nameEl.textContent = next.name;
      statusEl.textContent = next.enabled ? 'Live' : 'Tắt';
      urlEl.textContent = next.source_url;
      toggleBtn.textContent = next.enabled ? 'Đang bật' : 'Đang tắt';
      toggleBtn.className = `toggle ${next.enabled ? 'on' : ''}`;
    }

    // Chip trạng thái luồng trên thanh header (cùng hàng nút Đang bật/tắt) - thay cho badge
    // overlay góc video. stream.js gọi qua onMode mỗi khi trạng thái đổi. Dùng helper chung
    // (ui.js) để đồng bộ với focus/parking.
    const setStreamStatus = (mode) => setStreamStatusChip(streamStatusEl, mode);

    let animFrame = null;
    async function consumeFrame() {
      if (local.decoding) return;
      local.decoding = true;

      const frame = local.pendingFrame;
      local.pendingFrame = null;

      if (frame) {
        const blob = new Blob([frame], { type: 'image/jpeg' });
        const bitmap = await createImageBitmap(blob);
        placeholder.style.display = 'none';
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
      }

      local.decoding = false;

      if (local.pendingFrame && !local.decoding) {
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = requestAnimationFrame(() => consumeFrame().catch(console.error));
      }
    }

    function closeCardJpeg() {
      if (animFrame) {
        cancelAnimationFrame(animFrame);
        animFrame = null;
      }
      if (!local.ws) return;
      local.ws.onmessage = null;
      local.ws.onclose = null;
      local.ws.onerror = null;
      local.ws.close();
      local.ws = null;
    }

    // Fallback JPEG-over-WebSocket vẽ lên canvas (stream.js gọi khi WebRTC không khả dụng
    // /lỗi). Tự mở lại nếu WS rớt bất ngờ trong lúc luồng vẫn đang chạy.
    function openCardJpeg(cameraId) {
      closeCardJpeg();
      const ws = new WebSocket(wsCameraUrl(cameraId));
      ws.binaryType = 'arraybuffer';

      ws.onmessage = (ev) => {
        local.pendingFrame = ev.data;
        consumeFrame().catch(console.error);
      };

      ws.onclose = () => {
        if (camera.enabled && !local.paused && !local.pausedForFocus && state.currentView === 'cameras' && local.session) {
          setTimeout(() => {
            if (local.session) openCardJpeg(cameraId);
          }, 1000);
        }
      };

      local.ws = ws;
    }

    // Luồng hiển thị card: ưu tiên WebRTC, fallback JPEG. local.session != null nghĩa là
    // đang chạy (thay cho local.ws trước đây).
    function startCardStream() {
      if (local.paused || local.pausedForFocus || state.currentView !== 'cameras') return;
      if (!camera.enabled || local.session) return;

      local.session = createStreamSession({
        cameraId: camera.id,
        video,
        canvas,
        showVideo: () => {
          video.classList.add('is-live');
          canvas.style.display = 'none';
          placeholder.style.display = 'none';
        },
        showCanvas: () => {
          video.classList.remove('is-live');
          canvas.style.display = '';
        },
        startJpeg: () => {
          openCardJpeg(camera.id);
          return { stop: closeCardJpeg };
        },
        onMode: setStreamStatus
      });
      local.session.start();
    }

    function stopCardStream() {
      if (local.session) {
        local.session.stop();
        local.session = null;
      }
      setStreamStatus(null);
      closeCardJpeg();
      video.classList.remove('is-live');
      canvas.style.display = '';
    }

    async function toggleCamera() {
      try {
        await api(`/api/v1/cameras/${camera.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ enabled: !camera.enabled })
        });

        await loadCameras();
        await onCameraMutated();
      } catch (err) {
        notify(`Không thể đổi trạng thái camera: ${err.message}`, 'error');
      }
    }

    async function deleteCamera() {
      const agreed = window.confirm(`Xóa camera "${camera.name}" (#${camera.id})?`);
      if (!agreed) return;

      try {
        await api(`/api/v1/cameras/${camera.id}`, { method: 'DELETE' });
        if (state.focusedCameraId === camera.id) {
          clearFocusedCamera('Camera đang phóng lớn đã bị xóa');
        }

        await loadCameras();
        await onCameraMutated();
        notify('Đã xóa camera', 'success');
      } catch (err) {
        notify(`Không thể xóa camera: ${err.message}`, 'error');
      }
    }

    toggleBtn.addEventListener('click', toggleCamera);
    focusBtn.addEventListener('click', () => {
      setFocusedCamera(camera.id);
      notify(`Đang phóng lớn ${camera.name}`, 'success');
    });
    canvas.addEventListener('dblclick', () => {
      setFocusedCamera(camera.id);
      notify(`Đang phóng lớn ${camera.name}`, 'success');
    });
    editBtn.addEventListener('click', () => openEditModal(camera));
    deleteBtn.addEventListener('click', deleteCamera);

    renderHeader(camera);
    if (camera.enabled) {
      startCardStream();
    } else {
      placeholder.textContent = 'Camera đang tắt';
    }

    return {
      card,
      update(nextCamera) {
        camera = nextCamera;
        renderHeader(camera);

        if (!camera.enabled) {
          stopCardStream();
          placeholder.style.display = 'block';
          placeholder.textContent = 'Camera đang tắt';
          return;
        }

        if (!local.paused && !local.pausedForFocus && state.currentView === 'cameras' && !local.session) {
          startCardStream();
        }
      },
      pause() {
        local.paused = true;
        stopCardStream();
      },
      resume() {
        local.paused = false;
        if (camera.enabled && !local.pausedForFocus && !local.session) {
          startCardStream();
        }
      },
      setFocusStreamPaused(pausedForFocus) {
        local.pausedForFocus = pausedForFocus;
        if (pausedForFocus) {
          stopCardStream();
          return;
        }
        if (!local.paused && camera.enabled && state.currentView === 'cameras' && !local.session) {
          startCardStream();
        }
      },
      setFocused(isFocused) {
        card.classList.toggle('is-focused', isFocused);
      },
      destroy() {
        stopCardStream();
        card.remove();
      }
    };
  }

  async function loadCameras() {
    const cameras = await api('/api/v1/cameras');
    state.cameras = cameras;

    const seen = new Set();
    for (const camera of cameras) {
      seen.add(camera.id);
      const existing = cameraViews.get(camera.id);
      if (existing) {
        existing.update(camera);
        continue;
      }

      const view = createCameraCard(camera);
      cameraViews.set(camera.id, view);
      els.cameraGrid.appendChild(view.card);
    }

    for (const [id, view] of cameraViews.entries()) {
      if (!seen.has(id)) {
        view.destroy();
        cameraViews.delete(id);
      }
    }

    if (state.focusedCameraId != null && !state.cameras.some((cam) => cam.id === state.focusedCameraId)) {
      clearFocusedCamera();
    } else {
      syncFocusedCamera();
    }

    if (state.currentView !== 'cameras') {
      pauseAllCameraStreams();
    }

    await onCamerasUpdated(state.cameras);
  }

  function pauseAllCameraStreams() {
    for (const view of cameraViews.values()) {
      view.pause();
    }
  }

  function resumeAllCameraStreams() {
    for (const view of cameraViews.values()) {
      view.resume();
    }
  }

  function activateDashboardStreams() {
    resumeAllCameraStreams();
    syncFocusedCamera();
  }

  function deactivateDashboardStreams() {
    pauseAllCameraStreams();
    closeFocusSocket();
  }

  function init() {
    els.focusCanvas.width = 1280;
    els.focusCanvas.height = 720;

    // Khôi phục camera đang phóng lớn từ phiên trước. Chỉ set id; syncFocusedCamera (chạy khi
    // vào tab cameras) sẽ mở lại. Nếu camera không còn/đang tắt, loadCameras/openFocusSocket
    // tự xử lý (auto clear hoặc hiện placeholder).
    if (state.focusedCameraId == null) {
      const savedFocus = loadNav().focusedCameraId;
      if (savedFocus != null) state.focusedCameraId = savedFocus;
    }

    renderFocusHeader();

    els.focusCloseBtn.addEventListener('click', () => clearFocusedCamera());
    els.focusFullscreenBtn.addEventListener('click', async () => {
      if (!document.fullscreenElement) {
        try {
          await els.focusPanel.requestFullscreen();
        } catch (err) {
          notify(`Không thể fullscreen: ${err.message}`, 'warn');
        }
        return;
      }
      await document.exitFullscreen();
    });

    els.cameraEditForm.addEventListener('submit', submitEditModal);
    els.cameraEditCancelBtn.addEventListener('click', closeEditModal);
    els.cameraEditCloseBtn.addEventListener('click', closeEditModal);
    els.cameraEditModal.addEventListener('click', (ev) => {
      if (ev.target === els.cameraEditModal) {
        closeEditModal();
      }
    });
    // Esc đóng modal sửa camera (UX cơ bản: modal luôn thoát được bằng phím Esc).
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !els.cameraEditModal.classList.contains('is-hidden')) {
        closeEditModal();
      }
    });
  }

  return {
    init,
    loadCameras,
    activateDashboardStreams,
    deactivateDashboardStreams,
    setFocusedCamera,
    clearFocusedCamera,
    syncFocusedCamera
  };
}
