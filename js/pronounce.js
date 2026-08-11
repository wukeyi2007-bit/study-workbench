// ==========================================
// 发音评测（讯飞语音评测 ISE，真正逐词打分）
// 需用户在「⚙ 设置」填入讯飞 APPID / APIKey / APISecret
// 本文件依赖 app.js 中的全局：state / Speech / Utils / openModal / closeModal / escapeHtml / speechRecognitionFailed / openStandalone
// ==========================================
function xfConfigured() {
  const s = state.settings;
  return !!(s.xfAppId && s.xfApiKey && s.xfApiSecret);
}
function getXfConfig() {
  return { appId: state.settings.xfAppId, apiKey: state.settings.xfApiKey, apiSecret: state.settings.xfApiSecret };
}
function inIframe() { return window.self !== window.top; }

// Uint8Array / ArrayBuffer -> base64（同步、无Blob依赖）
function arrayBufferToBase64(u8) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// 麦克风录音：AudioContext 直采 16kHz/16bit/mono PCM
const Recorder = {
  ctx: null, proc: null, stream: null, samples: [], sampleRate: 16000,
  start() {
    const self = this;
    self.samples = [];
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (stream) {
      self.stream = stream;
      const AC = window.AudioContext || window.webkitAudioContext;
      self.ctx = new AC({ sampleRate: 16000 });
      self.sampleRate = self.ctx.sampleRate || 16000;
      const srcNode = self.ctx.createMediaStreamSource(stream);
      const processor = self.ctx.createScriptProcessor(4096, 1, 1);
      self.proc = processor;
      processor.onaudioprocess = function (e) {
        const input = e.inputBuffer.getChannelData(0);
        const buf = new Float32Array(input.length);
        buf.set(input);
        self.samples.push(buf);
      };
      srcNode.connect(processor);
      // 用 gain=0 连接到 destination，保证 ScriptProcessor 被调度，同时避免麦克风回环到扬声器
      const zeroGain = self.ctx.createGain();
      zeroGain.gain.value = 0;
      processor.connect(zeroGain);
      zeroGain.connect(self.ctx.destination);
    });
  },
  stop() {
    const self = this;
    return new Promise(function (resolve, reject) {
      if (self.proc) { try { self.proc.disconnect(); } catch (e) {} self.proc = null; }
      if (self.stream) { self.stream.getTracks().forEach(function (t) { t.stop(); }); self.stream = null; }
      if (self.ctx) { try { self.ctx.close(); } catch (e) {} self.ctx = null; }
      const total = self.samples.reduce(function (a, b) { return a + b.length; }, 0);
      if (total < 100) { reject(new Error('录音数据为空，请重新跟读')); return; }
      const all = new Float32Array(total);
      let off = 0;
      self.samples.forEach(function (chunk) { all.set(chunk, off); off += chunk.length; });
      self.samples = [];
      // 重采样到 16kHz（若浏览器未支持 sampleRate 选项）
      const targetRate = 16000;
      let pcm16;
      if (Math.abs(self.sampleRate - targetRate) < 1) {
        pcm16 = floatToInt16(all);
      } else {
        const ratio = targetRate / self.sampleRate;
        const newLen = Math.max(1, Math.floor(all.length * ratio));
        const resampled = new Float32Array(newLen);
        for (let i = 0; i < newLen; i++) {
          const idx = i / ratio;
          const i0 = Math.floor(idx), i1 = Math.min(i0 + 1, all.length - 1);
          const f = idx - i0;
          resampled[i] = all[i0] * (1 - f) + all[i1] * f;
        }
        pcm16 = floatToInt16(resampled);
      }
      const u8 = new Uint8Array(pcm16.buffer);
      const bytesPerFrame = Math.floor(targetRate * 40 / 1000) * 2; // 40ms = 640 samples = 1280 bytes
      const frames = [];
      for (let o = 0; o < u8.length; o += bytesPerFrame) {
        frames.push(arrayBufferToBase64(u8.subarray(o, Math.min(o + bytesPerFrame, u8.length))));
      }
      if (!frames.length) frames.push(arrayBufferToBase64(u8));
      const wavUrl = pcmToWavUrl(pcm16, targetRate);
      resolve({ frames: frames, wavUrl: wavUrl });
    });
  }
};

function floatToInt16(samples) {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7FFF;
  }
  return out;
}

// PCM16 单声道 -> WAV blob URL，用于本地回放对比（不依赖任何外部接口）
function pcmToWavUrl(int16, sampleRate) {
  const numChannels = 1, bitsPerSample = 16;
  const dataSize = int16.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  function writeStr(off, s) { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); }
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true);
  view.setUint16(32, numChannels * bitsPerSample / 8, true); view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data'); view.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < int16.length; i++) { view.setInt16(off, int16[i], true); off += 2; }
  return URL.createObjectURL(new Blob([view], { type: 'audio/wav' }));
}

// 讯飞鉴权 URL（HMAC-SHA256）
async function getXfAuthUrl() {
  const cfg = getXfConfig();
  const host = 'ise-api.xfyun.cn';
  const date = new Date().toGMTString();
  const requestLine = 'GET /v2/open-ise HTTP/1.1';
  const signatureOrigin = 'host: ' + host + '\ndate: ' + date + '\n' + requestLine;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(cfg.apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(signatureOrigin));
  const signature = arrayBufferToBase64(new Uint8Array(sigBuf));
  const authorizationOrigin = 'api_key="' + cfg.apiKey + '", algorithm="hmac-sha256", headers="host date request-line", signature="' + signature + '"';
  const authorization = btoa(authorizationOrigin);
  return 'wss://' + host + '/v2/open-ise?authorization=' + encodeURIComponent(authorization) + '&date=' + encodeURIComponent(date) + '&host=' + host;
}

