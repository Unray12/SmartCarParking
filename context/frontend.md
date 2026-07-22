# Frontend (SPA vanilla JS)

> Điều hướng "mở file nào" xem [code-map.md](code-map.md). Chi tiết stream (WebRTC/JPEG) xem
> [streaming-architecture.md](streaming-architecture.md).

## IA (cấu trúc trang)
Dark professional, sidebar nhóm có icon SVG. Nav: **Giám sát** (`overview`, `cameras`, `parking`) ·
**Dữ liệu** (`sessions`, `plates`, `reports`, `logs`) · **Quản trị** (`rfid`, `ai`, `settings`, `system`) + `user`.
- `overview`: KPI card + occupancy theo bãi + 2 bảng (session đang gửi, biển gần nhất).
- `cameras`: quản lý camera (form thêm + focus + grid live). **Stream chỉ bật ở view này.**
- `parking`: tạo bãi (sức chứa) + chọn cam vào/ra, bảng bãi + occupancy, ảnh chụp, chi tiết bãi (live + capture + log).
- `sessions`/`plates`: lịch sử + tìm kiếm (lọc client).
- `reports`: KPI + 2 chart canvas vẽ thủ công (không thư viện ngoài).
- `user`: thông tin phiên + đăng xuất + đổi/đặt lại mật khẩu.
- **Login riêng** `login.html` + `login.js` tại `/login`.

## Cơ chế chung
- `index.html`: sidebar nav + nhiều `<section data-view-panel>`. Đổi tab bằng class `is-active`, không reload.
- `config.js`: `API_BASE = <proto>//<hostname>:8010`.
- `api.js`: fetch wrapper (timeout AbortController, `_ts` chống cache GET), token Bearer, 401→login, `wsCameraUrl()`, `buildWhepUrl()`. `WS_BASE` đổi http→ws.
- `state.js`: `appState` + `VIEW_META` + localStorage settings (`scp_settings_v1`) + **nav (`scp_nav_v1`, giữ phiên)** qua `loadNav/saveNav`.

## Kiến trúc module FE (ESM singleton, không bundler)
Module import trực tiếp singleton chung (`els` từ `dom.js`, helper `ui.js`, `api`, `appState`). Cross-view qua **callback do `main.js` cấp** lúc init (tránh import vòng).
- **Shared:** `dom.js`, `ui.js` (notify/toast/fmt/occ/`setStreamStatusChip`/`withButtonBusy`), `layout.js`, `account.js`, `api.js`, `state.js`.
- **Stream:** `webrtc.js` (WHEP), `jpeg-stream.js` (`createJpegCanvasPlayer` dùng chung), `stream.js` (`createStreamSession` điều phối WebRTC/JPEG).
- **views/**: `overview`, `history`, `reports`, `parking`, `rfid`, `ai`, `system`. `camera.js`/`logs.js` factory.
- **`main.js` orchestrator (~260 dòng):** `switchView`/`getInitialView`/`hashchange` (giữ phiên qua URL hash + localStorage), `resetPolling`, `startApp`/`stopApp`/`bootstrap`, init các module + cấp callback (`onLotsLoaded`, `onEvent`, `onLogout`, `onCameraMutated`, `onCamerasUpdated`).

## Điều phối (`main.js`)
- `switchView(view)`: đổi tab, bật/tắt stream ở `cameras`, gọi loader tương ứng, lưu nav + đồng bộ URL hash.
- `resetPolling()`: `mainPoll` (refresh dữ liệu **view đang xem**, theo `refreshSeconds`) + `cameraPoll` (reload danh sách camera, chậm hơn).
- Giữ phiên: refresh/back-forward → đúng trang; camera phóng lớn + bãi đang mở cũng khôi phục.

## Camera (`camera.js`)
- `createCameraModule`: card grid + panel phóng lớn (focus). Mỗi luồng qua `createStreamSession` (WebRTC ưu tiên, JPEG cho HTTP). Pause/resume theo view + `pausedForFocus` + **`IntersectionObserver`** (chỉ stream card trong viewport). Chip trạng thái luồng trên header. Toggle/sửa (modal, Esc đóng)/xóa (confirm)/phóng lớn/fullscreen.

## Parking (`views/parking.js`)
- Chi tiết bãi: `openParkingLotDetail` render log in/out + ảnh capture; 2 stream vào/ra qua `createStreamSession`. Poll RIÊNG tần suất cao (`capture-status`, ~1s) cho chip RFID gần realtime, độc lập nhịp `/overview`. Chip RFID 3 trạng thái (ok/off/warn) + cảnh báo quẹt bị từ chối theo hướng (baseline chống pulse lại sự kiện cũ). Ô capture vào độc lập; ô ra chia đôi (đối chiếu vào/ra).
- **Nút "Giả lập quét RFID"** (chi tiết bãi, chỉ hiện khi `Settings.rfid_test_mode_enabled=true` - đọc qua `GET /health`): test vào/ra không cần đầu đọc thật. Dùng 1 thẻ cố định `WEBTEST0001` cho toàn hệ thống; bấm lần 1 = quẹt Vào, lần 2 = quẹt Ra (nhãn nút tự đổi theo `testCardActive`, suy từ session list của bãi đang mở). Vì thẻ là CHUNG (không phân theo bãi), quẹt Vào ở 1 bãi trong khi thẻ đang "trong" 1 bãi khác sẽ bị backend từ chối `already_in` — đúng ý người dùng "mặc định chỉ 1 session vào/ra tại 1 thời điểm".

## AI (`views/ai.js`)
- Upload model + test AI live: vòng poll tự-lên-lịch (`setTimeout`-sau-khi-xong, không `setInterval` — tránh chồng lấn trên NUC) gọi `/ai/test-camera`; vẽ frame + overlay box biển số lên canvas. (Đây là vòng JPEG riêng, chưa dùng `jpeg-stream.js` vì cần overlay per-frame.)

## Logs (`logs.js`)
- `createLogModule`: tab Logs gọi `/api/v1/logs`, bảng có badge theo loại, auto-refresh khi ở tab Logs.
