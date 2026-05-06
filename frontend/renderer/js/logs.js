import { api } from './api.js';

const TYPE_LABELS = {
  rfid_in: 'RFID VÀO',
  rfid_out: 'RFID RA',
  plate_read: 'BIỂN SỐ',
  session_in: 'XE VÀO',
  session_out: 'XE RA',
  camera_added: 'CAM +',
  camera_removed: 'CAM -',
};

const TYPE_CLASSES = {
  rfid_in: 'log-rfid-in',
  rfid_out: 'log-rfid-out',
  plate_read: 'log-plate',
  session_in: 'log-session-in',
  session_out: 'log-session-out',
  camera_added: 'log-camera',
  camera_removed: 'log-camera',
};

let refreshTimer = null;

export function createLogModule({ els, state, notify }) {
  async function loadLogs() {
    const hours = parseInt((els.logHours && els.logHours.value) || '24', 10);
    const limit = parseInt((els.logLimit && els.logLimit.value) || '100', 10);

    try {
      const logs = await api(`/api/logs?hours=${hours}&limit=${limit}`);
      renderLogs(logs);
    } catch (err) {
      notify(`Không thể tải logs: ${err.message}`, 'error');
    }
  }

  function renderLogs(logs) {
    if (!els.logBody) return;
    els.logBody.innerHTML = '';

    if (!logs || logs.length === 0) {
      els.logBody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#888">Chưa có sự kiện nào</td></tr>';
      return;
    }

    for (const log of logs) {
      const tr = document.createElement('tr');
      const cls = TYPE_CLASSES[log.type] || '';
      if (cls) tr.className = cls;

      const time = new Date(log.timestamp).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        day: '2-digit',
        month: '2-digit',
      });

      const typeLabel = TYPE_LABELS[log.type] || log.type;

      tr.innerHTML = '<td class="log-time">' + time + '</td>'
        + '<td class="log-type"><span class="badge ' + cls + '">' + typeLabel + '</span></td>'
        + '<td class="log-msg">' + escapeHtml(log.message) + '</td>';
      els.logBody.appendChild(tr);
    }
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    if ((els.logAutoRefresh && els.logAutoRefresh.checked) && state.currentView === 'logs') {
      refreshTimer = setInterval(function() {
        if (state.currentView === 'logs') {
          loadLogs();
        }
      }, 3000);
    }
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  function init() {
    if (els.logRefreshBtn) {
      els.logRefreshBtn.addEventListener('click', function() {
        loadLogs();
        notify('Đã làm mới logs', 'success');
      });
    }

    if (els.logHours) {
      els.logHours.addEventListener('change', loadLogs);
    }
    if (els.logLimit) {
      els.logLimit.addEventListener('change', loadLogs);
    }
    if (els.logAutoRefresh) {
      els.logAutoRefresh.addEventListener('change', function() {
        if (els.logAutoRefresh.checked) {
          startAutoRefresh();
        } else {
          stopAutoRefresh();
        }
      });
    }
  }

  function onViewChange(view) {
    if (view === 'logs') {
      loadLogs();
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  }

  return {
    init,
    onViewChange,
    loadLogs,
  };
}