// 调用评测并解析 XML
function assessPronunciation(text, isEnglish, pcmFrames) {
  return new Promise(function (resolve, reject) {
    if (!pcmFrames || !pcmFrames.length) { reject(new Error('录音数据为空，请重新跟读')); return; }
    getXfAuthUrl().then(function (url) {
      const ws = new WebSocket(url);
      let resultB64 = '';
      let done = false;
      let initAcked = false;
      const guard = setTimeout(function () { if (!done) { done = true; if (fallbackTimer) clearTimeout(fallbackTimer); try { ws.close(); } catch (e) {} reject(new Error('讯飞评测超时（15s 无响应）')); } }, 15000);
      let fallbackTimer = null;
      const ent = isEnglish ? 'en_vip' : 'cn_vip';
      const textContent = isEnglish ? text : '﻿' + text;
      const textB64 = btoa(unescape(encodeURIComponent(textContent)));
      // 根据文本形态选评测类别：英文无空格按单词评，含空格按句子评
      const category = isEnglish
        ? (/\s/.test(text.trim()) ? 'read_sentence' : 'read_word')
        : (text.trim().length <= 1 ? 'read_syllable' : 'read_sentence');

      // 按 40ms 间隔发送音频帧，最后一段真实音频用 status=2 / aus=4 收尾
      async function sendAudioFrames() {
        const n = pcmFrames.length;
        for (let i = 0; i < n; i++) {
          if (done) return;
          let aus, status;
          if (i === n - 1) { aus = 4; status = 2; }
          else if (i === 0) { aus = 1; status = 1; }
          else { aus = 2; status = 1; }
          ws.send(JSON.stringify({
            business: { cmd: 'auw', aus: aus, aue: 'raw' },
            data: { status: status, encoding: 'raw', data_type: 1, data: pcmFrames[i] }
          }));
          if (i < n - 1) await new Promise(function (r) { setTimeout(r, 40); });
        }
      }

      function ensureAudioStarted() {
        if (initAcked || done) return;
        initAcked = true;
        if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
        sendAudioFrames();
      }

      ws.onopen = function () {
        try {
          console.log('[ISE] ws open, category=' + category + ', frames=' + pcmFrames.length);
          // 首帧：仅上传参数，等服务器 ack 后再发音频
          ws.send(JSON.stringify({
            common: { app_id: getXfConfig().appId },
            business: { aue: 'raw', auf: 'audio/L16;rate=16000', category: category, cmd: 'ssb', ent: ent, sub: 'ise', text: textB64, ttp_skip: true, plev: '0' },
            data: { status: 0, data: '' }
          }));
          // 保险：若 1.5s 内没收到确认，也尝试开始发音频，避免双方死等
          fallbackTimer = setTimeout(function () { console.log('[ISE] fallback start audio'); ensureAudioStarted(); }, 1500);
        } catch (e) { console.error('[ISE] open send error', e); if (!done) { done = true; clearTimeout(guard); if (fallbackTimer) clearTimeout(fallbackTimer); try { ws.close(); } catch (x) {} reject(e); } }
      };
      ws.onmessage = function (ev) {
        try {
          const msg = JSON.parse(ev.data);
          console.log('[ISE] recv', msg);
          if (msg.code !== undefined && msg.code !== 0) {
            if (!done) { done = true; clearTimeout(guard); if (fallbackTimer) clearTimeout(fallbackTimer); ws.close(); }
            reject(new Error('讯飞返回错误 code=' + msg.code + ' ' + (msg.message || '')));
            return;
          }
          // 收到首帧确认（任意 code===0 的成功响应）后开始流式传音频
          if (!initAcked && msg.code === 0) {
            console.log('[ISE] server ack, start audio');
            ensureAudioStarted();
            return;
          }
          if (msg.data && msg.data.result) resultB64 += msg.data.result;
          if (msg.data && msg.data.status === 2) {
            if (!done) { done = true; clearTimeout(guard); if (fallbackTimer) clearTimeout(fallbackTimer); ws.close(); }
            try { resolve(parseIseXml(atob(resultB64))); }
            catch (e) { reject(new Error('解析评测结果失败')); }
          }
        } catch (e) { console.error('[ISE] msg error', e); if (!done) { done = true; clearTimeout(guard); if (fallbackTimer) clearTimeout(fallbackTimer); try { ws.close(); } catch (x) {} reject(e); } }
      };
      ws.onerror = function (err) { console.error('[ISE] ws error', err); if (!done) { done = true; clearTimeout(guard); if (fallbackTimer) clearTimeout(fallbackTimer); reject(new Error('ws-error')); } };
      ws.onclose = function () { console.log('[ISE] ws close'); if (!done) { done = true; clearTimeout(guard); if (fallbackTimer) clearTimeout(fallbackTimer); reject(new Error('评测连接被意外关闭')); } };
    }).catch(reject);
  });
}

