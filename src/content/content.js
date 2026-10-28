const MSG = {
  STATUS: 'rt_status', RESULT: 'rt_result', ERROR: 'rt_error', STOP: 'rt_stop', GET_SETTINGS: 'rt_get_settings', SAVE_SETTINGS: 'rt_save_settings'
};

let root;
let lines = [];

function createUI() {
  if (root) return;
  root = document.createElement('section');
  root.id = 'rt-translator-panel';
  root.innerHTML = `
    <header><strong>Realtime Translator</strong><button data-action="close" aria-label="Close">×</button></header>
    <div class="rt-status" data-status>Ready</div>
    <div class="rt-lines" data-lines></div>
    <footer>
      <button data-action="stop">Stop</button>
      <button data-action="clear">Clear</button>
      <button data-action="settings">Settings</button>
    </footer>
    <form data-settings hidden>
      <label>ASR endpoint <input name="asrUrl" type="url" placeholder="https://api.example.com/v1/audio/transcriptions"></label>
      <label>ASR API key <input name="asrApiKey" type="password"></label>
      <label>ASR model <input name="asrModel" placeholder="whisper-1"></label>
      <label>Translation endpoint <input name="translationUrl" type="url" placeholder="https://api.example.com/translate"></label>
      <label>Translation API key <input name="translationApiKey" type="password"></label>
      <label>Translation model <input name="translationModel" placeholder="translation-model"></label>
      <label>Source language <input name="sourceLanguage" value="auto"></label>
      <label>Target language <input name="targetLanguage" value="zh"></label>
      <button type="submit">Save settings</button>
    </form>`;
  document.documentElement.appendChild(root);
  root.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'close') root.remove(), root = undefined;
    if (action === 'stop') chrome.runtime.sendMessage({ type: MSG.STOP });
    if (action === 'clear') lines = [], renderLines();
    if (action === 'settings') root.querySelector('[data-settings]').hidden = !root.querySelector('[data-settings]').hidden;
  });
  root.querySelector('[data-settings]').addEventListener('submit', async event => {
    event.preventDefault();
    const settings = Object.fromEntries(new FormData(event.currentTarget));
    await chrome.runtime.sendMessage({ type: MSG.SAVE_SETTINGS, settings });
    setStatus('Settings saved');
  });
  chrome.runtime.sendMessage({ type: MSG.GET_SETTINGS }).then(settings => {
    for (const [key, value] of Object.entries(settings || {})) {
      const input = root.querySelector(`[name="${CSS.escape(key)}"]`);
      if (input) input.value = value;
    }
  });
}

function setStatus(value) {
  if (root) root.querySelector('[data-status]').textContent = value;
}

function renderLines() {
  if (!root) return;
  root.querySelector('[data-lines]').innerHTML = lines.slice(-30).map(line => `
    <article><div class="rt-original"></div><div class="rt-translation"></div></article>`).join('');
  [...root.querySelectorAll('article')].forEach((element, index) => {
    const line = lines.slice(-30)[index];
    element.children[0].textContent = line.original || '';
    element.children[1].textContent = line.translation || '';
  });
}

chrome.runtime.onMessage.addListener(message => {
  createUI();
  if (message.type === MSG.STATUS) setStatus(message.state);
  if (message.type === MSG.ERROR) setStatus(`Error: ${message.message}`);
  if (message.type === MSG.RESULT) {
    lines.push({ original: message.original, translation: message.translation });
    renderLines();
  }
});

createUI();
