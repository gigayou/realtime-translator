const MSG = {
  START: 'rt_start', STOP: 'rt_stop', RESULT: 'rt_result', STATUS: 'rt_status', ERROR: 'rt_error'
};

const sessions = new Map();

function emit(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

function pickHeader(key) {
  return key ? { Authorization: `Bearer ${key}` } : {};
}

async function transcribe(blob, settings) {
  if (!settings.asrUrl) throw new Error('Configure an ASR endpoint first.');
  const form = new FormData();
  form.append('file', blob, 'tab-audio.webm');
  if (settings.asrModel) form.append('model', settings.asrModel);
  if (settings.sourceLanguage && settings.sourceLanguage !== 'auto') form.append('language', settings.sourceLanguage);
  const response = await fetch(settings.asrUrl, { method: 'POST', headers: pickHeader(settings.asrApiKey), body: form });
  if (!response.ok) throw new Error(`ASR request failed: HTTP ${response.status}`);
  const data = await response.json();
  return data.text ?? data.transcript ?? data.result?.text ?? '';
}

async function translate(text, settings) {
  if (!text.trim() || !settings.translationUrl) return text;
  const response = await fetch(settings.translationUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...pickHeader(settings.translationApiKey) },
    body: JSON.stringify({
      model: settings.translationModel || undefined,
      text,
      source_language: settings.sourceLanguage,
      target_language: settings.targetLanguage,
    }),
  });
  if (!response.ok) throw new Error(`Translation request failed: HTTP ${response.status}`);
  const data = await response.json();
  return data.translation ?? data.translatedText ?? data.text ?? data.result ?? '';
}

async function start({ tabId, streamId, settings }) {
  if (sessions.has(tabId)) return;
  const session = { tabId, mediaStream: null, audioContext: null, recorder: null, stopped: false, settings };
  sessions.set(tabId, session);
  try {
    session.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
      video: false,
    });
    session.audioContext = new AudioContext();
    const source = session.audioContext.createMediaStreamSource(session.mediaStream);
    const monitor = session.audioContext.createGain();
    monitor.gain.value = 1;
    source.connect(monitor);
    monitor.connect(session.audioContext.destination);

    // This baseline uses short WebM chunks. Replace this transport with a
    // streaming WebSocket/WebRTC client when the chosen ASR provider supports it.
    session.recorder = new MediaRecorder(session.mediaStream, { mimeType: 'audio/webm;codecs=opus' });
    session.recorder.ondataavailable = async event => {
      if (!event.data.size || session.stopped) return;
      try {
        const original = await transcribe(event.data, settings);
        const translation = await translate(original, settings);
        emit({ type: MSG.RESULT, tabId, original, translation, final: true });
      } catch (error) {
        emit({ type: MSG.ERROR, tabId, message: error.message });
      }
    };
    session.recorder.start(3000);
    emit({ type: MSG.STATUS, tabId, state: 'running' });
  } catch (error) {
    await cleanup(session);
    sessions.delete(tabId);
    emit({ type: MSG.ERROR, tabId, message: error.message });
  }
}

async function cleanup(session) {
  session.stopped = true;
  if (session.recorder && session.recorder.state !== 'inactive') session.recorder.stop();
  session.mediaStream?.getTracks().forEach(track => track.stop());
  await session.audioContext?.close().catch(() => {});
}

async function stop(tabId) {
  const session = sessions.get(tabId);
  if (!session) return;
  await cleanup(session);
  sessions.delete(tabId);
  emit({ type: MSG.STATUS, tabId, state: 'stopped' });
}

chrome.runtime.onMessage.addListener(message => {
  if (message.type === MSG.START) start(message);
  if (message.type === MSG.STOP) stop(message.tabId);
});