function parseIseXml(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  // 讯飞 ISE 详细结果结构：
  // <rec_paper><read_xxx total_score="4.x" fluency_score="4.x" integrity_score="4.x">...<word content="debate" total_score="4.x">...</word>...</read_xxx></rec_paper>
  // 分数默认满分 5 分；word / phone 的 content 和分数都在属性上。
  const root = doc.querySelector('rec_paper') || doc.documentElement;
  const readTag = root.querySelector('read_syllable, read_word, read_sentence, read_chapter');

  function attrFloat(node, name) {
    if (!node) return null;
    const v = node.getAttribute(name);
    return v != null && v !== '' ? parseFloat(v) : null;
  }
  function toPercent(v) {
    if (v == null || isNaN(v)) return null;
    // 讯飞默认 5 分制，转成 0-100 更直观；若本身已是 0-100 则不转换
    return v <= 5.5 ? Math.round(v * 20) : Math.round(v);
  }
  function readPhones(node) {
    const arr = [];
    if (!node) return arr;
    node.querySelectorAll('phone').forEach(function (p) {
      const sym = p.getAttribute('content') || p.textContent || '';
      const sc = toPercent(attrFloat(p, 'total_score') || attrFloat(p, 'score'));
      const dp = p.getAttribute('dp_message');
      if (sym) arr.push({ sym: sym, score: sc, dp: dp });
    });
    return arr;
  }

  let overall = null, fluency = null, integrity = null;
  if (readTag) {
    overall = attrFloat(readTag, 'total_score');
    fluency = attrFloat(readTag, 'fluency_score');
    integrity = attrFloat(readTag, 'integrity_score');
  }
  // 精简结果兜底： <FinalResult><total_score>4.x</total_score></FinalResult>
  if (overall == null) {
    const final = doc.querySelector('FinalResult');
    if (final) overall = attrFloat(final, 'total_score');
  }
  if (overall == null) {
    const ts = doc.querySelector('total_score');
    if (ts) overall = parseFloat(ts.textContent);
  }

  const words = [];
  (readTag || doc).querySelectorAll('word').forEach(function (w) {
    const text = (w.getAttribute('content') || w.textContent || '').trim();
    if (text) {
      const sc = attrFloat(w, 'total_score');
      let phones = readPhones(w);                 // 英文：phone 在 word 内部
      if (!phones.length && readTag) {            // 中文：phone 常与 word 并列，兜底取 readTag 下全部
        phones = readPhones(readTag);
      }
      words.push({ text: text, score: sc, phones: phones });
    }
  });

  return { overall: toPercent(overall), fluency: toPercent(fluency), integrity: toPercent(integrity), words: words };
}

// 评测结果等级
function xfGrade(score) {
  if (score >= 90) return { text: 'OUTSTANDING', color: 'var(--success)', eval: '发音完美，甚至超越了原音！' };
  if (score >= 80) return { text: 'EXCELLENT', color: '#3b82f6', eval: '发音很棒，接近标准音。' };
  if (score >= 60) return { text: 'GOOD', color: 'var(--warning)', eval: '发音尚可，红色单词多跟读。' };
  return { text: 'KEEP PRACTICING', color: 'var(--danger)', eval: '发音需要加强，跟着标准音多练几次。' };
}
function scoreColor(score) {
  if (score == null) return 'var(--text-light)';
  if (score > 80) return 'var(--success)';   // >80 绿色
  if (score >= 60) return 'var(--warning)';  // 60-80 橙色
  return 'var(--danger)';                    // <60 红色
}
function scoreBar(score) {
  if (score == null) return 'var(--text-light)';
  if (score >= 80) return 'var(--success)';
  if (score >= 60) return 'var(--warning)';
  return 'var(--danger)';
}
function findTranslation(target) {
  if (typeof window === 'undefined') return '';
  if (typeof SENTENCES !== 'undefined' && Array.isArray(SENTENCES)) {
    const s = SENTENCES.find(function (x) { return x.en === target; });
    if (s && s.cn) return s.cn;
  }
  if (typeof VOCABULARY !== 'undefined' && Array.isArray(VOCABULARY)) {
    const w = VOCABULARY.find(function (x) { return x.word && x.word.toLowerCase() === target.toLowerCase(); });
    if (w && w.meaning) return w.meaning;
  }
  return '';
}
function confettiHtml() {
  const colors = ['#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7'];
  let html = '<div class="ise-confetti">';
  for (let i = 0; i < 18; i++) {
    html += '<span class="ise-confetti-piece" style="left:' + (Math.random() * 100) + '%;animation-delay:' + (Math.random() * 1.5) + 's;background:' + colors[i % colors.length] + ';"></span>';
  }
  return html + '</div>';
}

