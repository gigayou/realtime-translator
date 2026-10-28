# Realtime Translator

干净的 Chrome Manifest V3 实时翻译插件骨架。它捕获当前标签页音频，将短音频块发送到第三方 ASR API，再把识别文本发送到第三方翻译 API，并在网页右下角显示双语结果。

## 当前状态

这是一个可加载的开发骨架，不包含任何第三方密钥，也没有绑定特定供应商。默认协议约定：

### ASR API

- `POST` multipart/form-data
- 字段：`file`、可选 `model`、可选 `language`
- 返回 JSON：`{ "text": "..." }`，也兼容 `transcript` 或 `result.text`

### Translation API

- `POST` JSON
- 请求：

```json
{
  "model": "optional-model",
  "text": "source text",
  "source_language": "auto",
  "target_language": "zh"
}
```

- 返回 JSON：`{ "translation": "..." }`，也兼容 `translatedText`、`text` 或 `result`

## 加载到 Chrome

1. 打开 `chrome://extensions`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择：

```text
C:\Users\17273\Projects\realtime-translator
```

5. 打开可播放音频的网页。
6. 点击扩展图标。
7. 在字幕面板中点击 `Settings`，填写 ASR 和翻译 API 地址与密钥。
8. 再次点击扩展图标开始或停止捕获。

## 安全说明

- 当前版本为了便于验证，API key 保存在 `chrome.storage.local`，并直接从扩展上下文发送请求。
- 生产版本建议增加自己的后端代理，不把长期 API key 放进浏览器扩展。
- 仅使用你有权使用的第三方 ASR 和翻译服务。
- 当前实现使用约 3 秒的 `audio/webm;codecs=opus` 分片上传，延迟和兼容性取决于 API。
- 如果供应商支持实时 WebSocket/WebRTC，应将 `src/offscreen/offscreen.js` 的分片上传替换为流式客户端。

## 后续建议

1. 添加 API provider adapter，而不是让 offscreen 代码承担所有协议差异。
2. 将 ASR 和翻译请求迁移到自有后端。
3. 加入暂停/继续和 AbortController。
4. 添加字幕样式、历史记录和语言选择界面。
5. 针对 YouTube、Twitch 等网站单独实现评论捕获适配器。
6. 在发布前限制 `host_permissions`，不要默认使用 `<all_urls>`。
