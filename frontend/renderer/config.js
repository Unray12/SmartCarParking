window.__APP_CONFIG__ = {
  API_BASE: `${window.location.protocol}//${window.location.hostname || '127.0.0.1'}:8010`,
  // Cổng WHEP/WebRTC của MediaMTX (browser POST SDP offer thẳng tới đây). Để trống thì
  // frontend tự suy ra `${protocol}//${hostname}:8889`. Chỉ đặt khi MediaMTX đứng sau
  // reverse-proxy hoặc tên miền riêng, vd 'https://cam.example.com'.
  WEBRTC_BASE: ''
};