// 结果渲染（参考你截图的样式：逐词评分 + 大圆环 + 三维度进度条 + 重新录音）
function renderIseResult(r, target, container, retryFn, extraBtnHtml) {
  if (!container) return;
  const hasScore = r.overall != null && !isNaN(r.overall);
  const score = hasScore ? Math.round(r.overall) : 0;
  const grade = xfGrade(score);
  const accuracy = hasScore ? Math.round(r.overall) : 0;
  const fluency = r.fluency != null ? Math.round(r.fluency) : 0;
  const integrity = r.integrity != null ? Math.round(r.integrity) : 0;
  const translation = findTranslation(target);

  // 顶部句子：每个词带小分badge + 下划线颜色
  const tokens = (target || '').split(/\s+/).filter(function (t) { return t !== ''; });
  const wordMap = {};
  (r.words || []).forEach(function (w) {
    const key = (w.text || '').toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
    if (key) wordMap[key] = w;
  });
  const sentenceHtml = tokens.map(function (tok) {
    const key = tok.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
    const w = wordMap[key];
    const ws = w && w.score != null ? Math.round(w.score) : null;
    const color = scoreColor(ws);
    const badge = ws != null ? ws : '-';
    return '<span class="ise-word-wrap">' +
      '<span class="ise-score-badge" style="background:' + color + ';">' + badge + '</span>' +
      '<span class="ise-word-text" style="color:' + color + ';border-color:' + color + ';">' + escapeHtml(tok) + '</span>' +
      '</span>';
  }).join(' ');

  // 三维度进度条
  function metric(label, value) {
    const v = value || 0;
    const c = scoreBar(v);
    return '<div class="ise-metric">' +
      '<div class="ise-metric-label">' + label + '</div>' +
      '<div class="ise-progress"><div class="ise-progress-fill" style="width:' + v + '%;background:' + c + ';"></div></div>' +
      '<div class="ise-metric-num" style="color:' + c + ';">' + v + '</div>' +
      '</div>';
  }

  // 音素纠错详情（可折叠）
  let phonesHtml = '';
  const allPhones = [];
  (r.words || []).forEach(function (w) {
    if (w.phones && w.phones.length) {
      allPhones.push({ word: w.text, phones: w.phones });
    }
  });
  if (allPhones.length) {
    phonesHtml = '<details class="ise-phones"><summary>查看音素纠错</summary>' +
      allPhones.map(function (item) {
        return '<div class="ise-phone-word"><strong>' + escapeHtml(item.word) + '</strong> ' +
          item.phones.map(function (p) {
            const hit = p.score != null ? p.score >= 60 : (p.dp == null || p.dp === '0');
            return '<span class="ise-phone-chip ' + (hit ? 'hit' : 'miss') + '">' + escapeHtml(p.sym || '?') + '</span>';
          }).join('') + '</div>';
      }).join('') + '</details>';
  }

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, score) / 100);

  container.innerHTML = `
    <div class="ise-result">
      ${score >= 85 ? confettiHtml() : ''}
      <div class="ise-sentence">${sentenceHtml}</div>
      ${translation ? '<div class="ise-translation">' + escapeHtml(translation) + '</div>' : ''}
      <div class="ise-score-card">
        <div class="ise-score-main">
          <div class="ise-ring-wrap">
            <svg class="ise-ring" viewBox="0 0 100 100">
              <circle class="ise-ring-bg" cx="50" cy="50" r="${radius}"/>
              <circle class="ise-ring-fg" cx="50" cy="50" r="${radius}"
                stroke="${grade.color}" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"/>
            </svg>
            <div class="ise-ring-num" style="color:${grade.color};">${score}</div>
          </div>
          <div class="ise-grade-block">
            <div class="ise-grade-title" style="color:${grade.color};">${grade.text}</div>
            <div class="ise-grade-eval">${grade.eval}</div>
          </div>
        </div>
        <div class="ise-metrics">
          ${metric('准确度', accuracy)}
          ${metric('流畅度', fluency)}
          ${metric('完整度', integrity)}
        </div>
      </div>
      <button class="ise-mic-btn" onclick="${retryFn}" title="重新录音">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>
        <span>点击重新录音</span>
      </button>
      ${extraBtnHtml || ''}
      ${phonesHtml}
    </div>`;
}

function showXfSetupTip(rd, retryFn) {
  if (!rd) return;
  rd.innerHTML = `<div class="speech-error">⚠️ 还没配置发音评测密钥。<br/>
    <span style="font-size:12px;opacity:.85;display:block;margin-top:4px;">在「讯飞开放平台」创建「语音评测」应用，拿到 APPID / APIKey / APISecret，填入「⚙ 设置」即可真正自动评分。</span>
    <button class="btn btn-primary btn-sm" style="margin-top:8px;" onclick="openSettings()">⚙ 去设置</button>
    <button class="btn btn-success btn-sm" style="margin-top:8px;" onclick="${retryFn}">✅ 我读完了（自确认）</button></div>`;
}
function showIframeTip(rd, retryFn) {
  if (!rd) return;
  rd.innerHTML = `<div class="speech-error">⚠️ 预览面板禁用了麦克风，评测无法工作。<br/>
    <button class="btn btn-primary btn-sm" style="margin-top:8px;" onclick="openStandalone()">🌐 在新窗口打开</button>
    <button class="btn btn-success btn-sm" style="margin-top:8px;" onclick="${retryFn}">✅ 我读完了（自确认）</button></div>`;
}

