// Trang Reports: KPI + 2 biểu đồ Canvas tự vẽ (không thư viện ngoài).
import { api } from '../api.js';
import { appState } from '../state.js';
import { els } from '../dom.js';
import { notify, fmtDuration, fmtMoney } from '../ui.js';

const CHART_HEIGHT = 240;
let lastStats = null;

function prepareCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
  const cssH = CHART_HEIGHT; // chiều cao logic cố định (đồng bộ CSS)
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  return { ctx, w: cssW, h: cssH };
}

function drawAxes(ctx, w, h, pad, maxVal) {
  ctx.strokeStyle = 'rgba(148,173,211,0.18)';
  ctx.fillStyle = '#8d9cb5';
  ctx.font = '11px Inter, Segoe UI, sans-serif';
  ctx.lineWidth = 1;
  const steps = 4;
  for (let i = 0; i <= steps; i += 1) {
    const y = pad.top + (h - pad.top - pad.bottom) * (i / steps);
    const val = Math.round(maxVal * (1 - i / steps));
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    ctx.fillText(String(val), 6, y + 3);
  }
}

function drawGroupedBars(canvas, labels, seriesA, seriesB) {
  if (!canvas) return;
  const { ctx, w, h } = prepareCanvas(canvas);
  const pad = { top: 12, right: 12, bottom: 26, left: 30 };
  const maxVal = Math.max(1, ...seriesA, ...seriesB);
  drawAxes(ctx, w, h, pad, maxVal);

  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const groupW = plotW / labels.length;
  const barW = Math.max(3, Math.min(16, groupW / 3));

  for (let i = 0; i < labels.length; i += 1) {
    const cx = pad.left + groupW * i + groupW / 2;
    const aH = (seriesA[i] / maxVal) * plotH;
    const bH = (seriesB[i] / maxVal) * plotH;
    ctx.fillStyle = '#2dd4bf';
    ctx.fillRect(cx - barW - 1, pad.top + plotH - aH, barW, aH);
    ctx.fillStyle = '#4f86ff';
    ctx.fillRect(cx + 1, pad.top + plotH - bH, barW, bH);
    if (labels.length <= 16 || i % 2 === 0) {
      ctx.fillStyle = '#8d9cb5';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], cx, h - 8);
      ctx.textAlign = 'left';
    }
  }
}

function drawBars(canvas, labels, values, color) {
  if (!canvas) return;
  const { ctx, w, h } = prepareCanvas(canvas);
  const pad = { top: 12, right: 12, bottom: 26, left: 30 };
  const maxVal = Math.max(1, ...values);
  drawAxes(ctx, w, h, pad, maxVal);

  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const slot = plotW / values.length;
  const barW = Math.max(3, slot * 0.62);

  for (let i = 0; i < values.length; i += 1) {
    const cx = pad.left + slot * i + slot / 2;
    const bH = (values[i] / maxVal) * plotH;
    ctx.fillStyle = color;
    ctx.fillRect(cx - barW / 2, pad.top + plotH - bH, barW, bH);
    if (i % 2 === 0) {
      ctx.fillStyle = '#8d9cb5';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], cx, h - 8);
      ctx.textAlign = 'left';
    }
  }
}

function renderReports(stats) {
  lastStats = stats;
  els.rpRevenue.textContent = fmtMoney(stats.total_revenue, stats.currency);
  els.rpSessions.textContent = stats.total_sessions;
  els.rpAvgDuration.textContent = fmtDuration(stats.avg_duration_minutes);

  let peakHour = 0;
  let peakVal = -1;
  stats.by_hour.forEach((v, h) => {
    if (v > peakVal) { peakVal = v; peakHour = h; }
  });
  els.rpPeakHour.textContent = peakVal > 0 ? `${String(peakHour).padStart(2, '0')}:00` : '-';

  const dailyLabels = stats.daily.map((d) => d.date.slice(5)); // MM-DD
  drawGroupedBars(
    els.dailyChartCanvas,
    dailyLabels,
    stats.daily.map((d) => d.checkins),
    stats.daily.map((d) => d.checkouts)
  );
  const hourLabels = stats.by_hour.map((_, h) => String(h));
  drawBars(els.hourChartCanvas, hourLabels, stats.by_hour, '#4f86ff');
}

export async function refreshReports() {
  const days = Number(els.reportsDays?.value || 7);
  const stats = await api(`/api/v1/dashboard/stats?days=${days}`);
  renderReports(stats);
}

export function initReports() {
  if (els.reportsDays) {
    els.reportsDays.addEventListener('change', () => {
      refreshReports().catch((err) => notify(`Reports lỗi: ${err.message}`, 'error'));
    });
  }
  if (els.reportsRefreshBtn) {
    els.reportsRefreshBtn.addEventListener('click', () => {
      refreshReports()
        .then(() => notify('Đã làm mới báo cáo', 'success'))
        .catch((err) => notify(`Reports lỗi: ${err.message}`, 'error'));
    });
  }
  // Vẽ lại khi đổi kích thước nếu đang ở tab reports.
  window.addEventListener('resize', () => {
    if (appState.currentView === 'reports' && lastStats) renderReports(lastStats);
  });
}
