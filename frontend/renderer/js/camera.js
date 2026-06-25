import { WS_BASE } from './api.js';

export function createCameraModule({ els, state, api, notify, onCameraMutated, onCamerasUpdated }) {
  const cameraViews = new Map();
  const focusRuntime = {
    cameraId: null,
    ws: null,
    pendingFrame: null,
    decoding: false
  };
  let editingCameraId = null;

  function findCameraById(cameraId) {
    return state.cameras.find((cam) => cam.id === cameraId) || null;
  }

  function closeFocusSocket() {
    if (!focusRuntime.ws) return;
    if (focusAnimFrame) {
      cancelAnimationFrame(focusAnimFrame);
      focusAnimFrame = null;
    }
    focusRuntime.ws.onmessage = null;
    focusRuntime.ws.onclose = null;
    focusRuntime.ws.onerror = null;
    focusRuntime.ws.close();
    focusRuntime.ws = null;
    focusRuntime.cameraId = null;
    focusRuntime.pendingFrame = null;
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

  function openFocusSocket(cameraId) {
    if (focusRuntime.ws && focusRuntime.cameraId === cameraId) return;

    closeFocusSocket();
    const camera = findCameraById(cameraId);
    if (!camera || !camera.enabled || state.currentView !== 'cameras') {
      els.focusPlaceholder.textContent = camera && !camera.enabled ? 'Camera đang tắt' : 'Đang chờ camera...';
      els.focusPlaceholder.style.display = 'block';
      return;
    }

    const ws = new WebSocket(`${WS_BASE}/ws/cameras/${cameraId}`);
    ws.binaryType = 'arraybuffer';

    ws.onmessage = (ev) => {
      focusRuntime.pendingFrame = ev.data;
      consumeFocusFrame().catch(console.error);
    };

    ws.onclose = () => {
      const stillFocused = state.focusedCameraId === cameraId;
      const latest = findCameraById(cameraId);
      if (stillFocused && latest && latest.enabled && state.currentView === 'cameras') {
        setTimeout(() => openFocusSocket(cameraId), 1000);
      }
    };

    focusRuntime.ws = ws;
    focusRuntime.cameraId = cameraId;
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
    syncFocusedCamera();
  }

  function clearFocusedCamera(message = null) {
    state.focusedCameraId = null;
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

    try {
      await api(`/api/v1/cameras/${editingCameraId}`, {
        method: 'PUT',
        body: JSON.stringify({ name, source_url: sourceUrl, enabled })
      });

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
        <button class="toggle"></button>
      </div>
      <div class="preview">
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
    const toggleBtn = card.querySelector('.toggle');
    const urlEl = card.querySelector('.url');
    const focusBtn = card.querySelector('.mini-btn.focus');
    const editBtn = card.querySelector('.mini-btn.edit');
    const deleteBtn = card.querySelector('.mini-btn.danger');
    const canvas = card.querySelector('canvas');
    const placeholder = card.querySelector('.placeholder');
    const ctx = canvas.getContext('2d');

    canvas.width = 1280;
    canvas.height = 720;

    const local = {
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

    function closeSocket() {
      if (!local.ws) return;
      local.ws.onmessage = null;
      local.ws.onclose = null;
      local.ws.onerror = null;
      local.ws.close();
      local.ws = null;
    }

    function openSocket(cameraId) {
      if (local.paused || local.pausedForFocus || state.currentView !== 'cameras') return;

      closeSocket();
      const ws = new WebSocket(`${WS_BASE}/ws/cameras/${cameraId}`);
      ws.binaryType = 'arraybuffer';

      ws.onmessage = (ev) => {
        local.pendingFrame = ev.data;
        consumeFrame().catch(console.error);
      };

      ws.onclose = () => {
        if (camera.enabled && !local.paused && !local.pausedForFocus && state.currentView === 'cameras') {
          setTimeout(() => openSocket(cameraId), 1000);
        }
      };

      local.ws = ws;
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
      openSocket(camera.id);
    } else {
      placeholder.textContent = 'Camera đang tắt';
    }

    return {
      card,
      update(nextCamera) {
        camera = nextCamera;
        renderHeader(camera);

        if (!camera.enabled) {
          closeSocket();
          placeholder.style.display = 'block';
          placeholder.textContent = 'Camera đang tắt';
          return;
        }

        if (!local.paused && !local.pausedForFocus && state.currentView === 'cameras' && !local.ws) {
          openSocket(camera.id);
        }
      },
      pause() {
        local.paused = true;
        closeSocket();
      },
      resume() {
        local.paused = false;
        if (camera.enabled && !local.pausedForFocus && !local.ws) {
          openSocket(camera.id);
        }
      },
      setFocusStreamPaused(pausedForFocus) {
        local.pausedForFocus = pausedForFocus;
        if (pausedForFocus) {
          closeSocket();
          return;
        }
        if (!local.paused && camera.enabled && state.currentView === 'cameras' && !local.ws) {
          openSocket(camera.id);
        }
      },
      setFocused(isFocused) {
        card.classList.toggle('is-focused', isFocused);
      },
      destroy() {
        closeSocket();
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