// 讯飞评测链路的专属错误提示（区分麦克风 vs 讯飞调用，避免误说“依赖 Google”）
function showXfError(rd, retryFn, kind, detail, targetText) {
  if (!rd) return;
  let msg, tip;
  if (kind === 'mic') {
    msg = '麦克风未授权，录不到你的声音。';
    tip = '点地址栏左侧的🔒 / 🎤 图标，把麦克风设为「允许」，然后刷新本页重试。';
  } else {
    msg = '讯飞评测调用失败，没能拿到评分。';
    tip = '常见原因：① ⚙ 设置里的三个密钥填错（多了空格 / 对不上）；② 讯飞控制台没给该应用开通「语音评测」服务；③ 当前网络连不上讯飞。请逐项核对后重试。';
  }
  const detailHtml = (detail && detail !== 'ws-error')
    ? '<div style="font-size:11px;opacity:.6;margin-top:6px;">技术细节：' + escapeHtml(String(detail)) + '</div>'
    : '';
  rd.innerHTML = `<div class="speech-error">⚠️ ${msg}<br/>
    <span style="font-size:12px;opacity:.85;display:block;margin-top:4px;">${tip}</span>
    ${detailHtml}
    <span style="font-size:12px;opacity:.85;display:block;margin-top:4px;">👉 想先不评分也可以：用「🔊 朗读」听标准音，自行跟读练习。</span>
    <button class="btn btn-success btn-sm" style="margin-top:8px;" onclick="confirmSpokenManual('${rd.id}','${String(targetText || '').replace(/'/g, "\\'")}')">✅ 我读完了（自行确认）</button>
    <button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="${retryFn}">🔄 再试</button>
    </div>`;
}

// 统一录音 -> 本地自测（默认，无需讯飞）/ 可选讯飞评分
const Pronounce = {
  recording: false,
  lastFrames: null,
  async start(btnId, resultId, targetText, opts) {
    opts = opts || {};
    const btn = document.getElementById(btnId);
    const rd = document.getElementById(resultId);
    if (this.recording) { this.stop(btnId, resultId, targetText, opts); return; }
    if (inIframe()) { showIframeTip(rd, opts.retryFn); return; }
    try {
      await Recorder.start();
      this.recording = true;
      if (btn) { btn.classList.add('listening'); btn.innerHTML = '⏹ 停止'; }
      if (rd) rd.innerHTML = `<div class="speech-listening"><div class="pulse-dot"></div>请跟读：<strong>${escapeHtml(targetText)}</strong><br/><span style="font-size:12px;opacity:.8;">读完后点「停止」</span></div>`;
    } catch (e) {
      showMicError(rd, opts.retryFn, e && e.message, targetText);
    }
  },
  async stop(btnId, resultId, targetText, opts) {
    const btn = document.getElementById(btnId);
    const rd = document.getElementById(resultId);
    this.recording = false;
    if (btn) { btn.disabled = true; btn.classList.remove('listening'); btn.innerHTML = '⏳ 处理中...'; }
    if (rd) rd.innerHTML = `<div class="speech-listening"><div class="pulse-dot"></div>正在整理你的录音…</div>`;
    try {
      const res = await Recorder.stop();
      if (!res || !res.frames || !res.frames.length) throw new Error('录音转换后没有有效音频数据，请大声重新跟读');
      this.lastFrames = res.frames;
      // 默认：本地自测面板（离线、不依赖任何外部接口）
      renderLocalRepeat(rd, targetText, res.wavUrl, opts);
    } catch (e) {
      showMicError(rd, opts.retryFn, (e && e.message) || '录音失败', targetText);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '🎤 跟读'; }
    }
  }
};

// 麦克风相关错误提示（区分 iframe 禁用 / 未授权）
function showMicError(rd, retryFn, detail, targetText) {
  if (!rd) return;
  rd.innerHTML = `<div class="speech-error">⚠️ 录音没成功开始。<br/>
    <span style="font-size:12px;opacity:.85;display:block;margin-top:4px;">${escapeHtml(detail || '请检查麦克风权限')}。点地址栏左侧的🔒/🎤图标，把麦克风设为「允许」，再刷新重试。</span>
    <button class="btn btn-success btn-sm" style="margin-top:8px;" onclick="${retryFn}">✅ 我读完了（自行确认）</button>
    <button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="${retryFn}">🔄 再试</button>
    </div>`;
}

// 本地跟读自测面板：听标准音 + 听自己录音 + 自评（完全离线）
function renderLocalRepeat(rd, targetText, wavUrl, opts) {
  if (!rd) return;
  opts = opts || {};
  const isEn = !/[一-龥]/.test(targetText);
  const translation = findTranslation(targetText);
  const xfBtn = xfConfigured()
    ? `<button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="runXfScore('${rd.id}','${String(targetText).replace(/'/g, "\\'")}')">✨ 让讯飞打分（可选）</button>`
    : '';
  rd.innerHTML = `
    <div class="local-repeat">
      <div class="local-repeat-target">${escapeHtml(targetText)}</div>
      ${translation ? '<div class="local-repeat-trans">' + escapeHtml(translation) + '</div>' : ''}
      <div class="local-repeat-actions">
        <button class="btn btn-primary btn-sm" onclick="Speech.speak('${String(targetText).replace(/'/g, "\\'")}', {rate:${isEn ? 0.85 : 1}})">🔊 听标准音</button>
        ${wavUrl ? `<button class="btn btn-secondary btn-sm" onclick="playWav('${wavUrl}')">🎧 听我的录音</button>` : ''}
      </div>
      <div class="local-repeat-rate">
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px;">对比标准音，自己觉得读得怎么样？</div>
        <div class="rate-btns">
          <button class="rate-btn" onclick="setRepeatRating('${rd.id}','good')">👍 不错</button>
          <button class="rate-btn" onclick="setRepeatRating('${rd.id}','ok')">😐 一般</button>
          <button class="rate-btn" onclick="setRepeatRating('${rd.id}','weak')">💪 还需练</button>
        </div>
        <div class="local-repeat-rating" id="${rd.id}-rating"></div>
      </div>
      <button class="btn btn-success" style="width:100%;margin-top:12px;" onclick="confirmRepeatDone('${rd.id}','${String(targetText).replace(/'/g, "\\'")}')">✅ 完成跟读</button>
      ${xfBtn}
      ${opts.extraBtnHtml || ''}
    </div>`;
}

