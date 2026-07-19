// WHEP client tối giản (non-trickle) cho MediaMTX. Luồng: tạo RTCPeerConnection nhận-only,
// tạo SDP offer, chờ gom ICE candidate rồi POST offer 1 lần tới endpoint WHEP, nhận SDP
// answer đặt làm remote description. Media H.264 sau đó đi thẳng browser <-> MediaMTX qua
// UDP (không qua backend), decode bằng phần cứng của trình duyệt -> trễ thấp.

// Chờ ICE gom xong để gửi offer kèm sẵn candidate (non-trickle). Trong LAN, host candidate
// có gần như tức thì nên đặt timeout ngắn: gửi sớm với candidate đang có thay vì chờ đủ.
function waitIceGathering(pc, timeoutMs = 1500) {
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
// onFailed gọi khi lỗi ký kết SDP hoặc peer rớt (dùng để fallback JPEG ở tầng trên).
export function startWhep({ url, video, onConnected, onFailed }) {
  const pc = new RTCPeerConnection();
  let closed = false;
  const stream = new MediaStream();

  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.addTransceiver('audio', { direction: 'recvonly' });

  pc.ontrack = (ev) => {
    stream.addTrack(ev.track);
    video.srcObject = stream;
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
