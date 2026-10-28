const MSG = {
  TOGGLE: 'rt_toggle',
  START: 'rt_start',
  STOP: 'rt_stop',
  PAUSE: 'rt_pause',
  RESUME: 'rt_resume',
  RESULT: 'rt_result',
  STATUS: 'rt_status',
  ERROR: 'rt_error',
  GET_SETTINGS: 'rt_get_settings',
  SAVE_SETTINGS: 'rt_save_settings',
};

const DEFAULTS = {
  provider: 'openai-compatible',
  asrUrl: '',
  asrApiKey: '',
  asrModel: '',
  translationUrl: '',
  translationApiKey: '',
  translationModel: '',
  sourceLanguage: 'auto',
  targetLanguage: 'zh',
};

const OFFSCREEN_URL = 'src/offscreen/offscreen.html';
const tabStates = new Map();
let offscreenCreating;

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (!offscreenCreating) {
    offscreenCreating = chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['USER_MEDIA'],
      justification: 'Capture tab audio for transcription and translation.',
    }).finally(() => { offscreenCreating = undefined; });
  }
  await offscreenCreating;
}

async function getSettings() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

async function sendToTab(tabId, message) {
  try { await chrome.tabs.sendMessage(tabId, message); } catch { /* tab may not have content script */ }
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: MSG.STATUS, state: 'ready' });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['src/content/content.js'] });
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['src/content/content.css'] });
  }
}

async function start(tabId) {
  await ensureContentScript(tabId);
  await ensureOffscreen();
  const settings = await getSettings();
  const streamId = await new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, id => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message)); else resolve(id);
    });
  });
  tabStates.set(tabId, { state: 'starting', streamId });
  await chrome.runtime.sendMessage({ type: MSG.START, tabId, streamId, settings });
  await sendToTab(tabId, { type: MSG.STATUS, state: 'starting' });
}

async function stop(tabId) {
  await chrome.runtime.sendMessage({ type: MSG.STOP, tabId });
  tabStates.delete(tabId);
  await sendToTab(tabId, { type: MSG.STATUS, state: 'stopped' });
  if (await chrome.offscreen.hasDocument() && tabStates.size === 0) {
    await chrome.offscreen.closeDocument();
  }
}

chrome.action.onClicked.addListener(async tab => {
  if (!tab.id || !/^https?:|^file:/.test(tab.url || '')) return;
  try {
    if (tabStates.has(tab.id)) await stop(tab.id); else await start(tab.id);
  } catch (error) {
    await sendToTab(tab.id, { type: MSG.ERROR, message: error.message });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id ?? message.tabId;
  if (message.type === MSG.GET_SETTINGS) {
    getSettings().then(sendResponse);
    return true;
  }
  if (message.type === MSG.SAVE_SETTINGS) {
    chrome.storage.local.set({ ...DEFAULTS, ...message.settings }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === MSG.STOP && tabId != null) {
    stop(tabId).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return false;
});

chrome.tabs.onRemoved.addListener(tabId => {
  if (tabStates.has(tabId)) stop(tabId).catch(() => {});
});

// Messages from the offscreen document.
chrome.runtime.onMessage.addListener((message) => {
  if (!message.tabId) return;
  const state = tabStates.get(message.tabId);
  if (!state) return;
  if (message.type === MSG.STATUS) {
    state.state = message.state;
    sendToTab(message.tabId, message).catch(() => {});
  } else if (message.type === MSG.RESULT) {
    sendToTab(message.tabId, message).catch(() => {});
  } else if (message.type === MSG.ERROR) {
    state.state = 'error';
    sendToTab(message.tabId, message).catch(() => {});
  }
});

export { MSG, DEFAULTS };