function playWav(url) {
  try { const a = new Audio(url); a.play().catch(function () {}); } catch (e) {}
}
function setRepeatRating(rdId, level) {
  const el = document.getElementById(rdId + '-rating');
  if (!el) return;
  const map = {
    good: '👍 已记录：读得不错，继续保持！',
    ok: '😐 已记录：还需多跟着标准音读几遍',
    weak: '💪 已记录：重点练这个，多听多读'
  };
  el.textContent = map[level] || '';
}
function confirmRepeatDone(rdId, target) {
  const rd = document.getElementById(rdId);
  if (!rd) return;
  rd.innerHTML = `<div class="speech-result-card"><div class="speech-score-row">
    <div class="speech-score-big" style="color:var(--success);">✓</div>
    <div><div style="font-weight:600;color:var(--success);">跟读完成</div>
    <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">已听标准音并开口练习：${escapeHtml(target)}</div></div>
    </div></div>`;
}
// 可选：用讯飞对刚录的音频打分（仅已配置密钥时可用）
function runXfScore(rdId, target) {
  const rd = document.getElementById(rdId);
  if (!rd) return;
  if (!Pronounce.lastFrames || !Pronounce.lastFrames.length) {
    rd.innerHTML = '<div class="speech-error">没有可用的录音数据，请先点「🎤 跟读」录一遍再让讯飞打分。</div>';
    return;
  }
  rd.innerHTML = '<div class="speech-listening"><div class="pulse-dot"></div>正在用讯飞评测发音…</div>';
  const isEn = !/[一-龥]/.test(target);
  const retry = `runXfScore('${rdId}','${String(target).replace(/'/g, "\\'")}')`;
  assessPronunciation(target, isEn, Pronounce.lastFrames)
    .then(function (r) { renderIseResult(r, target, rd, retry, ''); })
    .catch(function (e) { showXfError(rd, retry, 'xf', e && e.message, target); });
}

