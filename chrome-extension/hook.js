// Runs in MAIN world (page JS context) — can hook RTCPeerConnection & getUserMedia.
// Communicates with content.js via window.postMessage.

(function () {
  const remoteStreams = [];
  let micStream = null;
  let audioCtx = null;
  let dest = null;
  let mediaRecorder = null;
  let chunks = [];
  const connectedStreamIds = new Set();

  // ── Hook getUserMedia — capture the host's microphone stream ───────────────
  const _origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async function (constraints) {
    const stream = await _origGUM(constraints);
    if (constraints && constraints.audio) {
      micStream = stream;
      _connectStream(stream); // connect immediately if already recording
    }
    return stream;
  };

  // ── Hook RTCPeerConnection — capture all remote participants' audio ─────────
  const _OrigPC = window.RTCPeerConnection;
  window.RTCPeerConnection = function (...args) {
    const pc = new _OrigPC(...args);
    pc.addEventListener('track', (e) => {
      if (e.track.kind === 'audio' && e.streams[0]) {
        remoteStreams.push(e.streams[0]);
        _connectStream(e.streams[0]); // connect immediately if already recording
      }
    });
    return pc;
  };
  Object.assign(window.RTCPeerConnection, _OrigPC);
  window.RTCPeerConnection.prototype = _OrigPC.prototype;

  // ── Dynamically connect a stream to the AudioContext mixer ─────────────────
  function _connectStream(stream) {
    if (!audioCtx || !dest) return;
    if (connectedStreamIds.has(stream.id)) return;
    try {
      const src = audioCtx.createMediaStreamSource(stream);
      src.connect(dest);
      connectedStreamIds.add(stream.id);
    } catch {}
  }

  // ── Commands from content.js ───────────────────────────────────────────────
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.source !== 'aimom-content') return;
    if (e.data.type === 'AIMOM_START') _startRecording();
    if (e.data.type === 'AIMOM_STOP')  _stopRecording();
  });

  function _startRecording() {
    try {
      audioCtx = new AudioContext();
      dest = audioCtx.createMediaStreamDestination();
      connectedStreamIds.clear();

      // Connect all streams captured before recording started
      remoteStreams.forEach(_connectStream);
      if (micStream) _connectStream(micStream);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      mediaRecorder = new MediaRecorder(dest.stream, { mimeType });
      chunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.start(10_000); // flush every 10s
      window.postMessage({ source: 'aimom-hook', type: 'AIMOM_RECORDING_STARTED' }, '*');
      console.log('[AI MOM] Recording started');
    } catch (err) {
      window.postMessage({ source: 'aimom-hook', type: 'AIMOM_ERROR', error: err.message }, '*');
      console.error('[AI MOM] Failed to start recording:', err);
    }
  }

  function _stopRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      window.postMessage({ source: 'aimom-hook', type: 'AIMOM_ERROR', error: 'No active recorder' }, '*');
      return;
    }

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.onloadend = () => {
        window.postMessage({
          source: 'aimom-hook',
          type: 'AIMOM_RECORDING_DONE',
          data: reader.result.split(',')[1], // base64
          mimeType: 'audio/webm',
          size: blob.size,
        }, '*');
        console.log(`[AI MOM] Recording ready — ${(blob.size / 1024 / 1024).toFixed(1)} MB`);
      };
      reader.readAsDataURL(blob);
    };

    mediaRecorder.stop();
  }
})();
