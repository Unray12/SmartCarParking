// WHEP client tối giản (non-trickle) cho MediaMTX. Luồng: tạo RTCPeerConnection nhận-only,
// tạo SDP offer, chờ gom ICE candidate rồi POST offer 1 lần tới endpoint WHEP, nhận SDP
// answer đặt làm remote description. Media H.264 sau đó đi thẳng browser <-> MediaMTX qua
// UDP (không qua backend), decode bằng phần cứng của trình duyệt -> trễ thấp.

// Ép nhánh nhận (receiver) giữ buffer NHỎ NHẤT có thể để giảm độ trễ hiển thị. Mặc định
// trình duyệt đệm thêm vài trăm ms (jitter buffer) để mượt khi mạng xóc - trong LAN ổn định
// thì đó là độ trễ thừa. Đây là đòn bẩy giảm delay lớn nhất phía client cho WebRTC.
//  - playoutDelayHint (Chrome, đơn vị GIÂY): 0 = phát ngay khi có frame.
//  - jitterBufferTarget (chuẩn W3C, đơn vị MS): 0 = nhắm buffer tối thiểu.
// Cả 2 chỉ là "hint" - trình duyệt vẫn tự nới buffer nếu mạng xấu để tránh giật, nên an toàn.
function minimizeReceiverLatency(receiver) {
  if (!receiver) return;
  try {
    if ('playoutDelayHint' in receiver) receiver.playoutDelayHint = 0;
  } catch { /* ignore */ }
  try {
    if ('jitterBufferTarget' in receiver) receiver.jitterBufferTarget = 0;
  } catch { /* ignore */ }
}

// Chờ ICE gom xong để gửi offer kèm sẵn candidate (non-trickle). Trong LAN, host candidate
// có gần như tức thì nên đặt timeout ngắn: gửi sớm với candidate đang có thay vì chờ đủ.
function waitIceGathering(pc, timeoutMs = 700) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === 'complete') finish();
    };
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(finish, timeoutMs);
  });
}

// Bắt đầu 1 phiên WHEP. Trả handle { close }. onConnected gọi khi peer 'connected';
// onFailed gọi khi lỗi ký kết SDP hoặc peer rớt - stream.js dùng để THỬ LẠI WebRTC (nguồn
// rtsp://) chứ không rơi về JPEG (JPEG chỉ dành cho nguồn HTTP/MJPEG không đi được WebRTC).
export function startWhep({ url, video, onConnected, onFailed }) {
  const pc = new RTCPeerConnection();
  let closed = false;
  const stream = new MediaStream();

  // CHỈ nhận video (bỏ audio): camera đỗ xe không có tiếng, mà thêm nhánh audio buộc trình
  // duyệt đồng bộ A/V - có thể GIỮ CHẬM video chờ audio, làm tăng trễ. Video-only vừa gọn
  // negotiation vừa bỏ được nguồn trễ này.
  pc.addTransceiver('video', { direction: 'recvonly' });

  pc.ontrack = (ev) => {
    stream.addTrack(ev.track);
    video.srcObject = stream;
    minimizeReceiverLatency(ev.receiver);
    // Gọi play() chủ động: nếu autoplay bị chặn, video đứng im (trông như trễ vô hạn). muted
    // nên trình duyệt cho phép; nuốt lỗi để không vỡ luồng.
    video.play?.().catch(() => { /* autoplay policy - đã muted nên hiếm khi xảy ra */ });
  };

  pc.onconnectionstatechange = () => {
    if (closed) return;
    if (pc.connectionState === 'connected') {
      onConnected?.();
    } else if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
      onFailed?.(new Error(`peer ${pc.connectionState}`));
    }
  };

  const handle = {
    close() {
      if (closed) return;
      closed = true;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      try { pc.close(); } catch { /* ignore */ }
      if (video && video.srcObject === stream) video.srcObject = null;
    }
  };

  (async () => {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitIceGathering(pc);
      if (closed) return;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: pc.localDescription.sdp
      });
      if (!res.ok) throw new Error(`WHEP HTTP ${res.status}`);

      const answerSdp = await res.text();
      if (closed) return;
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch (err) {
      if (!closed) onFailed?.(err);
      handle.close();
    }
  })();

  return handle;
}