// 设置弹窗
function openSettings() {
  const s = state.settings;
  const avatars = ['👋', '👩', '🧑', '🐱', '🐶', '🌸', '🌟', '🎧', '📚', '✨'];
  const avatarOptions = avatars.map(a =>
    `<button type="button" class="avatar-option ${(s.avatar || '👋') === a ? 'selected' : ''}" data-avatar="${a}" onclick="pickAvatar('${a}')">${a}</button>`
  ).join('');

  // 图片上传控件：选择本地照片 → 预览缩略图 + 移除按钮
  function imgRow(id, label, value, pickFn, clearFn) {
    const has = !!value;
    const safe = has ? value : '';
    return `
      <div class="img-upload-row">
        <div class="iu-label">${label}</div>
        <div class="iu-actions">
          <button type="button" class="btn btn-sm btn-secondary" onclick="document.getElementById('file_${id}').click()">选择图片</button>
          <button type="button" class="btn btn-sm btn-ghost" id="rm_${id}" style="display:${has ? '' : 'none'};" onclick="${clearFn}()">移除</button>
        </div>
        <input type="file" id="file_${id}" accept="image/*" style="display:none" onchange="${pickFn}(this)" />
        <div class="iu-preview" id="prev_${id}">${has ? `<img src="${safe}" alt="预览" />` : `<span class="iu-empty">未设置</span>`}</div>
      </div>`;
  }

  const body = `
    <div style="font-size:14px;font-weight:600;color:var(--text-secondary);margin-bottom:10px;">👤 个人信息</div>
    <label class="modal-label">昵称</label>
    <input class="modal-input" id="setUsername" value="${escapeHtml(s.username || '')}" placeholder="怎么称呼你" />
    <label class="modal-label" style="margin-top:12px;">个人状态</label>
    <input class="modal-input" id="setStatus" value="${escapeHtml(s.status || '')}" placeholder="例如：四级备考中" />
    <label class="modal-label" style="margin-top:12px;">头像</label>
    <div class="avatar-picker" id="setAvatarPicker">
      ${avatarOptions}
    </div>
    <input type="hidden" id="setAvatar" value="${escapeHtml(s.avatar || '👋')}" />
    <label class="modal-label" style="margin-top:12px;">头像图片（可选，留空则用上面的表情头像）</label>
    ${imgRow('avatarImg', '个人头像图片', s.avatarImage, 'onAvatarFileChange', 'clearAvatarImage')}
    <hr style="margin:16px 0;border:none;border-top:1px solid var(--border);" />
    <label class="modal-label">每日背词目标（留空 = 不设目标，背多少算多少）</label>
    <input class="modal-input" id="setDailyGoal" type="number" min="1" max="200" value="${s.dailyGoal > 0 ? s.dailyGoal : ''}" placeholder="例如 20，留空则不设目标" />
    <div style="font-size:12px;color:var(--text-light);margin-top:4px;">设了之后，首页「今日背词」会显示 N/目标 和完成百分比；留空则只显示今天背了几个。</div>
    <hr style="margin:16px 0;border:none;border-top:1px solid var(--border);" />
    <div style="font-size:14px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">🎨 外观主题</div>
    <div style="font-size:12px;color:var(--text-light);margin-bottom:10px;">挑一个整体配色，立即预览；选择会自动保存，刷新或重开仍保留。</div>
    ${renderThemeOptions()}
    <div style="display:flex;align-items:center;gap:10px;margin-top:12px;">
      <span style="font-size:13px;color:var(--text-secondary);">自定义主色：</span>
      <input type="color" id="setCustomAccent" value="${state.settings.customAccent || '#f59e0b'}" oninput="pickCustomTheme(this.value)" style="width:42px;height:32px;border:none;background:none;cursor:pointer;border-radius:8px;" />
      <span style="font-size:12px;color:var(--text-light);">拖动选色后立即预览</span>
    </div>
    <input type="hidden" id="setTheme" value="${getThemeKey()}" />
    <hr style="margin:16px 0;border:none;border-top:1px solid var(--border);" />
    <div style="font-size:14px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">🖼️ 背景图片</div>
    <div style="font-size:12px;color:var(--text-light);margin-bottom:10px;line-height:1.5;">选一张本地照片作为背景：可单独设置「应用整体背景」与「每日金句卡片背景」。留空则使用默认配色背景，随时可点「移除」恢复。</div>
    ${imgRow('bg', '应用背景图（整体）', s.bgImage, 'onBgFileChange', 'clearBgImage')}
    ${imgRow('quoteBg', '每日金句背景图', s.quoteBgImage, 'onQuoteBgFileChange', 'clearQuoteBgImage')}
    <hr style="margin:16px 0;border:none;border-top:1px solid var(--border);" />
    <label class="modal-label">朗读音色（英文单词 / 句子发音）</label>
    <select class="modal-input" id="setSpeakVoice">
      <option value="">自动（推荐：挑最自然的发音人）</option>
    </select>
    <div style="font-size:12px;color:var(--text-light);margin-top:4px;line-height:1.6;">
      提示：在 <b>Edge 浏览器</b> 里打开本页，下拉里会出现微软<b>在线神经语音</b>（如 Aria / Jenny Online），比 Chrome 自带的机器音自然非常多、更接近真人有语气。<br/>
      选「自动」时系统自动挑质量最高的那个；也可手动指定你听着最舒服的。
    </div>
    <label class="modal-label" style="margin-top:12px;">朗读语速</label>
    <select class="modal-input" id="setSpeakRate">
      <option value="0.7" ${s.speakRate == 0.7 ? 'selected' : ''}>慢速 0.7×（最清晰）</option>
      <option value="0.8" ${s.speakRate == 0.8 ? 'selected' : ''}>较慢 0.8×</option>
      <option value="0.9" ${s.speakRate == 0.9 ? 'selected' : ''}>适中 0.9×</option>
      <option value="1" ${s.speakRate == 1 ? 'selected' : ''}>正常 1.0×</option>
    </select>
    <div style="font-size:12px;color:var(--text-light);margin-top:4px;">备考建议 0.8–0.9×，清晰又不拖沓。</div>
    <hr style="margin:16px 0;border:none;border-top:1px solid var(--border);" />
    <label class="modal-label">发音方式（听力 / 单词朗读）</label>
    <select class="modal-input" id="setAudioSource">
      <option value="auto" ${(!s.audioSource || (s.audioSource !== 'youdao' && s.audioSource !== 'tts')) ? 'selected' : ''}>自动（真人发音优先，失败用系统音）</option>
      <option value="youdao" ${s.audioSource === 'youdao' ? 'selected' : ''}>真人发音（有道，自然清晰）</option>
      <option value="tts" ${s.audioSource === 'tts' ? 'selected' : ''}>系统发音（设备朗读，离线稳定）</option>
    </select>
    <div style="font-size:12px;color:var(--text-light);margin-top:4px;line-height:1.6;">
      在微信里若听着卡顿、发怪声，多半是真人发音的网络被拦；切到「系统发音」即可稳定。若系统音太机械，切回「自动」或「真人发音」。
    </div>
    <hr style="margin:16px 0;border:none;border-top:1px solid var(--border);" />
    <div style="font-size:14px;font-weight:600;color:var(--text-secondary);margin-bottom:10px;">🧭 导航设置（自定义左侧任务栏）</div>
    <div style="font-size:12px;color:var(--text-light);margin-bottom:10px;line-height:1.5;">
      勾选你想显示在左侧边栏的模块；取消勾选即可隐藏。隐藏后不会删除数据，随时可再打开。
    </div>
    <div id="setSidebarModules" style="display:flex;flex-direction:column;gap:8px;">
      ${renderSidebarModuleOptions()}
    </div>
    <button type="button" class="btn btn-xs btn-ghost" style="margin-top:10px;" onclick="resetSidebarModules()">恢复默认导航</button>
    <hr style="margin:16px 0;border:none;border-top:1px solid var(--border);" />
    <hr style="margin:16px 0;border:none;border-top:1px solid var(--border);" />
    <hr style="margin:16px 0;border:none;border-top:1px solid var(--border);" />
    <div style="font-size:12px;color:var(--text-light);line-height:1.6;">
      学习记录存在浏览器本地。如需跨设备迁移，请用首页底部的「💾 数据备份与恢复」导出/导入 JSON 文件。
    </div>`;
  openModal('⚙ 设置', body, `<button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="saveSettings()">保存</button>`);
  setTimeout(fillVoiceOptions, 0);
  if (Speech.voices.length === 0 && Speech.synth && Speech.synth.onvoiceschanged !== undefined) {
    Speech.synth.onvoiceschanged = fillVoiceOptions;
  }
}

// 动态填充英文朗读音色下拉
function fillVoiceOptions() {
  const sel = document.getElementById('setSpeakVoice');
  if (!sel) return;
  if (Speech.voices.length === 0) Speech.voices = (Speech.synth && Speech.synth.getVoices()) || [];
  const cur = state.settings.speakVoiceURI || '';
  const en = Speech.voices.filter(v => (v.lang || '').toLowerCase().startsWith('en'));
  let html = '<option value="">自动（推荐：挑最自然的发音人）</option>';
  en.forEach(function (v) {
    const score = (Speech.voiceScore ? Speech.voiceScore(v) : 0);
    const tag = score >= 100 ? ' ★神经' : (score >= 80 ? ' ✓自然' : '');
    html += `<option value="${escapeHtml(v.voiceURI)}" ${v.voiceURI === cur ? 'selected' : ''}>${escapeHtml(v.name)} (${escapeHtml(v.lang)})${tag}</option>`;
  });
  sel.innerHTML = html;
}
function pickAvatar(a) {
  const input = document.getElementById('setAvatar');
  if (input) input.value = a;
  document.querySelectorAll('#setAvatarPicker .avatar-option').forEach(function (btn) {
    btn.classList.toggle('selected', btn.getAttribute('data-avatar') === a);
  });
}

function renderSidebarModuleOptions() {
  if (typeof SIDEBAR_MODULES === 'undefined' || typeof getSidebarVisible !== 'function') return '';
  const visible = getSidebarVisible();
  const groups = {};
  SIDEBAR_MODULES.forEach(m => {
    if (!groups[m.group]) groups[m.group] = [];
    groups[m.group].push(m);
  });
  return Object.keys(groups).map(g => `
    <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin:4px 0 2px;">${g}</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;">
      ${groups[g].map(m => `
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;cursor:pointer;background:var(--card-bg);">
          <input type="checkbox" class="sidebar-mod-check" data-key="${m.key}" ${visible[m.key] ? 'checked' : ''} />
          <span>${m.label}</span>
        </label>
      `).join('')}
    </div>
  `).join('');
}

function resetSidebarModules() {
  if (typeof SIDEBAR_MODULES === 'undefined') return;
  document.querySelectorAll('.sidebar-mod-check').forEach(cb => {
    cb.checked = true;
  });
}

function saveSettings() {
  const uInput = document.getElementById('setUsername');
  state.settings.username = (uInput ? (uInput.value || '').trim() : state.settings.username) || '柯仪';
  const aInput = document.getElementById('setAvatar');
  state.settings.avatar = (aInput ? (aInput.value || '').trim() : state.settings.avatar) || '👋';
  const stInput = document.getElementById('setStatus');
  state.settings.status = (stInput ? (stInput.value || '').trim() : state.settings.status) || '四级备考中';
  const vSel = document.getElementById('setSpeakVoice');
  state.settings.speakVoiceURI = vSel ? vSel.value : '';
  const rSel = document.getElementById('setSpeakRate');
  state.settings.speakRate = rSel ? (parseFloat(rSel.value) || 0.9) : 0.9;
  const aSrc = document.getElementById('setAudioSource');
  state.settings.audioSource = aSrc ? (aSrc.value || 'auto') : 'auto';
  const gInput = document.getElementById('setDailyGoal');
  const gVal = gInput ? parseInt(gInput.value, 10) : 0;
  state.settings.dailyGoal = (gVal && gVal > 0) ? gVal : 0;
  // 外观主题
  const themeInput = document.getElementById('setTheme');
  const customInput = document.getElementById('setCustomAccent');
  state.settings.theme = themeInput ? themeInput.value : 'amber';
  if (state.settings.theme === 'custom' && customInput && customInput.value) {
    state.settings.customAccent = customInput.value;
  }
  applyTheme(state.settings.theme, state.settings.customAccent);
  // 读取导航设置
  const visible = {};
  const defVisible = (typeof getDefaultSidebarVisible === 'function') ? getDefaultSidebarVisible() : {};
  document.querySelectorAll('.sidebar-mod-check').forEach(function (cb) {
    const key = cb.getAttribute('data-key');
    if (key) visible[key] = cb.checked;
  });
  // 只保存非默认值，减少 localStorage 占用
  const toSave = {};
  let hasCustom = false;
  for (const key in defVisible) {
    if (visible[key] !== defVisible[key]) { toSave[key] = visible[key]; hasCustom = true; }
  }
  state.sidebar = hasCustom ? { visible: toSave } : null;
  // 重新加载选定音色缓存
  if (Speech.initVoices) Speech.initVoices();
  Store.save();
  closeModal();
  if (typeof renderSidebarProfile === 'function') renderSidebarProfile();
  if (typeof renderSidebarVisibility === 'function') renderSidebarVisibility();
  if (typeof applyAppBackground === 'function') applyAppBackground();
  // 保存设置后回到首页，让用户立刻看到目标、主题等变化
  if (typeof navigate === 'function') navigate('home');
  Utils.toast('已保存设置（含昵称 / 头像 / 状态 / 朗读音色 / 语速 / 每日背词目标 / 外观主题 / 导航模块）', 'success');
}

