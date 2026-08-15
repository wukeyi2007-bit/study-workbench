// ==========================================
// CET-4 学习工作台 - 核心逻辑
// ==========================================

// ===== 数据管理 =====
const Store = {
  KEY: "cet4_workspace",

  load() {
    try {
      const data = localStorage.getItem(this.KEY);
      if (data) {
        const stored = JSON.parse(data);
        // 向后兼容：旧版本 localStorage 可能缺少新增模块字段，
        // 用 default() 作基底合并，确保 news/reading/finance 等字段始终存在
        return this.mergeDefaults(stored);
      }
    } catch (e) { console.warn("数据加载失败", e); }
    return this.default();
  },

  // 把已存数据合并到默认结构，补齐缺失的嵌套字段
  mergeDefaults(stored) {
    const base = this.default();
    const out = Object.assign({}, base, stored);
    out.settings = Object.assign({}, base.settings, stored.settings || {});
    // 兼容旧版：旧存档没有头像/状态，补默认值
    if (!out.settings.avatar) out.settings.avatar = "👋";
    if (!out.settings.status) out.settings.status = "四级备考中";
    out.progress = Object.assign({}, base.progress, stored.progress || {});
    out.news = Object.assign({}, base.news, stored.news || {});
    out.reading = Object.assign({}, base.reading, stored.reading || {});
    out.finance = Object.assign({}, base.finance, stored.finance || {});
    out.financeKnowledge = Object.assign({}, base.financeKnowledge, stored.financeKnowledge || {});
    out.listening = Object.assign({}, base.listening, stored.listening || {});
    // 兼容旧 listening.daily 数字格式 { date: N } → { date: { word:N, dialogue:0, sentence:0, dictation:0 } }
    if (out.listening.daily) {
      for (const d in out.listening.daily) {
        const v = out.listening.daily[d];
        if (typeof v === 'number') {
          out.listening.daily[d] = { word: v, dialogue: 0, sentence: 0, dictation: 0 };
        }
      }
    }
    out.translate = Object.assign({}, base.translate, stored.translate || {});
    out.sentenceDaily = stored.sentenceDaily || {};
    out.exercise = Object.assign({}, base.exercise, stored.exercise || {});
    out.diet = Object.assign({}, base.diet, stored.diet || {});
    out.weight = Object.assign({}, base.weight, stored.weight || {});
    out.wordStatus = stored.wordStatus || {};
    out.sentenceStatus = stored.sentenceStatus || {};
    out.weakWords = stored.weakWords || [];
    out.errorBook = stored.errorBook || [];
    out.studyLog = stored.studyLog || {};
    out.lastDailyStudy = stored.lastDailyStudy || null;
    out.sidebar = stored.sidebar || null;
    out.mood = Object.assign({}, base.mood, stored.mood || {});
    return out;
  },

  save() {
    localStorage.setItem(this.KEY, JSON.stringify(state));
    // 若已开启云端同步，则在短暂防抖后自动把最新数据推送到云端（跨设备互通）
    if (typeof CloudSync !== 'undefined' && CloudSync.enabled) CloudSync.schedulePush();
  },

  default() {
    return {
      settings: { username: "柯仪", avatar: "👋", avatarImage: "", bgImage: "", quoteBgImage: "", status: "四级备考中", dailyGoal: CONFIG.dailyGoal, xfAppId: "", xfApiKey: "", xfApiSecret: "", speakVoiceURI: "", speakRate: 0.9, audioSource: "auto", cloudSync: { enabled: false, token: "", syncId: "", gistId: "", lastSync: 0 } },
      progress: {
        currentSet: 1,
        wordsLearned: 0,
        streak: 0,
        lastStudyDate: null,
        totalStudyDays: 0,
        totalTests: 0,
        totalCorrect: 0,
      },
      wordStatus: {},
      newWordSeen: [],  // 已作为「新词」出示过的单词 id（游标，避免重复出示）
      sentenceStatus: {},
      weakWords: [],     // 生词本：认读时标记「不熟悉」的单词 id 列表，次日复习优先安排
      errorBook: [],
      studyLog: {},
      exercise: {
        log: [],  // { id, date, type: "run"|"video", distance, category, note }
        userVideos: [], // 用户自定义跟练视频 { id, name, icon, link, desc }
      },
      lastDailyStudy: null, // 上次闭环学习的日期
      news: {
        readByDate: {},  // 按新闻日期分桶的已读新闻 id 列表：{ '2026-08-08': ['n1','n5',...] }
        bookmarked: [],  // 收藏新闻 id 列表
        important: [],  // 设为「今日重点」的新闻 id 列表（旧字段，兼容保留）
        importantIds: [],   // 锁定存档的「今日重点」id 列表（按新闻日期批次锁定，重跑新闻也不变）
        importantLockDate: "", // importantIds 对应的新闻日期；与 currentNewsDate 一致时才沿用，跨天自动重选
        lastDate: "",   // 上次新闻内容日期；新的新闻日期只会向前推进，不会因抓到旧缓存而回退
        lastVisitDate: "", // 上次打开 App 的日历日期
      },
      reading: {
        goalPages: READING_CONFIG.dailyGoalPages, // 每日页数目标
        books: [],      // { id, title, author, totalPages, currentPage, status }
        log: [],        // { id, date, bookId, pages, note }
        streak: 0,
        lastReadDate: null,
      },
      diet: {
        // 每日饮食记录：{ 'YYYY-MM-DD': [ {id, meal:'breakfast|lunch|dinner|snack', name, amount(克), kcal, photo(base64|null), note} ] }
        log: {},
        // 每日热量参考目标（估算，轻体力活动女性约 1800kcal；用户可改）
        kcalTarget: 1800,
      },
      weight: {
        height: 164,      // 固定身高 cm
        records: [],      // [ {id, date:'YYYY-MM-DD', kg} ]
      },
      finance: {
        learning: [],   // 学习中课程 id（旧课程模式保留兼容）
        done: [],       // 已学完课程 id
        important: [],  // 设为「今日重点」的课程 id 列表
      },
      financeKnowledge: {
        startDate: null,       // 首次使用日期 YYYY-MM-DD
        currentDay: 1,         // 当前查看/学习到第几天
        completed: {},         // { day: [itemId, ...] }
        keyIds: [],            // 用户在卡片上标记为重点的理财知识点 id 列表（用于定期复习）
        reviewed: {},          // { 'YYYY-MM-DD': [itemId,...] } 重点复习日里点过「已复习」的重点 id
        lastFinanceDate: null, // 上次自动推进到今天的天数日期（每天只推进一次）
      },
      listening: {
        daily: {},   // { 'YYYY-MM-DD': 完成题数 } 每日听力打卡
      },
      translate: {
        daily: {},   // { 'YYYY-MM-DD': 完成篇数 } 每日翻译打卡
      },
      sentenceDaily: {}, // { 'YYYY-MM-DD': 完成句数 } 每日句子翻译打卡
      sidebar: null, // { visible: { home:true, words:true, ... } }，null 时使用默认全部显示
      mood: { date: "", mood: "", quote: "" }, // 今日心情与金句
    };
  }
};

// ===== 全局状态 =====
let state = Store.load();
let currentPage = "home"; // 当前所在板块，供云端同步拉取后重渲染使用
const pageScrollY = {};    // 每个板块各自的滚动位置，切换时互不串台

// 新闻数据：默认用 data.js 中的 HOT_NEWS 兜底；运行时若成功拉取 news.json 则覆盖为线上最新
let NEWS_DATA = null;
function getNews() { return NEWS_DATA || HOT_NEWS; }

// 由 AI 分析预置的「今日重点」提取（数据里 important:true 的项）
function defaultImportantNews() {
  return getNews().filter(n => n.important).map(n => n.id);
}
// 当前线上新闻的日期（用于把「已读」按新闻批次分桶，避免跨天/缓存导致进度丢失）
function currentNewsDate() {
  return (NEWS_DATA && NEWS_DATA.length && NEWS_DATA[0] && NEWS_DATA[0].date) ? NEWS_DATA[0].date : Utils.today();
}
// 取「当前新闻日期批次」下已读的新闻 id 列表（首页进度/卡片已读判断统一走这里）
// 自愈：news.json 被替换后，自动剔除已失效的旧 id（含占位卡 id），避免「0 条已读却显示 1/17」。
function getNewsReadIds() {
  const d = currentNewsDate();
  const rawIds = (state.news.readByDate && state.news.readByDate[d]) || [];
  if (!rawIds.length) return rawIds;
  const liveIdSet = new Set(getNews().map(n => n.id));
  return rawIds.filter(id => liveIdSet.has(id));
}
// 锁定并取「今日重点」id 列表：首次看到当天新闻时把重点 id 固化进 state，
// 之后即使 news.json 被定时任务重跑、重要集合变化，进度也始终锚定这 5 条，绝不归零。
// 永久自愈：若 locked 列表里所有 id 都已在 news.json 中失效（被替换/漂移），自动重选；
// 避免出现「5 张全占位卡」的死锁状态，保证用户永远能看到真实的 5 条重点新闻。
function getTodayImportantIds() {
  const d = currentNewsDate();
  const liveAll = getNews();
  const liveIdSet = new Set(liveAll.map(n => n.id));
  const liveImportant = liveAll.filter(n => n.important).map(n => n.id);

  // 已被用户主动重置（?reset=1 或控制台 forceResetImportantNews()）→ 直接重新选
  if (state.news.importantLockDate === '__RESET__') {
    state.news.importantLockDate = '';
    state.news.importantIds = [];
  }

  if (state.news.importantLockDate === d && Array.isArray(state.news.importantIds) && state.news.importantIds.length) {
    const locked = state.news.importantIds;
    const validLocked = locked.filter(id => liveIdSet.has(id));
    if (validLocked.length === 0) {
      // 全失效（典型场景：跨大版本升级、news.json 整体替换）→ 清掉旧锁，从 live 重选
      state.news.importantIds = [];
      state.news.importantLockDate = '';
    } else if (validLocked.length < locked.length) {
      // 部分失效：保留仍有效的，从 live 的 important 集合里补齐到 5 条
      const need = Math.max(5, locked.length) - validLocked.length;
      const filler = liveImportant.filter(id => !validLocked.includes(id));
      // 不够再从任意 live 未读新闻补（保证不出现空白卡）
      const anyFiller = filler.length >= need ? filler.slice(0, need) : filler.concat(
        liveAll.filter(n => !liveIdSet.has(n.id) ? false : !validLocked.includes(n.id)).slice(0, need - filler.length).map(n => n.id)
      );
      state.news.importantIds = validLocked.concat(anyFiller).slice(0, Math.max(5, locked.length));
      try { Store.save(); } catch (e) { /* 忽略 */ }
      return state.news.importantIds;
    } else {
      return locked;
    }
  }
  // 未锁定或日期变了：用当前新闻的重点集合锁定（日期向前推进时自然换一批新的重点）
  if (liveImportant.length) {
    state.news.importantIds = liveImportant.slice();
    state.news.importantLockDate = d;
    try { Store.save(); } catch (e) { /* 忽略 */ }
  }
  return state.news.importantIds || [];
}
// 紧急逃生口：用户遇到"5 张全占位卡"等死锁时可在控制台调用：
//   forceResetImportantNews()
// 或在 URL 加 ?reset=1 让 app 启动时自动重置。
window.forceResetImportantNews = function() {
  try {
    state.news.importantIds = [];
    state.news.importantLockDate = '__RESET__';
    Store.save();
    if (typeof renderDashboard === 'function') renderDashboard();
    console.log('[重要新闻] 已重置，刷新页面即可看到新的 5 条。');
  } catch (e) { console.error(e); }
};
// URL 带 ?reset=1 时启动时强制重置（适用于刚推送完代码、用户第一次刷新）
try {
  if (typeof location !== 'undefined' && /[?&]reset=1\b/.test(location.search)) {
    setTimeout(() => { try { window.forceResetImportantNews(); } catch (e) {} }, 300);
  }
} catch (e) { /* 忽略 */ }
// 主动锁定（新闻加载完成后调用，确保尽早固化当天重点）
function lockTodayImportant() { getTodayImportantIds(); }
function defaultImportantFinance() {
  // 按日期确定性轮换「今日重点」：每天选出 5 条不同的课程，做到"每天自动更新"且无需外部内容
  const all = FINANCE_COURSES;
  if (!all || !all.length) return [];
  const dayNum = Math.floor(Date.now() / 86400000); // 每天变化，保证每日不同
  const n = Math.min(5, all.length);
  const out = [];
  for (let i = 0; i < n; i++) out.push(all[(dayNum + i) % all.length].id);
  return out;
}

// 首次/清空时，自动预置由 AI 分析得出的「今日重点」（新闻5条 + 理财5条），
// 过滤掉数据里已不存在的 id，保证健壮
function ensureDefaultImportant() {
  const sync = (obj, list, getDefault) => {
    let ids = obj.important;
    if (!Array.isArray(ids) || ids.length === 0) ids = getDefault();
    ids = ids.filter(id => list.some(x => x.id === id));
    if (ids.length === 0) ids = getDefault();
    obj.important = ids;
  };
  sync(state.news, getNews(), defaultImportantNews);
  sync(state.finance, FINANCE_COURSES, defaultImportantFinance);
}

// ===== 每日心情与金句 =====
const MOOD_QUOTES = {
  happy: {
    label: "开心",
    emoji: "😄",
    color: "#f59e0b",
    quotes: [
      "好心情是最好的学习催化剂，今天也要闪闪发光呀！✨",
      "笑容是最好的开场白，四级之路因你而明亮。",
      "保持热爱，奔赴山海；今天的你，比昨天更靠近目标。",
      "快乐学习，效率翻倍，继续冲！",
      "阳光正好，你也正好，开始今天的进步吧。"
    ]
  },
  calm: {
    label: "平静",
    emoji: "🍃",
    color: "#10b981",
    quotes: [
      "心静则神远，慢即是快。稳步推进，自有回响。",
      "不慌不忙，稳扎稳打，每一步都算数。",
      "平静的力量，胜过千军万马。",
      "今天也要像植物一样，安静生长。🌱",
      "专注当下，结果自来。"
    ]
  },
  tired: {
    label: "疲惫",
    emoji: "😴",
    color: "#8b5cf6",
    quotes: [
      "累了就慢一点，但别停下来。你已经走了很远。",
      "休息不是放弃，是为了更好地出发。",
      "允许自己疲惫，但不允许自己放弃。",
      "每一个坚持的今天，都是未来感谢的昨天。",
      "电量不足？充一会儿，再继续发光。🔋"
    ]
  },
  anxious: {
    label: "焦虑",
    emoji: "😰",
    color: "#ef4444",
    quotes: [
      "焦虑的反义词是具体。把目标拆小，逐个击破。",
      "你担心的事，80%不会发生。先行动，再调整。",
      "深呼吸，然后只做下一道题、下一个词。",
      "比起完美，完成更重要。先完成，再完美。",
      "别怕慢，就怕站。今天哪怕一个词，也是进步。"
    ]
  },
  confused: {
    label: "迷茫",
    emoji: "🌫️",
    color: "#6b7280",
    quotes: [
      "迷雾里也能赶路，因为每一步都在拨开云雾。",
      "看不清远方的时候，就先把眼前的事做好。",
      "迷茫说明你在思考，行动会给你答案。",
      "没有白走的路，每一个尝试都在为你定位。",
      "只要还在走，方向就会慢慢清晰。"
    ]
  },
  excited: {
    label: "激动",
    emoji: "🔥",
    color: "#f97316",
    quotes: [
      "把这份热血，化作今天的行动力！",
      "激情是燃料，坚持才是引擎。全速前进！",
      "状态拉满，今天多背几个词！",
      "你的能量，值得被今天的目标点燃。",
      "冲劲十足？那就趁势而上，拿下今天的任务！"
    ]
  }
};

function getMoodQuote(moodKey, excludeText) {
  const cfg = MOOD_QUOTES[moodKey];
  if (!cfg) return { text: "", emoji: "", color: "" };
  let pool = cfg.quotes;
  // 若指定排除且池子够大，优先不与上一条重复
  if (excludeText && pool.length > 1) {
    const filtered = pool.filter(q => q !== excludeText);
    if (filtered.length) pool = filtered;
  }
  const text = pool[Math.floor(Math.random() * pool.length)];
  return { text, emoji: cfg.emoji, color: cfg.color, label: cfg.label };
}

function checkDailyMood() {
  if (!state.mood || state.mood.date !== Utils.today()) {
    setTimeout(() => showMoodPicker(), 400);
  }
}

function showMoodPicker() {
  const root = document.getElementById("modalRoot");
  if (!root) return;
  const items = Object.entries(MOOD_QUOTES).map(([key, cfg]) => `
    <button class="mood-btn" data-mood="${key}" onclick="selectMood('${key}')"
      style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
             padding:14px 8px;border:2px solid var(--border);border-radius:var(--radius-lg);
             background:var(--surface);cursor:pointer;transition:all .15s;min-width:80px;"
      onmouseover="this.style.borderColor='${cfg.color}';this.style.boxShadow='0 0 0 3px '+hexToRgba('${cfg.color}',0.12)"
      onmouseout="this.style.borderColor='var(--border)';this.style.boxShadow='none'">
      <span style="font-size:28px;line-height:1;">${cfg.emoji}</span>
      <span style="font-size:13px;font-weight:600;color:var(--text);">${cfg.label}</span>
    </button>
  `).join('');
  root.innerHTML = `
    <div class="modal-card" style="max-width:420px;text-align:center;">
      <div class="modal-title" style="font-size:20px;">🌤️ 今天心情怎么样？</div>
      <div class="modal-body" style="margin-bottom:8px;">
        <p style="font-size:14px;color:var(--text-secondary);margin-bottom:18px;">选一个最贴近的状态，我会为你准备一句今日金句。</p>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">${items}</div>
      </div>
    </div>`;
  root.classList.add("show");
  root.onclick = null; // 必须选择，不能点遮罩关闭
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function selectMood(moodKey) {
  const lastQuote = state.mood && state.mood.mood === moodKey ? state.mood.quote : "";
  const q = getMoodQuote(moodKey, lastQuote);
  state.mood = { date: Utils.today(), mood: moodKey, quote: q.text };
  Store.save();
  closeModal();
  // 重新渲染首页以显示金句
  if (typeof renderDashboard === 'function') renderDashboard();
}

// 首页心情横幅点「换一个」：不换心情，只换一句金句，且尽量不与当前重复
function refreshMoodQuote() {
  if (!state.mood || !state.mood.mood) return;
  const q = getMoodQuote(state.mood.mood, state.mood.quote);
  state.mood.quote = q.text;
  state.mood.date = Utils.today();
  Store.save();
  if (typeof renderDashboard === 'function') renderDashboard();
}

function renderMoodBanner() {
  if (!state.mood || state.mood.date !== Utils.today() || !state.mood.quote) return '';
  const cfg = MOOD_QUOTES[state.mood.mood] || MOOD_QUOTES.calm;
  // 每日金句背景图（用户设置）：叠加白色半透明遮罩保证文字可读
  const quoteBg = (state.settings && state.settings.quoteBgImage) || '';
  const bgStyle = quoteBg
    ? 'position:relative;overflow:hidden;'
    : `background:linear-gradient(135deg, ${hexToRgba(cfg.color, 0.08)} 0%, var(--surface) 100%);`;
  const quoteBgLayer = quoteBg
    ? `<div class="quote-bg-layer" style="background-image:url('${quoteBg}');"></div>`
    : '';
  return `
    <div class="card mood-banner" style="${bgStyle}border-color:${cfg.color};">
      ${quoteBgLayer}
      <div class="mood-banner-inner">
        <div class="mood-emoji">${cfg.emoji}</div>
        <div class="mood-text">
          <div class="mood-label">今日心情 · ${cfg.label}</div>
          <div class="mood-quote">${escapeHtml(state.mood.quote)}</div>
        </div>
        <button class="btn btn-light" onclick="refreshMoodQuote()">换一个</button>
      </div>
    </div>`;
}

// 新闻换日期（每日自动更新后或跨自然日），把昨天的「已读」和「今日重点」清空，
// 重置为当天的新内容。这样昨天读过的 n5/n6… 不会误判成今天已读。
function resetNewsIfDateChanged() {
  const today = Utils.today();
  // 兼容旧数据：把旧版 state.news.read（数组）迁移到按日期分桶的 readByDate
  if (Array.isArray(state.news.read)) {
    const d = state.news.lastDate || today;
    state.news.readByDate = state.news.readByDate || {};
    if (!state.news.readByDate[d]) state.news.readByDate[d] = state.news.read;
    delete state.news.read;
  }
  if (!state.news.readByDate) state.news.readByDate = {};
  // 只有运行时已经拉取到线上 news.json 后，才用内容日期做判断；
  // 否则兜底 HOT_NEWS 的日期会和真实日期对不上，导致每天误清空已读。
  const hasRuntimeNews = !!NEWS_DATA && Array.isArray(NEWS_DATA) && NEWS_DATA.length;
  const todayNewsDate = hasRuntimeNews ? NEWS_DATA[0].date : "";
  let changed = false;

  // 情况 1：新闻内容日期「向前推进」了（自动化更新到更新的新闻）。
  // 注意：只在变新时更新，绝不在抓到旧缓存数据时回退——
  // 否则会把「今天的已读」对齐到旧新闻集合，导致首页进度误算成 0%、刷新时好时坏。
  if (hasRuntimeNews && todayNewsDate > state.news.lastDate) {
    state.news.lastDate = todayNewsDate;
    state.news.important = defaultImportantNews();
    changed = true;
  }
  // 新闻已加载则固化当天重点（日期向前推进时自动换一批新的，否则沿用已锁定的，避免重跑归零）
  if (hasRuntimeNews) lockTodayImportant();

  // 情况 2：跨自然日仅更新访问日期；已读进度已按新闻日期分桶，
  // 新的一天自然使用空桶，无需手动清零（也不会让昨天 100% 污染今天）。
  if (state.news.lastVisitDate !== today) {
    state.news.lastVisitDate = today;
    changed = true;
  }

  // 理财「今日重点」按日期轮换：每天首次打开时刷新为当天的一组，做到每日自动更新
  if (state.finance.lastRotateDate !== today) {
    state.finance.lastRotateDate = today;
    changed = true;
    state.finance.important = defaultImportantFinance();
  }

  if (changed) {
    try { Store.save(); } catch (e) { /* 忽略 */ }
  }
}

// ===== 工具函数 =====
const Utils = {
  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },

  dateOffset(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },

  daysUntil(dateStr) {
    const target = new Date(dateStr);
    const now = new Date();
    return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
  },

  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  pick(arr, n) {
    return Utils.shuffle(arr).slice(0, n);
  },

  toast(msg, type = "") {
    let t = document.getElementById("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.className = "toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = `toast ${type} show`;
    setTimeout(() => t.classList.remove("show"), 2500);
  },

  getWordStatus(id) {
    if (!state.wordStatus[id]) {
      state.wordStatus[id] = { level: 0, correct: 0, wrong: 0, lastReview: null };
    }
    return state.wordStatus[id];
  },

  getSentenceStatus(id) {
    if (!state.sentenceStatus[id]) {
      state.sentenceStatus[id] = { level: 0, correct: 0, wrong: 0, lastReview: null };
    }
    return state.sentenceStatus[id];
  },

  statusLabel(level) {
    return ["新词", "学习中", "熟悉", "已掌握"][level] || "新词";
  },

  statusClass(level) {
    return ["new", "learning", "familiar", "mastered"][level] || "new";
  },
};

// ===== 语音工具（TTS 朗读 + STT 识别 + 发音评分）=====
const Speech = {
  synth: window.speechSynthesis || null,
  recognition: null,
  isListening: false,
  voices: [],
  bestEnVoice: null,
  selectedVoice: null,

  ttsSupported() { return "speechSynthesis" in window; },
  sttSupported() {
    return "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
  },

  // 初始化语音列表（异步加载）
  initVoices() {
    if (!this.ttsSupported()) return;
    const load = () => {
      this.voices = this.synth.getVoices();
      this.bestEnVoice = this.pickBestEnVoice();
      const sel = this.voices.find(v => v.voiceURI === state.settings.speakVoiceURI);
      this.selectedVoice = sel || this.bestEnVoice || null;
      // 首次未指定音色时，自动锁定当前最佳英文女声，避免每次启动/刷新音色乱跳
      if (!state.settings.speakVoiceURI && this.bestEnVoice && this.bestEnVoice.voiceURI) {
        state.settings.speakVoiceURI = this.bestEnVoice.voiceURI;
        Store.save();
      }
    };
    load();
    if (this.voices.length === 0) {
      this.synth.onvoiceschanged = load;
    }
  },

  // 给英文语音打分：优先固定几款稳定的女声，避免不同设备/启动时音色乱跳
  voiceScore(v) {
    if (!v.lang || !v.lang.toLowerCase().startsWith("en")) return -1;
    const n = (v.name || "").toLowerCase();
    const u = (v.voiceURI || "").toLowerCase();
    const combined = n + " " + u;
    let score = 0;
    // 首选：稳定女声（Microsoft/Google 常见女声，音色一致、不易变）
    const preferredFemales = [
      /sonia/i, /jenny/i, /aria/i, /zira/i, /hazel/i, /karen/i,
      /victoria/i, /samantha/i, /google us english/i, /google uk english female/i,
      /tessa/i, /moira/i, /catherine/i, /leslie/i, /susan/i
    ];
    const fallbackFemales = [/libby/i, /linda/i, /anna/i, /helen/i, /lucy/i];
    const fallbackMales = [/daniel/i, /fred/i, /david/i, /mark/i, /alex/i, /tom/i, /ryan/i, /jacob/i];
    if (preferredFemales.some(rx => rx.test(combined))) score = 100;
    else if (fallbackFemales.some(rx => rx.test(combined))) score = 80;
    else if (fallbackMales.some(rx => rx.test(combined))) score = 60;
    else if (/google.*english/i.test(combined)) score = 70;
    else score = 50;
    // 已知稳定引擎优先
    if (/microsoft|google|apple|amazon|com\.apple/.test(combined)) score += 8;
    // en-US 优先（通常更自然），en-GB 次之
    if (v.lang.toLowerCase() === "en-us") score += 4;
    else if (v.lang.toLowerCase() === "en-gb") score += 2;
    return score;
  },

  // 选出系统里最稳定的英文女声；一旦选定就保存到 settings，避免每次启动换声音
  pickBestEnVoice() {
    const en = this.voices.filter(v => (v.lang || "").toLowerCase().startsWith("en"));
    if (!en.length) return null;
    en.sort((a, b) => this.voiceScore(b) - this.voiceScore(a));
    return en[0];
  },

  // 朗读英文文本
  speak(text, opts = {}) {
    if (!this.ttsSupported()) {
      Utils.toast("浏览器不支持语音播放，请使用 Chrome 或 Edge", "warning");
      return;
    }
    this.stopSpeak();
    // Chrome 有时会暂停 synthesis，主动 resume 让声音更快出来
    try { if (this.synth && this.synth.paused) this.synth.resume(); } catch(e) {}
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = opts.rate != null ? opts.rate : (parseFloat(state.settings.speakRate) || 0.9);
    u.pitch = opts.pitch || 1;
    // 语音优先级：调用指定 > 设置指定 > 自动最优英文语音
    if (this.voices.length === 0) this.voices = this.synth.getVoices();
    let voice = null;
    const wantURI = opts.voiceURI || state.settings.speakVoiceURI;
    // 长句（preferLocal）优先本地离线语音：在线神经语音依赖网络，网络差会逐词卡顿
    if (opts.preferLocal) {
      const en = this.voices.filter(v => (v.lang || "").toLowerCase().startsWith("en"));
      voice = en.find(v => v.localService === true) || en[0] || null;
    } else if (wantURI) {
      voice = this.voices.find(v => v.voiceURI === wantURI);
    }
    if (!voice && this.selectedVoice && this.selectedVoice.voiceURI === state.settings.speakVoiceURI) voice = this.selectedVoice;
    if (!voice) voice = this.bestEnVoice || this.voices.find(v => (v.lang || "").toLowerCase().startsWith("en"));
    if (voice) u.voice = voice;
    if (opts.onstart) u.onstart = opts.onstart;
    // Chrome/安卓 播放长句约 15 秒后会自动 pause，导致卡顿、读一半停住；
    // 播放期间定时 resume，保持连续不卡。
    if (this._keepAlive) { clearInterval(this._keepAlive); this._keepAlive = null; }
    this._keepAlive = setInterval(() => {
      if (this.synth && this.synth.paused) { try { this.synth.resume(); } catch (e) {} }
    }, 2500);
    const done = () => { if (this._keepAlive) { clearInterval(this._keepAlive); this._keepAlive = null; } };
    const origEnd = opts.onend;
    u.onend = (e) => { done(); if (origEnd) origEnd(e); };
    u.onerror = () => { done(); };
    this.synth.speak(u);
  },

  stopSpeak() {
    if (this._keepAlive) { clearInterval(this._keepAlive); this._keepAlive = null; }
    if (this.synth) this.synth.cancel();
  },

  // 开始语音识别
  startListening(callback) {
    if (!this.sttSupported()) {
      Utils.toast("浏览器不支持语音识别，请使用 Chrome 或 Edge", "warning");
      if (callback.onError) callback.onError("unsupported");
      return;
    }
    this.stopListening();

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SR();
    this.recognition.lang = "en-US";
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 3;
    this.isListening = true;

    let finalTranscript = "";

    this.recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interim += transcript;
        }
      }
      if (callback.onInterim && interim) callback.onInterim(interim);
    };

    this.recognition.onerror = (event) => {
      this.isListening = false;
      if (callback.onError) callback.onError(event.error);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (callback.onEnd) callback.onEnd(finalTranscript.trim());
    };

    try {
      this.recognition.start();
      if (callback.onStart) callback.onStart();
    } catch (e) {
      this.isListening = false;
      if (callback.onError) callback.onError(e.message);
    }
  },

  stopListening() {
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
      this.recognition = null;
    }
    this.isListening = false;
  },

// 发音对比评分：返回 { score, spoken, matched, total, details }
  compare(spoken, target) {
    const norm = s => s.toLowerCase()
      .replace(/[^a-z\s']/g, "")
      .trim()
      .split(/\s+/)
      .filter(w => w.length > 0);

    const spokenWords = norm(spoken);
    const targetWords = norm(target);

    if (targetWords.length === 0) return { score: 0, matched: 0, total: 0, spoken: spoken.trim() };
    if (spokenWords.length === 0) return { score: 0, matched: 0, total: targetWords.length, spoken: "" };

    // 逐词匹配（允许乱序）
    let matched = 0;
    const targetCopy = [...targetWords];
    const details = targetWords.map(t => ({ word: t, hit: false }));

    for (const sw of spokenWords) {
      const idx = targetCopy.indexOf(sw);
      if (idx >= 0) {
        matched++;
        // 标记对应的 detail
        const detailIdx = details.findIndex(d => d.word === sw && !d.hit);
        if (detailIdx >= 0) details[detailIdx].hit = true;
        targetCopy.splice(idx, 1);
      } else {
        // 模糊匹配：编辑距离 ≤1 视为命中
        for (let i = 0; i < targetCopy.length; i++) {
          if (this.editDistance(sw, targetCopy[i]) <= 1 && sw.length >= 3) {
            matched++;
            const detailIdx = details.findIndex(d => d.word === targetCopy[i] && !d.hit);
            if (detailIdx >= 0) details[detailIdx].hit = true;
            targetCopy.splice(i, 1);
            break;
          }
        }
      }
    }

    const score = Math.round((matched / targetWords.length) * 100);
    return { score, matched, total: targetWords.length, spoken: spoken.trim(), details };
  },

  // 编辑距离（用于模糊匹配）
  editDistance(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j-1], dp[i-1][j], dp[i][j-1]);
      }
    }
    return dp[m][n];
  },

  // 评分等级
  scoreGrade(score) {
    if (score >= 90) return { text: "发音优秀！", emoji: "🎉", color: "var(--success)" };
    if (score >= 70) return { text: "发音不错！", emoji: "👍", color: "var(--primary)" };
    if (score >= 50) return { text: "基本可以，继续练", emoji: "💪", color: "var(--warning)" };
    return { text: "再听一遍试试", emoji: "🔁", color: "var(--danger)" };
  },
};

// 答对时的轻快提示音（Web Audio API，不依赖外部文件）
function playCorrectSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const t0 = ctx.currentTime;

    // 柔和双音「叮」：E5 + G5 大三度和弦，更像玻璃/水滴提示音
    const notes = [659.25, 783.99];
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.14, t0);
    master.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
    master.connect(ctx.destination);

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0 + i * 0.04);
      gain.gain.setValueAtTime(0, t0 + i * 0.04);
      gain.gain.linearRampToValueAtTime(1, t0 + i * 0.04 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.04 + 0.35);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0 + i * 0.04);
      osc.stop(t0 + i * 0.04 + 0.38);
    });
  } catch (e) {}
}

// 答错时的低沉提示音
function playWrongSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t0);
    osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.25);
    gain.gain.setValueAtTime(0.12, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.38);
  } catch (e) {}
}

// 语音识别环境诊断：浏览器支持性 + 是否在禁麦的预览面板中
function speechEnvCheck() {
  const inIframe = window.self !== window.top;
  if (!Speech.sttSupported()) {
    return {
      ok: false,
      toast: "当前浏览器不支持语音识别，请用 Chrome / Edge 桌面版",
      html: `<div class="speech-error">⚠️ 当前浏览器不支持语音识别（需要 Chrome / Edge 桌面版）。<br/>你仍可用「🔊 朗读」听标准发音，再自行跟读练习。</div>`
    };
  }
  if (inIframe) {
    return {
      ok: false,
      toast: "麦克风在预览面板被禁用，请在新窗口打开工作台再试",
      html: `<div class="speech-error">⚠️ 预览面板禁用了麦克风，识别无法工作。<br/>请点下方「🌐 在新窗口打开」，用 Chrome 打开后重试。<br/><button class="btn btn-primary btn-sm" style="margin-top:8px;" onclick="openStandalone()">🌐 在新窗口打开</button></div>`
    };
  }
  return { ok: true };
}

// 在新窗口打开当前页面（绕过预览面板的麦克风限制）
function openStandalone() {
  try {
    window.open(window.location.href, "_blank");
  } catch (e) {
    Utils.toast("请复制地址栏链接，到 Chrome 桌面版打开", "info");
  }
}

// 识别失败的统一提示 + 降级确认（不卡死流程）
function speechRecognitionFailed(err, target, resultDiv, retryFn) {
  if (!resultDiv) return;
  let msg, tip;
  if (err === "no-speech") { msg = "没有检测到声音。"; tip = "请靠近麦克风、调高音量后再试。"; }
  else if (err === "not-allowed") { msg = "浏览器拒绝了麦克风权限。"; tip = "点地址栏左侧的🔒/🎤图标，把麦克风设为「允许」，再刷新重试。"; }
  else if (err === "network" || err === "service-not-allowed") { msg = "语音识别服务连接失败。"; tip = "浏览器自带识别依赖 Google 服务器，国内通常连不上——这是环境限制，不是你的问题。"; }
  else { msg = "识别出错：" + err; tip = "可能是网络或服务不可用。"; }
  resultDiv.innerHTML = `
    <div class="speech-error">${msg}<br/>
    <span style="font-size:12px;opacity:.85;display:block;margin-top:4px;">${tip}</span>
    <span style="font-size:12px;opacity:.85;display:block;margin-top:4px;">👉 也可改用「🔊 朗读」听标准音，自行跟读练习。</span>
    <button class="btn btn-success btn-sm" style="margin-top:8px;" onclick="confirmSpokenManual('${resultDiv.id}','${String(target).replace(/'/g, "\\'")}')">✅ 我读完了（自行确认）</button>
    <button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="${retryFn}">🔄 再试</button>
    </div>`;
}

// 识别不可用时的降级：记录一次跟读（不自动评分）
function confirmSpokenManual(resultId, target) {
  const rd = document.getElementById(resultId);
  if (!rd) return;
  rd.innerHTML = `
    <div class="speech-result-card">
      <div class="speech-score-row">
        <div class="speech-score-big" style="color:var(--primary);">✓</div>
        <div style="flex:1;">
          <div style="font-weight:600;">已记录跟读：${target}</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">（识别服务不可用，已自行确认，未自动评分）</div>
        </div>
      </div>
    </div>`;
}

// ===== 打卡逻辑 =====
function checkStreak() {
  const today = Utils.today();
  if (state.progress.lastStudyDate === today) return;

  if (state.progress.lastStudyDate === Utils.dateOffset(-1)) {
    // 继续连击
  } else if (state.progress.lastStudyDate !== today) {
    state.progress.streak = 0;
  }
}

function getTodayWordCount(date) {
  const d = date || Utils.today();
  const log = state.studyLog[d];
  if (!log) return 0;
  // 优先按真实词 ID 去重计数；旧数据没有 wordIds 时回退到 words 字段
  if (Array.isArray(log.wordIds)) return log.wordIds.length;
  return log.words || 0;
}

function recordStudy(wordsCount, wordId) {
  const today = Utils.today();
  if (state.progress.lastStudyDate !== today) {
    state.progress.streak += 1;
    state.progress.totalStudyDays += 1;
    state.progress.lastStudyDate = today;
  }
  if (!state.studyLog[today]) {
    state.studyLog[today] = { words: 0, tests: 0, correct: 0, wrong: 0, wordIds: [] };
  }
  const log = state.studyLog[today];
  log.words += wordsCount;
  // 用 wordIds 数组去重，防止同一单词多轮次被重复计数
  if (!Array.isArray(log.wordIds)) log.wordIds = [];
  if (wordId) {
    if (!log.wordIds.includes(wordId)) log.wordIds.push(wordId);
  }
  Store.save();
}

function recordTest(correct, wrong) {
  const today = Utils.today();
  state.progress.totalTests += 1;
  state.progress.totalCorrect += correct;
  if (!state.studyLog[today]) {
    state.studyLog[today] = { words: 0, tests: 0, correct: 0, wrong: 0, wordIds: [] };
  }
  const log = state.studyLog[today];
  log.tests += 1;
  log.correct += correct;
  log.wrong += wrong;
  if (!Array.isArray(log.wordIds)) log.wordIds = [];
  Store.save();
}

// ===== 页面路由 =====
let _navigatingFromHistory = false; // 防止 history.pushState 与 popstate 循环

function navigate(page, { pushHistory = true, replaceHistory = false } = {}) {
  // 离开当前板块前，记住它的滚动位置（此时 currentPage 仍是旧页名）
  if (typeof window !== 'undefined') {
    const _main = document.querySelector('.main');
    const _y = (window.scrollY || window.pageYOffset || 0) || (_main ? _main.scrollTop : 0) || 0;
    pageScrollY[currentPage] = _y;
  }
  const prevPage = currentPage;
  currentPage = page;
  // 离开听力页时停止正在播放的音频，避免返回首页仍继续朗读
  if (page !== 'listening' && listeningState && listeningState.active) {
    stopListeningAudio();
  }
  // 离开翻译练习页时停止正在播放的英文朗读，避免返回首页仍继续读
  if (prevPage === 'translate' && page !== 'translate') {
    Speech.stopSpeak();
  }

  // 历史栈同步（让手机返回键行为合理）：
  // - 首页(base) → 子板块：pushState，使返回键能回到首页，不会直接退出 APP；
  // - 子板块 → 子板块（侧边栏切换）：replaceState，不堆积历史，一次返回即回首页；
  // - 回到首页：replaceState，不新增多余首页层。
  if (!_navigatingFromHistory && typeof history !== 'undefined') {
    if (page === 'home') {
      history.replaceState({ page: 'home' }, '', location.pathname + location.search);
    } else if (prevPage === 'home') {
      history.pushState({ page: page }, '', '#p=' + page);
    } else {
      history.replaceState({ page: page }, '', '#p=' + page);
    }
  }

  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));

  const pageEl = document.getElementById(`page-${page}`);
  const tabEl = document.querySelector(`.nav-tab[data-page="${page}"]`);
  if (pageEl) pageEl.classList.add("active");
  if (tabEl) tabEl.classList.add("active");

  // 更新顶部标题
  const titleMap = {
    home: "首页",
    words: "单词",
    sentences: "句子",
    exercise: "锻炼",
    life: "生活记录",
    news: "热点新闻",
    reading: "阅读笔记",
    finance: "理财学习",
    errors: "错题本",
    stats: "统计",
    listening: "听力练习",
    translate: "翻译练习",
    diet: "饮食",
    weight: "体重"
  };
  const topbarTitle = document.getElementById("topbarTitle");
  if (topbarTitle) topbarTitle.textContent = titleMap[page] || "柯仪工作台";

  // 返回首页按钮：除首页外所有板块都在左上角显示
  const backBtn = document.getElementById("backHomeBtn");
  if (backBtn) backBtn.style.display = (page === "home") ? "none" : "flex";

  // 关闭移动端侧边栏展开状态
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const sidebarExpandBtn = document.getElementById("sidebarExpand");
  if (sidebar) sidebar.classList.remove("open");
  if (overlay) overlay.classList.remove("show");
  if (sidebarExpandBtn) sidebarExpandBtn.textContent = "»";

  // 渲染对应页面
  switch (page) {
    case "home": renderDashboard(); break;
    case "words": renderWords(); break;
    case "sentences": renderSentences(); break;
    case "exercise": renderExercise(); break;
    case "life": renderLifeJournal(); break;
    // // case "news": renderNews(); break; // 新闻模块已移除 // 新闻模块已移除
    case "reading": renderReading(); break;
    case "finance": renderFinance(); break;
    case "errors": renderErrors(); break;
    case "stats": renderStats(); break;
    case "listening": renderListening(); break;
    case "translate": renderTranslate(); break;
    case "diet": renderDiet(); break;
    case "weight": renderWeight(); break;
  }

  // 各板块独立记住自己的滚动位置：切回时恢复该板块上次的位置，互不串台
  const _restoreY = pageScrollY[page] || 0;
  setTimeout(() => {
    if (typeof window !== 'undefined') window.scrollTo(0, _restoreY);
    const _mainEl = document.querySelector('.main');
    if (_mainEl) _mainEl.scrollTop = _restoreY;
  }, 0);

  // 全局：渲染后把页面里的英文单词变成可点击的（模仿"不背单词"点击查词）
  setTimeout(() => activateWordTap(`page-${page}`), 100);
}

// ==========================================
// 首页仪表盘
// ==========================================
function renderTodayOverview() {
  const today = Utils.today();
  const todayLog = state.studyLog[today] || { words: 0, tests: 0, correct: 0, wrong: 0, wordIds: [] };
  const todayWords = getTodayWordCount(today);
  // 单词进度改为基于艾宾浩斯复习队列（更贴合新系统）
  const wm = Object.values(state.wordStatus);
  const masteredWords = wm.filter(s => s.mastered).length;
  const learningWords = wm.filter(s => s.level >= 1 && !s.mastered).length;
  const unlearnedWords = Math.max(0, VOCABULARY.length - masteredWords - learningWords);
  const dueReviewWords = getDueReviewWords().length;
  const wordPct = VOCABULARY.length ? Math.min(100, Math.round(((masteredWords + learningWords) / VOCABULARY.length) * 100)) : 0;

  const SENTENCE_DAILY = 5; // 句子翻译每日目标
  const sentenceDoneToday = state.sentenceDaily && state.sentenceDaily[today] ? state.sentenceDaily[today] : 0;
  const sentencePct = Math.min(100, Math.round((sentenceDoneToday / SENTENCE_DAILY) * 100));

  const exStats = getWeekExerciseStats();
  const runPct = Math.min(100, Math.round((exStats.runKm / exStats.runGoalKm) * 100));

  // 视频跟练按「今天」打卡的模块数计算，不是本周累计
  const todayVideoLogs = (state.exercise?.log || []).filter(e => e.date === today && e.type === 'video');
  const todayVideoCats = new Set();
  todayVideoLogs.forEach(e => {
    const catId = getVideoCategoryId(e.category);
    if (catId) todayVideoCats.add(catId);
  });
  const videoGoal = getVideoCategories().length;
  const videoDone = todayVideoCats.size;
  const videoPct = Math.min(100, Math.round((videoDone / videoGoal) * 100));

  const readPagesToday = state.reading.log
    .filter(l => l.date === today)
    .reduce((sum, l) => sum + (l.pages || 0), 0);
  const readingGoal = state.reading.goalPages || READING_CONFIG.dailyGoalPages;
  const readingPct = Math.min(100, Math.round((readPagesToday / readingGoal) * 100));

  // 理财学习：按今日知识点 5 条计算（循环轮次映射到 1~30）
  const financeTodayDay = getFinanceTodayDay();
  const { dayIndex: financeTodayIdx } = getFinanceDayInfo(financeTodayDay);
  const financeTodayData = FINANCE_KNOWLEDGE.find(d => d.day === financeTodayIdx);
  const financeTotal = financeTodayData ? financeTodayData.items.length : 5;
  const financeDone = getCompletedForDay(financeTodayDay).length;
  const financePct = financeTotal ? Math.min(100, Math.round((financeDone / financeTotal) * 100)) : 0;

  // 新闻模块已移除，进度不再统计
  const newsPct = 0; const newsRead = 0; const newsTotal = 0;

  const listenProgress = getListeningProgress(today);
  const listenPct = listenProgress.pct;

  const translateDone = state.translate.daily[today] || 0;
  const translatePct = Math.min(100, Math.round((translateDone / TRANSLATE_GOAL) * 100));

  const dailyWordGoal = state.settings.dailyGoal || 0;
  const dailyWordPct = dailyWordGoal > 0
    ? Math.min(100, Math.round((todayWords / dailyWordGoal) * 100))
    : wordPct;

  const items = [
    { icon: "📖", name: "单词学习", pct: dailyWordPct, desc: `今日背词 ${todayWords}${dailyWordGoal > 0 ? '/' + dailyWordGoal : ''} · 待复习 ${dueReviewWords}` },
    { icon: "🔄", name: "句子翻译", pct: sentencePct, desc: `${sentenceDoneToday}/${SENTENCE_DAILY} 句` },
    { icon: "🎧", name: "听力练习", pct: listenPct, desc: `${listenProgress.totalDone}/${listenProgress.totalGoal} 题` },
    { icon: "📝", name: "翻译练习", pct: translatePct, desc: `${translateDone}/${TRANSLATE_GOAL} 篇` },
    { icon: "📒", name: "阅读笔记", pct: readingPct, desc: `${readPagesToday}/${readingGoal} 页` },
    { icon: "🏃", name: "跑步", pct: runPct, desc: `${exStats.runKm}/${exStats.runGoalKm} km` },
    { icon: "💪", name: "视频跟练", pct: videoPct, desc: `${videoDone}/${videoGoal} 类` },
    { icon: "💰", name: "理财学习", pct: financePct, desc: `${financeDone}/${financeTotal} 知识点` },
  ];

  const r = 26;
  const circumference = 2 * Math.PI * r;

  return `
    <div class="today-overview">
      <div class="today-overview-title">☀️ 今日概览</div>
      <div class="overview-grid">
        ${items.map(item => {
          const offset = circumference * (1 - item.pct / 100);
          const doneClass = item.pct >= 100 ? 'done' : '';
          return `
            <div class="overview-item ${doneClass}" onclick="navigate('${pageForOverview(item.name)}')">
              <div class="icon">${item.icon}</div>
              <div class="name">${item.name}</div>
              <div class="overview-ring">
                <svg viewBox="0 0 64 64">
                  <circle class="bg-circle" cx="32" cy="32" r="${r}"></circle>
                  <circle class="fg-circle" cx="32" cy="32" r="${r}"
                    stroke-dasharray="${circumference.toFixed(3)}"
                    stroke-dashoffset="${offset.toFixed(3)}"></circle>
                </svg>
                <div class="ring-num">${item.pct}%</div>
              </div>
              <div class="desc">${item.desc}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function pageForOverview(name) {
  if (name === "单词闭环" || name === "单词学习") return "words";
  if (name === "句子翻译") return "sentences";
  if (name === "阅读笔记") return "reading";
  if (name === "跑步" || name === "视频跟练") return "exercise";
  if (name === "理财学习") return "finance";
  // 新闻模块已移除
  if (name === "听力练习") return "listening";
  if (name === "翻译练习") return "translate";
  return "home";
}

function renderDashboard() {
  checkStreak();
  const today = Utils.today();
  const todayWords = getTodayWordCount(today);
  const goal = state.settings.dailyGoal || 0;
  const daysLeft = Utils.daysUntil(CONFIG.examDate);
  const username = state.settings.username || "柯仪";
  const avatar = state.settings.avatar || "👋";
  const avatarImg = (state.settings && state.settings.avatarImage) || '';
  const avatarHtml = avatarImg
    ? `<img class="hero-avatar" src="${avatarImg}" alt="头像" />`
    : `<span class="hero-avatar-emoji">${avatar}</span>`;

  // 待复习单词数
  const dueReview = getDueReviewWords().length;

  const totalErrors = state.errorBook.filter(e => !e.mastered).length;

  // 锻炼统计
  if (!state.exercise) state.exercise = { log: [] };
  const exStats = getWeekExerciseStats();

  const html = `
    ${renderMoodBanner()}
    ${renderTodayOverview()}

    <div class="dashboard-hero">
      <h1>${avatarHtml} ${username}，准备好了吗？</h1>
      <p>距离四级考试还有 ${daysLeft} 天 · 今天背多少都算数</p>
      <div class="countdown">
        <div class="countdown-item"><div class="num">${daysLeft}</div><div class="label">天</div></div>
        <div class="countdown-item"><div class="num">${Math.floor(daysLeft / 7)}</div><div class="label">周</div></div>
        <div class="countdown-item"><div class="num">${state.progress.streak}</div><div class="label">连续打卡</div></div>
        <div class="countdown-item"><div class="num">${exStats.runKm}</div><div class="label">本周跑步km</div></div>
      </div>
    </div>

    <div class="grid grid-4" style="margin-bottom: 14px;">
      <div class="card stat-card" onclick="navigate('words');setTimeout(()=>startWordSession(),120)">
        <div class="stat-icon">📖</div>
        <div class="stat-value">${todayWords}</div>
        <div class="stat-label">${goal > 0 ? `今日背词(目标${goal})` : '今日背词'}</div>
      </div>
      <div class="card stat-card" onclick="navigate('words');setTimeout(()=>startReviewSession(),120)">
        <div class="stat-icon">🔄</div>
        <div class="stat-value">${dueReview}</div>
        <div class="stat-label">待复习</div>
      </div>
      <div class="card stat-card" onclick="navigate('exercise')">
        <div class="stat-icon">🏃</div>
        <div class="stat-value">${exStats.runKm}/${exStats.runGoalKm}km</div>
        <div class="stat-label">本周跑步</div>
      </div>
      <div class="card stat-card" onclick="navigate('errors')">
        <div class="stat-icon">❌</div>
        <div class="stat-value">${totalErrors}</div>
        <div class="stat-label">待复习错题</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="card-title">💪 本周锻炼</div>
      ${renderExerciseMini()}
    </div>

    <div class="card">
      <div class="card-title">💾 数据备份与恢复</div>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;line-height:1.6;">
        学习记录存在浏览器本地。万一页面打不开或换设备，先用「导出」把备份文件保存好，需要时再「导入」恢复全部进度。
      </p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="exportData()">⬇️ 导出数据备份</button>
        <button class="btn btn-secondary" onclick="showImportMenu()">⬆️ 导入数据备份</button>
        <input type="file" id="importFile" accept=".json,application/json" style="display:none;" onchange="importData(this)" />
      </div>
    </div>

  `;
  document.getElementById("page-home").innerHTML = html;
}

// ===== 数据导出 / 导入（跨环境迁移） =====
function exportData() {
  try {
    const data = localStorage.getItem(Store.KEY);
    if (!data) { alert("当前没有可导出的数据。"); return; }
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cet4-backup-" + Utils.today() + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert("已导出备份文件（" + a.download + "），请妥善保存到手机/电脑。");
  } catch (e) {
    alert("导出失败：" + e.message);
  }
}

function importData(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!confirm("导入会覆盖当前环境的全部学习记录，确定继续？\n（建议先在旧环境已导出备份后再操作）")) {
    input.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = function (e) {
    importJsonText(e.target.result, "文件");
  };
  reader.onerror = function () {
    alert("读取文件失败，请重试。");
  };
  reader.readAsText(file);
  input.value = "";
}

function importJsonText(text, sourceName) {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("文件格式不正确");
    }
    localStorage.setItem(Store.KEY, JSON.stringify(parsed));
    state = Store.load();
    resetNewsIfDateChanged();
    ensureDefaultImportant();
    alert("✅ " + (sourceName || "数据") + "已恢复！页面即将刷新。");
    navigate("home");
  } catch (err) {
    alert("导入失败：" + err.message);
  }
}

function showImportMenu() {
  const root = document.getElementById("modalRoot");
  if (!root) return;
  root.innerHTML = `
    <div class="modal-card" style="max-width:420px;">
      <div class="modal-title">⬆️ 导入数据备份</div>
      <div class="modal-body">
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;line-height:1.6;">
          导入会<b>覆盖</b>当前设备的全部学习记录。请先把电脑导出的备份文件发到手机，再选择下面任一方式：
        </p>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button type="button" class="btn btn-primary" id="importFileBtn" style="justify-content:center;">
            📁 从文件导入（.json 备份）
          </button>
          <button type="button" class="btn btn-secondary" onclick="showImportPaste();" style="justify-content:center;">
            📋 粘贴 JSON 文本导入
          </button>
        </div>
        <div style="margin-top:14px;font-size:12px;color:var(--text-light);line-height:1.6;background:var(--surface-alt);padding:10px 12px;border-radius:var(--radius);">
          <b>小提示：</b>如果点「从文件导入」只看到相机/照片，点「更多」或「浏览」找到「文件管理」，再找到微信/QQ 保存的 <code>cet4-backup-日期.json</code> 文件即可。
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">取消</button>
      </div>
    </div>`;
  root.classList.add("show");
  root.onclick = function (e) { if (e.target === root) closeModal(); };
  // 动态创建 file input，避免在首页/设置页依赖不同 id
  const fileBtn = document.getElementById("importFileBtn");
  if (fileBtn) {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".json,application/json";
    inp.style.display = "none";
    inp.onchange = function () { importData(inp); closeModal(); };
    fileBtn.onclick = function () { inp.click(); };
  }
}

function showImportPaste() {
  const root = document.getElementById("modalRoot");
  if (!root) return;
  root.innerHTML = `
    <div class="modal-card" style="max-width:420px;">
      <div class="modal-title">📋 粘贴 JSON 文本导入</div>
      <div class="modal-body">
        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">把备份文件的全部内容复制后，粘贴到下方：</p>
        <textarea id="importPasteArea" style="width:100%;min-height:160px;font-family:monospace;font-size:12px;padding:10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);color:var(--text);resize:vertical;box-sizing:border-box;" placeholder='{"settings":{...},"wordStatus":{...}}'></textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="showImportMenu()">返回</button>
        <button class="btn btn-primary" onclick="confirmImportPaste()">确认导入</button>
      </div>
    </div>`;
  root.classList.add("show");
  root.onclick = function (e) { if (e.target === root) closeModal(); };
}

function confirmImportPaste() {
  const area = document.getElementById("importPasteArea");
  if (!area || !area.value.trim()) { alert("请粘贴备份内容后再导入。"); return; }
  if (!confirm("导入会覆盖当前环境的全部学习记录，确定继续？")) return;
  importJsonText(area.value.trim(), "粘贴内容");
}

// ===== 迷你热力图 =====
function renderMiniHeatmap() {
  const days = 28; // 最近4周
  let html = '<div class="heatmap">';
  for (let i = days - 1; i >= 0; i--) {
    const date = Utils.dateOffset(-i);
    const log = state.studyLog[date];
    let level = 0;
    if (log) {
      if (log.words >= 20) level = 3;
      else if (log.words >= 10) level = 2;
      else if (log.words > 0) level = 1;
    }
    const isToday = i === 0;
    const dayNum = new Date(date).getDate();
    html += `<div class="heatmap-cell ${level > 0 ? 'studied-' + level : ''} ${isToday ? 'today' : ''}" title="${date}: ${log ? log.words + '词' : '未学习'}">${dayNum}</div>`;
  }
  html += '</div>';
  html += `
    <div class="heatmap-legend">
      <span>少</span>
      <div class="swatch" style="background:var(--surface-alt);border:1px solid var(--border);"></div>
      <div class="swatch" style="background:#c7d2fe;"></div>
      <div class="swatch" style="background:#93a4f9;"></div>
      <div class="swatch" style="background:var(--primary);"></div>
      <span>多</span>
    </div>
  `;
  return html;
}

// ===== 首页锻炼迷你预览 =====
function renderExerciseMini() {
  if (!state.exercise) state.exercise = { log: [] };
  const stats = getWeekExerciseStats();
  const runKmPct = Math.min(100, Math.round((stats.runKm / stats.runGoalKm) * 100));
  const runDaysPct = Math.min(100, Math.round((stats.runDays / stats.runGoalDays) * 100));

  // 本周日历迷你版
  const weekStart = getWeekStart();
  const dayNames = ["一", "二", "三", "四", "五", "六", "日"];
  let calHtml = '<div class="week-calendar">';
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dayLogs = stats.weekLogs.filter(e => e.date === dateStr);
    const hasRun = dayLogs.some(e => e.type === "run");
    const hasVideo = dayLogs.some(e => e.type === "video");
    const isToday = dateStr === Utils.today();

    let cls = "week-day";
    if (hasRun && hasVideo) cls += " has-both";
    else if (hasRun) cls += " has-run";
    else if (hasVideo) cls += " has-video";
    if (isToday) cls += " today";

    let icons = "";
    if (hasRun) icons += "🏃";
    if (hasVideo) icons += "💪";

    calHtml += `<div class="${cls}"><div class="day-name">${dayNames[i]}</div><div class="day-num">${d.getDate()}</div><div class="exercise-icons">${icons}</div></div>`;
  }
  calHtml += '</div>';

  return `
    <div class="exercise-progress">
      <div class="exercise-progress-item">
        <div class="header">
          <span class="label">🏃 跑步里程</span>
          <span class="value">${stats.runKm} / ${stats.runGoalKm} km</span>
        </div>
        <div class="exercise-progress-bar">
          <div class="exercise-progress-fill run" style="width:${runKmPct}%;"></div>
        </div>
      </div>
      <div class="exercise-progress-item">
        <div class="header">
          <span class="label">📅 本周次数</span>
          <span class="value">${stats.runDays} 次</span>
        </div>
        <div class="exercise-progress-bar">
          <div class="exercise-progress-fill run" style="width:${Math.min(100, stats.runDays * 20)}%;"></div>
        </div>
      </div>
    </div>
    ${calHtml}
  `;
}

// ==========================================
// 单词模块
// ==========================================  
// 单词模块（不背单词模式·改良艾宾浩斯·复习优先·三轮自测）  
// ==========================================  
const SPACING = [1, 2, 4, 7, 15];
const MASTERED_RETURN_DAYS = 30; // 已掌握单词 30 天后返场巩固
const MASTERED_LEVEL = 4;        // 达到该 level 即视为已掌握（降低门槛，增强成就感）

let wordState = { mode: "menu", phase: "idle", filter: "all", cards: [], currentIndex: 0, currentCard: null, answered: false, showAnswer: false, newWords: [], learnRound: 1, learnWord: null, learnWordId: null, learnOptions: [], learnAnswer: '', reviewCorrect: 0, reviewWrong: 0, newCorrect: 0, newWrong: 0, review: null };
// 兼容旧全局
let dailyStudy = { active: false, phase: "result" };

function pickDistractors(correctMeaning, count) {
  const norm = s => (s || '').trim();
  const others = VOCABULARY.map(w => norm(w.meaning)).filter(m => m && m !== norm(correctMeaning));
  const unique = [...new Set(others)];
  return shuffleArr(unique).slice(0, count);
}

function pickDistractorWords(correctWord, count) {
  const norm = s => (s || '').trim();
  const others = VOCABULARY.filter(w => w.id !== correctWord.id && norm(w.meaning) !== norm(correctWord.meaning));
  return shuffleArr(others).slice(0, count);
}

function getDueReviewWords() {
  const today = Utils.today();
  return VOCABULARY.filter(w => {
    const s = Utils.getWordStatus(w.id);
    if (s.level < 1) return false;
    if (s.mastered) {
      // 已掌握单词按 MASTERED_RETURN_DAYS 定期返场
      if (!s.nextReview) { s.nextReview = Utils.dateOffset(MASTERED_RETURN_DAYS); Store.save(); }
      return s.nextReview <= today;
    }
    if (!s.nextReview) { s.nextReview = Utils.dateOffset(SPACING[s.level - 1] || 1); Store.save(); }
    return s.nextReview <= today;
  });
}

function getNewWordsForToday(count) {
  return VOCABULARY.filter(w => { const s = Utils.getWordStatus(w.id); return s.level === 0; })
    .sort((a, b) => (b.freq || 0) - (a.freq || 0)).slice(0, count);
}

function renderWords() {
  wordState.mode = "menu"; wordState.phase = "idle";
  const total = VOCABULARY.length;
  const learned = Object.values(state.wordStatus).filter(s => s.level >= 1).length;
  const mastered = Object.values(state.wordStatus).filter(s => s.mastered).length;
  const dueReview = getDueReviewWords().length;
  document.getElementById("page-words").innerHTML = '<div class="toolbar"><div class="toolbar-left"><h2 style="font-size:20px;">📚 单词</h2></div></div>' +
    '<div class="study-session-card"><div class="session-title">📖 今日学习</div><div class="session-desc">复习优先 · 三轮自测 · 艾宾浩斯间隔</div>' +
    '<div class="session-plan"><div class="plan-item"><div class="num">' + dueReview + '</div><div class="label">待复习</div></div>' +
    '<div class="plan-item"><div class="num" style="opacity:.7">' + (total - learned) + '</div><div class="label">未学习</div></div></div>' +
    '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:6px;">' +
    '<button class="btn btn-light" style="font-size:16px;padding:14px 28px;" onclick="startReviewSession()">🔁 开始复习 (' + dueReview + ')</button>' +
    '<button class="btn btn-primary" style="font-size:16px;padding:14px 28px;" onclick="startNewWords()">🆕 开始新词</button>' +
    '</div></div>' +
    '<div class="grid grid-2" style="margin-top:20px;">' +
    '<div class="card stat-card" style="border:2px solid var(--warning);" onclick="wordState.filter=\'learning\';renderWordsMenu()"><div class="stat-value" style="color:var(--warning);">' + (learned - mastered) + '</div><div class="stat-label">学习中</div></div>' +
    '<div class="card stat-card" style="border:2px solid var(--border);" onclick="wordState.filter=\'unlearned\';renderWordsMenu()"><div class="stat-value">' + (total - learned) + '</div><div class="stat-label">未学习</div></div>' +
    '</div>' +
    '<div class="grid grid-2" style="margin-top:16px;"><div class="card" style="border:2px solid var(--primary);" onclick="wordState.filter=\'all\';renderWordsMenu()"><div style="display:flex;align-items:center;gap:12px;"><div style="font-size:32px;">📖</div><div><div style="font-weight:600;font-size:16px;">浏览全部 ' + total + ' 个考纲词</div><div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">搜索单词/释义 · 点击🔊听发音</div></div></div></div>' +
    '<div class="card" style="border:2px solid var(--warning);" onclick="renderWeakBook()"><div style="display:flex;align-items:center;gap:12px;"><div style="font-size:32px;">📒</div><div><div style="font-weight:600;font-size:16px;">生词本 ' + ((state.weakWords || []).length ? '<span class="user-badge">' + state.weakWords.length + '</span>' : '') + '</div><div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">认读时标记「不熟悉」的词，在生词本里单独复习</div></div></div></div></div>' +
    '<div style="margin-top:24px;font-size:13px;color:var(--text-light);text-align:center;">学习原理：1天→2天→4天→7天→15天 改良艾宾浩斯复习 · ⚡</div>';
}

function startWordSession() {
  const today = Utils.today();
  // 断点续学：今天有未完成的复习（沿用上次进度）
  if (state.reviewSession && state.reviewSession.date === today && state.reviewSession.review) {
    wordState.phase = "review";
    wordState.review = state.reviewSession.review;
    wordState.reviewCorrect = wordState.review.correct || 0;
    wordState.reviewWrong = wordState.review.wrong || 0;
    renderReviewCard();
    return;
  }
  const reviews = getDueReviewWords();
  if (reviews.length > 0) {
    beginReviewSession(reviews.map(w => w.id));
  } else { startNewWords(); }
}

// 独立复习入口：只复习当前到期（含今天刚学完）的单词
function startReviewSession() {
  const reviews = getDueReviewWords();
  if (reviews.length === 0) { Utils.toast("今天没有待复习的单词，先去学新词吧", "info"); return; }
  beginReviewSession(reviews.map(w => w.id));
}

// 建立复习批：10 个一组，先「认单词」整批过一遍，再「默写」整批过一遍
// 认词与默写的顺序各自独立打乱，避免两次顺序一模一样
function beginReviewSession(allIds) {
  wordState.phase = "review";
  wordState.reviewCorrect = 0; wordState.reviewWrong = 0;
  wordState.review = {
    allIds: shuffleArr(allIds),       // 整批单词（已打乱）
    batchSize: 10,                    // 10 个一组
    batchIdx: 0,                      // 当前第几组
    phase: 'recognize',               // 'recognize' 认单词 | 'dictate' 默写
    segIdx: 0,                        // 当前阶段内的第几个
    recognizeList: [],                // 本组「认单词」顺序（打乱）
    dictateList: [],                  // 本组「默写」顺序（重新打乱，与认词不同）
    recognized: {},                   // 本组内被点「认识」的单词 id
    correct: 0, wrong: 0, done: 0     // 统计
  };
  saveReviewSession();
  beginReviewBatch();
}

function saveReviewSession() {
  state.reviewSession = { date: Utils.today(), review: wordState.review };
  Store.save();
}

// 进入下一组（或结束）
function beginReviewBatch() {
  const r = wordState.review;
  if (!r) { startNewWords(); return; }
  const start = r.batchIdx * r.batchSize;
  const batch = r.allIds.slice(start, start + r.batchSize);
  if (batch.length === 0) { finishReviewSession(); return; }
  r.phase = 'recognize';
  r.segIdx = 0;
  r.recognizeList = shuffleArr(batch);
  r.dictateList = [];
  r.recognized = {};
  wordState.showAnswer = false;
  renderReviewCard();
}

function finishReviewSession() {
  state.reviewSession = null; Store.save();
  startNewWords();
}

function renderReviewCard() {
  wordState.answered = false;
  const r = wordState.review;
  if (!r) { startNewWords(); return; }
  const list = r.phase === 'recognize' ? r.recognizeList : r.dictateList;
  if (r.segIdx >= (list ? list.length : 0)) {
    // 当前阶段（认单词 / 默写）已走完，切到下一阶段或下一组
    if (r.phase === 'recognize') {
      // 进入默写：只默写本组「认识」的词，顺序重新打乱（与认词顺序不同）
      r.dictateList = shuffleArr(r.recognizeList.filter(id => r.recognized[id]));
      if (r.dictateList.length === 0) { r.batchIdx++; saveReviewSession(); beginReviewBatch(); return; }
      r.phase = 'dictate'; r.segIdx = 0; wordState.showAnswer = false; renderReviewCard(); return;
    } else {
      r.batchIdx++; saveReviewSession(); beginReviewBatch(); return;
    }
  }
  const wordId = list[r.segIdx];
  const word = VOCABULARY.find(w => w.id === wordId);
  if (!word) { r.segIdx++; renderReviewCard(); return; }
  wordState.currentCard = { wordId: word.id };
  const total = r.allIds.length;
  const progress = Math.min(100, Math.round((r.done / total) * 100));
  const s = Utils.getWordStatus(word.id);
  const returnTag = s.mastered ? '<div style="display:inline-block;background:var(--success);color:#fff;font-size:12px;padding:4px 10px;border-radius:12px;margin-bottom:12px;">🔄 已掌握·返场巩固</div>' : '';
  const weakToggle = weakToggleHtml(word.id);
  let body;
  if (r.phase === 'recognize') {
    if (!wordState.showAnswer) {
      body = returnTag + weakToggle + '<div class="word-display" style="font-size:30px;margin-bottom:24px;">' + word.word + '</div>' +
        (word.phonetic ? '<div class="phonetic-display">' + escapeHtml(word.phonetic) + '</div>' : '') +
        '<div class="speech-controls" style="justify-content:center;margin-top:8px;"><button class="btn btn-speech" onclick="speakWord(\'' + word.word.replace(/'/g,"\\'") + '\')">🔊 听发音</button></div>' +
        '<div style="color:var(--text-secondary);font-size:14px;margin-top:20px;">第 1 步 · 先看英文回想中文，再点下方按钮</div>' +
        '<button class="btn btn-primary btn-lg" style="margin-top:16px;min-width:200px;" onclick="revealReviewCard()">👆 显示答案</button>';
    } else {
      body = returnTag + weakToggle + '<div class="word-display" style="font-size:30px;margin-bottom:8px;">' + word.word + '</div>' +
        (word.phonetic ? '<div class="phonetic-display">' + escapeHtml(word.phonetic) + '</div>' : '') +
        '<div class="speech-controls" style="justify-content:center;margin-top:8px;"><button class="btn btn-speech" onclick="speakWord(\'' + word.word.replace(/'/g,"\\'") + '\')">🔊 听发音</button></div>' +
        renderSensesHtml(getWordSenses(word)) +
        '<div style="margin:14px 0 6px;"><button class="btn btn-light" style="font-size:13px;padding:7px 14px;" onclick="markWordMastered(' + word.id + ')">🔥 已经记住，直接掌握</button></div>' +
        '<div class="speech-controls" style="justify-content:center;gap:16px;margin-top:12px;">' +
        '<button class="btn btn-danger" onclick="reviewAnswer(\'wrong\')" style="font-size:16px;padding:12px 28px;">❌ 不认识</button>' +
        '<button class="btn btn-warning" onclick="reviewAnswer(\'blur\')" style="font-size:16px;padding:12px 28px;">⚠️ 模糊</button>' +
        '<button class="btn btn-success" onclick="reviewAnswer(\'correct\')" style="font-size:16px;padding:12px 28px;">✅ 认识</button></div>';
    }
  } else {
    // 第 2 步：看中文写英语（整批统一默写，顺序与认词不同）
    const senses = getWordSenses(word);
    const meaningDisplay = senses.length ? senses.map(s => s.meaning).join('；') : cleanSenseText(word.meaning || '');
    body = returnTag + weakToggle + '<div id="reviewStepLabel" style="font-size:13px;color:var(--text-light);margin-bottom:8px;">第 2 步 · 根据中文写出英文</div>' +
      '<div id="reviewSpellMeaning" class="word-display" style="font-size:24px;color:var(--primary);margin-bottom:8px;">' + escapeHtml(meaningDisplay) + '</div>' +
      '<div class="speech-controls" style="justify-content:center;margin:8px 0 12px;"><button id="spellSpeakBtn" class="btn btn-speech" onmousedown="event.preventDefault();" onclick="speakWord(\'' + word.word.replace(/'/g,"\\'") + '\')">🔊 听发音</button></div>' +
      '<div style="color:var(--text-secondary);font-size:13px;margin-bottom:16px;">请输入对应的英文单词</div>' +
      '<input id="reviewSpellInput" class="spell-input" style="max-width:360px;" placeholder="输入英文单词..." onkeydown="if(event.key===\'Enter\')submitReviewSpell()" autocomplete="off" />' +
      '<div style="margin-top:12px;"><button id="reviewSpellSubmitBtn" class="btn btn-primary" onclick="submitReviewSpell()">提交拼写</button></div>' +
      '<div id="reviewFeedback" style="margin-top:12px;"></div>';
  }
  const phaseLabel = r.phase === 'recognize' ? ('认单词 ' + (r.segIdx + 1) + '/' + r.recognizeList.length) : ('默写 ' + (r.segIdx + 1) + '/' + r.dictateList.length);
  document.getElementById("page-words").innerHTML = '<div class="toolbar"><div class="toolbar-left"><button class="btn btn-secondary btn-icon" onclick="exitWordSession()">←</button>' +
    '<span id="reviewPhaseLabel" style="font-weight:600;">🔁 复习 · ' + phaseLabel + '</span></div>' +
    '<div class="toolbar-right" style="font-size:14px;color:var(--text-secondary);">✅' + wordState.reviewCorrect + ' ❌' + wordState.reviewWrong + '</div></div>' +
    '<div class="test-container"><div class="test-progress"><span style="font-size:13px;color:var(--text-secondary);">复习进度</span>' +
    '<div class="test-progress-bar"><div class="test-progress-fill" style="width:' + progress + '%;background:var(--warning);"></div></div></div>' +
    '<div class="test-question" style="text-align:center;">' + body + '</div></div>';
  setTimeout(() => activateWordTap("page-words"), 60);
  // 默写阶段首次渲染时聚焦输入框；后续提交通过 advanceReviewSpell 原地更新，输入框一直存活，键盘保持弹起
  if (r.phase === 'dictate') {
    setTimeout(() => { const inp = document.getElementById('reviewSpellInput'); if (inp) inp.focus(); }, 200);
  }
  // 认单词阶段自动朗读（未看答案时）；默写阶段不读，避免「一听就会写」
  if (r.phase === 'recognize' && word && !wordState.showAnswer) setTimeout(() => playTextAudio(word.word), 100);
}

function revealReviewCard() { wordState.showAnswer = true; renderReviewCard(); }

// 渲染单词例句块（复习/学习卡片共用）
function getExampleBlock(word) {
  if (!word) return '';
  const en = word.example || word.en || '';
  const cn = word.exampleCn || word.cn || '';
  if (!en && !cn) return '';
  return '<div class="example-card" style="text-align:left;margin:16px auto 0;max-width:480px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;">' +
    (en ? '<div class="example-en" style="font-size:14px;line-height:1.6;">' + escapeHtml(en) + '</div>' : '') +
    (cn ? '<div class="example-cn" style="font-size:13px;color:var(--text-light);margin-top:4px;line-height:1.5;">' + escapeHtml(cn) + '</div>' : '') +
    '</div>';
}

// 取单词的多个义项（优先 WORD_SENSES 多义词词典，否则用旧字段兜底）
function getWordSenses(input) {
  const word = (input && input.word) ? input.word : (typeof input === 'string' ? input : '');
  if (!word) return [];
  const key = word.toLowerCase();
  if (typeof WORD_SENSES !== 'undefined' && WORD_SENSES[key]) {
    return WORD_SENSES[key].map(s => ({
      pos: s.pos || '',
      meaning: cleanSenseText(s.meaning),
      phrase: cleanSenseText(s.phrase),
      phraseCn: cleanSenseText(s.phraseCn),
      example: cleanSenseText(s.example),
      exampleCn: cleanSenseText(s.exampleCn)
    }));
  }
  const w = (input && input.word) ? input : VOCABULARY.find(v => v.word.toLowerCase() === key);
  if (!w) return [];
  const m = cleanSenseText(w.meaning || '');
  if (!m) return [];
  return m.split(/[、,，]/).map(mm => {
    const meaning = cleanSenseText(mm);
    const ex = (w.example && w.exampleCn) ? { en: cleanSenseText(w.example), cn: cleanSenseText(w.exampleCn) } : getExample(w.word, meaning);
    return {
      pos: cleanSenseText(w.pos) || '',
      meaning,
      phrase: '',
      example: cleanSenseText(ex.en) || '',
      exampleCn: cleanSenseText(ex.cn) || ''
    };
  });
}

// 把义项数组渲染成卡片（词性 + 释义 + 短语 + 例句）
function renderSensesHtml(senses) {
  if (!senses || !senses.length) return '';
  return '<div class="senses-list">' + senses.map(s =>
    '<div class="sense-item">' +
      (s.pos ? '<span class="sense-pos">' + escapeHtml(cleanSenseText(s.pos)) + '</span>' : '') +
      '<span class="sense-meaning">' + escapeHtml(cleanSenseText(s.meaning)) + '</span>' +
      (s.phrase ? '<div class="sense-phrase">🔖 ' + escapeHtml(cleanSenseText(s.phrase)) + (s.phraseCn ? ' <span class="sense-phrase-cn">（' + escapeHtml(cleanSenseText(s.phraseCn)) + '）</span>' : '') + '</div>' : '') +
      (s.example ? '<div class="sense-example"><div class="example-en">' + escapeHtml(cleanSenseText(s.example)) + '</div>' + (s.exampleCn ? '<div class="example-cn">' + escapeHtml(cleanSenseText(s.exampleCn)) + '</div>' : '') + '</div>' : '') +
    '</div>'
  ).join('') + '</div>';
}

function applyReviewResult(s, result) {
  if (result === 'correct') {
    if (s.mastered) {
      // 返场巩固答对：保持已掌握，30 天后再返场
      s.nextReview = Utils.dateOffset(MASTERED_RETURN_DAYS);
    } else {
      if (s.level < MASTERED_LEVEL) s.level++;
      s.nextReview = Utils.dateOffset(SPACING[Math.min(s.level - 1, 4)]);
      if (s.level >= MASTERED_LEVEL) s.mastered = true;
    }
  }
  else if (result === 'blur') {
    if (s.mastered) {
      // 返场模糊：降为熟悉（level 3），重新进入正常复习
      s.mastered = false;
      s.level = 3;
    }
    s.nextReview = Utils.dateOffset(SPACING[Math.min(Math.max(0, s.level - 1), 4)]);
  }
  else {
    // 不认识：直接降级为学习中
    s.mastered = false;
    s.level = 1;
    s.nextReview = Utils.dateOffset(1);
  }
}

function reviewAnswer(result) {
  if (wordState.answered) return; wordState.answered = true;
  const r = wordState.review;
  if (!r || r.phase !== 'recognize') return;
  const wordId = r.recognizeList[r.segIdx];
  const word = VOCABULARY.find(w => w.id === wordId);
  if (!word) return;
  const s = Utils.getWordStatus(word.id);
  if (result === 'correct') {
    // 认识 → 留到本组统一默写阶段再判级（不直接升级，默写通过才算过）
    r.recognized[word.id] = true;
    playCorrectSound();
    r.segIdx++;
    wordState.showAnswer = false;
    saveReviewSession();
    renderReviewCard();
    return;
  }
  // 不认识 / 模糊 → 该词结束，降级处理
  r.wrong++; wordState.reviewWrong++;
  applyReviewResult(s, result);
  s.lastReview = Utils.today();
  r.done++;
  r.segIdx++;
  wordState.showAnswer = false;
  saveReviewSession();
  renderReviewCard();
}

function finishReviewSpell(result) {
  const r = wordState.review;
  if (!r || r.phase !== 'dictate') return;
  const wordId = r.dictateList[r.segIdx];
  const word = VOCABULARY.find(w => w.id === wordId);
  if (!word) return;
  const s = Utils.getWordStatus(word.id);
  if (result === 'correct') {
    r.correct++; wordState.reviewCorrect++;
    recordStudy(1, word.id); // 完整复习通过一词，计入今日背词进度
  } else {
    r.wrong++; wordState.reviewWrong++;
  }
  applyReviewResult(s, result);
  s.lastReview = Utils.today();
  r.done++;
  r.segIdx++;
  wordState.showAnswer = false;
  saveReviewSession();
  advanceReviewSpell();
}

// 复习默写阶段：原地推进到下一题，不重建输入框，保持软键盘弹起
function advanceReviewSpell() {
  const r = wordState.review;
  if (!r || r.phase !== 'dictate') { renderReviewCard(); return; }
  const list = r.dictateList;
  if (r.segIdx >= (list ? list.length : 0)) {
    // 本组默写完成，进入下一组或结束，需要完整重绘
    r.batchIdx++; saveReviewSession(); beginReviewBatch(); return;
  }
  wordState.answered = false;
  const wordId = list[r.segIdx];
  const word = VOCABULARY.find(w => w.id === wordId);
  if (!word) { r.segIdx++; advanceReviewSpell(); return; }
  wordState.currentCard = { wordId: word.id };

  // 更新释义
  const senses = getWordSenses(word);
  const meaningDisplay = senses.length ? senses.map(s => s.meaning).join('；') : cleanSenseText(word.meaning || '');
  const meaningEl = document.getElementById('reviewSpellMeaning');
  if (meaningEl) meaningEl.textContent = meaningDisplay;

  // 更新步骤标签
  const stepEl = document.getElementById('reviewStepLabel');
  if (stepEl) stepEl.textContent = '第 2 步 · 根据中文写出英文';

  // 更新工具栏阶段标题
  const phaseLabel = '默写 ' + (r.segIdx + 1) + '/' + r.dictateList.length;
  const phaseEl = document.getElementById('reviewPhaseLabel');
  if (phaseEl) phaseEl.textContent = '🔁 复习 · ' + phaseLabel;

  // 更新进度条
  const total = r.allIds.length;
  const progress = Math.min(100, Math.round((r.done / total) * 100));
  const fillEl = document.querySelector('#page-words .test-progress-fill');
  if (fillEl) fillEl.style.width = progress + '%';

  // 更新生词本按钮
  const weakBtn = document.getElementById('weakToggleBtn');
  if (weakBtn) {
    const weak = isWeakWord(word.id);
    weakBtn.className = 'btn ' + (weak ? 'btn-light' : 'btn-secondary');
    weakBtn.textContent = weak ? '📒 已在生词本' : '📒 加入生词本';
    weakBtn.setAttribute('onclick', 'toggleWeakWord(' + word.id + ')');
  }

  // 更新听发音按钮（修复：换词后发音还是上一条的 bug）
  const speakBtn = document.getElementById('spellSpeakBtn');
  if (speakBtn) {
    speakBtn.setAttribute('onclick', "speakWord('" + word.word.replace(/'/g, "\\'") + "')");
  }

  // 清空反馈与输入框，并保持输入框聚焦
  const fb = document.getElementById('reviewFeedback');
  if (fb) fb.innerHTML = '';
  const inp = document.getElementById('reviewSpellInput');
  if (inp) { inp.value = ''; inp.style.display = ''; inp.focus(); }
  const submitBtn = document.getElementById('reviewSpellSubmitBtn');
  if (submitBtn) { submitBtn.style.display = ''; submitBtn.textContent = '提交拼写'; }

  setTimeout(() => activateWordTap("page-words"), 60);
}

// 刷新复习工具栏计数与进度条（原地更新，不重绘整张卡片）
function updateReviewProgressUI() {
  const r = wordState.review;
  if (!r) return;
  const total = r.allIds.length;
  const progress = Math.min(100, Math.round((r.done / total) * 100));
  const fillEl = document.querySelector('#page-words .test-progress-fill');
  if (fillEl) fillEl.style.width = progress + '%';
  const toolbarRight = document.querySelector('#page-words .toolbar-right');
  if (toolbarRight) toolbarRight.textContent = '✅' + wordState.reviewCorrect + ' ❌' + wordState.reviewWrong;
}

// 拼写错误后，用户点击“下一题”再推进
function nextReviewSpell() {
  const r = wordState.review;
  if (!r || r.phase !== 'dictate') { renderReviewCard(); return; }
  r.segIdx++;
  wordState.showAnswer = false;
  saveReviewSession();
  advanceReviewSpell();
}

function submitReviewSpell() {
  if (wordState.answered) return;
  const inputVal = document.getElementById('reviewSpellInput').value.trim();
  if (!inputVal) { Utils.toast('请先输入英文单词', 'warning'); return; }
  wordState.answered = true;
  const r = wordState.review;
  const wordId = r.dictateList[r.segIdx];
  const word = VOCABULARY.find(w => w.id === wordId);
  if (!word) return;
  const isCorrect = inputVal.toLowerCase().replace(/[^a-z]/g, '') === word.word.toLowerCase().replace(/[^a-z]/g, '');
  const fb = document.getElementById('reviewFeedback');
  if (isCorrect) {
    playCorrectSound();
    fb.innerHTML = '<div class="card" style="text-align:center;border:2px solid var(--success);">' +
      '<div style="font-size:18px;font-weight:600;color:var(--success);">✅ 拼写正确</div>' +
      '<div style="font-size:14px;color:var(--text-secondary);margin-top:4px;">两步都完成，该词升级</div></div>';
    setTimeout(() => finishReviewSpell('correct'), 400);
  } else {
    playWrongSound();
    const s = Utils.getWordStatus(word.id);
    r.wrong++; wordState.reviewWrong++;
    applyReviewResult(s, 'wrong');
    s.lastReview = Utils.today();
    r.done++;
    saveReviewSession();
    updateReviewProgressUI();
    const senses = getWordSenses(word);
    const meaningDisplay = senses.length ? senses.map(s => s.meaning).join('；') : cleanSenseText(word.meaning || '');
    fb.innerHTML = '<div class="card" style="text-align:center;border:2px solid var(--danger);">' +
      '<div style="font-size:18px;font-weight:600;color:var(--danger);">❌ 拼写错误</div>' +
      '<div style="font-size:15px;color:var(--text-secondary);margin-top:6px;">你输入的是：<b style="color:var(--danger);">' + escapeHtml(inputVal || '') + '</b></div>' +
      '<div style="font-size:18px;font-weight:600;margin-top:10px;">' + escapeHtml(word.word) + '</div>' +
      (word.phonetic ? '<div class="phonetic-display" style="margin-top:2px;">' + escapeHtml(word.phonetic) + '</div>' : '') +
      '<div style="font-size:14px;color:var(--text-secondary);margin-top:6px;">' + escapeHtml(meaningDisplay) + '</div>' +
      '<div style="font-size:13px;color:var(--text-secondary);margin-top:8px;">已加入本轮复习，点下方按钮继续</div></div>' +
      '<div style="margin-top:12px;"><button id="reviewSpellNextBtn" class="btn btn-primary" onclick="nextReviewSpell()">下一题 →</button></div>';
    // 隐藏输入框与提交按钮，避免继续编辑
    const inp = document.getElementById('reviewSpellInput');
    if (inp) inp.style.display = 'none';
    const submitBtn = document.getElementById('reviewSpellSubmitBtn');
    if (submitBtn) submitBtn.style.display = 'none';
  }
}

// 朗读单词
// ===== 真人发音音频（有道词典，联网实时拉取；网络失败自动退回系统 TTS）=====
const AudioPlayer = {
  el: null,
  // 已成功加载过的音频缓存：textKey -> { url, el }
  // 同一句重复播放直接复用元素（currentTime 归零重播），不再重新请求网络，彻底消除“第二次点击还卡”的问题
  cache: new Map(),
  // 播放一个音频 URL：成功放完调用 onend；出错/超时调用 onerror
  // textKey：可选，传了则同一文本复用已加载的缓存元素；否则每次重新加载
  // 注意：onplaying 只负责取消「超时回退」计时器，不要把它当成已结束，否则 onended 会被吞掉（之前这里导致对话只放一句就卡住、按钮一直转圈）
  play(url, onend, onerror, textKey) {
    this.stop();
    // 命中已加载成功的缓存：直接从头重播，零等待
    if (textKey) {
      const hit = this.cache.get(textKey);
      if (hit && hit.el && !hit.bad) {
        const el = hit.el;
        let ended = false, failed = false;
        el.onended = () => { if (ended || failed) return; ended = true; this.el = null; if (onend) onend(); };
        el.onerror = () => { if (ended || failed) return; failed = true; this.el = null; hit.bad = true; this.cache.delete(textKey); if (onerror) onerror(); };
        this.el = el;
        try { el.currentTime = 0; } catch (e) {}
        const p = el.play();
        if (p && p.catch) p.catch(() => { if (ended || failed) return; failed = true; this.el = null; hit.bad = true; this.cache.delete(textKey); if (onerror) onerror(); });
        return;
      }
    }
    let ended = false, failed = false;
    let timer = null;
    const onFail = () => { if (ended || failed) return; failed = true; if (timer) clearTimeout(timer); this.el = null; if (onerror) onerror(); };
    try {
      const a = new Audio();
      a.src = url;
      a.preload = 'auto';
      this.el = a;
      a.onplaying = () => {
        if (timer) { clearTimeout(timer); timer = null; }
        // 确认真正出声后才进缓存，避免把加载失败的坏元素缓存下来
        if (textKey && !this.cache.has(textKey)) this.cache.set(textKey, { url, el: a });
      };
      a.onended = () => { if (ended || failed) return; ended = true; if (timer) clearTimeout(timer); this.el = null; if (onend) onend(); };
      a.onerror = onFail;
      timer = setTimeout(onFail, 5000); // 5 秒还没出声则退回系统 TTS（原 7s，缩短减少“干等”）
      const p = a.play();
      if (p && p.catch) p.catch(onFail);
    } catch (e) { onFail(); }
  },
  stop() {
    if (this.el) { try { this.el.pause(); } catch (e) {} this.el = null; }
  }
};

// 当前选择的发音方式：auto(真人优先) / youdao(仅真人) / tts(仅系统)
function audioSourceMode() {
  const m = (state.settings && state.settings.audioSource) || 'auto';
  return (m === 'youdao' || m === 'youdao-only') ? 'youdao' : (m === 'tts' ? 'tts' : 'auto');
}

// 播放英文文本：默认真人发音（美音，更自然），失败/超时自动退回系统 TTS
// 注意：URL 不再加随机时间戳——同一文本 URL 稳定，才能命中 AudioPlayer 内存缓存和浏览器 HTTP 缓存，重复点击秒开（这才是之前“卡顿”的根因）
function playTextAudio(text, opts = {}) {
  if (!text) return;
  if (Speech.synth) { try { Speech.synth.cancel(); } catch (e) {} }
  // 句子（含空格、多词）统一走系统 TTS + 本地语音，避免有道 dictvoice 对长句卡顿；
  // 单词（无空格）仍走有道真人发音。
  if (/\s/.test(text)) {
    speakSentence(text, opts);
    return;
  }
  const mode = audioSourceMode();
  if (mode === 'tts') { Speech.speak(text, opts); return; } // 用户指定用系统音，直接播，不联网
  let tried = 0;
  const mkUrl = () => 'https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(text) + '&type=2';
  const tryYoudao = () => {
    AudioPlayer.play(mkUrl(), opts.onend, function () {
      if (tried++ < 1) { tryYoudao(); }            // 偶发网络抖动，重试一次（URL 不变，重试会命中 HTTP 缓存，通常很快）
      else { Speech.speak(text, opts); }            // 最终退回系统发音
    }, text);
  };
  tryYoudao();
}

// 朗读长句：系统 TTS + onend 兜底。
// 有道 dictvoice 只适合单词；长句 / 对话走它会卡顿、发怪声甚至截断。
// 这里统一走系统 TTS 且优先本地离线语音（在线神经语音依赖网络，网络差会逐词卡顿），并用预估时长兜底，
// 防止个别安卓浏览器 onend 不触发导致对话卡住、按钮一直转圈。
function speakSentence(text, opts) {
  opts = opts || {};
  if (!text) { if (opts.onend) opts.onend(); return; }
  let done = false, guard = null;
  const finish = function () {
    if (done) return;
    done = true;
    if (guard) clearTimeout(guard);
    if (opts.onend) opts.onend();
  };
  const words = ((text || '').split(/\s+/).filter(Boolean).length) || 1;
  guard = setTimeout(finish, Math.max(1500, words * 500 + 1200));
  Speech.speak(text, { rate: opts.rate, preferLocal: true, onend: finish });
}

function speakWord(text) {
  if (!text) return;
  if (!Speech.ttsSupported()) {
    Utils.toast("浏览器不支持语音播放，请使用 Chrome 或 Edge", "warning");
    return;
  }
  playTextAudio(text);
  // 默写阶段点发音后，把焦点还给输入框，防止软键盘收起
  setTimeout(() => {
    const inp = document.getElementById('reviewSpellInput');
    if (inp && inp.style.display !== 'none') { inp.focus(); }
  }, 80);
}

// 朗读单词（已定义在前面）
function speakExample(id) {
  const w = VOCABULARY.find(v => v.id === id);
  if (!w) return;
  const ex = getExample(w.word, w.meaning);
  if (ex && ex.en) playTextAudio(ex.en, { rate: 0.8 });
}

// 词表浏览器（按 filter 筛选）
function renderWordsMenu() {
  wordState.mode = "list";
  const filter = wordState.filter || 'all';
  const filterLabels = { all: '全部', mastered: '已掌握', learning: '学习中', unlearned: '未学习' };
  let words = VOCABULARY;
  if (filter === 'mastered') words = words.filter(w => Utils.getWordStatus(w.id).mastered);
  else if (filter === 'learning') words = words.filter(w => {
    const s = Utils.getWordStatus(w.id); return s.level >= 1 && !s.mastered;
  });
  else if (filter === 'unlearned') words = words.filter(w => Utils.getWordStatus(w.id).level === 0);
  document.getElementById("page-words").innerHTML = '<div class="toolbar"><div class="toolbar-left"><button class="btn btn-secondary btn-icon" onclick="wordState.filter=\'all\';wordState.mode=\'menu\';renderWords()">←</button><span style="font-weight:600;">📖 词表 · ' + filterLabels[filter] + ' (' + words.length + ')</span></div></div>' +
    '<div style="padding:16px;max-height:75vh;overflow-y:auto;">' + words.slice(0, 200).map(w => {
      const s = Utils.getWordStatus(w.id);
      const stage = s.mastered ? '<span style="color:var(--success);">✅已掌握</span>' : s.level >= 1 ? '<span style="color:var(--warning);">学习中</span>' : '<span style="color:var(--text-light);">未学</span>';
      const masterBtn = s.mastered ? '' : `<button class="btn btn-success btn-sm" style="margin-left:6px;" onclick="markWordMastered(${w.id})">掌握</button>`;
      return '<div style="padding:12px 0;border-bottom:1px solid var(--border);"><div style="display:flex;align-items:center;gap:10px;justify-content:space-between;"><div style="min-width:0;flex:1;"><span class="word-tappable" style="font-weight:600;font-size:15px;">' + w.word + '</span> ' + (w.phonetic ? '<span style="font-size:12px;color:var(--text-light);">' + w.phonetic + '</span>' : '') + (w.pos ? ' <span style="font-size:12px;color:var(--text-light);">' + w.pos + '</span>' : '') + '</div><div style="display:flex;align-items:center;gap:6px;flex-shrink:0;"><div style="font-size:12px;text-align:right;white-space:nowrap;">' + stage + '</div><button class="btn btn-speech-sm" style="flex-shrink:0;" onclick="speakWord(\'' + w.word.replace(/'/g, "\\'") + '\')">🔊</button>' + masterBtn + '</div></div><div style="margin-top:6px;color:var(--text-secondary);font-size:14px;line-height:1.5;">' + escapeHtml(w.meaning) + '</div></div>';
    }).join('') + (words.length > 200 ? '<div style="text-align:center;padding:16px;color:var(--text-secondary);font-size:13px;">共 ' + words.length + ' 词，已显示前 200 个</div>' : '') + '</div>';
  setTimeout(() => activateWordTap("page-words"), 60);
}

// 生词本：显示标记为「不熟悉」的单词
function renderWeakBook() {
  wordState.mode = "weak";
  const ids = state.weakWords || [];
  const words = ids.map(id => VOCABULARY.find(w => w.id === id)).filter(Boolean);
  const dueCount = words.filter(w => {
    const s = Utils.getWordStatus(w.id);
    return s.level >= 1 && !s.mastered && (!s.nextReview || s.nextReview <= Utils.today());
  }).length;
  const listHtml = words.length ? words.map(w => {
    const s = Utils.getWordStatus(w.id);
    const stage = s.mastered ? '<span style="color:var(--success);">✅已掌握</span>' : s.level >= 1 ? '<span style="color:var(--warning);">学习中</span>' : '<span style="color:var(--text-light);">未学</span>';
    const masterBtn = s.mastered ? '' : `<button class="btn btn-success btn-sm" style="margin-left:6px;" onclick="markWordMastered(${w.id})">掌握</button>`;
    return '<div style="padding:12px 0;border-bottom:1px solid var(--border);"><div style="display:flex;align-items:center;gap:10px;justify-content:space-between;"><div style="min-width:0;flex:1;"><span class="word-tappable" style="font-weight:600;font-size:15px;">' + w.word + '</span> ' + (w.phonetic ? '<span style="font-size:12px;color:var(--text-light);">' + w.phonetic + '</span>' : '') + '</div><div style="display:flex;align-items:center;gap:6px;flex-shrink:0;"><div style="font-size:12px;text-align:right;white-space:nowrap;">' + stage + '</div><button class="btn btn-speech-sm" style="flex-shrink:0;" onclick="speakWord(\'' + w.word.replace(/'/g, "\\'") + '\')">🔊</button>' + masterBtn + '<button class="btn btn-danger btn-sm" style="flex-shrink:0;" onclick="removeWeakWord(\'' + String(w.id).replace(/'/g, "\\'") + '\')">移除</button></div></div><div style="margin-top:6px;color:var(--text-secondary);font-size:14px;line-height:1.5;">' + escapeHtml(w.meaning) + '</div></div>';
  }).join('') : '<div style="text-align:center;padding:40px 20px;color:var(--text-light);">📒 生词本为空<br><span style="font-size:13px;">在学习卡片上标记「不熟悉」后会出现在这里</span></div>';
  const reviewBtn = words.length
    ? `<button class="btn btn-warning" onclick="startWeakWordReview()">🔥 重点复习 ${dueCount ? '(' + dueCount + ')' : ''}</button>`
    : '';
  document.getElementById("page-words").innerHTML = '<div class="toolbar"><div class="toolbar-left"><button class="btn btn-secondary btn-icon" onclick="wordState.mode=\'menu\';renderWords()">←</button><span style="font-weight:600;">📒 生词本 (' + words.length + ')</span></div>' + (reviewBtn ? '<div class="toolbar-right">' + reviewBtn + '</div>' : '') + '</div>' +
    '<div style="padding:16px;max-height:75vh;overflow-y:auto;">' + listHtml + '</div>';
  setTimeout(() => activateWordTap("page-words"), 60);
}

// 生词本「重点复习」：独立的生词本小循环，不复用全局复习、不改单词/生词本状态
let weakReviewState = { active: false, items: [], itemsR2: [], current: 0, round: 1, correct: 0, wrong: 0, answered: false, roundResults: {}, options: null, answer: null };

function startWeakWordReview() {
  const ids = (state.weakWords || []).filter(id => { const s = Utils.getWordStatus(id); return !s.mastered; });
  if (ids.length === 0) { Utils.toast("生词本里没有待复习的词", "info"); return; }
  const items = ids.map(id => VOCABULARY.find(w => w.id === id)).filter(Boolean);
  const r1 = shuffleArr(items), r2 = shuffleArr(items);
  weakReviewState = { active: true, items: r1, itemsR2: r2, current: 0, round: 1, correct: 0, wrong: 0, answered: false, roundResults: {}, options: null, answer: null };
  renderWeakReview();
}

function renderWeakReview() {
  const r = weakReviewState.round;
  const curItems = r === 1 ? weakReviewState.items : weakReviewState.itemsR2;
  if (!weakReviewState.active || weakReviewState.current >= curItems.length) {
    if (r === 1) { weakReviewState.round = 2; weakReviewState.current = 0; weakReviewState.answered = false; renderWeakReview(); return; }
    renderWeakReviewResult(); return;
  }
  const w = curItems[weakReviewState.current];
  const total = curItems.length;
  const wordText = w.word, meaning = w.meaning, phonetic = w.phonetic;
  const progress = (weakReviewState.current / total) * 100;
  weakReviewState.answered = false;
  let bodyHtml;
  if (r === 1) {
    const distractors = pickMeaningDistractors(meaning, VOCABULARY.map(x => x.meaning), 3);
    const options = shuffleArr([meaning, ...distractors]);
    weakReviewState.options = options; weakReviewState.answer = meaning;
    bodyHtml = `
      <div class="prompt">第 1 轮：看英文选中文释义</div>
      <div class="word-display" style="font-size:26px;">${wordText}</div>
      ${phonetic ? `<div class="phonetic-display">${phonetic}</div>` : ''}
      <div class="speech-controls" style="justify-content:center;margin-top:8px;">
        <button class="btn btn-speech" onclick="speakWord('${wordText.replace(/'/g, "\\'")}')">🔊 听发音</button>
      </div>
      <div class="test-options" id="weakReviewOptions">
        ${options.map((opt, i) => `<div class="test-option" onclick="answerWeakReview(${i})" data-idx="${i}">${String.fromCharCode(65 + i)}. ${escapeHtml(opt)}</div>`).join('')}
      </div>
      <div id="weakReviewFeedback"></div>`;
  } else {
    bodyHtml = `
      <div class="prompt">第 2 轮：看中文写英文拼写</div>
      <div class="word-display" style="font-size:22px;">${meaning}</div>
      <div class="speech-controls" style="justify-content:center;margin-top:8px;">
        <button class="btn btn-speech" onmousedown="event.preventDefault();" onclick="speakWord('${wordText.replace(/'/g, "\\'")}')">🔊 听发音</button>
      </div>
      <input id="weakReviewSpell" class="spell-input" style="margin-top:16px;" placeholder="在此输入英文单词..." onkeydown="if(event.key==='Enter')submitWeakReviewSpell()" autocomplete="off" />
      <div style="margin-top:12px;"><button class="btn btn-primary" onclick="submitWeakReviewSpell()">提交拼写</button></div>
      <div id="weakReviewFeedback"></div>`;
  }
  document.getElementById("page-words").innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <button class="btn btn-secondary btn-icon" onclick="exitWeakReview()">←</button>
        <span style="font-weight:600;">📒 生词本复习 · 第 ${r} 轮</span>
      </div>
      <div class="toolbar-right" style="font-size:14px;color:var(--text-secondary);">
        ${weakReviewState.current + 1} / ${total} · ✅${weakReviewState.correct} ❌${weakReviewState.wrong}
      </div>
    </div>
    <div class="test-container">
      <div class="test-progress">
        <span style="font-size:13px;color:var(--text-secondary);">进度</span>
        <div class="test-progress-bar"><div class="test-progress-fill" style="width:${progress}%;"></div></div>
      </div>
      <div class="test-question">${bodyHtml}</div>
    </div>`;
  if (r === 2) setTimeout(() => { const inp = document.getElementById('weakReviewSpell'); if (inp) inp.focus(); }, 200);
  setTimeout(() => activateWordTap("page-words"), 60);
}

function answerWeakReview(idx) {
  if (weakReviewState.answered) return;
  weakReviewState.answered = true;
  const selected = weakReviewState.options[idx];
  const isCorrect = selected === weakReviewState.answer;
  const w = weakReviewState.items[weakReviewState.current];
  if (isCorrect) weakReviewState.correct++; else weakReviewState.wrong++;
  if (!weakReviewState.roundResults[w.id]) weakReviewState.roundResults[w.id] = {};
  weakReviewState.roundResults[w.id].r1 = isCorrect;
  const options = document.querySelectorAll('#weakReviewOptions .test-option');
  options.forEach(o => o.classList.add('disabled'));
  if (isCorrect) { options[idx].classList.add('correct'); playCorrectSound(); }
  else { options[idx].classList.add('wrong'); const ci = weakReviewState.options.indexOf(weakReviewState.answer); if (ci >= 0) options[ci].classList.add('correct'); }
  const isLast = weakReviewState.current >= weakReviewState.items.length - 1;
  document.getElementById('weakReviewFeedback').innerHTML = `
    <div class="card" style="text-align:center;margin-top:16px;${isCorrect ? 'border:2px solid var(--success);' : 'border:2px solid var(--danger);'}">
      <div style="font-size:18px;font-weight:600;color:${isCorrect ? 'var(--success)' : 'var(--danger)'};">${isCorrect ? '✅ 正确！' : '❌ 错误'}</div>
      ${!isCorrect ? `<div style="margin-top:8px;"><b>${w.word}</b> — ${w.meaning}</div>` : ''}
      <button class="btn btn-primary" style="margin-top:12px;" onclick="nextWeakReview()">${isLast ? '进入第二遍 →' : '下一个 →'}</button>
    </div>`;
}

function submitWeakReviewSpell() {
  if (weakReviewState.answered) return;
  const inputVal = document.getElementById('weakReviewSpell').value.trim();
  if (!inputVal) { Utils.toast('请先输入英文单词', 'warning'); return; }
  weakReviewState.answered = true;
  const w = weakReviewState.itemsR2[weakReviewState.current];
  const correctWord = w.word;
  const isCorrect = inputVal.toLowerCase().replace(/[^a-z]/g, '') === correctWord.toLowerCase().replace(/[^a-z]/g, '');
  if (isCorrect) weakReviewState.correct++; else weakReviewState.wrong++;
  if (!weakReviewState.roundResults[w.id]) weakReviewState.roundResults[w.id] = {};
  weakReviewState.roundResults[w.id].r2 = isCorrect;
  if (isCorrect) playCorrectSound();
  const isLast = weakReviewState.current >= weakReviewState.itemsR2.length - 1;
  document.getElementById('weakReviewFeedback').innerHTML = `
    <div class="card" style="text-align:center;margin-top:16px;${isCorrect ? 'border:2px solid var(--success);' : 'border:2px solid var(--danger);'}">
      <div style="font-size:18px;font-weight:600;color:${isCorrect ? 'var(--success)' : 'var(--danger)'};">${isCorrect ? '✅ 拼写正确！' : '❌ 拼写错误'}</div>
      ${!isCorrect ? `<div style="margin-top:8px;"><b>${correctWord}</b> — ${w.meaning}</div>` : ''}
      <button class="btn btn-speech" onclick="speakWord('${correctWord.replace(/'/g, "\\'")}')" style="margin-top:8px;">🔊 听发音</button>
      <button class="btn btn-primary" style="margin-top:12px;margin-left:8px;" onclick="nextWeakReview()">${isLast ? '完成复习 →' : '下一个 →'}</button>
    </div>`;
}

function nextWeakReview() {
  weakReviewState.answered = false;
  weakReviewState.current++;
  if (weakReviewState.round === 1) {
    if (weakReviewState.current >= weakReviewState.items.length) { weakReviewState.round = 2; weakReviewState.current = 0; weakReviewState.answered = false; renderWeakReview(); }
    else renderWeakReview();
  } else {
    if (weakReviewState.current >= weakReviewState.itemsR2.length) {
      for (const w of weakReviewState.items) {
        const res = weakReviewState.roundResults[w.id] || {};
        if (res.r1 && res.r2) state.weakWords = (state.weakWords || []).filter(x => String(x) !== String(w.id));
      }
      Store.save();
      renderWeakReviewResult();
    } else renderWeakReview();
  }
}

function exitWeakReview() { weakReviewState.active = false; renderWeakBook(); }

function renderWeakReviewResult() {
  const total = weakReviewState.items.length;
  const correct = weakReviewState.correct;
  const totalQ = total * 2;
  const acc = totalQ ? Math.round((correct / totalQ) * 100) : 0;
  const cleared = Object.entries(weakReviewState.roundResults).filter(([k, v]) => v.r1 && v.r2).length;
  document.getElementById("page-words").innerHTML = `
    <div class="toolbar"><div class="toolbar-left"><h2 style="font-size:20px;">🎉 复习完成</h2></div></div>
    <div class="card" style="text-align:center;padding:36px;">
      <div style="font-size:52px;font-weight:700;color:${acc >= 80 ? 'var(--success)' : acc >= 60 ? 'var(--warning)' : 'var(--danger)'};">${acc}%</div>
      <div style="font-size:16px;margin-top:8px;">综合正确率（${total} 题 × 2 遍）</div>
      <div style="font-size:14px;color:var(--text-secondary);margin-top:6px;">✅ ${correct} 次 · ❌ ${weakReviewState.wrong} 次 · 📒 ${cleared} 个两遍都对，已移出生词本</div>
    </div>
    <div style="margin-top:22px;display:flex;gap:12px;flex-wrap:wrap;">
      <button class="btn btn-primary btn-lg" onclick="startWeakWordReview()">🔁 再复习一轮</button>
      <button class="btn btn-secondary btn-lg" onclick="exitWeakReview()">返回生词本</button>
    </div>`;
}

function removeWeakWord(id) {
  state.weakWords = (state.weakWords || []).filter(x => String(x) !== String(id));
  Store.save();
  renderWeakBook();
}

function toggleWeakWord(id) {
  const wid = String(id);
  const idx = (state.weakWords || []).indexOf(wid);
  if (idx >= 0) {
    state.weakWords.splice(idx, 1);
    Utils.toast("已移出生词本", "info");
  } else {
    state.weakWords.push(wid);
    // 加入生词本时，把该词复习日期提前到今天，使其优先混进全局复习几次
    const s = Utils.getWordStatus(id);
    if (s.level >= 1) s.nextReview = Utils.today();
    Utils.toast("已加入生词本，会优先混进复习几次", "warning");
  }
  Store.save();
  // 如果当前在生词本页面，刷新列表；否则刷新当前卡片按钮状态
  if (wordState.mode === 'weak') renderWeakBook();
  else {
    const btn = document.getElementById('weakToggleBtn');
    if (btn) btn.outerHTML = weakToggleHtml(id);
  }
}

function isWeakWord(id) { return (state.weakWords || []).includes(String(id)); }

// 主动将单词标记为已掌握，同时移出生词本/错题本待复习
function markWordMastered(id) {
  const s = Utils.getWordStatus(id);
  s.level = MASTERED_LEVEL;
  s.mastered = true;
  s.nextReview = Utils.dateOffset(MASTERED_RETURN_DAYS);
  s.lastReview = Utils.today();
  // 从生词本移除
  state.weakWords = (state.weakWords || []).filter(x => String(x) !== String(id));
  // 同步错题本中同 wordId 的未掌握记录
  state.errorBook.forEach(e => {
    if (e.wordId && String(e.wordId) === String(id) && !e.mastered) e.mastered = true;
  });
  Store.save();
  Utils.toast("已标记为掌握 ✅", "success");
  if (wordState.mode === 'weak') renderWeakBook();
  else if (wordState.mode === 'list') renderWordsMenu();
}

function weakToggleHtml(id) {
  const weak = isWeakWord(id);
  const label = weak ? '📒 已在生词本' : '📒 加入生词本';
  const cls = weak ? 'btn-light' : 'btn-secondary';
  return `<button id="weakToggleBtn" class="btn ${cls}" style="font-size:13px;padding:6px 12px;" onclick="toggleWeakWord(${id})">${label}</button>`;
}

// 持久化新词学习进度（断点续学）
function saveNewSession() {
  state.wordSession = {
    date: Utils.today(),
    q1: wordState.round1Queue.map(w => w.id),
    q2: wordState.round2Queue.map(w => w.id),
    q3: wordState.round3Queue.map(w => w.id),
    round: wordState.learnRound,
    newCorrect: wordState.newCorrect,
    newWrong: wordState.newWrong
  };
  Store.save();
}

function startNewWords() {
  // 游标制：已学(level>=1)的词永不重复；已作为新词出示过的词也不再重复，
  // 始终往后取「没学过也没见过」的新词，学完一批自动推进到下一批。
  wordState.phase = "learn"; wordState.learnRound = 1; wordState.newCorrect = 0; wordState.newWrong = 0;
  if (!state.newWordSeen) state.newWordSeen = [];
  let pool = VOCABULARY.filter(w => {
    const s = Utils.getWordStatus(w.id);
    return s.level === 0 && !state.newWordSeen.includes(w.id);
  }).sort((a, b) => (b.freq || 0) - (a.freq || 0));
  if (pool.length === 0) {
    // 所有未掌握词都「见过」一遍了：清空游标，给没掌握的词二次机会（已掌握的因 level>=1 自动排除）
    state.newWordSeen = [];
    pool = VOCABULARY.filter(w => Utils.getWordStatus(w.id).level === 0)
      .sort((a, b) => (b.freq || 0) - (a.freq || 0));
  }
  const cnt = Math.min(10, pool.length);
  wordState.round1Queue = shuffleArr(pool.slice(0, cnt));
  wordState.round2Queue = []; wordState.round3Queue = [];
  // 记录本批 id，避免同一批词被反复出示
  state.newWordSeen = state.newWordSeen.concat(wordState.round1Queue.map(w => w.id));
  Store.save();
  if (wordState.round1Queue.length === 0) { finishWordSession(); return; }
  loadNextLearnWord();
}

function loadNextLearnWord() {
  const queue = wordState.learnRound === 1 ? wordState.round1Queue : wordState.learnRound === 2 ? wordState.round2Queue : wordState.round3Queue;
  if (queue.length === 0) {
    if (wordState.learnRound === 1 && wordState.round2Queue.length > 0) { wordState.learnRound = 2; wordState.round2Queue = shuffleArr(wordState.round2Queue); loadNextLearnWord(); return; }
    if (wordState.learnRound === 2 && wordState.round3Queue.length > 0) { wordState.learnRound = 3; wordState.round3Queue = shuffleArr(wordState.round3Queue); loadNextLearnWord(); return; }
    Store.save(); finishWordSession(); return;
  }
  wordState.learnWordId = queue[0].id; renderLearnCard();
}

function renderLearnCard() {
  wordState.answered = false;
  const word = VOCABULARY.find(w => w.id === wordState.learnWordId);
  if (!word) { loadNextLearnWord(); return; }
  wordState.learnWord = word; const r = wordState.learnRound;
  if (r === 1 || r === 2) { const d = pickDistractorWords(word, 3); wordState.learnOptions = shuffleArr([word, ...d]); wordState.learnAnswer = word; }
  else { wordState.learnOptions = []; wordState.learnAnswer = word.word; }

  const q = r === 1 ? wordState.round1Queue : r === 2 ? wordState.round2Queue : wordState.round3Queue;
  const remain = q.length; const r1Total = (wordState.round1Queue && wordState.round1Queue.length) || 0;
  const r2Total = (wordState.round2Queue && wordState.round2Queue.length) || 0;
  const idxLabel = "第" + r + "轮 · 剩余 " + remain + " 词";
  const totalAll = (r >= 1 ? r1Total : 0) + (r >= 2 ? r2Total : 0) + (r >= 3 ? (wordState.round3Queue && wordState.round3Queue.length || 0) : 0);
  const progress = totalAll ? Math.min(100, Math.round(((totalAll - remain) / Math.max(1, totalAll)) * 100)) : 0;

  let body;
  const weakToggle = weakToggleHtml(word.id);
  const optionHtml = (opt, i) => '<div class="test-option" onclick="answerLearnRound(' + i + ')" data-idx="' + i + '" data-word="' + escapeHtml(opt.word) + '">' +
    '<span class="opt-letter">' + String.fromCharCode(65 + i) + '.</span>' +
    '<span class="opt-meaning">' + escapeHtml(opt.meaning) + '</span>' +
    '<span class="opt-word clickable" style="display:none;" onclick="event.stopPropagation(); showWordPopup(\'' + opt.word.replace(/'/g,"\\'") + '\', event)">' + opt.word + '</span>' +
  '</div>';

  if (r === 1) {
    body = weakToggle + '<div style="font-size:13px;color:var(--text-light);margin-bottom:4px;">第 1 轮 / 3 · 看英文选中文</div>' +
      '<div class="word-display" style="font-size:28px;">' + word.word + '</div>' +
      (word.phonetic ? '<div class="phonetic-display">' + escapeHtml(word.phonetic) + '</div>' : '') +
      '<div class="speech-controls" style="justify-content:center;margin-top:8px;"><button class="btn btn-speech" onclick="speakWord(\'' + word.word.replace(/'/g,"\\'") + '\')">🔊 听发音</button></div>' +
      '<div class="test-options" id="learnOptions" style="margin-top:16px;">' + wordState.learnOptions.map(optionHtml).join('') + '</div><div id="learnFeedback"></div>';
  } else if (r === 2) {
    const ex = getExample(word.word, word.meaning);
    const exampleHtml = ex && ex.en
      ? '<div class="example-card" style="text-align:left;margin-top:10px;"><div class="example-en">' + escapeHtml(ex.en) + '</div></div>'
      : '<div style="margin-top:10px;font-size:13px;color:var(--text-light);">（该词暂无现成例句，请根据释义判断）</div>';
    body = weakToggle + '<div style="font-size:13px;color:var(--text-light);margin-bottom:4px;">第 2 轮 / 3 · 看例句选中文</div>' +
      '<div class="word-display" style="font-size:24px;">' + word.word + '</div>' +
      '<div class="speech-controls" style="justify-content:center;margin-top:4px;"><button class="btn btn-speech" onclick="speakWord(\'' + word.word.replace(/'/g,"\\'") + '\')">🔊 听发音</button></div>' +
      exampleHtml +
      '<div class="test-options" id="learnOptions" style="margin-top:14px;">' + wordState.learnOptions.map(optionHtml).join('') + '</div><div id="learnFeedback"></div>';
  } else {
    const spellSenses = getWordSenses(word);
    const spellMeaning = spellSenses.length ? spellSenses.map(s => s.meaning).join('；') : (word.meaning || '');
    body = weakToggle + '<div style="font-size:13px;color:var(--text-light);margin-bottom:4px;">第 3 轮 / 3 · 看中文拼写</div>' +
      '<div class="word-display" style="font-size:24px;color:var(--primary);">' + escapeHtml(spellMeaning) + '</div>' +
      '<div class="speech-controls" style="justify-content:center;margin-top:10px;"><button class="btn btn-speech" onmousedown="event.preventDefault();" onclick="speakWord(\'' + word.word.replace(/'/g,"\\'") + '\')">🔊 听发音</button></div>' +
      '<input id="learnSpellInput" class="spell-input" style="margin-top:16px;" placeholder="输入英文单词..." onkeydown="if(event.key===\'Enter\')submitLearnSpell()" autocomplete="off" />' +
      '<div style="margin-top:12px;"><button class="btn btn-primary" onclick="submitLearnSpell()">提交拼写</button></div><div id="learnFeedback"></div>';
  }
  document.getElementById("page-words").innerHTML = '<div class="toolbar"><div class="toolbar-left"><button class="btn btn-secondary btn-icon" onclick="exitWordSession()">←</button>' +
    '<span class="phase-badge learning">📝 新词 · 第 ' + r + ' 轮</span></div>' +
    '<div class="toolbar-right" style="font-size:14px;color:var(--text-secondary);">' + idxLabel + '</div></div>' +
    '<div class="test-container"><div class="test-progress"><span style="font-size:13px;color:var(--text-secondary);">新词进度</span>' +
    '<div class="test-progress-bar"><div class="test-progress-fill" style="width:' + progress + '%;"></div></div></div>' +
    '<div class="test-question" style="text-align:center;">' + body + '</div></div>';
  if (r === 3) setTimeout(() => { const inp = document.getElementById('learnSpellInput'); if (inp) inp.focus(); }, 200);
  setTimeout(() => activateWordTap("page-words"), 60);
  // 自动朗读单词发音（低延迟、用默认语速）
  // 看中文拼写轮（r===3）和复习第2步不再自动朗读，避免用户一听就会写；
  // 保留"听发音"按钮让用户手动播放。
  if (r !== 3) setTimeout(() => playTextAudio(word.word), 100);
}

function answerLearnRound(idx) {
  if (wordState.answered) return; wordState.answered = true;
  const selected = wordState.learnOptions[idx]; const isCorrect = selected === wordState.learnAnswer; const word = wordState.learnWord;
  const options = document.querySelectorAll('#learnOptions .test-option');
  options.forEach(o => {
    o.classList.add('disabled', 'revealed');
    const ow = o.querySelector('.opt-word');
    if (ow) ow.style.display = 'inline-block';
  });
  if (isCorrect) { options[idx].classList.add('correct'); playCorrectSound(); } else { options[idx].classList.add('wrong'); const ci = wordState.learnOptions.findIndex(o => o === wordState.learnAnswer); if (ci >= 0) options[ci].classList.add('correct'); }
  const fb = document.getElementById('learnFeedback');
  if (isCorrect) {
    fb.innerHTML = '<div class="card" style="text-align:center;margin-top:16px;border:2px solid var(--success);">' +
      '<div style="font-size:18px;font-weight:600;color:var(--success);">✅ 正确</div>' +
      '<div style="margin-top:6px;font-size:14px;color:var(--text-secondary);">点击选项右侧英文单词可查看短语例句</div></div>' +
      '<div style="margin-top:14px;text-align:center;"><button class="btn btn-primary" onclick="learnFeedbackAction(\'correct\')">下一题 →</button></div>';
    setTimeout(() => fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  } else {
    fb.innerHTML = '<div class="card" style="text-align:center;margin-top:16px;border:2px solid var(--danger);">' +
      '<div style="font-size:18px;font-weight:600;color:var(--danger);">❌ 错误</div>' +
      '<div style="margin-top:6px;font-size:14px;color:var(--text-secondary);">点击选项右侧英文单词可查看详解，然后选择认识程度：</div></div>' +
      '<div class="speech-controls" style="justify-content:center;gap:12px;margin-top:14px;"><button class="btn btn-warning" onclick="learnFeedbackAction(\'blur\')">⚠️ 模糊</button>' +
      '<button class="btn btn-danger" onclick="learnFeedbackAction(\'wrong\')">❌ 不会</button></div>';
    setTimeout(() => fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }
}

function submitLearnSpell() {
  if (wordState.answered) return; const inputVal = document.getElementById('learnSpellInput').value.trim();
  if (!inputVal) { Utils.toast('请先输入英文单词', 'warning'); return; } wordState.answered = true;
  const word = wordState.learnWord;
  const isCorrect = inputVal.toLowerCase().replace(/[^a-z]/g, '') === word.word.toLowerCase().replace(/[^a-z]/g, '');
  const fb = document.getElementById('learnFeedback');
  const detailCard = '<div class="card" style="text-align:left;margin-top:10px;border:2px solid ' + (isCorrect ? 'var(--success)' : 'var(--danger)') + ';">' +
    '<div style="font-size:18px;font-weight:600;">' + word.word + (word.phonetic ? ' <span style="font-size:14px;color:var(--text-secondary);font-weight:400;">' + escapeHtml(word.phonetic) + '</span>' : '') + '</div>' +
    '<div style="margin-top:4px;">' + renderSensesHtml(getWordSenses(word)) + '</div>' +
  '</div>';
  if (isCorrect) {
    playCorrectSound();
    fb.innerHTML = '<div class="card" style="text-align:center;margin-top:16px;border:2px solid var(--success);">' +
      '<div style="font-size:18px;font-weight:600;color:var(--success);">✅ 拼写正确</div>' +
      '<div style="margin-top:6px;font-size:14px;color:var(--text-secondary);">详情如下，1.5 秒后自动进入下一轮…</div></div>' + detailCard;
    setTimeout(() => { if (wordState.answered) advanceSpellWord(); }, 1500);
  } else {
    fb.innerHTML = '<div class="card" style="text-align:center;margin-top:16px;border:2px solid var(--danger);">' +
      '<div style="font-size:18px;font-weight:600;color:var(--danger);">❌ 拼写错误</div>' +
      '<div style="margin-top:6px;font-size:14px;color:var(--text-secondary);">查看单词详解，然后选择认识程度：</div></div>' + detailCard +
      '<div class="speech-controls" style="justify-content:center;gap:12px;margin-top:12px;"><button class="btn btn-warning" onclick="learnFeedbackAction(\'blur\')">⚠️ 模糊</button>' +
      '<button class="btn btn-danger" onclick="learnFeedbackAction(\'wrong\')">❌ 不会</button></div>';
    setTimeout(() => fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }
}

// 第 3 轮（看中文拼写）答对后原地推进到下一个单词：
// 仅更新卡片中的动态内容，不重建输入框，避免 iOS 键盘反复收起/弹出。
function advanceSpellWord() {
  if (wordState.learnRound !== 3) { learnFeedbackAction('correct'); return; }
  const queue = wordState.round3Queue;
  const prevLen = queue.length;
  const curId = wordState.learnWord && wordState.learnWord.id;
  const idx = queue.findIndex(w => w.id === curId);
  if (idx >= 0) queue.splice(idx, 1);
  // 三轮全部通过，这个单词才算真正学完
  if (curId) {
    recordStudy(1, curId);
    const s = Utils.getWordStatus(curId);
    s.level = 1; s.lastReview = Utils.today(); s.nextReview = Utils.dateOffset(1);
  }
  wordState.newCorrect++;
  saveNewSession();

  if (queue.length === 0) { Store.save(); finishWordSession(); return; }

  const nextWord = queue[0];
  wordState.learnWordId = nextWord.id;
  wordState.learnWord = nextWord;
  wordState.answered = false;

  // 原地更新：释义、工具栏剩余数量、进度条、听发音、生词本按钮
  const senses = getWordSenses(nextWord);
  const spellMeaning = senses.length ? senses.map(s => s.meaning).join('；') : (nextWord.meaning || '');
  const displayEl = document.querySelector('#page-words .word-display');
  if (displayEl) displayEl.textContent = spellMeaning;

  const speakBtn = document.querySelector('#page-words .btn-speech');
  if (speakBtn) speakBtn.setAttribute('onclick', "speakWord('" + nextWord.word.replace(/'/g, "\\'") + "')");

  const weakBtn = document.getElementById('weakToggleBtn');
  if (weakBtn) {
    const weak = isWeakWord(nextWord.id);
    weakBtn.className = 'btn ' + (weak ? 'btn-light' : 'btn-secondary');
    weakBtn.textContent = weak ? '📒 已在生词本' : '📒 加入生词本';
    weakBtn.setAttribute('onclick', 'toggleWeakWord(' + nextWord.id + ')');
  }

  const remain = queue.length;
  const idxLabelEl = document.querySelector('#page-words .toolbar-right');
  if (idxLabelEl) idxLabelEl.textContent = '第 3 轮 · 剩余 ' + remain + ' 词';

  const progress = prevLen ? Math.min(100, Math.round(((prevLen - remain) / prevLen) * 100)) : 0;
  const fillEl = document.querySelector('#page-words .test-progress-fill');
  if (fillEl) fillEl.style.width = progress + '%';

  const fb = document.getElementById('learnFeedback');
  if (fb) fb.innerHTML = '';

  const inp = document.getElementById('learnSpellInput');
  if (inp) { inp.value = ''; inp.focus(); }
  setTimeout(() => activateWordTap("page-words"), 60);
}

function learnFeedbackAction(result) {
  const word = wordState.learnWord; if (!word) return;
  const queue = wordState.learnRound === 1 ? wordState.round1Queue : wordState.learnRound === 2 ? wordState.round2Queue : wordState.round3Queue;
  const idx = queue.findIndex(w => w.id === word.id);
  if (idx >= 0) queue.splice(idx, 1);
  if (result === 'wrong') {
    wordState.round1Queue.push(word);
  } else if (result === 'blur') {
    queue.push(word);
  } else {
    if (wordState.learnRound === 1) wordState.round2Queue.push(word);
    else if (wordState.learnRound === 2) wordState.round3Queue.push(word);
    else {
      // 三轮全部通过，这个单词才算真正学完，计入今日背词进度
      recordStudy(1, word.id);
      // 标记为已学（level=1），次日才进入复习队列（当天不再重复见到）
      const s = Utils.getWordStatus(word.id);
      s.level = 1;
      s.lastReview = Utils.today();
      s.nextReview = Utils.dateOffset(1);
      wordState.newCorrect++;
    }
  }
  saveNewSession();
  loadNextLearnWord();
}
function advanceLearnWord() {}

function finishWordSession() {
  state.wordSession = null; state.reviewSession = null; Store.save();
  document.getElementById("page-words").innerHTML = '<div class="toolbar"><div class="toolbar-left"><h2 style="font-size:20px;">🎉 今日学习完成</h2></div></div>' +
    '<div class="card" style="text-align:center;padding:36px;"><div style="font-size:48px;">📚</div>' +
    '<div style="margin-top:12px;font-size:16px;">复习：✅ ' + wordState.reviewCorrect + ' · ❌ ' + wordState.reviewWrong + '</div>' +
    '<div style="margin-top:8px;font-size:16px;">新词：✅ ' + wordState.newCorrect + ' · ❌ ' + wordState.newWrong + '</div></div>' +
    '<div style="margin-top:22px;"><button class="btn btn-primary btn-lg" onclick="renderWords()">返回学习页面</button></div>';
  wordState.phase = "idle";
}

function exitWordSession() { wordState.phase = "idle"; wordState.mode = "menu"; renderWords(); }

// 旧函数兼容桩
function startDailyStudy() { startWordSession(); }
function renderDailyStudy() { if (wordState.phase === "review") renderReviewCard(); else renderLearnCard(); }
function prepareCardQuestion() {}
function finishDailyStudy() {}
function nextCard() {}
function prevCardContent() {}
function renderRound1Card(card) {}
function renderRound2Card(card) {}
function renderRound3Card(card) {}
function answerRound1(i) {}
function answerRound2(i) {}
function answerRound3() {}
function exitDailyStudy() { exitWordSession(); }
function tagWordFamiliar(id, familiar) {}
function clearDailyAutoNext() {}
function getNewWords(count) {}
function getReviewWords(count, excludeIds) {}
function updateWordStatusAfterTest(wordId, isCorrect) {
  const status = Utils.getWordStatus(wordId);
  if (isCorrect) {
    status.correct++;
    if (status.level < 3) status.level = Math.min(3, status.level + 1);
  } else {
    status.wrong++;
    if (status.level > 0) status.level = Math.max(0, status.level - 1);
  }
  status.lastReview = Utils.today();
  Store.save();
}

function exitTest() {
  testData.active = false;
  wordState.mode = "menu";
  wordState.filter = "all";
  renderWordsMenu();
}

function renderTestResult() {
  testData.active = false;
  const total = testData.questions.length;
  const accuracy = total > 0 ? Math.round((testData.correct / total) * 100) : 0;

  recordTest(testData.correct, testData.wrong);

  let grade = "加油！";
  let gradeColor = "var(--danger)";
  if (accuracy >= 90) { grade = "优秀！🎉"; gradeColor = "var(--success)"; }
  else if (accuracy >= 70) { grade = "不错！👍"; gradeColor = "var(--primary)"; }
  else if (accuracy >= 50) { grade = "继续努力！💪"; gradeColor = "var(--warning)"; }

  document.getElementById("page-words").innerHTML = `
    <div class="test-container">
      <div class="card" style="text-align:center;padding:48px;">
        <div style="font-size:48px;margin-bottom:16px;">${accuracy >= 70 ? '🏆' : '📚'}</div>
        <h2 style="font-size:28px;color:${gradeColor};margin-bottom:8px;">${grade}</h2>
        <div style="font-size:64px;font-weight:800;color:${gradeColor};margin:16px 0;">${accuracy}%</div>
        <div style="font-size:16px;color:var(--text-secondary);margin-bottom:24px;">
          答对 ${testData.correct} 题 · 答错 ${testData.wrong} 题 · 共 ${total} 题
        </div>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
          <button class="btn btn-primary btn-lg" onclick="startTest('${testData.type}')">再来一次</button>
          <button class="btn btn-secondary btn-lg" onclick="exitTest()">返回单词页</button>
          <button class="btn btn-secondary btn-lg" onclick="navigate('errors')">查看错题本</button>
        </div>
      </div>
    </div>
  `;
}

// ===== 错题本记录 =====
function addError(word, type, userAnswer, correctAnswer) {
  const today = Utils.today();
  // 合并同词+同类型的错误：避免重复展示，增加计数器
  const existing = state.errorBook.find(e =>
    e.wordId === word.id && e.type === type && !e.mastered
  );
  if (existing) {
    existing.wrongCount = (existing.wrongCount || 1) + 1;
    existing.date = today; // 更新最近出错日期
    existing.userAnswer = userAnswer;
    existing.correctAnswer = correctAnswer;
    Store.save();
    return;
  }

  state.errorBook.push({
    wordId: word.id,
    word: word.word,
    phonetic: word.phonetic,
    meaning: word.meaning,
    type: type,
    userAnswer: userAnswer,
    correctAnswer: correctAnswer,
    date: today,
    mastered: false,
    wrongCount: 1,
  });
  Store.save();
}

// ==========================================
// 句子翻译模块
// ==========================================
let sentenceState = {
  filter: "all",
  practiceMode: false,
  currentId: null,
};

function renderSentences() {
  sentenceState.practiceMode = false;
  renderSentenceList();
}

function renderSentenceList() {
  let filter = sentenceState.filter;

  let tabsHtml = `<div class="filter-tab ${filter === 'all' ? 'active' : ''}" onclick="filterSentences('all')">全部</div>`;
  Object.entries(SENTENCE_TYPES).forEach(([key, label]) => {
    tabsHtml += `<div class="filter-tab ${filter === key ? 'active' : ''}" onclick="filterSentences('${key}')">${label}</div>`;
  });

  let sentences = SENTENCES;
  if (filter !== "all") sentences = sentences.filter(s => s.type === filter);

  let listHtml = "";
  sentences.forEach(s => {
    const status = Utils.getSentenceStatus(s.id);
    const enEscaped = s.en.replace(/'/g, "\\'");
    listHtml += `
      <div class="sentence-card">
        <span class="sentence-type-badge ${s.type}">${SENTENCE_TYPES[s.type]}</span>
        <div class="sentence-en">${s.en}</div>
        <div class="sentence-cn">${s.cn}</div>
        <div class="speech-controls" style="margin-top:12px;">
          <button class="btn btn-speech" onclick="speakWord('${enEscaped}')">🔊 朗读</button>
        </div>
        <div id="speechResultSen_${s.id}" style="margin-top:8px;"></div>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button class="btn btn-primary" onclick="startSentencePractice(${s.id})">📝 练习翻译</button>
          <span class="word-status ${Utils.statusClass(status.level)}" style="margin-left:auto;">${Utils.statusLabel(status.level)}</span>
        </div>
      </div>
    `;
  });

  document.getElementById("page-sentences").innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <h2 style="font-size:20px;">🔄 句子翻译</h2>
      </div>
    </div>
    <p style="color:var(--text-secondary);margin-bottom:20px;font-size:14px;">
      共 ${SENTENCES.length} 个四级常考句子，涵盖写作、阅读、翻译等场景。点击「练习翻译」开始中英互译。
    </p>
    <div class="filter-tabs">${tabsHtml}</div>
    ${listHtml}
  `;
}

function filterSentences(type) {
  sentenceState.filter = type;
  renderSentenceList();
}

function startSentencePractice(id) {
  sentenceState.practiceMode = true;
  sentenceState.currentId = id;
  renderSentencePractice();
}

function renderSentencePractice() {
  const s = SENTENCES.find(x => x.id === sentenceState.currentId);
  if (!s) return;

  document.getElementById("page-sentences").innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <button class="btn btn-secondary btn-icon" onclick="exitSentencePractice()">←</button>
        <span style="font-weight:600;">翻译练习</span>
      </div>
      <div class="toolbar-right">
        <span class="sentence-type-badge ${s.type}">${SENTENCE_TYPES[s.type]}</span>
      </div>
    </div>

    <div class="sentence-card">
      <div class="prompt" style="font-size:14px;color:var(--text-secondary);margin-bottom:8px;">请将以下中文翻译成英文：</div>
      <div class="sentence-en" style="font-size:20px;">${s.cn}</div>

      <div class="translation-area">
        <textarea id="translationInput" placeholder="在此输入你的英文翻译..." autocomplete="off"></textarea>
        <div style="margin-top:12px;display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="checkTranslation(${s.id})">提交翻译</button>
          <button class="btn btn-secondary" onclick="showReference(${s.id})">查看参考译文</button>
        </div>
        <div class="translation-result" id="translationResult"></div>
      </div>
    </div>
  `;
}

function checkTranslation(id) {
  const s = SENTENCES.find(x => x.id === id);
  const input = document.getElementById("translationInput");
  const result = document.getElementById("translationResult");
  const userTrans = input.value.trim();

  if (!userTrans) {
    Utils.toast("请先输入翻译内容", "warning");
    return;
  }

  // 简单评估：检查关键词匹配度
  const keywords = s.en.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  const userWords = userTrans.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  const matched = keywords.filter(k => userWords.includes(k));
  const matchPct = keywords.length > 0 ? Math.round((matched.length / keywords.length) * 100) : 0;

  const status = Utils.getSentenceStatus(id);
  let isCorrect = matchPct >= 60;

  if (isCorrect) {
    status.correct++;
    if (status.level < 3) status.level++;
  } else {
    status.wrong++;
    if (status.level > 0) status.level = Math.max(0, status.level - 1);
    // 加入错题本
    addError({ id: s.id, word: s.en.substring(0, 30) + "...", phonetic: "", meaning: s.cn },
      "sentence", userTrans, s.en);
  }
  status.lastReview = Utils.today();
  Store.save();

  // 记录每日句子完成数
  if (!state.sentenceDaily) state.sentenceDaily = {};
  const today = Utils.today();
  state.sentenceDaily[today] = (state.sentenceDaily[today] || 0) + 1;
  Store.save();

  result.className = `translation-result show ${isCorrect ? 'correct' : 'wrong'}`;
  const enEscaped = s.en.replace(/'/g, "\\'");
  result.innerHTML = `
    <div style="font-weight:600;margin-bottom:8px;">
      ${isCorrect ? '✅ 翻译不错！' : '❌ 还需改进'}
    </div>
    <div style="font-size:14px;margin-bottom:6px;">关键词匹配度：${matchPct}%</div>
    <div style="font-size:14px;margin-bottom:4px;"><strong>参考译文：</strong></div>
    <div style="font-size:15px;color:var(--text);">${s.en}</div>
    <div class="speech-controls" style="margin-top:12px;">
      <button class="btn btn-speech" onclick="speakWord('${enEscaped}')">🔊 朗读</button>
    </div>
    <div id="speechResultSenPractice" style="margin-top:8px;"></div>
    <div style="margin-top:12px;">
      <button class="btn btn-primary" onclick="nextSentence(${id})">下一个句子 →</button>
      <button class="btn btn-secondary" onclick="exitSentencePractice()">返回列表</button>
    </div>
  `;

  // 自动朗读参考译文
  setTimeout(() => playTextAudio(s.en, { rate: 0.85 }), 300);
}

function showReference(id) {
  const s = SENTENCES.find(x => x.id === id);
  const result = document.getElementById("translationResult");
  const enEscaped = s.en.replace(/'/g, "\\'");
  result.className = "translation-result show";
  result.style.background = "var(--info-bg)";
  result.style.border = "1px solid var(--info)";
  result.innerHTML = `
    <div style="font-weight:600;margin-bottom:8px;color:var(--info);">📋 参考译文</div>
    <div style="font-size:15px;">${s.en}</div>
    <div class="speech-controls" style="margin-top:12px;">
      <button class="btn btn-speech" onclick="speakWord('${enEscaped}')">🔊 朗读</button>
    </div>
    <div id="speechResultSenPractice" style="margin-top:8px;"></div>
  `;

  // 自动朗读
  setTimeout(() => playTextAudio(s.en, { rate: 0.85 }), 300);
}

function nextSentence(id) {
  const idx = SENTENCES.findIndex(s => s.id === id);
  const next = SENTENCES[(idx + 1) % SENTENCES.length];
  sentenceState.currentId = next.id;
  renderSentencePractice();
}

function exitSentencePractice() {
  sentenceState.practiceMode = false;
  renderSentenceList();
}

// ==========================================
// 热点新闻模块
// ==========================================
let newsFilter = "all";
let newsView = "all"; // all | bookmarked

function renderNews() {
  const allNews = getNews();
  const newsReadIds = getNewsReadIds();
  const readCount = newsReadIds.length;
  const bmIds = state.news.bookmarked;
  const bmCount = bmIds.length;

  // 今日重点：锚定「锁定的重点 id 列表」，不随 news.json 重跑变化
  const importantIds = getTodayImportantIds();
  const importantIdSet = new Set(importantIds);
  const importantDone = importantIds.filter(id => newsReadIds.includes(id)).length;
  // 按锁定顺序还原新闻对象（只还原新闻里还存在的；缺失的用占位卡保证进度可见）
  const importantNews = importantIds.map(id => {
    const found = allNews.find(n => n.id === id);
    return found || { id, missing: true, title: "（该重点新闻已更新，点此补标记）", cat: "domestic", date: currentNewsDate(), summary: "", source: "" };
  });

  // 渲染单条新闻卡片（右上角不显示星标，避免与下方「收藏」按钮重复）
  const renderCard = (n) => {
    const isRead = newsReadIds.includes(n.id);
    const isBm = bmIds.includes(n.id);
    const isImportant = importantIdSet.has(n.id);
    if (n.missing) {
      return `
      <div class="news-card ${isRead ? 'read' : ''} ${isImportant ? 'important' : ''}">
        <div class="news-title">${escapeHtml(n.title)}</div>
        <div class="news-bottom">
          <div style="display:flex;align-items:center;gap:8px;margin-left:auto;">
            <button class="btn btn-xs ${isRead ? 'btn-ghost' : 'btn-secondary'}" onclick="event.stopPropagation();markNewsRead('${n.id}')">${isRead ? '✓ 已读' : '标记已读'}</button>
          </div>
        </div>
      </div>`;
    }
    return `
      <div class="news-card ${isRead ? 'read' : ''} ${isImportant ? 'important' : ''}">
        <div class="news-top">
          <span class="news-cat ${n.cat}">${NEWS_CATEGORIES[n.cat]}</span>
          <span class="news-date">${n.date}</span>
        </div>
        <div class="news-title">${n.title}</div>
        ${(n.summary && n.summary.trim() && n.summary.trim() !== n.title.trim()) ? `<div class="news-summary">${n.summary}</div>` : ''}
        <div class="news-bottom">
          <span class="news-source">📰 ${n.source}</span>
          <div style="display:flex;align-items:center;gap:8px;margin-left:auto;">
            <button class="btn btn-xs ${isRead ? 'btn-ghost' : 'btn-secondary'}" onclick="event.stopPropagation();markNewsRead('${n.id}')">${isRead ? '✓ 已读' : '标记已读'}</button>
            <button class="btn btn-xs ${isBm ? 'btn-primary' : 'btn-secondary'}" onclick="event.stopPropagation();toggleNewsBookmark('${n.id}')">${isBm ? '⭐ 已收藏' : '☆ 收藏'}</button>
          </div>
        </div>
      </div>
    `;
  };

  // ===== 我的收藏视图 =====
  if (newsView === "bookmarked") {
    const bmList = allNews.filter(n => bmIds.includes(n.id));
    const cards = bmList.length
      ? bmList.map(n => renderCard(n)).join("")
      : `<div class="error-empty"><div class="icon">⭐</div><div style="font-size:16px;font-weight:600;">还没有收藏</div><div style="font-size:14px;margin-top:4px;">点新闻卡片右下角的「☆ 收藏」，喜欢的新闻就会存到这里</div></div>`;
    document.getElementById("page-news").innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <button class="btn btn-xs btn-ghost" onclick="viewAllNews()">← 返回全部</button>
          <h2 style="font-size:20px;">⭐ 我的收藏</h2>
        </div>
        <div class="toolbar-right">
          <span style="font-size:13px;color:var(--text-secondary);">共 ${bmCount} 条</span>
        </div>
      </div>
      <div class="news-list">${cards}</div>
    `;
    return;
  }

  // ===== 全部视图：今日重点在前 + 其余纵向排列 =====
  const restList = allNews.filter(n => !importantIdSet.has(n.id));
  const importantSection = importantNews.length ? `
    <div class="news-important-section">
      <div class="news-important-title">⭐ 今日重点 · ${importantDone}/${importantNews.length} 已完成</div>
      ${importantNews.map(n => renderCard(n)).join("")}
    </div>
    <div class="news-all-divider">全部新闻</div>
  ` : "";
  const listHtml = restList.map(n => renderCard(n)).join("");

  document.getElementById("page-news").innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <h2 style="font-size:20px;">📰 热点新闻</h2>
      </div>
      <div class="toolbar-right">
        <span class="news-bm-link" onclick="viewBookmarkedNews()" title="查看我收藏的新闻">已读 ${readCount}/${allNews.length} · ⭐ 收藏 ${bmCount}</span>
      </div>
    </div>

    <div class="news-hero">
      <div style="font-size:14px;opacity:.9;">${allNews[0] ? allNews[0].date : ''} 更新 · 共 ${allNews.length} 条热点 · 今日重点 ${importantDone}/${importantNews.length}</div>
    </div>

    ${importantSection}

    <div class="news-list">${listHtml}</div>
  `;
}

function viewBookmarkedNews() { newsView = "bookmarked"; renderNews(); }
function viewAllNews() { newsView = "all"; renderNews(); }

function filterNews(cat) {
  newsFilter = cat;
  renderNews();
}

function markNewsRead(id) {
  const d = currentNewsDate();
  if (!state.news.readByDate[d]) state.news.readByDate[d] = [];
  if (!state.news.readByDate[d].includes(id)) {
    state.news.readByDate[d].push(id);
    Store.save();
  }
  renderNews();
}

function toggleNewsBookmark(id) {
  const i = state.news.bookmarked.indexOf(id);
  if (i >= 0) state.news.bookmarked.splice(i, 1);
  else state.news.bookmarked.push(id);
  Store.save();
  renderNews();
}

function toggleNewsImportant(id) {
  const i = state.news.important.indexOf(id);
  if (i >= 0) state.news.important.splice(i, 1);
  else {
    if (state.news.important.length >= 5) {
      Utils.toast("重点最多设 5 个，先取消一个吧", "warning");
      return;
    }
    state.news.important.push(id);
  }
  Store.save();
  renderNews();
}

// ==========================================
// 读书笔记模块
// ==========================================
let readingFilter = "all"; // all | reading | finished

function getTodayReadingPages() {
  const today = Utils.today();
  return state.reading.log
    .filter(l => l.date === today)
    .reduce((sum, l) => sum + (l.pages || 0), 0);
}

function renderReading() {
  const goal = state.reading.goalPages;
  const todayPages = getTodayReadingPages();
  const pct = Math.min(100, Math.round((todayPages / goal) * 100));
  const done = todayPages >= goal;

  let books = state.reading.books;
  if (readingFilter === "reading") books = books.filter(b => b.currentPage < b.totalPages);
  if (readingFilter === "finished") books = books.filter(b => b.currentPage >= b.totalPages);

  const bookHtml = books.length ? books.map(b => {
    const hasPages = b.totalPages > 0;
    const bp = hasPages ? Math.min(100, Math.round((b.currentPage / b.totalPages) * 100)) : 0;
    const noteCount = (b.notes || []).length;
    return `
      <div class="book-card">
        <div class="book-cover">${b.title.slice(0, 1)}</div>
        <div class="book-info">
          <div class="book-title">${b.title}</div>
          <div class="book-author">${b.author || "佚名"}</div>
          ${hasPages
            ? `<div class="book-progress-text">${b.currentPage} / ${b.totalPages} 页</div>
               <div class="book-bar"><div class="book-bar-fill" style="width:${bp}%;"></div></div>`
            : `<div class="book-progress-text">📝 ${noteCount} 条笔记</div>`}
        </div>
        <div class="book-actions">
          <button class="btn btn-primary btn-sm" onclick="openBookDetail(${b.id})">📝 记笔记</button>
          <button class="btn btn-xs btn-ghost" onclick="deleteBook(${b.id})">删除</button>
        </div>
      </div>
    `;
  }).join("") : `<div class="error-empty"><div class="icon">📒</div><div style="font-size:16px;font-weight:600;">还没有书</div><div style="font-size:14px;margin-top:4px;">点击右上角「＋ 添加书籍」开始记录</div></div>`;

  // 最近阅读记录
  const recent = [...state.reading.log].reverse().slice(0, 8);
  const logHtml = recent.length ? recent.map(l => {
    const book = state.reading.books.find(b => b.id === l.bookId);
    return `
      <div class="read-log-item">
        <div class="read-log-date">${l.date}</div>
        <div class="read-log-main">
          <div class="read-log-book">${book ? book.title : "已删书籍"} · +${l.pages} 页</div>
          ${l.note ? `<div class="read-log-note">📝 ${l.note}</div>` : ''}
        </div>
      </div>
    `;
  }).join("") : `<div style="font-size:14px;color:var(--text-light);padding:12px 0;">还没有阅读记录</div>`;

  document.getElementById("page-reading").innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <h2 style="font-size:20px;">📒 阅读笔记</h2>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-primary btn-sm" onclick="addBook()">＋ 添加书籍</button>
      </div>
    </div>

    <div class="reading-goal-card ${done ? 'done' : ''}">
      <div class="rg-left">
        <div class="rg-num">${todayPages}<span style="font-size:14px;color:var(--text-secondary);">/${goal} 页</span></div>
        <div class="rg-label">今日已读 ${done ? '🎉 达标！' : '继续加油'}</div>
      </div>
      <div class="rg-right">
        <div class="rg-bar"><div class="rg-bar-fill" style="width:${pct}%;"></div></div>
        <div style="font-size:13px;color:var(--text-secondary);margin-top:8px;">连续读书 ${state.reading.streak} 天 · 书架共 ${state.reading.books.length} 本</div>
      </div>
    </div>

    <div class="filter-tabs">
      <div class="filter-tab ${readingFilter === 'all' ? 'active' : ''}" onclick="filterReading('all')">全部</div>
      <div class="filter-tab ${readingFilter === 'reading' ? 'active' : ''}" onclick="filterReading('reading')">在读</div>
      <div class="filter-tab ${readingFilter === 'finished' ? 'active' : ''}" onclick="filterReading('finished')">已读完</div>
    </div>

    <div class="book-list">${bookHtml}</div>

    <h3 style="font-size:16px;margin:24px 0 12px;color:var(--text-secondary);">📝 最近阅读记录</h3>
    <div class="read-log">${logHtml}</div>
  `;
}

function filterReading(f) {
  readingFilter = f;
  renderReading();
}

// ===== 通用页内弹窗（替代原生 prompt/confirm，避免 iframe 预览中被拦截）=====
function openModal(title, bodyHtml, actionsHtml, extraClass) {
  const root = document.getElementById("modalRoot");
  if (!root) return;
  root.innerHTML = `
    <div class="modal-card${extraClass ? " " + extraClass : ""}">
      <div class="modal-title">${title}</div>
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-actions">${actionsHtml}</div>
    </div>`;
  root.classList.add("show");
  // 点击遮罩关闭
  root.onclick = (e) => { if (e.target === root) closeModal(); };
}
function closeModal() {
  const root = document.getElementById("modalRoot");
  if (!root) return;
  root.classList.remove("show");
  root.innerHTML = "";
  root.onclick = null;
}

// 添加书籍（页内表单：书名 + 作者 + 可选总页数，进入后再记笔记）
function addBook() {
  const body = `
    <label class="modal-label">书名 *</label>
    <input class="modal-input" id="bkTitle" placeholder="你正在读什么书？如：活着 / 人间值得" />
    <label class="modal-label">作者（可留空）</label>
    <input class="modal-input" id="bkAuthor" placeholder="例如：余华" />
    <label class="modal-label">总页数（可留空；填了可看阅读进度）</label>
    <input class="modal-input" id="bkPages" type="number" min="1" placeholder="如 320" style="max-width:140px;" />
    <div style="font-size:12px;color:var(--text-light);margin-top:8px;line-height:1.6;">
      添加后点进书即可记笔记、记每天读了几页。不用上传文件。
    </div>`;
  const actions = `
    <button class="btn btn-secondary" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="submitAddBook()">添加</button>`;
  openModal("＋ 添加书籍", body, actions, "addbook-modal");
  setTimeout(() => { const t = document.getElementById("bkTitle"); if (t) t.focus(); }, 60);
}

// 维基文库（公版书）搜索 + 取全文（best-effort，依赖浏览器联网）
async function searchWikisource() {
  const q = (document.getElementById("wsQuery").value || "").trim();
  const box = document.getElementById("wsResults");
  if (!q) { Utils.toast("请输入书名", "warning"); return; }
  box.innerHTML = '<div class="ws-loading">搜索中…</div>';
  const url = "https://zh.wikisource.org/w/api.php?action=query&list=search&srsearch=" + encodeURIComponent(q) + "&srlimit=8&format=json&origin=*";
  try {
    const res = await fetch(url, { headers: { "User-Agent": "WorkBuddy/1.0" } });
    const data = await res.json();
    const list = (data.query && data.query.search) || [];
    if (!list.length) { box.innerHTML = '<div class="ws-loading">没搜到，换个词试试，或用手动上传。</div>'; return; }
    box.innerHTML = list.map(r => {
      const t = r.title;
      return `<div class="ws-result"><span class="ws-result-title">${escapeHtml(t)}</span><button class="btn btn-xs btn-primary" onclick="pickWikisource('${t.replace(/'/g, "\\'")}')">选用并取全文</button></div>`;
    }).join("");
  } catch (e) {
    box.innerHTML = '<div class="ws-loading">搜索失败（需联网）。请检查网络，或直接上传 .txt。</div>';
  }
}

async function pickWikisource(title) {
  const box = document.getElementById("wsResults");
  box.innerHTML = '<div class="ws-loading">正在取《' + escapeHtml(title) + '》全文…</div>';
  try {
    const api = "https://zh.wikisource.org/w/api.php?format=json&origin=*&action=parse&page=" + encodeURIComponent(title) + "&prop=text";
    const res = await fetch(api, { headers: { "User-Agent": "WorkBuddy/1.0" } });
    const data = await res.json();
    const html = data && data.parse && data.parse.text && data.parse.text["*"];
    if (!html) throw new Error("empty");
    const text = htmlToText(html);
    // 维基文库部分书以扫描页分卷存储，parse 出来的正文极短 → 提示改用上传
    if (text.length < 200) {
      box.innerHTML = '<div class="ws-loading">《' + escapeHtml(title) + '》在维基文库是以扫描页分卷存的，无法自动取全文。请用上方「选择 .txt 文件」上传（从你已有的电子书导出 txt 即可）。</div>';
      return;
    }
    document.getElementById("bkTitle").value = title;
    document.getElementById("bkContent").value = text;
    box.innerHTML = '<div class="ws-loading">✅ 已取回全文（' + text.length + ' 字），填好书名点「添加」即可阅读。</div>';
    Utils.toast("已取回《" + title + "》全文", "success");
  } catch (e) {
    box.innerHTML = '<div class="ws-loading">取全文失败（需联网或该书不支持）。请改用上传 .txt。</div>';
  }
}

// HTML→纯文本（保留段落换行），供维基文库全文清洗
function htmlToText(html) {
  let t = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/p>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<\/div>/gi, "\n").replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  t = t.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
       .replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&#\d+;/g, "");
  return t.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
}

function loadBookFile(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    const ta = document.getElementById("bkContent");
    if (ta) ta.value = r.result;
    Utils.toast("已读取：" + f.name, "success");
  };
  r.readAsText(f, "utf-8");
}
function onDropFile(e) {
  e.preventDefault();
  const dz = document.getElementById("dropZone");
  if (dz) dz.classList.remove("drag");
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    const ta = document.getElementById("bkContent");
    if (ta) ta.value = r.result;
    Utils.toast("已读取：" + f.name, "success");
  };
  r.readAsText(f, "utf-8");
}
function submitAddBook() {
  const title = (document.getElementById("bkTitle").value || "").trim();
  if (!title) { Utils.toast("请填写书名", "warning"); return; }
  const author = (document.getElementById("bkAuthor").value || "").trim();
  const pages = parseInt(document.getElementById("bkPages").value || "0", 10);
  const totalPages = pages > 0 ? pages : 0; // 0 = 不记录页数

  state.reading.books.push({
    id: Date.now(),
    title: title,
    author: author,
    totalPages: totalPages,
    currentPage: 0,
    notes: [],
  });
  Store.save();
  closeModal();
  Utils.toast("已添加《" + title + "》", "success");
  renderReading();
}

// 记录阅读进度（页内表单）
function logReading(bookId) {
  const book = state.reading.books.find(b => b.id === bookId);
  if (!book) return;
  const body = `
    <div style="color:var(--text-secondary);margin-bottom:10px;">《${book.title}》· 共 ${book.totalPages} 页（已读 ${book.currentPage}）</div>
    <label class="modal-label">本次读了几页 *</label>
    <input class="modal-input" id="rdPages" type="number" min="1" placeholder="例如：20" />
    <label class="modal-label">读后感 / 笔记（可留空）</label>
    <textarea class="modal-textarea" id="rdNote" placeholder="写下你的想法…"></textarea>`;
  const actions = `
    <button class="btn btn-secondary" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="submitLogReading(${bookId})">保存</button>`;
  openModal("📖 读几页", body, actions);
  setTimeout(() => { const e = document.getElementById("rdPages"); if (e) e.focus(); }, 60);
}
function submitLogReading(bookId) {
  const book = state.reading.books.find(b => b.id === bookId);
  if (!book) return;
  const pages = parseInt(document.getElementById("rdPages").value || "0", 10);
  if (!pages || pages <= 0) { Utils.toast("请输入有效页数", "warning"); return; }
  const note = (document.getElementById("rdNote").value || "").trim();

  book.currentPage = Math.min(book.totalPages, book.currentPage + pages);
  state.reading.log.push({
    id: Date.now(),
    date: Utils.today(),
    bookId: bookId,
    pages: pages,
    note: note,
  });

  // 连续天数
  const today = Utils.today();
  if (state.reading.lastReadDate !== today) {
    const y = Utils.dateOffset(-1);
    state.reading.streak = (state.reading.lastReadDate === y) ? state.reading.streak + 1 : 1;
    state.reading.lastReadDate = today;
  }

  Store.save();
  closeModal();
  Utils.toast("已记录 +" + pages + " 页", "success");
  renderReading();
}

// 删除书籍（页内确认）
function deleteBook(id) {
  const book = state.reading.books.find(b => b.id === id);
  const name = book ? book.title : "这本书";
  const body = `<div style="color:var(--text-secondary);">确定删除《${name}》？阅读记录会保留。</div>`;
  const actions = `
    <button class="btn btn-secondary" onclick="closeModal()">取消</button>
    <button class="btn btn-danger" onclick="confirmDeleteBook(${id})">删除</button>`;
  openModal("删除书籍", body, actions);
}
function confirmDeleteBook(id) {
  state.reading.books = state.reading.books.filter(b => b.id !== id);
  Store.save();
  closeModal();
  renderReading();
}

// ===== 书籍详情：记笔记 + 阅读打卡 =====
function openBookDetail(bookId) {
  const book = state.reading.books.find(b => b.id === bookId);
  if (!book) return;
  if (!book.notes) book.notes = [];
  renderBookDetail(book);
}

function renderBookDetail(book) {
  const hasPages = book.totalPages > 0;
  const bp = hasPages ? Math.min(100, Math.round((book.currentPage / book.totalPages) * 100)) : 0;

  const notes = [...(book.notes || [])].reverse();
  const noteHtml = notes.length ? notes.map(n => `
    <div class="note-item">
      <div class="note-head">
        <span class="note-date">${n.date}</span>
        ${n.page ? `<span class="note-page">P${n.page}</span>` : ''}
        <button class="note-del" onclick="deleteBookNote(${book.id}, ${n.id})" title="删除">✕</button>
      </div>
      <div class="note-text">${escapeHtml(n.text)}</div>
    </div>
  `).join("") : `<div style="font-size:14px;color:var(--text-light);padding:14px 0;">还没有笔记，点右上角「＋ 写笔记」记录你的想法吧。</div>`;

  document.getElementById("page-reading").innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <button class="btn btn-ghost btn-sm" onclick="renderReading()">‹ 返回</button>
        <h2 style="font-size:20px;margin-left:8px;">📒 ${escapeHtml(book.title)}</h2>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-secondary btn-sm" onclick="logReading(${book.id})">📖 读几页</button>
        <button class="btn btn-primary btn-sm" onclick="addBookNote(${book.id})">＋ 写笔记</button>
      </div>
    </div>

    <div class="book-detail-meta">
      <div class="bd-author">${escapeHtml(book.author || "佚名")}</div>
      ${hasPages
        ? `<div class="bd-progress"><div class="bd-bar"><div class="bd-bar-fill" style="width:${bp}%;"></div></div><span>${book.currentPage}/${book.totalPages} 页</span></div>`
        : `<div class="bd-progress"><span>未设置总页数</span></div>`}
    </div>

    <h3 style="font-size:16px;margin:20px 0 12px;color:var(--text-secondary);">📝 我的笔记（${book.notes.length}）</h3>
    <div class="note-list">${noteHtml}</div>
  `;
}

// 添加笔记弹窗
function addBookNote(bookId) {
  const book = state.reading.books.find(b => b.id === bookId);
  if (!book) return;
  const body = `
    <label class="modal-label">页码（可留空）</label>
    <input class="modal-input" id="ntPage" type="number" min="1" placeholder="如 36" style="max-width:120px;" />
    <label class="modal-label">笔记内容 *</label>
    <textarea class="modal-textarea" id="ntText" placeholder="写下你的想法、摘抄或感悟…" style="min-height:120px;"></textarea>`;
  const actions = `
    <button class="btn btn-secondary" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="submitBookNote(${bookId})">保存笔记</button>`;
  openModal("＋ 写笔记", body, actions);
  setTimeout(() => { const t = document.getElementById("ntText"); if (t) t.focus(); }, 60);
}

function submitBookNote(bookId) {
  const book = state.reading.books.find(b => b.id === bookId);
  if (!book) return;
  const text = (document.getElementById("ntText").value || "").trim();
  if (!text) { Utils.toast("笔记内容不能为空", "warning"); return; }
  const page = parseInt(document.getElementById("ntPage").value || "0", 10);
  if (!book.notes) book.notes = [];
  book.notes.push({ id: Date.now(), date: Utils.today(), page: page > 0 ? page : 0, text: text });
  Store.save();
  closeModal();
  Utils.toast("已保存笔记", "success");
  renderBookDetail(book);
}

function deleteBookNote(bookId, noteId) {
  const book = state.reading.books.find(b => b.id === bookId);
  if (!book || !book.notes) return;
  book.notes = book.notes.filter(n => n.id !== noteId);
  Store.save();
  renderBookDetail(book);
}

// 记录阅读页数（供「读几页」和阅读器共用）：写入当日记录 + 连续天数
function addReadingPages(bookId, pages) {
  if (!pages || pages <= 0) return;
  const today = Utils.today();
  state.reading.log.push({
    id: Date.now(),
    date: today,
    bookId: bookId,
    pages: pages,
    note: "",
    auto: true,
  });
  if (state.reading.lastReadDate !== today) {
    const y = Utils.dateOffset(-1);
    state.reading.streak = (state.reading.lastReadDate === y) ? state.reading.streak + 1 : 1;
    state.reading.lastReadDate = today;
  }
  Store.save();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// 清洗释义/例句里混入的 SVG/HTML 标签（如 <g id="...">），只保留可见文本
function cleanSenseText(s) {
  if (s == null) return '';
  return String(s).replace(/<\/?[a-zA-Z][^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// ===== 工作台内 TXT 电子书阅读器 =====
const Reader = { bookId: null, cpp: 1500, total: 1, page: 1, fontSize: 18 };

function openReader(bookId) {
  const book = state.reading.books.find(b => b.id === bookId);
  if (!book || !book.content) return;
  Reader.bookId = bookId;
  Reader.cpp = book.charsPerPage || 1500;
  Reader.total = Math.max(1, Math.ceil(book.content.length / Reader.cpp));
  // 打开即记录第一页已读（实时）
  if ((book.currentPage || 0) < 1) {
    book.currentPage = 1;
    addReadingPages(book.id, 1);
  }
  Reader.page = Math.min(book.currentPage || 1, Reader.total);
  if (Reader.page < 1) Reader.page = 1;
  renderReader();
}

function renderReader() {
  const book = state.reading.books.find(b => b.id === Reader.bookId);
  if (!book) return;
  const start = (Reader.page - 1) * Reader.cpp;
  const text = book.content.slice(start, start + Reader.cpp);
  const furthest = book.currentPage || 0;
  const pct = Math.round((furthest / Reader.total) * 100);
  const root = document.getElementById("readerRoot");
  if (!root) return;
  root.innerHTML = `
    <div class="reader-head">
      <div class="reader-meta">
        <div class="reader-title">${escapeHtml(book.title)}</div>
        <div class="reader-sub">${escapeHtml(book.author || "佚名")} · 第 ${Reader.page} / ${Reader.total} 页</div>
      </div>
      <button class="reader-x" onclick="closeReader()" title="关闭并保存">✕</button>
    </div>
    <div class="reader-body" id="readerBody" style="font-size:${Reader.fontSize}px;">${escapeHtml(text)}</div>
    <div class="reader-foot">
      <div class="reader-progress"><div class="reader-progress-fill" style="width:${pct}%;"></div></div>
      <div class="reader-controls">
        <button class="btn btn-sm" onclick="readerGo(-1)">‹ 上一页</button>
        <span class="reader-pagenum">${Reader.page} / ${Reader.total}</span>
        <button class="btn btn-sm btn-primary" onclick="readerGo(1)">下一页 ›</button>
        <span class="reader-fsize">
          <button class="btn btn-sm" onclick="readerFont(-1)" title="缩小">A−</button>
          <button class="btn btn-sm" onclick="readerFont(1)" title="放大">A＋</button>
        </span>
      </div>
      <div class="reader-hint">翻页即实时记录 · 已读至第 ${furthest} 页（共 ${Reader.total} 页）</div>
    </div>`;
  root.classList.add("show");
}

function readerGo(dir) {
  const book = state.reading.books.find(b => b.id === Reader.bookId);
  if (!book) return;
  const next = Reader.page + dir;
  if (next < 1) { Utils.toast("已经是第一页", "warning"); return; }
  if (next > Reader.total) { Utils.toast("已经是最后一页 🎉", "success"); return; }
  // 仅向前翻页且超过历史最远页时，才计入已读页数
  if (dir > 0 && next > (book.currentPage || 0)) {
    const delta = next - (book.currentPage || 0);
    book.currentPage = next;
    addReadingPages(book.id, delta);
  }
  Reader.page = next;
  renderReader();
}

function readerFont(delta) {
  Reader.fontSize = Math.min(32, Math.max(14, Reader.fontSize + delta * 2));
  const body = document.getElementById("readerBody");
  if (body) body.style.fontSize = Reader.fontSize + "px";
}

function closeReader() {
  const root = document.getElementById("readerRoot");
  if (!root) return;
  root.classList.remove("show");
  root.innerHTML = "";
  renderReading();
  renderTodayOverview();
}

// ==========================================
// 理财学习模块（知识点模式：每日 5 条，30 天递进）
// ==========================================

function financeDaysBetween(start, end) {
  const a = new Date(start + "T00:00:00");
  const b = new Date(end + "T00:00:00");
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function initFinanceKnowledge() {
  if (!state.financeKnowledge) {
    state.financeKnowledge = { startDate: null, currentDay: 1, completed: {}, lastFinanceDate: null };
  }
  if (!state.financeKnowledge.startDate) {
    state.financeKnowledge.startDate = Utils.today();
    state.financeKnowledge.currentDay = 1;
    state.financeKnowledge.lastFinanceDate = Utils.today();
  }
  if (!state.financeKnowledge.completed) state.financeKnowledge.completed = {};
  if (!state.financeKnowledge.keyIds) state.financeKnowledge.keyIds = [];
  if (!state.financeKnowledge.reviewed) state.financeKnowledge.reviewed = {};
  if (state.financeKnowledge.lastFinanceDate === undefined) state.financeKnowledge.lastFinanceDate = null;
}

// 新的一天首次打开时，自动把当前学习天数推进到「今天对应的天数」，
// 但用户当天手动切回前一天复习后，不再反复弹回今天。
function advanceFinanceDayIfNeeded() {
  initFinanceKnowledge();
  const today = Utils.today();
  if (state.financeKnowledge.lastFinanceDate === today) return;
  const todayDay = getFinanceTodayDay();
  if (state.financeKnowledge.currentDay < todayDay) {
    state.financeKnowledge.currentDay = todayDay;
  }
  state.financeKnowledge.lastFinanceDate = today;
  Store.save();
}

function getFinanceTodayDay() {
  initFinanceKnowledge();
  const start = state.financeKnowledge.startDate;
  const today = Utils.today();
  const diff = Math.max(0, financeDaysBetween(start, today));
  return diff + 1; // 不再限制 30 天，持续循环
}

// 把真实天数映射到 1~30 的循环索引，并返回轮次
function getFinanceDayInfo(day) {
  const total = FINANCE_KNOWLEDGE.length || 30;
  const round = Math.ceil(day / total);
  const dayIndex = ((day - 1) % total) + 1;
  return { dayIndex, round };
}

function getFinanceLevelName(dayIndex) {
  if (dayIndex <= 10) return "入门";
  if (dayIndex <= 20) return "进阶";
  return "综合";
}

function getFinanceCurrentDay() {
  initFinanceKnowledge();
  return Math.min(state.financeKnowledge.currentDay, getFinanceTodayDay());
}

function setFinanceCurrentDay(day) {
  const maxDay = getFinanceTodayDay();
  if (day < 1 || day > maxDay) {
    Utils.toast(day > maxDay ? "明天的内容还没到解锁时间，明天再来吧" : "已经是第一天了", "warning");
    return;
  }
  state.financeKnowledge.currentDay = day;
  Store.save();
  renderFinance();
}

function getCompletedForDay(day) {
  initFinanceKnowledge();
  return state.financeKnowledge.completed[day] || [];
}

function toggleFinanceKnowledge(id, day) {
  initFinanceKnowledge();
  const list = state.financeKnowledge.completed[day] || [];
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  else list.push(id);
  state.financeKnowledge.completed[day] = list;
  Store.save();
  renderFinance();
}

// ===== 重点知识（标记 + 定期复习）=====
function getFinanceKeyIds() {
  initFinanceKnowledge();
  return state.financeKnowledge.keyIds || [];
}

function isFinanceKey(id) {
  return getFinanceKeyIds().indexOf(id) >= 0;
}

function toggleFinanceKey(id) {
  initFinanceKnowledge();
  const arr = state.financeKnowledge.keyIds || (state.financeKnowledge.keyIds = []);
  const i = arr.indexOf(id);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(id);
  Store.save();
  renderFinance();
}

// 把所有标记为重点的知识点对象取出来（按标记顺序），过滤掉已不存在的 id
function getAllKeyItems() {
  const ids = getFinanceKeyIds();
  const map = {};
  FINANCE_KNOWLEDGE.forEach(d => d.items.forEach(it => { map[it.id] = it; }));
  return ids.map(id => map[id]).filter(Boolean);
}

// 两个数组交错合并（用于把重点复习卡穿插进当天新知识点列表）
function interleaveArrays(a, b) {
  const out = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}

// 每个复习日穿插进当天学习的重点数量（其余名额留给当天新知识点，保证总量 5）
const FINANCE_REVIEW_PER_DAY = 2;

// 重点复习日：点一下卡片即记为「今天复习过」（不计入当天新知识点掌握进度）
function markFinanceReview(id) {
  initFinanceKnowledge();
  const d = Utils.today();
  const arr = state.financeKnowledge.reviewed[d] || (state.financeKnowledge.reviewed[d] = []);
  const i = arr.indexOf(id);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(id);
  Store.save();
  renderFinance();
}

// 重点复习弹层：一次性回顾所有标记为重点的知识
function openKeyReview() {
  const items = getAllKeyItems();
  let body;
  if (items.length === 0) {
    body = `<div style="text-align:center;color:var(--text-secondary);padding:14px 4px;line-height:1.7;">还没有重点知识。<br>在理财学习里点任意卡片右下角的「☆ 重点」即可添加，<br>之后会定期出现在复习日帮你再复习一遍。</div>`;
  } else {
    body = items.map(it => `
      <div class="knowledge-card" style="margin-bottom:12px;cursor:default;">
        <div class="knowledge-text">${escapeHtml(it.text)}</div>
        <div class="knowledge-foot">
          <span class="knowledge-key">💡 ${escapeHtml(it.keyPoint)}</span>
          <button class="star-btn active" onclick="toggleFinanceKey('${it.id}');openKeyReview();">⭐ 取消重点</button>
        </div>
      </div>`).join("");
  }
  const actions = `<button class="btn btn-secondary" onclick="closeModal()">关闭</button>`;
  openModal(`⭐ 重点复习 (${items.length})`, body, actions);
}


function renderFinance() {
  initFinanceKnowledge();
  const day = getFinanceCurrentDay();
  const todayDay = getFinanceTodayDay();
  const { dayIndex, round } = getFinanceDayInfo(day);
  const dayData = FINANCE_KNOWLEDGE.find(d => d.day === dayIndex);
  if (!dayData) {
    document.getElementById("page-finance").innerHTML = `<div class="toolbar"><h2>💰 理财学习</h2></div><div class="card" style="padding:24px;">暂无第 ${dayIndex} 天的知识点。</div>`;
    return;
  }
  const completed = getCompletedForDay(day);
  const levelName = getFinanceLevelName(dayIndex);
  const prevDisabled = day <= 1;
  const nextDisabled = day >= todayDay;

  // 长期总进度：所有轮次里标记过的知识点去重数 / 总条数
  const totalItems = FINANCE_KNOWLEDGE.reduce((sum, d) => sum + d.items.length, 0);
  const masteredSet = new Set();
  Object.values(state.financeKnowledge.completed || {}).forEach(ids => ids.forEach(id => masteredSet.add(id)));
  const masteredCount = masteredSet.size;

  // ===== 当天展示的 5 张卡片：复习日把部分重点穿插进来一起复习（总量仍 5）=====
  const keyItems = getAllKeyItems();
  const isReviewDay = (dayIndex % 7 === 0); // 每隔 7 天一个复习日
  const reviewedToday = (state.financeKnowledge.reviewed && state.financeKnowledge.reviewed[Utils.today()]) || [];
  let reviewItems = [];
  if (isReviewDay && keyItems.length > 0) {
    const rd = Math.floor(dayIndex / 7); // 第几个复习日（1,2,3...）
    const off = ((rd - 1) % keyItems.length + keyItems.length) % keyItems.length; // 轮换起点，保证每个重点都能轮到
    const n = Math.min(keyItems.length, FINANCE_REVIEW_PER_DAY);
    for (let k = 0; k < n; k++) reviewItems.push(keyItems[(off + k) % keyItems.length]);
  }
  const remain = 5 - reviewItems.length; // 其余名额留给当天新知识点
  const unmastered = dayData.items.filter(it => !completed.includes(it.id));
  const fill = [...unmastered, ...dayData.items.filter(it => completed.includes(it.id))].slice(0, remain);
  const displayItems = interleaveArrays(
    reviewItems.map(it => ({ item: it, isReview: true })),
    fill.map(it => ({ item: it, isReview: false }))
  );

  const shownRegular = displayItems.filter(d => !d.isReview);
  const shownDone = shownRegular.filter(d => completed.includes(d.item.id)).length;
  const progress = shownDone;       // 仅统计当天新知识点（重点复习卡不计入掌握进度）
  const shownTotal = shownRegular.length;
  const allDone = shownTotal > 0 && shownDone >= shownTotal;

  const cardsHtml = displayItems.map(({ item, isReview }) => {
    const done = isReview ? reviewedToday.includes(item.id) : completed.includes(item.id);
    const key = isFinanceKey(item.id);
    return `
      <div class="knowledge-card ${done ? 'done' : ''} ${key ? 'key' : ''} ${isReview ? 'review-card' : ''}" onclick="if(event.target.closest('.knowledge-actions'))return; ${isReview ? `markFinanceReview('${item.id}')` : `toggleFinanceKnowledge('${item.id}', ${day})`}">
        <div class="knowledge-text">${escapeHtml(item.text)}</div>
        <div class="knowledge-foot">
          <span class="knowledge-key">💡 ${escapeHtml(item.keyPoint)}</span>
          <span class="knowledge-actions">
            ${key ? '<span class="star-static" title="已是重点 · 在「⭐ 重点复习」中可取消">⭐ 已重点</span>' : '<button class="star-btn" onclick="event.stopPropagation();toggleFinanceKey(\'${item.id}\')">☆ 重点</button>'}
            <span class="knowledge-check">${isReview ? (done ? '✅ 已复习' : '🔁 点我复习') : (done ? '✅ 已掌握' : '⭕ 点我掌握')}</span>
          </span>
        </div>
      </div>`;
  }).join("");

  let summaryHtml = allDone
    ? `<div class="finance-summary success">🎉 今日知识点全部掌握，打卡完成！</div>`
    : `<div class="finance-summary">今天还有 <strong>${shownTotal - progress}</strong> 条新知识点待掌握，点击卡片即可标记。</div>`;
  if (reviewItems.length > 0) {
    const revDone = reviewItems.filter(it => reviewedToday.includes(it.id)).length;
    summaryHtml += `<div class="finance-summary review-hint">🔁 今日穿插 ${reviewItems.length} 条「重点」复习（已复习 ${revDone}/${reviewItems.length}），右下角会显示「🔁 点我复习」。其余位置是当天新知识点，每天总量仍是 5 条。</div>`;
  }

  const dayTitle = round === 1
    ? `第 ${dayIndex} 天 · <span class="day-level level-${levelName === '入门' ? 'easy' : levelName === '进阶' ? 'medium' : 'hard'}">${levelName}</span>`
    : `第 ${round} 轮 第 ${dayIndex} 天 · <span class="day-level level-${levelName === '入门' ? 'easy' : levelName === '进阶' ? 'medium' : 'hard'}">${levelName}</span>`;

  document.getElementById("page-finance").innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <h2 style="font-size:20px;">💰 理财学习</h2>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-sm btn-key" onclick="openKeyReview()">⭐ 重点复习 (${getFinanceKeyIds().length})</button>
        <span class="user-badge">长期进度 ${masteredCount}/${totalItems}</span>
      </div>
    </div>

    <div class="finance-hero knowledge-hero">
      <div style="font-size:15px;font-weight:600;">📌 每日 5 条理财知识点</div>
      <div style="font-size:13px;opacity:.92;margin-top:6px;line-height:1.6;">
        30 天内容学完后会自动进入下一轮复习，重点反复巩固。理财没有终点，每天进步一点就好。
      </div>
    </div>

    <div class="finance-day-bar">
      <button class="btn btn-sm btn-secondary" onclick="setFinanceCurrentDay(${day - 1})" ${prevDisabled ? 'disabled' : ''}>← 前一天</button>
      <div class="day-info">
        <div class="day-title">${dayTitle}</div>
        <div class="day-progress">掌握 ${progress}/${shownTotal}</div>
      </div>
      <button class="btn btn-sm btn-secondary" onclick="setFinanceCurrentDay(${day + 1})" ${nextDisabled ? 'disabled' : ''}>后一天 →</button>
    </div>

    ${summaryHtml}

    <div class="knowledge-list">${cardsHtml}</div>
  `;
}

// ==========================================
// 错题本模块
// ==========================================
function renderErrors() {
  let filter = "all";
  window.filterErrors = function(type) {
    renderErrorsFiltered(type);
  };
  renderErrorsFiltered("all");
}

function renderErrorsFiltered(type) {
  let errors = state.errorBook;
  if (type === "unmastered") errors = errors.filter(e => !e.mastered);
  else if (type === "mastered") errors = errors.filter(e => e.mastered);
  else if (type !== "all") errors = errors.filter(e => e.type === type);

  // 按日期倒序
  errors = [...errors].sort((a, b) => b.date.localeCompare(a.date));

  let tabsHtml = `
    <div class="filter-tab ${type === 'all' ? 'active' : ''}" onclick="renderErrorsFiltered('all')">全部 (${state.errorBook.length})</div>
    <div class="filter-tab ${type === 'unmastered' ? 'active' : ''}" onclick="renderErrorsFiltered('unmastered')">待复习 (${state.errorBook.filter(e => !e.mastered).length})</div>
    <div class="filter-tab ${type === 'mastered' ? 'active' : ''}" onclick="renderErrorsFiltered('mastered')">已掌握 (${state.errorBook.filter(e => e.mastered).length})</div>
    <div class="filter-tab ${type === 'choice' ? 'active' : ''}" onclick="renderErrorsFiltered('choice')">选择题</div>
    <div class="filter-tab ${type === 'spell' ? 'active' : ''}" onclick="renderErrorsFiltered('spell')">拼写</div>
    <div class="filter-tab ${type === 'sentence' ? 'active' : ''}" onclick="renderErrorsFiltered('sentence')">句子</div>
    <div class="filter-tab ${type === 'listening' ? 'active' : ''}" onclick="renderErrorsFiltered('listening')">听力</div>
    <div class="filter-tab ${type === 'translate' ? 'active' : ''}" onclick="renderErrorsFiltered('translate')">翻译</div>
  `;

  let listHtml = "";
  if (errors.length === 0) {
    listHtml = `
      <div class="error-empty">
        <div class="icon">🎉</div>
        <div style="font-size:16px;font-weight:600;">暂无错题</div>
        <div style="font-size:14px;margin-top:4px;">继续练习，保持正确率！</div>
      </div>
    `;
  } else {
    errors.forEach(e => {
      const typeLabel = { choice: "选择题", spell: "拼写", sentence: "句子翻译", listening: "听力", translate: "翻译" }[e.type] || e.type;
      const wc = e.wrongCount || 1;
      const countBadge = wc > 1 ? `<span style="background:var(--danger);color:#fff;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:700;margin-left:6px;">错${wc}次</span>` : '';
      listHtml += `
        <div class="error-item ${e.mastered ? 'mastered' : ''}">
          <div class="error-content">
            <div class="error-word">${e.word}${countBadge} ${e.phonetic ? '<span style="font-size:13px;color:var(--text-light);">' + e.phonetic + '</span>' : ''}</div>
            <div class="error-detail">
              <span style="background:var(--surface-alt);padding:2px 8px;border-radius:10px;font-size:11px;margin-right:8px;">${typeLabel}</span>
              ${e.meaning ? '<span>' + e.meaning + '</span> · ' : ''}
              <span class="wrong-answer">${e.userAnswer}</span>
              →
              <span class="correct-answer">${e.correctAnswer}</span>
              <span style="margin-left:8px;color:var(--text-light);">${e.date}</span>
            </div>
          </div>
          <div class="error-actions">
            ${!e.mastered
              ? `<button class="btn btn-success" onclick="markErrorMastered(${state.errorBook.indexOf(e)})">✅ 已掌握</button>`
              : `<span style="font-size:13px;color:var(--success);">✅ 已掌握</span>`
            }
          </div>
        </div>
      `;
    });
  }

  document.getElementById("page-errors").innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <h2 style="font-size:20px;">❌ 错题本</h2>
      </div>
      ${state.errorBook.length > 0 ? `
      <div class="toolbar-right" style="display:flex;gap:8px;">
        <button class="btn btn-warning" onclick="startErrorReview()">🔁 复习</button>
        <button class="btn btn-secondary" onclick="clearMasteredErrors()">🧹 清除已掌握</button>
      </div>` : ''}
    </div>
    <div class="filter-tabs">${tabsHtml}</div>
    <div class="error-list">${listHtml}</div>
  `;
}

function markErrorMastered(index) {
  const e = state.errorBook[index];
  if (!e) return;
  e.mastered = true; // 仅清除该条错题，不联动单词/生词本状态
  Store.save();
  Utils.toast("已标记为掌握 ✅", "success");
  renderErrorsFiltered("all");
}

function clearMasteredErrors() {
  const count = state.errorBook.filter(e => e.mastered).length;
  if (count === 0) {
    Utils.toast("没有已掌握的错题", "");
    return;
  }
  state.errorBook = state.errorBook.filter(e => !e.mastered);
  Store.save();
  Utils.toast(`已清除 ${count} 条已掌握错题`, "success");
  renderErrorsFiltered("all");
}

// ==========================================
// 错题本复习模块（复习待掌握的错题）
// ==========================================
let errorReviewState = { active: false, items: [], itemsR2: [], current: 0, round: 1, correct: 0, wrong: 0, answered: false, roundResults: {} };

function startErrorReview() {
  const unmastered = state.errorBook.filter(e => !e.mastered);
  if (unmastered.length === 0) {
    Utils.toast("没有待复习的错题", "success");
    return;
  }
  const r1 = shuffleArr(unmastered);
  const r2 = shuffleArr(unmastered); // 两遍顺序不同
  errorReviewState = {
    active: true,
    items: r1,
    itemsR2: r2,
    current: 0,
    round: 1,
    correct: 0,
    wrong: 0,
    answered: false,
    roundResults: {}, // { wordId: { r1: true/false, r2: true/false } }
  };
  renderErrorReview();
}

function renderErrorReview() {
  const r = errorReviewState.round;
  const curItems = r === 1 ? errorReviewState.items : errorReviewState.itemsR2;
  if (!errorReviewState.active || errorReviewState.current >= curItems.length) {
    if (r === 1) {
      // 第一遍全做完 → 自动进第二遍
      errorReviewState.round = 2;
      errorReviewState.current = 0;
      errorReviewState.answered = false;
      renderErrorReview();
      return;
    }
    renderErrorReviewResult();
    return;
  }
  const e = curItems[errorReviewState.current];
  const total = curItems.length;
  const word = VOCABULARY.find(w => w.id === e.wordId);
  const wordText = word ? word.word : e.word;
  const meaning = word ? word.meaning : e.meaning || '';
  const phonetic = word ? word.phonetic : e.phonetic || '';
  const progress = (errorReviewState.current / total) * 100;
  errorReviewState.answered = false;

  let bodyHtml;
  if (r === 1) {
    // 看英语选汉语
    const distractors = pickMeaningDistractors(meaning, VOCABULARY.map(w => w.meaning), 3);
    const options = shuffleArr([meaning, ...distractors]);
    errorReviewState.options = options;
    errorReviewState.answer = meaning;
    bodyHtml = `
      <div class="prompt">第 1 轮：看英文选中文释义</div>
      <div class="word-display" style="font-size:26px;">${wordText}</div>
      ${phonetic ? `<div class="phonetic-display">${phonetic}</div>` : ''}
      <div class="speech-controls" style="justify-content:center;margin-top:8px;">
        <button class="btn btn-speech" onclick="speakWord('${wordText}')">🔊 听发音</button>
      </div>
      <div class="test-options" id="errorReviewOptions">
        ${options.map((opt, i) => `
          <div class="test-option" onclick="answerErrorReview(${i})" data-idx="${i}">
            ${String.fromCharCode(65 + i)}. ${escapeHtml(opt)}
          </div>`).join('')}
      </div>
      <div id="errorReviewFeedback"></div>`;
  } else {
    // 看中文写英语
    bodyHtml = `
      <div class="prompt">第 2 轮：看中文写英文拼写</div>
      <div class="word-display" style="font-size:22px;">${meaning}</div>
      <div class="speech-controls" style="justify-content:center;margin-top:8px;">
        <button class="btn btn-speech" onmousedown="event.preventDefault();" onclick="speakWord('${wordText}')">🔊 听发音</button>
      </div>
      <input id="errorReviewSpell" class="spell-input" style="margin-top:16px;" placeholder="在此输入英文单词..." onkeydown="if(event.key==='Enter')submitErrorReviewSpell()" autocomplete="off" />
      <div style="margin-top:12px;">
        <button class="btn btn-primary" onclick="submitErrorReviewSpell()">提交拼写</button>
      </div>
      <div id="errorReviewFeedback"></div>`;
  }

  document.getElementById("page-errors").innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <button class="btn btn-secondary btn-icon" onclick="exitErrorReview()">←</button>
        <span style="font-weight:600;">🔁 错题复习 · 第 ${r} 轮</span>
      </div>
      <div class="toolbar-right" style="font-size:14px;color:var(--text-secondary);">
        ${errorReviewState.current + 1} / ${total} · ✅${errorReviewState.correct} ❌${errorReviewState.wrong}
      </div>
    </div>
    <div class="test-container">
      <div class="test-progress">
        <span style="font-size:13px;color:var(--text-secondary);">进度</span>
        <div class="test-progress-bar"><div class="test-progress-fill" style="width:${progress}%;"></div></div>
      </div>
      <div class="test-question">${bodyHtml}</div>
    </div>
  `;
  if (r === 2) setTimeout(() => { const inp = document.getElementById('errorReviewSpell'); if (inp) inp.focus(); }, 200);
  setTimeout(() => activateWordTap("page-errors"), 60);
}

function answerErrorReview(idx) {
  if (errorReviewState.answered) return;
  errorReviewState.answered = true;
  const selected = errorReviewState.options[idx];
  const isCorrect = selected === errorReviewState.answer;
  const e = errorReviewState.items[errorReviewState.current];

  if (isCorrect) errorReviewState.correct++;
  else errorReviewState.wrong++;
  if (!errorReviewState.roundResults[e.wordId]) errorReviewState.roundResults[e.wordId] = {};
  errorReviewState.roundResults[e.wordId].r1 = isCorrect;

  const word = VOCABULARY.find(w => w.id === e.wordId);
  const wordText = word ? word.word : e.word;
  const options = document.querySelectorAll('#errorReviewOptions .test-option');
  options.forEach(o => o.classList.add('disabled'));
  if (isCorrect) {
    options[idx].classList.add('correct');
    playCorrectSound();
  } else {
    options[idx].classList.add('wrong');
    const ci = errorReviewState.options.indexOf(errorReviewState.answer);
    if (ci >= 0) options[ci].classList.add('correct');
  }

  const isLast = errorReviewState.current >= errorReviewState.items.length - 1;
  document.getElementById('errorReviewFeedback').innerHTML = `
    <div class="card" style="text-align:center;margin-top:16px;${isCorrect ? 'border:2px solid var(--success);' : 'border:2px solid var(--danger);'}">
      <div style="font-size:18px;font-weight:600;color:${isCorrect ? 'var(--success)' : 'var(--danger)'};">
        ${isCorrect ? '✅ 正确！' : '❌ 错误'}
      </div>
      ${!isCorrect ? `<div style="margin-top:8px;"><b>${wordText}</b> — ${e.meaning || errorReviewState.answer}</div>` : ''}
      <button class="btn btn-primary" style="margin-top:12px;" onclick="nextErrorReview()">${isLast ? '进入第二遍 →' : '下一个 →'}</button>
    </div>`;
}

function submitErrorReviewSpell() {
  if (errorReviewState.answered) return;
  const inputVal = document.getElementById('errorReviewSpell').value.trim();
  if (!inputVal) { Utils.toast('请先输入英文单词', 'warning'); return; }
  errorReviewState.answered = true;
  const e = errorReviewState.itemsR2[errorReviewState.current];
  const word = VOCABULARY.find(w => w.id === e.wordId);
  const correctWord = word ? word.word : e.word;
  const isCorrect = inputVal.toLowerCase().replace(/[^a-z]/g, '') === correctWord.toLowerCase().replace(/[^a-z]/g, '');
  if (isCorrect) errorReviewState.correct++;
  else errorReviewState.wrong++;
  if (!errorReviewState.roundResults[e.wordId]) errorReviewState.roundResults[e.wordId] = {};
  errorReviewState.roundResults[e.wordId].r2 = isCorrect;

  if (isCorrect) playCorrectSound();
  const isLast = errorReviewState.current >= errorReviewState.itemsR2.length - 1;
  document.getElementById('errorReviewFeedback').innerHTML = `
    <div class="card" style="text-align:center;margin-top:16px;${isCorrect ? 'border:2px solid var(--success);' : 'border:2px solid var(--danger);'}">
      <div style="font-size:18px;font-weight:600;color:${isCorrect ? 'var(--success)' : 'var(--danger)'};">
        ${isCorrect ? '✅ 拼写正确！' : '❌ 拼写错误'}
      </div>
      ${!isCorrect ? `<div style="margin-top:8px;"><b>${correctWord}</b> — ${e.meaning || ''}</div>` : ''}
      <button class="btn btn-speech" onclick="speakWord('${correctWord}')" style="margin-top:8px;">🔊 听发音</button>
      <button class="btn btn-primary" style="margin-top:12px;margin-left:8px;" onclick="nextErrorReview()">${isLast ? '完成复习 →' : '下一个 →'}</button>
    </div>`;
}

function nextErrorReview() {
  errorReviewState.answered = false;
  errorReviewState.current++;
  if (errorReviewState.round === 1) {
    // 第一遍：看英语选汉语
    if (errorReviewState.current >= errorReviewState.items.length) {
      // 第一遍结束 → 进入第二遍
      errorReviewState.round = 2;
      errorReviewState.current = 0;
      errorReviewState.answered = false;
      renderErrorReview();
    } else {
      renderErrorReview();
    }
  } else {
    // 第二遍：看中文写英语
    if (errorReviewState.current >= errorReviewState.itemsR2.length) {
      // 两遍都做完 → 标记两遍都对的项目 mastered
      for (const e of errorReviewState.items) {
        const res = errorReviewState.roundResults[e.wordId] || {};
        if (res.r1 && res.r2) {
          const idx = state.errorBook.indexOf(e);
          if (idx >= 0) {
            state.errorBook[idx].mastered = true;
          }
        }
      }
      Store.save();
      renderErrorReviewResult();
    } else {
      renderErrorReview();
    }
  }
}

function exitErrorReview() {
  errorReviewState.active = false;
  renderErrorsFiltered("all");
}

function renderErrorReviewResult() {
  const total = errorReviewState.items.length;
  const correct = errorReviewState.correct;
  const totalQ = total * 2;
  const acc = totalQ ? Math.round((correct / totalQ) * 100) : 0;
  const mastered = Object.entries(errorReviewState.roundResults).filter(([k, v]) => v.r1 && v.r2).length;
  document.getElementById("page-errors").innerHTML = `
    <div class="toolbar"><div class="toolbar-left"><h2 style="font-size:20px;">🎉 复习完成</h2></div></div>
    <div class="card" style="text-align:center;padding:36px;">
      <div style="font-size:52px;font-weight:700;color:${acc>=80?'var(--success)':acc>=60?'var(--warning)':'var(--danger)'};">${acc}%</div>
      <div style="font-size:16px;margin-top:8px;">综合正确率（${total} 题 × 2 遍）</div>
      <div style="font-size:14px;color:var(--text-secondary);margin-top:6px;">✅ ${correct} 次 · ❌ ${errorReviewState.wrong} 次 · 🎯 ${mastered} 题两遍都对</div>
      <div style="font-size:13px;color:var(--text-light);margin-top:4px;">两遍都对的已自动标为「已掌握」</div>
    </div>
    <div style="margin-top:22px;display:flex;gap:12px;flex-wrap:wrap;">
      <button class="btn btn-primary btn-lg" onclick="startErrorReview()">🔁 再复习一轮</button>
      <button class="btn btn-secondary btn-lg" onclick="exitErrorReview()">返回错题本</button>
    </div>`;
}

// ==========================================
// 听力练习模块
// ==========================================
const LISTENING_GOALS = { word: 10, dialogue: 2, sentence: 2, dictation: 2 };
const LISTENING_MODES = [
  { key: 'word', label: '听词选义' },
  { key: 'dialogue', label: '对话理解' },
  { key: 'sentence', label: '听句选译' },
  { key: 'dictation', label: '句子听写' }
];

// 获取某日听力进度（兼容旧数字格式）
function getListeningProgress(date) {
  const raw = state.listening.daily[date];
  const zero = { word: 0, dialogue: 0, sentence: 0, dictation: 0 };
  const today = typeof raw === 'number'
    ? { word: raw, dialogue: 0, sentence: 0, dictation: 0 }
    : Object.assign({}, zero, raw || {});
  const donePerMode = LISTENING_MODES.map(m => Math.min(1, today[m.key] / LISTENING_GOALS[m.key]));
  const pct = Math.round(donePerMode.reduce((a, b) => a + b, 0) / LISTENING_MODES.length * 100);
  const totalDone = LISTENING_MODES.reduce((sum, m) => sum + (today[m.key] || 0), 0);
  const totalGoal = LISTENING_MODES.reduce((sum, m) => sum + LISTENING_GOALS[m.key], 0);
  return { today, pct, totalDone, totalGoal };
}

let listeningState = {
  mode: null,        // 'word' | 'sentence' | 'dictation'
  questions: [],
  current: 0,
  correct: 0,
  wrong: 0,
  answered: false,
  currentCorrect: false,
  active: false,
  dictHintShown: false,  // 听写题首字母提示是否显示
  autoPlayed: false,     // 当前题是否已经自动播放过一次
};

// 听写题慢速重播（rate 0.55 比正常 0.8 更慢，听不清可反复点）
function playListeningSlow() {
  const q = listeningState.questions[listeningState.current];
  if (!q) return;
  const btn = document.getElementById('listenPlayBtn');
  if (btn) btn.classList.add('playing');
  Speech.speak(q.play, {
    rate: 0.7,
    onend: function () { if (btn) btn.classList.remove('playing'); }
  });
  Utils.toast('🐢 慢速播放中…', 'success');
}

// 听写题首字母提示：显示每个单词的首字母（其他字符用 _ 代替）
function toggleDictHint() {
  const q = listeningState.questions[listeningState.current];
  if (!q || q.type !== 'dictation') return;
  const hint = document.getElementById('dictHint');
  if (!hint) return;
  listeningState.dictHintShown = !listeningState.dictHintShown;
  if (listeningState.dictHintShown) {
    const mask = q.answer.split(/(\s+)/).map(tok => {
      if (/^\s+$/.test(tok)) return tok;
      return tok.split('').map((ch, i) => i === 0 ? ch : (ch === ' ' || ch === ',' || ch === '.' || ch === '?' || ch === '!') ? ch : '_').join('');
    }).join('');
    hint.textContent = mask;
    hint.style.display = 'block';
  } else {
    hint.style.display = 'none';
  }
  // 重新渲染按钮文字
  const btn = document.querySelector('button[onclick="toggleDictHint()"]');
  if (btn) btn.innerHTML = `💡 ${listeningState.dictHintShown ? '隐藏首字母' : '首字母提示'}`;
}

function shuffleArr(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// 从全库抽取「汉语释义」干扰项：
// - 来源不限于当前题目那几个词，而是整个词库（避免选项反复重复、被排除法猜中）
// - 选项之间差异要足够大：干扰项释义不能包含与正确项相同的「词素」，避免 A/B 选项同义
function pickMeaningDistractors(correct, sourceMeanings, count) {
  const norm = s => (s || '').trim().replace(/[\s,，;；、/（）()]+/g, ' ').replace(/\s+/g, ' ').trim();
  const cn = norm(correct);
  if (!cn) return shuffleArr(sourceMeanings).filter(m => norm(m) !== cn).slice(0, count);

  // 把释义拆成词素：按分号、逗号、顿号、斜杠、空格切分
  const tokenize = s => norm(s).split(/[；;，,、/ ]+/).filter(t => t && t.length);
  const correctTokens = tokenize(cn);

  // 候选：排除与正确项完全相同
  const cand = sourceMeanings.filter(m => norm(m) !== cn);

  // 判断候选是否「太相似」：若候选任一 token 与正确项任一 token 相同，或互为子串，则排除
  const isTooSimilar = m => {
    const tokens = tokenize(m);
    for (const ct of correctTokens) {
      for (const t of tokens) {
        if (!t || !ct) continue;
        // 完全相同的词素
        if (t === ct) return true;
        // 双字及以上互为子串（如 "花费" 与 "花费" / "收视率" 与 "收视"）
        if (t.length >= 2 && ct.length >= 2 && (t.indexOf(ct) >= 0 || ct.indexOf(t) >= 0)) return true;
      }
    }
    return false;
  };

  // 第一步：优先选择完全不相似的干扰项
  let pool = cand.filter(m => !isTooSimilar(m));
  if (pool.length < count) {
    // 第二步：放宽到仅排除 token 完全相同，允许单字/部分重叠
    pool = cand.filter(m => {
      const tokens = tokenize(m);
      for (const ct of correctTokens) {
        for (const t of tokens) {
          if (t === ct) return false;
        }
      }
      return true;
    });
  }
  if (pool.length < count) {
    // 最后兜底：只能排除和正确项完全相同的
    pool = cand;
  }

  const out = [];
  const used = new Set();
  for (const m of shuffleArr(pool)) {
    const k = norm(m);
    if (!used.has(k)) { used.add(k); out.push(m); if (out.length === count) break; }
  }
  return out;
}

function renderListening() {
  listeningState.active = false;
  listeningState.mode = null;
  const progress = getListeningProgress(Utils.today());
  const modeLines = LISTENING_MODES.map(m => {
    const done = progress.today[m.key] || 0;
    const goal = LISTENING_GOALS[m.key];
    const doneMark = done >= goal ? ' ✅' : '';
    return `${m.label} ${done}/${goal}${doneMark}`;
  }).join(' · ');
  document.getElementById("page-listening").innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <h2 style="font-size:20px;">🎧 听力练习</h2>
      </div>
    </div>
    <p style="color:var(--text-secondary);margin-bottom:8px;font-size:14px;">
      四级听力训练：听英文、做选择或听写，告别「看得懂却听不懂」。今日总进度 <b>${progress.totalDone}/${progress.totalGoal}</b> 题。
    </p>
    <p style="color:var(--text-secondary);margin-bottom:16px;font-size:13px;">
      ${modeLines}
    </p>
    <div class="listen-modes">
      ${listenModeCard('word', '🎧', '听词选义', '听单词发音（默认从已学过的旧词）；未学过的词不影响复习')}
      ${listenModeCard('dialogue', '💬', '对话理解', '听四级题材对话，选出正确答案')}
      ${listenModeCard('sentence', '🔊', '听句选译', '听一个句子，选出正确的中文翻译')}
      ${listenModeCard('dictation', '✍️', '句子听写', '听句子，写出你听到的英文')}
    </div>
    <div class="listen-hint">💡 听不清可点「🔊 重听」反复播放；建议佩戴耳机，效果更佳。</div>
  `;
}

function listenModeCard(mode, icon, title, desc) {
  const progress = getListeningProgress(Utils.today());
  const done = progress.today[mode] || 0;
  const goal = LISTENING_GOALS[mode];
  const badge = done >= goal
    ? '<span style="color:var(--success);font-size:12px;">今日已完成</span>'
    : `<span style="color:var(--text-secondary);font-size:12px;">${done}/${goal}</span>`;
  return `
    <div class="listen-mode-card" onclick="startListening('${mode}')">
      <div class="listen-mode-icon">${icon}</div>
      <div class="listen-mode-title">${title}</div>
      <div class="listen-mode-desc">${desc}</div>
      <div class="listen-mode-go" style="display:flex;align-items:center;gap:6px;">${badge} <span>→</span></div>
    </div>`;
}

function startListening(mode) {
  listeningState.mode = mode;
  listeningState.current = 0;
  listeningState.correct = 0;
  listeningState.wrong = 0;
  listeningState.answered = false;
  listeningState.active = true;
  listeningState.dictHintShown = false;
  listeningState.autoPlayed = false;
  listeningState.aborted = false;
  listeningState.questions = buildListeningQuestions(mode, LISTENING_GOALS[mode]);
  renderListeningQuestion();
}

// 停止当前听力音频（手动退出 / 跳转到其他页面时调用）
function stopListeningAudio() {
  listeningState.aborted = true;
  Speech.stopSpeak();
  AudioPlayer.stop();
  const btn = document.getElementById('listenPlayBtn');
  if (btn) btn.classList.remove('playing');
}

function buildListeningQuestions(mode, n) {
  const qs = [];
  // 全库释义池（干扰项来源，不限于当前题目那几个词）
  const allMeanings = VOCABULARY.map(w => w.meaning);
  const allSentenceCn = SENTENCES.map(s => s.cn);
  if (mode === 'word') {
    // 默认从已学过的旧词出题（level ≥ 1），符合"听已背过的词"诉求；不足时用全库补足
    const learned = VOCABULARY.filter(w => (state.wordStatus[w.id]?.level || 0) >= 1);
    const pool = learned.length >= 5 ? shuffleArr(learned) : shuffleArr(VOCABULARY);
    const items = pool.map(w => ({
      play: w.word, answer: w.meaning,
      ref: { id: w.id, word: w.word, phonetic: w.phonetic, meaning: w.meaning }
    }));
    for (let i = 0; i < n; i++) {
      const a = items[i % items.length];
      const dist = pickMeaningDistractors(a.answer, allMeanings, 3);
      // 选项做成富对象：cn=释义、en=单词、id=词条 id，打乱后生成 options
      let optionMap = [
        { cn: a.answer, en: a.ref.word, id: a.ref.id, correct: true },
        ...dist.map(m => {
          // 用 cn 反查单词（一个 cn 可能对应多词，取首个）
          const w = VOCABULARY.find(x => x.meaning === m) || { id: 0, word: '' };
          return { cn: m, en: w.word, id: w.id, correct: false };
        })
      ];
      optionMap = shuffleArr(optionMap);
      qs.push({
        type: 'word', play: a.play, answer: a.answer,
        options: optionMap.map(o => o.cn), // 兼容旧代码（按 cn 字符串比较）
        optionMap, ref: a.ref
      });
    }
  } else if (mode === 'sentence') {
    const items = shuffleArr(SENTENCES).map(s => ({
      play: s.en, answer: s.cn,
      ref: { id: s.id, word: s.en, phonetic: '', meaning: s.cn }
    }));
    for (let i = 0; i < n; i++) {
      const a = items[i % items.length];
      const dist = pickMeaningDistractors(a.answer, allSentenceCn, 3);
      let optionMap = [
        { cn: a.answer, en: a.ref.word, id: a.ref.id, correct: true },
        ...dist.map(m => {
          const s = SENTENCES.find(x => x.cn === m) || { id: 0, en: '' };
          return { cn: m, en: s.en, id: s.id, correct: false };
        })
      ];
      optionMap = shuffleArr(optionMap);
      qs.push({
        type: 'sentence', play: a.play, answer: a.answer,
        options: optionMap.map(o => o.cn),
        optionMap, ref: a.ref
      });
    }
  } else if (mode === 'dialogue') {
    const ds = shuffleArr(DIALOGUES).slice(0, n);
    for (let i = 0; i < n; i++) {
      const d = ds[i % ds.length];
      const script = d.lines.map(l => l.text).join(' ');
      // 选项与中文翻译一并打乱，正确答案位置随机化（避免总是同一选项）
      const paired = d.options.map((opt, ki) => ({ en: opt, cn: (d.optionsCn || [])[ki] }));
      const shuffled = shuffleArr(paired);
      const correctEn = d.options[d.answer];
      qs.push({
        type: 'dialogue',
        play: script,
        dialogue: d,
        question: d.question,
        options: shuffled.map(o => o.en),   // English（已打乱）
        optionsCn: shuffled.map(o => o.cn), // Chinese（与英文同序打乱）
        answer: correctEn,                   // 按英文文本判分，与位置无关
        answerIdx: shuffled.findIndex(o => o.en === correctEn),
        explain: d.explain,
        ref: { id: d.id, word: d.scene, phonetic: '', meaning: d.question }
      });
    }
  } else { // dictation
    const items = shuffleArr(SENTENCES).slice(0, n).map(s => ({
      play: s.en, answer: s.en, cn: s.cn,
      ref: { id: s.id, word: s.en, phonetic: '', meaning: s.cn }
    }));
    for (let i = 0; i < n; i++) {
      const a = items[i % items.length];
      qs.push({ type: 'dictation', play: a.play, answer: a.answer, cn: a.cn, ref: a.ref });
    }
  }
  return qs;
}

function renderListeningQuestion() {
  const q = listeningState.questions[listeningState.current];
  if (!q) { renderListeningResult(); return; }
  const total = listeningState.questions.length;
  const progress = (listeningState.current / total) * 100;
  const isDict = q.type === 'dictation';
  const isDialogue = q.type === 'dialogue';

  let bodyHtml;
  if (isDict) {
    // 听写题：用户多次重听（慢速/原速/首字母提示）方便不同水平
    bodyHtml = `
      <div class="prompt">请听写你听到的句子（英文）</div>
      <textarea id="listenDictInput" class="spell-input" style="min-height:90px;" placeholder="在此输入你听到的英文..." onkeydown="if(event.key==='Enter'&&event.ctrlKey)submitListeningDictation()" autocomplete="off"></textarea>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="submitListeningDictation()">提交听写</button>
        <button class="btn btn-speech-sm" onclick="playListeningSlow()">🐢 慢速重播</button>
        <button class="btn btn-speech-sm" onclick="toggleDictHint()">💡 ${listeningState.dictHintShown ? '隐藏首字母' : '首字母提示'}</button>
      </div>
      <div id="dictHint" style="display:none;margin-top:10px;font-size:14px;color:var(--text-secondary);background:var(--primary-bg);padding:10px 14px;border-radius:8px;letter-spacing:2px;"></div>`;
  } else if (isDialogue) {
    // 对话默认隐藏文本（先听后选），用 A/B 标识替代刻意男女声，播放时高亮当前句
    const totalLines = q.dialogue.lines.length;
    bodyHtml = `
      <div id="dialogueText" style="display:none;">
        <div class="dialogue-script">
          ${q.dialogue.lines.map((l, i) => `
            <div class="dialogue-line" id="dialogueLine_${i}">
              <span class="dialogue-who ${l.who === 'M' ? 'm' : 'w'}">${l.who === 'M' ? '👤 A' : '👤 B'}</span>
              <span class="dialogue-text">${escapeHtml(l.text)}</span>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="dialogue-progress">
        <div class="ds-label">🎙️ 正在播放第 <span id="dsCur">1</span> / ${totalLines} 句</div>
        <div class="ds-bar"><div class="ds-fill" id="dsFill" style="width:0%"></div></div>
      </div>
      <div class="dialogue-toggle">
        <button class="btn btn-speech-sm" id="toggleDialogueBtn" onclick="toggleDialogueText()">👁️ 显示对话文本</button>
      </div>
      <div class="prompt">${escapeHtml(q.question)}</div>
      <div class="test-options" id="listenOptions">
        ${q.options.map((opt, i) => `
          <div class="test-option" onclick="answerListening(${i})" data-idx="${i}">
            ${String.fromCharCode(65 + i)}. ${escapeHtml(opt)}
          </div>`).join('')}
      </div>`;
  } else {
    bodyHtml = `
      <div class="prompt">请听音频，选择正确答案</div>
      <div class="test-options" id="listenOptions">
        ${q.options.map((opt, i) => `
          <div class="test-option" onclick="answerListening(${i})" data-idx="${i}">
            ${String.fromCharCode(65 + i)}. ${escapeHtml(opt)}
          </div>`).join('')}
      </div>`;
  }

  document.getElementById("page-listening").innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <button class="btn btn-secondary btn-icon" onclick="exitListening()">←</button>
        <span style="font-weight:600;">${q.type === 'word' ? '听词选义' : q.type === 'sentence' ? '听句选译' : q.type === 'dictation' ? '句子听写' : '对话理解'}</span>
      </div>
      <div class="toolbar-right" style="font-size:14px;color:var(--text-secondary);">
        ${listeningState.current + 1} / ${total} · ✅${listeningState.correct} ❌${listeningState.wrong}
      </div>
    </div>

    <div class="test-container">
      <div class="test-progress">
        <span style="font-size:13px;color:var(--text-secondary);">进度</span>
        <div class="test-progress-bar"><div class="test-progress-fill" style="width:${progress}%;"></div></div>
      </div>

      <div class="listen-play-zone">
        <button class="listen-big-play" id="listenPlayBtn" onclick="playListeningCurrent()">🔊</button>
        <div class="listen-hint">${isDialogue ? '点击播放整段对话（逐句朗读，自然发音）' : '点击播放 / 重听（可多次）'}</div>
      </div>

      <div class="test-question" onkeydown="listenKeyHandler(event)">${bodyHtml}</div>
      <div id="listenFeedback"></div>
    </div>
  `;

  // 听词选义：进入后自动播放一次，之后由用户手动点击重听
  if (q.type === 'word' && !listeningState.autoPlayed) {
    listeningState.autoPlayed = true;
    const currentIdx = listeningState.current;
    setTimeout(() => {
      if (listeningState.active && listeningState.current === currentIdx && !listeningState.answered) {
        playListeningCurrent();
      }
    }, 500);
  }
  if (isDict) setTimeout(() => { const ta = document.getElementById('listenDictInput'); if (ta) ta.focus(); }, 400);
  setTimeout(() => activateWordTap("page-listening"), 60);
}

function playListeningCurrent() {
  const q = listeningState.questions[listeningState.current];
  if (!q) return;
  const btn = document.getElementById('listenPlayBtn');
  if (btn) btn.classList.add('playing');

  // 对话模式：逐句朗读
  if (q.type === 'dialogue' && q.dialogue && q.dialogue.lines) {
    playDialogueLines(q.dialogue.lines, 0, btn);
    return;
  }

  // 长句（听句选译 / 句子听写）走系统 TTS，避免有道 dictvoice 卡顿、发怪声
  if (q.type === 'sentence' || q.type === 'dictation') {
    speakSentence(q.play, {
      rate: 0.8,
      onend: function () { if (btn) btn.classList.remove('playing'); }
    });
    return;
  }

  // 单词（听词选义）仍走真人发音，声音最自然
  playTextAudio(q.play, {
    rate: 0.8,
    onend: function () { if (btn) btn.classList.remove('playing'); }
  });
}

// 逐句播放对话：统一自然音高，不再刻意分男女变调，避免声音滑稽
// 视觉同步：进度条 + 当前句高亮
function playDialogueLines(lines, idx, btn) {
  const total = lines.length;
  // 更新进度
  const curEl = document.getElementById('dsCur');
  const fillEl = document.getElementById('dsFill');
  if (curEl) curEl.textContent = Math.min(idx + 1, total);
  if (fillEl) fillEl.style.width = Math.round((idx / Math.max(1, total - 1)) * 100) + '%';
  // 高亮当前句（若文本已展开）
  document.querySelectorAll('.dialogue-line').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
  });
  if (idx >= lines.length) {
    if (btn) btn.classList.remove('playing');
    return;
  }
  const line = lines[idx];
  speakSentence(line.text, { rate: 0.85, onend: function () {
    if (listeningState.aborted) { if (btn) btn.classList.remove('playing'); return; }
    setTimeout(() => playDialogueLines(lines, idx + 1, btn), 300);
  }});
}

function answerListening(idx) {
  if (listeningState.answered) return;
  const q = listeningState.questions[listeningState.current];
  listeningState.answered = true;
  const options = document.querySelectorAll('#listenOptions .test-option');
  options.forEach(o => o.classList.add('disabled'));
  const selected = q.options[idx];
  const isCorrect = selected === q.answer;
  listeningState.currentCorrect = isCorrect;
  if (isCorrect) {
    options[idx].classList.add('correct');
    listeningState.correct++;
    playCorrectSound();
  } else {
    options[idx].classList.add('wrong');
    const ci = q.options.indexOf(q.answer);
    if (ci >= 0) options[ci].classList.add('correct');
    listeningState.wrong++;
    addError(q.ref, 'listening', selected, q.answer);
  }
  // 答完后揭示每个选项的英文（听词选义/听句选译 模式），点击可看例句
  if (q.optionMap) {
    options.forEach((el, i) => {
      el.classList.add('revealed');
      const o = q.optionMap[i];
      if (!o) return;
      const enText = escapeHtml(o.en || '');
      // 单词模式：英文作为可点开例句的 chip；句子模式：英文整句作展示
      if (q.type === 'word' && o.id) {
        const enSpan = document.createElement('span');
        enSpan.className = 'opt-word clickable';
        enSpan.title = '点击查看例句';
        enSpan.onclick = () => toggleListenOptionExample(o.id);
        enSpan.innerHTML = `${enText} <span class="ex-hint">💡</span>`;
        el.appendChild(enSpan);
        const exDiv = document.createElement('div');
        exDiv.className = 'opt-example';
        exDiv.id = `listenOptEx-${o.id}`;
        exDiv.style.display = 'none';
        el.appendChild(exDiv);
      } else if (q.type === 'sentence' && o.en) {
        const enDiv = document.createElement('div');
        enDiv.className = 'opt-sentence-en';
        enDiv.style.fontSize = '13px';
        enDiv.style.color = 'var(--text-secondary)';
        enDiv.style.marginTop = '6px';
        enDiv.style.fontStyle = 'italic';
        enDiv.textContent = enText;
        el.appendChild(enDiv);
      }
    });
  }
  // 对话模式：答完后揭示每个选项的中文翻译
  if (q.type === 'dialogue' && q.optionsCn) {
    options.forEach((el, i) => {
      el.classList.add('revealed');
      const cn = q.optionsCn[i] || '';
      if (cn) {
        const cnDiv = document.createElement('div');
        cnDiv.style.fontSize = '13px';
        cnDiv.style.color = 'var(--text-secondary)';
        cnDiv.style.marginTop = '4px';
        cnDiv.textContent = '🔤 ' + cn;
        el.appendChild(cnDiv);
      }
    });
  }
  recordListeningDone();
  showListeningFeedback(q, isCorrect, null);
}

// 对话理解：切换文本显示/隐藏
function toggleDialogueText() {
  const textEl = document.getElementById('dialogueText');
  const btn = document.getElementById('toggleDialogueBtn');
  if (!textEl || !btn) return;
  if (textEl.style.display === 'none' || textEl.style.display === '') {
    textEl.style.display = 'block';
    btn.innerHTML = '🙈 隐藏对话文本';
  } else {
    textEl.style.display = 'none';
    btn.innerHTML = '👁️ 显示对话文本';
  }
}

// 听力题答完后，点击英文单词展开/收起例句
function toggleListenOptionExample(id) {
  const ex = document.getElementById(`listenOptEx-${id}`);
  if (!ex) return;
  if (ex.style.display === 'none' || ex.style.display === '') {
    const vw = VOCABULARY.find(x => x.id === id);
    if (!vw) return;
    const result = lookupWord(vw.word);
    if (!result) return;
    const { w, ex: example } = result;
    ex.innerHTML = `
      <div class="example-card" style="text-align:left;padding:12px 14px;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
          <span style="font-weight:700;font-size:16px;color:var(--text-primary);">${escapeHtml(w.word)}</span>
          ${w.phonetic ? `<span style="font-size:13px;color:var(--text-light);">${escapeHtml(w.phonetic)}</span>` : ''}
          ${w.pos ? `<span style="font-size:12px;color:var(--text-light);background:var(--primary-bg);padding:2px 6px;border-radius:4px;">${escapeHtml(w.pos)}</span>` : ''}
        </div>
        <div style="color:var(--text-secondary);font-size:14px;margin-bottom:10px;line-height:1.5;">${escapeHtml(w.meaning)}</div>
        ${example && example.en ? `
          <div class="example-en" style="font-size:14px;line-height:1.6;">${escapeHtml(example.en)}</div>
          ${example.cn ? `<div class="example-cn" style="font-size:13px;color:var(--text-light);margin-top:4px;line-height:1.5;">${escapeHtml(example.cn)}</div>` : ''}
        ` : ''}
        <div style="margin-top:10px;">
          <button class="btn btn-speech-sm" onclick="event.stopPropagation();speakWord('${w.word.replace(/'/g, "\\'")}')">🔊 朗读</button>
        </div>
      </div>
    `;
    ex.style.display = 'block';
  } else {
    ex.style.display = 'none';
  }
}

function submitListeningDictation() {
  if (listeningState.answered) return;
  const q = listeningState.questions[listeningState.current];
  const input = document.getElementById('listenDictInput');
  const userAns = input ? input.value.trim() : '';
  if (!userAns) { Utils.toast('请先输入听到的内容', 'warning'); return; }
  listeningState.answered = true;
  const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const ansNorm = norm(q.answer);
  const userWords = norm(userAns).split(' ').filter(Boolean);
  const kws = (ansNorm.match(/\b[a-z]{3,}\b/g) || []);
  const matched = kws.filter(k => userWords.includes(k));
  const pct = kws.length ? Math.round((matched.length / kws.length) * 100) : 100;
  const isCorrect = pct >= 80;
  if (isCorrect) {
    listeningState.correct++;
  } else {
    listeningState.wrong++;
    addError(q.ref, 'listening', userAns, q.answer);
  }
  recordListeningDone();
  showListeningFeedback(q, isCorrect, { pct });
}

function showListeningFeedback(q, isCorrect, dictInfo) {
  const feedback = document.getElementById('listenFeedback');
  if (!feedback) return;
  let detail = '';
  if (q.type === 'word') {
    detail = `
      <div style="margin-top:8px;font-size:15px;font-weight:600;">${escapeHtml(q.ref.word)}</div>
      <div style="font-size:14px;color:var(--text-secondary);margin-top:4px;">${escapeHtml(q.ref.meaning)}</div>
      ${q.ref.phonetic ? `<div style="font-size:13px;color:var(--text-light);">${escapeHtml(q.ref.phonetic)}</div>` : ''}`;
  } else if (q.type === 'sentence') {
    detail = `
      <div style="margin-top:8px;font-size:15px;">${escapeHtml(q.ref.word)}</div>
      <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">${escapeHtml(q.ref.meaning)}</div>`;
  } else {
    detail = `
      <div style="margin-top:8px;font-size:14px;text-align:left;">
        <div style="font-weight:600;margin-bottom:4px;">标准答案：</div>
        <div style="font-size:15px;color:var(--text);">${escapeHtml(q.answer)}</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">${escapeHtml(q.cn)}</div>
        ${q.type === 'dialogue' && q.optionsCn ? '<div style="font-size:13px;margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);">选项中文：<br/>' + q.options.map(function(opt,i){ return '· '+ escapeHtml(opt) + ' <span style="color:var(--text-light);">' + escapeHtml(q.optionsCn[i]||'') + '</span>'; }).join('<br/>') + '</div>' : ''}
        ${dictInfo ? `<div style="font-size:13px;margin-top:6px;">关键词匹配度：<b>${dictInfo.pct}%</b></div>` : ''}
      </div>`;
  }
  feedback.innerHTML = `
    <div class="card" style="text-align:center;margin-top:16px;${isCorrect ? 'border:2px solid var(--success);' : 'border:2px solid var(--danger);'}">
      <div style="font-size:18px;font-weight:600;color:${isCorrect ? 'var(--success)' : 'var(--danger)'};">
        ${isCorrect ? '✅ 答对了！' : '❌ 答错了'}
      </div>
      ${detail}
      ${q.explain ? `<div style="font-size:13px;color:var(--text-secondary);margin-top:10px;text-align:left;"><b>解析：</b>${escapeHtml(q.explain)}</div>` : ''}
      <div style="margin-top:16px;display:flex;flex-direction:column;gap:10px;align-items:center;">
        <button class="btn btn-primary btn-lg" style="min-width:200px;justify-content:center;" onclick="nextListening()">下一题<span class="btn-icon-r">→</span></button>
        <button class="btn btn-speech" onclick="playListeningCurrent()">🔊 再听一遍</button>
      </div>
      ${isCorrect ? `<div style="font-size:12px;color:var(--text-light);margin-top:8px;">按 Enter 也可直接跳到下一题</div>` : ''}
    </div>`;
  // 答对后自动聚焦「下一题」按钮，回车即可进入下一题
  if (isCorrect) {
    const nb = feedback.querySelector('.btn-primary');
    if (nb) { nb.focus(); nb.scrollIntoView({ block: 'center' }); }
  }
  setTimeout(() => activateWordTap("listenFeedback"), 50);
}

function nextListening() {
  Speech.stopSpeak();          // 切下一题时停掉上一题余音
  listeningState.aborted = false;
  listeningState.answered = false;
  listeningState.currentCorrect = false;
  listeningState.autoPlayed = false;
  listeningState.current++;
  if (listeningState.current >= listeningState.questions.length) renderListeningResult();
  else renderListeningQuestion();
}

// 听力答题区回车键：答对后按 Enter 直接进下一题（输入法/文本框内不触发）
function listenKeyHandler(e) {
  if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
  if (e.key === 'Enter' && listeningState.answered && listeningState.currentCorrect) {
    e.preventDefault();
    nextListening();
  }
}

function recordListeningDone() {
  const today = Utils.today();
  const mode = listeningState.mode;
  if (!state.listening.daily[today]) state.listening.daily[today] = { word: 0, dialogue: 0, sentence: 0, dictation: 0 };
  // 兼容旧数字格式
  if (typeof state.listening.daily[today] === 'number') {
    state.listening.daily[today] = { word: state.listening.daily[today], dialogue: 0, sentence: 0, dictation: 0 };
  }
  if (mode && state.listening.daily[today][mode] !== undefined) {
    state.listening.daily[today][mode]++;
  }
  Store.save();
}

function renderListeningResult() {
  const total = listeningState.questions.length;
  const acc = total ? Math.round((listeningState.correct / total) * 100) : 0;
  const color = acc >= 80 ? 'var(--success)' : (acc >= 60 ? 'var(--warning)' : 'var(--danger)');
  document.getElementById("page-listening").innerHTML = `
    <div class="toolbar"><div class="toolbar-left"><h2 style="font-size:20px;">🎉 本轮完成</h2></div></div>
    <div class="card" style="text-align:center;padding:36px;">
      <div style="font-size:52px;font-weight:700;color:${color};">${acc}%</div>
      <div style="font-size:16px;margin-top:8px;">正确率</div>
      <div style="font-size:14px;color:var(--text-secondary);margin-top:6px;">✅ ${listeningState.correct} 题 · ❌ ${listeningState.wrong} 题</div>
    </div>
    <div style="margin-top:22px;display:flex;gap:12px;flex-wrap:wrap;">
      <button class="btn btn-primary btn-lg" onclick="startListening('${listeningState.mode}')">🔁 再来一轮</button>
      <button class="btn btn-secondary btn-lg" onclick="renderListening()">返回菜单</button>
    </div>`;
}

function exitListening() {
  stopListeningAudio();
  renderListening();
}

// ==========================================
// 四级翻译练习模块（汉译英·模拟真题题材）
// ==========================================
const TRANSLATE_GOAL = 1; // 每日翻译打卡目标：1 篇即 100%
let translateState = { active: false, current: 0, items: [], userAns: '', scored: null };

function renderTranslate() {
  translateState.active = false;
  const doneToday = state.translate.daily[Utils.today()] || 0;
  document.getElementById("page-translate").innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <h2 style="font-size:20px;">📝 四级翻译练习</h2>
      </div>
    </div>
    <p style="color:var(--text-secondary);margin-bottom:16px;font-size:14px;">
      汉译英训练：给出中文段落，写出英文译文，系统按采分点关键词自动评分。每日目标 <b>${TRANSLATE_GOAL}</b> 篇，今日已完成 <b>${doneToday}</b> 篇。<br/>
      <span style="color:var(--text-light);">题材参考四级常考的中国文化 / 社会 / 发展类主题（模拟真题题材）。</span>
    </p>
    <div class="translate-list">
      ${TRANSLATE_ITEMS.map((t) => `
        <div class="translate-card" onclick="startTranslate('${t.id}')">
          <div class="translate-card-top">
            <span class="translate-topic">${escapeHtml(t.topic)}</span>
            <span class="translate-diff diff-${t.difficulty}">${t.difficulty}</span>
          </div>
          <div class="translate-card-cn">${escapeHtml(t.cn.slice(0, 42))}…</div>
          <div class="translate-card-go">📖 先记忆 →</div>
        </div>
      `).join('')}
    </div>
  `;
}

function startTranslate(id) {
  // 先展示中英文对照预览，让用户记忆后再练习
  showTranslatePreview(id);
}

// 第 1 步：中英对照预览（先记忆背诵）
function showTranslatePreview(id) {
  const item = TRANSLATE_ITEMS.find(t => t.id === id);
  if (!item) return;
  translateState.active = false;
  const enEscaped = item.en.replace(/'/g, "\\'");
  document.getElementById("page-translate").innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <button class="btn btn-secondary btn-icon" onclick="renderTranslate()">←</button>
        <span style="font-weight:600;">📝 先记忆 · ${escapeHtml(item.topic)}</span>
      </div>
      <div class="toolbar-right">
        <span class="translate-diff diff-${item.difficulty}">${item.difficulty}</span>
      </div>
    </div>
    <div class="translate-memory-card">
      <div class="translate-memory-title">📖 中英对照 · 请先记忆背诵</div>
      <div class="translate-memory-cn">${escapeHtml(item.cn)}</div>
      <div class="translate-memory-divider"></div>
      <div class="translate-memory-en">${escapeHtml(item.en)}</div>
      <div style="margin-top:10px;">
        <button class="btn btn-speech-sm" onclick="speakWord('${enEscaped}')">🔊 朗读英文</button>
      </div>
    </div>
    <div class="translate-memory-points">
      <div class="translate-memory-points-title">🎯 采分点关键词</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">
        ${item.points.map(p => `<span class="point-tag hit">${escapeHtml(p)}</span>`).join('')}
      </div>
    </div>
    <div style="margin-top:20px;display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
      <button class="btn btn-primary btn-lg" onclick="startTranslatePractice('${id}')">✅ 已背诵，开始翻译</button>
      <button class="btn btn-secondary" onclick="startTranslatePractice('${id}')">直接翻译（跳过背诵）</button>
    </div>
  `;
  setTimeout(() => activateWordTap("page-translate"), 60);
}

// 第 2 步：真正的翻译练习（只看中文，写出英文）
function startTranslatePractice(id) {
  const item = TRANSLATE_ITEMS.find(t => t.id === id);
  if (!item) { renderTranslate(); return; }
  translateState.active = true;
  translateState.current = 0;
  translateState.items = [item];
  translateState.userAns = '';
  translateState.scored = null;
  renderTranslateQuestion();
}

function renderTranslateQuestion() {
  const item = translateState.items[translateState.current];
  if (!item) { renderTranslate(); return; }
  translateState.scored = null;
  document.getElementById("page-translate").innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <button class="btn btn-secondary btn-icon" onclick="renderTranslate()">←</button>
        <span style="font-weight:600;">📝 翻译 · ${escapeHtml(item.topic)}</span>
      </div>
    </div>
    <div class="test-container">
      <div class="translate-cn-card">
        <div class="translate-cn-title">请将以下中文翻译成英文：</div>
        <div class="translate-cn-text">${escapeHtml(item.cn)}</div>
      </div>
      <textarea id="translateInput" class="spell-input" style="min-height:140px;" placeholder="在此输入你的英文译文..." onkeydown="if(event.key==='Enter'&&event.ctrlKey)submitTranslate()" autocomplete="off"></textarea>
      <div style="margin-top:12px;display:flex;gap:8px;">
        <button class="btn btn-primary" onclick="submitTranslate()">提交译文</button>
        <button class="btn btn-secondary" onclick="renderTranslate()">返回</button>
      </div>
      <div id="translateFeedback"></div>
    </div>
  `;
  setTimeout(() => { const ta = document.getElementById('translateInput'); if (ta) ta.focus(); }, 300);
  setTimeout(() => activateWordTap("page-translate"), 60);
}

function scoreTranslate(userAns, item) {
  const userWords = (userAns.toLowerCase().match(/[a-z']+/g) || []);
  const set = new Set(userWords);
  const check = p => p.toLowerCase().split(/\s+/).filter(Boolean).every(w => set.has(w));
  const hit = item.points.filter(check).length;
  const kwPct = item.points.length ? Math.round((hit / item.points.length) * 100) : 0;
  const refWords = (item.en.toLowerCase().match(/[a-z']+/g) || []);
  const ratio = refWords.length ? Math.min(userWords.length / refWords.length, refWords.length / userWords.length) : 0;
  const lenScore = Math.round(ratio * 100);
  const total = Math.round(kwPct * 0.75 + lenScore * 0.25);
  return { total, kwPct, hit, lenScore, missed: item.points.filter(p => !check(p)) };
}

function submitTranslate() {
  if (translateState.scored) return;
  const item = translateState.items[translateState.current];
  const input = document.getElementById('translateInput');
  const userAns = input ? input.value.trim() : '';
  if (!userAns) { Utils.toast('请先输入英文译文', 'warning'); return; }
  const res = scoreTranslate(userAns, item);
  translateState.scored = res;
  translateState.userAns = userAns;
  const today = Utils.today();
  if (!state.translate.daily[today]) state.translate.daily[today] = 0;
  state.translate.daily[today]++;
  if (res.total < 60) {
    addError({ id: item.id, word: item.topic, phonetic: '', meaning: item.cn.slice(0, 30) + '…' }, 'translate', userAns, item.en);
  }
  Store.save();
  renderTranslateFeedback();
}

function renderTranslateFeedback() {
  const item = translateState.items[translateState.current];
  const res = translateState.scored;
  const fb = document.getElementById('translateFeedback');
  if (!fb) return;
  const pointsHtml = item.points.map(p => {
    const ok = !res.missed.includes(p);
    return `<span class="point-tag ${ok ? 'hit' : 'miss'}">${escapeHtml(p)}</span>`;
  }).join('');
  const grade = res.total >= 85 ? '优秀' : res.total >= 70 ? '良好' : res.total >= 60 ? '及格' : '需努力';
  const color = res.total >= 70 ? 'var(--success)' : res.total >= 60 ? 'var(--warning)' : 'var(--danger)';
  fb.innerHTML = `
    <div class="card" style="margin-top:16px;border:2px solid ${color};">
      <div style="font-size:20px;font-weight:600;color:${color};">得分 ${res.total} 分 · ${grade}</div>
      <div style="font-size:13px;color:var(--text-secondary);margin-top:6px;">采分点命中 ${res.hit}/${item.points.length}（${res.kwPct}%）· 篇幅匹配 ${res.lenScore}%</div>
      <div style="margin-top:10px;font-size:13px;font-weight:600;">采分点：</div>
      <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px;">${pointsHtml}</div>
      <div style="margin-top:14px;font-size:13px;font-weight:600;">参考译文：</div>
      <div style="margin-top:6px;font-size:14px;line-height:1.7;color:var(--text);background:var(--surface-alt);padding:12px;border-radius:8px;">${escapeHtml(item.en)}</div>
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="renderTranslate()">返回列表</button>
        <button class="btn btn-secondary" onclick="renderTranslateQuestion()">再做一次</button>
      </div>
    </div>`;
  // 参考译文里的英文单词也可点开查词
  setTimeout(() => activateWordTap("translateFeedback"), 50);
}

// ==========================================
// 统计模块
// ==========================================
function renderStats() {
  let mastered = 0, learning = 0, newWords = 0;
  Object.values(state.wordStatus).forEach(s => {
    if (s.level >= 3) mastered++;
    else if (s.level >= 1) learning++;
    else newWords++;
  });

  const totalTests = state.progress.totalTests;
  const totalCorrect = state.progress.totalCorrect;
  const accuracy = totalTests > 0 ? Math.round((totalCorrect / (totalCorrect + state.errorBook.filter(e => !e.mastered).length || 1)) * 100) : 0;

  // 30天热力图
  let heatmapHtml = "";
  for (let i = 29; i >= 0; i--) {
    const date = Utils.dateOffset(-i);
    const words = getTodayWordCount(date);
    let level = 0;
    if (words >= 20) level = 3;
    else if (words >= 10) level = 2;
    else if (words > 0) level = 1;
    const isToday = i === 0;
    const dayNum = new Date(date).getDate();
    heatmapHtml += `<div class="heatmap-cell ${level > 0 ? 'studied-' + level : ''} ${isToday ? 'today' : ''}" title="${date}: ${words}词">${dayNum}</div>`;
  }

  // 句子统计
  let sentenceMastered = 0;
  Object.values(state.sentenceStatus).forEach(s => {
    if (s.level >= 3) sentenceMastered++;
  });

  const daysLeft = Utils.daysUntil(CONFIG.examDate);
  const dueReview = getDueReviewWords().length;

  document.getElementById("page-stats").innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <h2 style="font-size:20px;">📊 学习统计</h2>
      </div>
    </div>

    <div class="grid grid-4" style="margin-bottom:20px;">
      <div class="card stat-card">
        <div class="stat-icon">📚</div>
        <div class="stat-value">${state.progress.wordsLearned}</div>
        <div class="stat-label">已学单词</div>
      </div>
      <div class="card stat-card">
        <div class="stat-icon">🔁</div>
        <div class="stat-value">${dueReview}</div>
        <div class="stat-label">待复习单词</div>
      </div>
      <div class="card stat-card">
        <div class="stat-icon">🔥</div>
        <div class="stat-value">${state.progress.streak}</div>
        <div class="stat-label">连续打卡</div>
      </div>
      <div class="card stat-card">
        <div class="stat-icon">📅</div>
        <div class="stat-value">${daysLeft}</div>
        <div class="stat-label">距考试天数</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="card-title">🎯 掌握度分布</div>
      <div style="display:flex;flex-direction:column;gap:16px;margin-top:16px;">
        <div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
            <span style="font-size:14px;">📘 熟悉中</span>
            <span style="font-size:14px;font-weight:600;color:var(--info);">${learning}</span>
          </div>
          <div style="height:10px;background:var(--border);border-radius:5px;overflow:hidden;">
            <div style="height:100%;width:${VOCABULARY.length > 0 ? (learning / VOCABULARY.length) * 100 : 0}%;background:var(--info);border-radius:5px;transition:width 0.5s;"></div>
          </div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
            <span style="font-size:14px;">📝 未学习</span>
            <span style="font-size:14px;font-weight:600;color:var(--text-light);">${VOCABULARY.length - mastered - learning}</span>
          </div>
          <div style="height:10px;background:var(--border);border-radius:5px;overflow:hidden;">
            <div style="height:100%;width:${VOCABULARY.length > 0 ? ((VOCABULARY.length - mastered - learning) / VOCABULARY.length) * 100 : 0}%;background:var(--text-light);border-radius:5px;transition:width 0.5s;"></div>
          </div>
        </div>
        <div style="margin-top:8px;padding-top:16px;border-top:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;">
            <span style="font-size:14px;color:var(--text-secondary);">句子已掌握</span>
            <span style="font-size:14px;font-weight:600;">${sentenceMastered} / ${SENTENCES.length}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:6px;">
            <span style="font-size:14px;color:var(--text-secondary);">总测试次数</span>
            <span style="font-size:14px;font-weight:600;">${totalTests}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:6px;">
            <span style="font-size:14px;color:var(--text-secondary);">总学习天数</span>
            <span style="font-size:14px;font-weight:600;">${state.progress.totalStudyDays}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">🗓️ 30天学习日历</div>
      <div class="heatmap" style="grid-template-columns:repeat(10,1fr);">
        ${heatmapHtml}
      </div>
      <div class="heatmap-legend">
        <span>少</span>
        <div class="swatch" style="background:var(--surface-alt);border:1px solid var(--border);"></div>
        <div class="swatch" style="background:#c7d2fe;"></div>
        <div class="swatch" style="background:#93a4f9;"></div>
        <div class="swatch" style="background:var(--primary);"></div>
        <span>多</span>
        <span style="margin-left:auto;">总学习天数：${state.progress.totalStudyDays} 天</span>
      </div>
    </div>

    <div class="card" style="margin-top:20px;">
      <div class="card-title">🔧 数据修正</div>
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;line-height:1.6;">
        如果今天的「背词数」看起来不对（比如旧版本把同一单词的 3 轮练习算成了 3 个词），可以在这里手动修正为真实词数。
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <input type="number" id="fixTodayWordInput" class="modal-input" style="width:120px;" placeholder="例如 10" min="0" value="${getTodayWordCount()}" />
        <button type="button" class="btn btn-primary" onclick="fixTodayWordCount(document.getElementById('fixTodayWordInput').value)">修正今日背词数</button>
      </div>
    </div>

    ${renderExerciseStatsCard()}
  `;
}

// ==========================================
// 锻炼模块
// ==========================================

// 获取本周一日期
function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// 判断日期是否在本周
function isThisWeek(dateStr) {
  const ws = getWeekStart();
  const we = new Date(ws);
  we.setDate(we.getDate() + 7);
  const d = new Date(dateStr);
  return d >= ws && d < we;
}

// 获取所有跟练分类（默认 + 用户自定义）
function getVideoCategories() {
  const defaults = (EXERCISE_CONFIG.videoCategories || []).map(c => ({ ...c, default: true }));
  const userCats = (state.exercise?.userCategories || []).map(c => ({ ...c, user: true }));
  return [...defaults, ...userCats];
}

// 默认分类对应的主视频
function getDefaultVideoForCategory(cat) {
  return { id: cat.id, name: cat.name, icon: cat.icon, desc: cat.desc, link: "", catId: cat.id, default: true };
}

// 根据视频 ID 找到它所属的分类 ID
function getVideoCategoryId(videoId) {
  if (getVideoCategories().some(c => c.id === videoId)) return videoId;
  const uv = (state.exercise?.userVideos || []).find(v => v.id === videoId);
  return uv?.catId || null;
}

// 根据视频 ID 获取视频对象（默认主视频或用户视频）
function getVideoById(videoId) {
  const cat = getVideoCategories().find(c => c.id === videoId);
  if (cat) return getDefaultVideoForCategory(cat);
  return (state.exercise?.userVideos || []).find(v => v.id === videoId) || null;
}

// 获取某个分类下的所有视频（仅用户添加的视频；不再展示默认主视频）
function getVideosByCategory(catId) {
  const cat = getVideoCategories().find(c => c.id === catId);
  if (!cat) return [];
  const videos = [];
  (state.exercise?.userVideos || []).forEach(v => {
    if (v.catId === catId) videos.push(v);
  });
  return videos;
}

// 全部跟练视频（平铺列表）：用于日志查找、按视频统计次数
function getAllVideos() {
  const disabled = new Set(state.exercise?.disabledVideos || []);
  const list = [];
  getVideoCategories().forEach(cat => {
    if (disabled.has(cat.id)) return;
    list.push(getDefaultVideoForCategory(cat));
    (state.exercise?.userVideos || []).forEach(v => {
      if (v.catId === cat.id) list.push(v);
    });
  });
  // 兼容旧数据：没有 catId 的用户视频单独列出（避免丢失）
  (state.exercise?.userVideos || []).forEach(v => {
    if (!v.catId) list.push({ ...v, catId: 'other', orphan: true });
  });
  return list;
}

// 获取本周锻炼统计
function getWeekExerciseStats() {
  const weekLogs = (state.exercise?.log || []).filter(e => isThisWeek(e.date));
  const runLogs = weekLogs.filter(e => e.type === "run");
  const videoLogs = weekLogs.filter(e => e.type === "video");

  const runKm = runLogs.reduce((sum, e) => sum + (e.distance || 0), 0);
  const runDays = new Set(runLogs.map(e => e.date)).size;

  // 每个视频的独立打卡次数
  const videoCounts = {};
  getAllVideos().forEach(v => {
    videoCounts[v.id] = videoLogs.filter(e => e.category === v.id).length;
  });

  // 每个分类（模块）的总打卡次数；完成一个模块 = 该模块下至少练过一次
  const categoryCounts = {};
  getVideoCategories().forEach(cat => {
    categoryCounts[cat.id] = videoLogs.filter(e => getVideoCategoryId(e.category) === cat.id).length;
  });

  return {
    runKm,
    runDays,
    runGoalKm: EXERCISE_CONFIG.running.weeklyGoalKm,
    runGoalDays: EXERCISE_CONFIG.running.weeklyGoalDays,
    videoTotal: videoLogs.length,
    videoCounts,
    categoryCounts,
    categoryDone: Object.values(categoryCounts).filter(c => c > 0).length,
    categoryGoal: getVideoCategories().length,
    weekLogs,
  };
}

// 每周锻炼汇总：按周分组统计跑步公里数和视频跟练次数，替代逐条翻阅
function renderWeeklySummary() {
  const logs = state.exercise?.log || [];
  if (!logs.length) return '';
  const weeks = {};
  logs.forEach(e => {
    const d = new Date(e.date + 'T00:00:00');
    const day = d.getDay() || 7;
    const monday = new Date(d); monday.setDate(d.getDate() - day + 1);
    const key = monday.toISOString().slice(0, 10);
    if (!weeks[key]) { weeks[key] = { runKm: 0, videoByCat: {}, monday: monday }; }
    if (e.type === 'run') weeks[key].runKm += (e.distance || 0);
    else if (e.type === 'video') {
      // 先按视频 ID 找到分类 ID，再查分类名称（不是视频名——视频名很长，比如"居家改善翼状肩胛正确贴🔥..."）
      const catId = getVideoCategoryId(e.category);
      const cat = getVideoCategories().find(c => c.id === catId);
      const catName = cat ? cat.name : (catId || '其他');
      weeks[key].videoByCat[catName] = (weeks[key].videoByCat[catName] || 0) + 1;
    }
  });
  const entries = Object.entries(weeks).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8);
  let html = '<div class="weekly-summary" style="margin-bottom:12px;border:1px solid var(--border);border-radius:10px;padding:12px 14px;background:var(--surface);">';
  html += '<div style="font-size:14px;font-weight:600;margin-bottom:8px;">📊 每周汇总</div>';
  entries.forEach(([monday, stat]) => {
    const sunday = new Date(stat.monday); sunday.setDate(sunday.getDate() + 6);
    const fmt = d => `${d.getMonth()+1}/${d.getDate()}`;
    const parts = [];
    if (stat.runKm > 0) parts.push(`🏃 ${stat.runKm}km`);
    const cats = Object.entries(stat.videoByCat);
    if (cats.length) {
      const catStr = cats.map(([name, cnt]) => `${name} ${cnt}次`).join('、');
      parts.push(`💪 ${catStr}`);
    }
    html += `<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--border-light, #eee);font-size:13px;">
      <span style="color:var(--text-secondary);flex-shrink:0;margin-right:10px;">${fmt(stat.monday)} - ${fmt(sunday)}</span>
      <span style="font-weight:500;text-align:right;line-height:1.5;">${parts.join(' · ')}</span>
    </div>`;
  });
  html += '</div>';
  return html;
}

// ==================== 生活记录 ====================

function compressImage(file, maxW, quality) {
  return new Promise(function (resolve, reject) {
    if (!file || !file.type.startsWith('image/')) return reject(new Error('不是图片文件'));
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        var w = img.width, h = img.height;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ensureLife() { if (!state.life) state.life = { log: [] }; if (!state.life.log) state.life.log = []; }

var _lifePhotoData = null;
var _lifeEditId = null;

function openLifeModal(editId) {
  _lifePhotoData = null; _lifeEditId = editId || null;
  var text = '';
  if (editId) { ensureLife(); var e = state.life.log.find(function (x) { return x.id === editId; }); if (e) { text = e.text || ''; _lifePhotoData = e.photo || null; } }
  var body = '<textarea id="lifeText" style="width:100%;min-height:100px;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:15px;" placeholder="写点什么...">' + escapeHtml(text) + '</textarea>' +
    '<div style="margin-top:12px;"><label style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;color:var(--primary);font-size:14px;">📷 ' + (_lifePhotoData ? '换照片' : '拍照/选照片') + '<input type="file" id="lifePhotoInput" accept="image/*" style="display:none;" onchange="previewLifePhoto()"></label><span id="lifePhotoName" style="margin-left:8px;font-size:13px;color:var(--text-secondary);"></span></div>';
  if (_lifePhotoData) body += '<div style="margin-top:12px;"><img id="lifePhotoPreview" src="' + _lifePhotoData + '" style="width:100%;max-height:300px;object-fit:cover;border-radius:8px;" /></div>';
  openModal(editId ? '✏️ 编辑记录' : '📝 记录生活', body, '<button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="submitLifeEntry()">' + (editId ? '保存修改' : '保存') + '</button>');
  setTimeout(function () { var t = document.getElementById('lifeText'); if (t) t.focus(); }, 100);
}

function previewLifePhoto() {
  var inp = document.getElementById('lifePhotoInput');
  if (!inp || !inp.files || !inp.files[0]) return;
  var f = inp.files[0];
  var n = document.getElementById('lifePhotoName'); if (n) n.textContent = f.name;
  compressImage(f, 1200, 0.7).then(function (b64) {
    _lifePhotoData = b64;
    var prev = document.getElementById('lifePhotoPreview');
    if (prev) prev.src = b64;
    else { var area = document.querySelector('.modal-body'); if (area) area.insertAdjacentHTML('beforeend', '<div style="margin-top:12px;"><img id="lifePhotoPreview" src="' + b64 + '" style="width:100%;max-height:300px;object-fit:cover;border-radius:8px;" /></div>'); }
    var label = document.querySelector('.modal-body label');
    if (label && label.childNodes[0]) label.childNodes[0].textContent = '📷 换照片';
  });
}

function submitLifeEntry() {
  var text = (document.getElementById('lifeText')?.value || '').trim();
  if (!text && !_lifePhotoData) { Utils.toast('至少写点文字或拍张照片', 'warning'); return; }
  ensureLife();
  var entry = { id: _lifeEditId || Date.now(), date: Utils.today(), text: text, photo: _lifePhotoData || null };
  if (_lifeEditId) {
    var old = state.life.log.find(function (e) { return e.id === _lifeEditId; });
    if (old) { entry.date = old.date; entry.time = old.time; }
    state.life.log = state.life.log.filter(function (e) { return e.id !== _lifeEditId; });
  } else {
    entry.time = new Date().toTimeString().slice(0, 5);
  }
  state.life.log.push(entry);
  try { Store.save(); } catch (e) {}
  closeModal(); _lifePhotoData = null; _lifeEditId = null;
  renderLifeJournal();
  Utils.toast('已保存', 'success');
}

function editLifeEntry(id) { ensureLife(); var e = state.life.log.find(function (x) { return x.id === id; }); if (e) openLifeModal(id); }

function deleteLifeEntry(id) { if (!confirm('确定删除？')) return; ensureLife(); state.life.log = state.life.log.filter(function (e) { return e.id !== id; }); try { Store.save(); } catch (e) {} renderLifeJournal(); }

function renderLifeJournal() {
  ensureLife();
  var logs = state.life.log.slice().sort(function (a, b) { return b.id - a.id; });
  var h = '<div class="life-journal"><div style="margin-bottom:16px;"><button class="btn btn-primary" onclick="openLifeModal()" style="width:100%;padding:14px;font-size:16px;">✏️ 记录今天的生活</button></div>';
  if (!logs.length) {
    h += '<div class="error-empty"><div class="icon">📝</div><div style="font-size:16px;font-weight:600;">还没有生活记录</div><div style="font-size:14px;margin-top:4px;">点击上方按钮开始记录吧</div></div>';
  } else {
    var groups = {}; logs.forEach(function (e) { if (!groups[e.date]) groups[e.date] = []; groups[e.date].push(e); });
    Object.keys(groups).sort().reverse().forEach(function (date) {
      h += '<div style="font-size:15px;font-weight:600;margin:16px 0 8px;padding:6px 0;border-bottom:2px solid var(--primary);color:var(--primary);">📅 ' + date + '</div>';
      groups[date].forEach(function (e) {
        h += '<div class="card" style="margin-bottom:12px;padding:14px;">';
        if (e.photo) h += '<div style="margin-bottom:10px;"><img src="' + e.photo + '" style="width:100%;max-height:400px;object-fit:cover;border-radius:8px;" onclick="viewLifePhoto(' + e.id + ')" /></div>';
        if (e.text) h += '<div style="font-size:15px;line-height:1.6;white-space:pre-wrap;">' + escapeHtml(e.text) + '</div>';
        h += '<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:12px;color:var(--text-light);"><span>' + (e.time || '') + '</span><div style="display:flex;gap:4px;"><button class="btn btn-xs btn-secondary" onclick="editLifeEntry(' + e.id + ')">✎ 编辑</button><button class="btn btn-xs btn-secondary" style="color:var(--danger,#e53e3e);" onclick="deleteLifeEntry(' + e.id + ')">删除</button></div></div></div>';
      });
    });
  }
  h += '</div><div style="height:80px;"></div>';
  document.getElementById('page-life').innerHTML = h;
}

window.viewLifePhoto = function (id) {
  ensureLife(); var e = state.life.log.find(function (x) { return String(x.id) === String(id); });
  if (!e || !e.photo) return;
  openModal('📷 照片', '<div style="text-align:center;"><img src="' + e.photo + '" style="max-width:100%;max-height:70vh;border-radius:8px;" /></div>', '<button class="btn btn-secondary" onclick="closeModal()">关闭</button>');
};


function renderExercise() {
  // 状态字段补齐（兼容旧存档）
  if (!state.exercise) {
    state.exercise = { log: [], userVideos: [], disabledVideos: [], userCategories: [] };
    Store.save();
  } else {
    if (!state.exercise.userVideos) state.exercise.userVideos = [];
    if (!state.exercise.disabledVideos) state.exercise.disabledVideos = [];
    if (!state.exercise.userCategories) state.exercise.userCategories = [];
    // 旧用户视频没有 catId，默认归入第一个分类（肩背部），避免数据丢失
    const defaultCat = getVideoCategories()[0]?.id || 'shoulder';
    state.exercise.userVideos.forEach(v => {
      if (!v.catId) v.catId = defaultCat;
    });
  }

  const stats = getWeekExerciseStats();
  const runKmPct = Math.min(100, Math.round((stats.runKm / stats.runGoalKm) * 100));
  const runDaysPct = Math.min(100, Math.round((stats.runDays / stats.runGoalDays) * 100));

  // 周日历
  const weekStart = getWeekStart();
  const dayNames = ["一", "二", "三", "四", "五", "六", "日"];
  let calendarHtml = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dayLogs = stats.weekLogs.filter(e => e.date === dateStr);
    const hasRun = dayLogs.some(e => e.type === "run");
    const hasVideo = dayLogs.some(e => e.type === "video");
    const isToday = dateStr === Utils.today();
    const isFuture = d > new Date() && !isToday;

    let dayClass = "week-day";
    if (hasRun && hasVideo) dayClass += " has-both";
    else if (hasRun) dayClass += " has-run";
    else if (hasVideo) dayClass += " has-video";
    if (isToday) dayClass += " today";

    let icons = "";
    if (hasRun) icons += "🏃";
    if (hasVideo) icons += "💪";

    calendarHtml += `
      <div class="${dayClass}">
        <div class="day-name">${dayNames[i]}</div>
        <div class="day-num">${d.getDate()}</div>
        <div class="exercise-icons">${icons}</div>
      </div>
    `;
  }

  // 视频类型卡片：按分类（模块）分组，每个分类下可含多个视频
  const disabled = new Set(state.exercise.disabledVideos || []);
  let videoCardsHtml = "";
  getVideoCategories().forEach(cat => {
    if (disabled.has(cat.id)) return;
    const videos = getVideosByCategory(cat.id);
    const catCount = stats.categoryCounts[cat.id] || 0;
    const catDoneToday = videos.some(v =>
      stats.weekLogs.some(e => e.type === "video" && e.category === v.id && e.date === Utils.today())
    );

    const videoItemsHtml = videos.map(v => {
      const isUser = !!v.user;
      const count = stats.videoCounts[v.id] || 0;
      const doneToday = stats.weekLogs.some(e => e.type === "video" && e.category === v.id && e.date === Utils.today());
      return `
        <div class="video-item ${doneToday ? 'done' : ''} ${isUser ? 'user' : ''}">
          <div class="vi-name">${v.icon} ${v.name}${isUser ? ' <span class="user-badge">自定义</span>' : ''}</div>
          <div class="vi-count">本周 ${count} 次 ${doneToday ? '· 今日已练 ✅' : ''}</div>
          <div class="vi-actions">
            ${v.link ? `<button class="btn btn-xs btn-secondary" onclick="openVideoLink('${v.id}')">去看 →</button>` : ''}
            <button class="btn btn-primary btn-sm" onclick="logExercise('video','${v.id}')">${doneToday ? '再练' : '打卡'}</button>
            ${!v.default ? `<button class="btn btn-xs btn-ghost" onclick="deleteVideo('${v.id}', true)" title="删除此视频">✕</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    videoCardsHtml += `
      <div class="video-category-card ${catDoneToday ? 'done' : ''}">
        <div class="video-category-header">
          <div class="vt-icon">${cat.icon}</div>
          <div class="vt-info">
            <div class="vt-name">${cat.name}</div>
          </div>
          ${cat.user
            ? `<button class="btn btn-xs btn-ghost" onclick="deleteVideo('${cat.id}', false)" title="删除该模块">✕</button>`
            : `<button class="btn btn-xs btn-ghost" onclick="deleteVideo('${cat.id}', false)" title="隐藏该分类">✕</button>`
          }
        </div>
        <div class="video-list">${videoItemsHtml}</div>
        <button class="btn btn-xs btn-secondary" onclick="addVideo('${cat.id}')" style="margin-top:10px;width:100%;">＋ 给${cat.name}加视频</button>
      </div>
    `;
  });

  // 最近记录
  const recentLogs = [...(state.exercise.log || [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  let logHtml = "";
  if (recentLogs.length === 0) {
    logHtml = `
      <div class="error-empty">
        <div class="icon">🏃‍♀️</div>
        <div style="font-size:16px;font-weight:600;">还没有锻炼记录</div>
        <div style="font-size:14px;margin-top:4px;">点击上方按钮开始打卡吧！</div>
      </div>
    `;
  } else {
    logHtml = '<div class="exercise-log-list">';
    recentLogs.forEach(e => {
      const idx = state.exercise.log.indexOf(e);
      if (e.type === "run") {
        logHtml += `
          <div class="exercise-log-item">
            <div class="log-icon run">🏃</div>
            <div class="log-info">
              <div class="log-type">跑步 ${e.distance}km</div>
              <div class="log-detail">${e.date}</div>
            </div>
            <button class="log-delete" onclick="deleteExerciseLog(${idx})">✕</button>
          </div>
        `;
      } else {
        const v = getVideoById(e.category);
        const vName = v ? v.name : e.category;
        const vIcon = v ? v.icon : "💪";
        logHtml += `
          <div class="exercise-log-item">
            <div class="log-icon video">${vIcon}</div>
            <div class="log-info">
              <div class="log-type">${vName}跟练</div>
              <div class="log-detail">${e.date}</div>
            </div>
            <button class="log-delete" onclick="deleteExerciseLog(${idx})">✕</button>
          </div>
        `;
      }
    });
    logHtml += '</div>';
  }

  // 总统计
  const totalRuns = (state.exercise.log || []).filter(e => e.type === "run").length;
  const totalKm = (state.exercise.log || []).filter(e => e.type === "run").reduce((s, e) => s + (e.distance || 0), 0);
  const totalVideos = (state.exercise.log || []).filter(e => e.type === "video").length;

  document.getElementById("page-exercise").innerHTML = `
    <div class="exercise-hero">
      <h2>💪 本周锻炼</h2>
      <p>跑步里程 ${stats.runKm}/${stats.runGoalKm}km（累计够 ${stats.runGoalKm}km 即达标）· 本周已跑 ${stats.runDays} 次 · 视频跟练 ${stats.videoTotal} 次</p>
      <div class="exercise-weekly-stats">
        <div class="item">
          <div class="num">${stats.runKm}</div>
          <div class="label">本周跑步(km)</div>
        </div>
        <div class="item">
          <div class="num">${stats.runDays}</div>
          <div class="label">跑步天数</div>
        </div>
        <div class="item">
          <div class="num">${stats.videoTotal}</div>
          <div class="label">视频跟练</div>
        </div>
        <div class="item">
          <div class="num">${totalKm}</div>
          <div class="label">累计跑步(km)</div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="card-title">🏃 跑步进度</div>
      <div class="exercise-progress">
        <div class="exercise-progress-item">
          <div class="header">
            <span class="label">本周里程</span>
            <span class="value">${stats.runKm} / ${stats.runGoalKm} km</span>
          </div>
          <div class="exercise-progress-bar">
            <div class="exercise-progress-fill run" style="width:${runKmPct}%;"></div>
          </div>
        </div>
        <div class="exercise-progress-item">
          <div class="header">
            <span class="label">本周次数</span>
            <span class="value">${stats.runDays} 次（不限制天数）</span>
          </div>
          <div class="exercise-progress-bar">
            <div class="exercise-progress-fill run" style="width:${Math.min(100, stats.runDays * 20)}%;"></div>
          </div>
        </div>
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:16px;" onclick="openRunModal()">
        🏃 记录跑步（填公里数）
      </button>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="card-title">
        💪 视频跟练进度
        <button class="btn btn-sm btn-secondary" style="float:right;" onclick="addVideo()">＋ 添加视频</button>
      </div>
      <div class="video-type-grid video-type-stack">
        ${videoCardsHtml}
      </div>
      <button class="btn btn-xs btn-secondary" onclick="addVideoCategory()" style="margin-top:12px;width:100%;">＋ 添加部位/模块（如大腿、臀部）</button>
      <div style="font-size:13px;color:var(--text-secondary);margin-top:6px;">点「＋ 添加视频」把小红书跟练加进已有模块；点「添加部位/模块」可自定义新分类。</div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="card-title">📅 本周日历</div>
      <div class="week-calendar">
        ${calendarHtml}
      </div>
      <div class="heatmap-legend" style="margin-top:12px;">
        <div class="swatch" style="background:#fef3c7;border:1px solid #fbbf24;"></div><span>跑步</span>
        <div class="swatch" style="background:#dbeafe;border:1px solid #60a5fa;"></div><span>视频</span>
        <div class="swatch" style="background:linear-gradient(135deg,var(--primary-bg) 50%,#dbeafe 50%);"></div><span>两者</span>
      </div>
    </div>

    <div class="card">
      <div class="card-title">📋 锻炼记录</div>
      ${renderWeeklySummary()}
      <div style="margin-top:4px;">
        <button class="btn btn-xs btn-secondary" onclick="toggleExerciseLog()" id="toggleLogBtn" style="font-size:12px;">展开明细 ▸</button>
      </div>
      <div id="exerciseLogDetail" style="display:none;margin-top:8px;">${logHtml}</div>
    </div>
  `;
}

// 切换锻炼明细展开/收起
let exerciseLogExpanded = false;
function toggleExerciseLog() {
  exerciseLogExpanded = !exerciseLogExpanded;
  const el = document.getElementById('exerciseLogDetail');
  const btn = document.getElementById('toggleLogBtn');
  if (el && btn) {
    el.style.display = exerciseLogExpanded ? '' : 'none';
    btn.textContent = exerciseLogExpanded ? '收起明细 ▾' : '展开明细 ▸';
  }
}

function logExercise(type, category) {
  if (!state.exercise) state.exercise = { log: [] };
  if (!state.exercise.log) state.exercise.log = [];

  const entry = {
    id: Date.now(),
    date: Utils.today(),
    type: type,
  };

  if (type === "run") {
    entry.distance = EXERCISE_CONFIG.running.perRunKm;
    Utils.toast(`🏃 跑步 ${entry.distance}km 已记录！`, "success");
  } else if (type === "video") {
    entry.category = category;
    const v = getVideoById(category);
    Utils.toast(`${v?.icon || "💪"} ${v?.name || ""}跟练已记录！`, "success");
  }

  state.exercise.log.push(entry);
  Store.save();
  renderExercise();
}

// 记录跑步：页内弹窗输入本次公里数（累计够每周目标即达标）
function openRunModal() {
  const defaultKm = EXERCISE_CONFIG.running.perRunKm;
  const body = `
    <div style="color:var(--text-secondary);margin-bottom:10px;">本周目标 ${EXERCISE_CONFIG.running.weeklyGoalKm}km，每次跑多少就记多少，跑够即可（不限天数）。</div>
    <label class="modal-label">本次跑步公里数 *</label>
    <input class="modal-input" id="runKm" type="number" min="0.1" step="0.1" value="${defaultKm}" placeholder="例如：3.2" />`;
  const actions = `
    <button class="btn btn-secondary" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="submitLogRun()">记录</button>`;
  openModal("🏃 记录跑步", body, actions);
  setTimeout(() => { const e = document.getElementById("runKm"); if (e) e.focus(); }, 60);
}
function submitLogRun() {
  const km = parseFloat(document.getElementById("runKm").value || "0");
  if (!km || km <= 0) { Utils.toast("请输入有效公里数", "warning"); return; }
  if (!state.exercise) state.exercise = { log: [] };
  if (!state.exercise.log) state.exercise.log = [];
  state.exercise.log.push({
    id: Date.now(),
    date: Utils.today(),
    type: "run",
    distance: Math.round(km * 10) / 10,
  });
  Store.save();
  closeModal();
  Utils.toast(`🏃 跑步 ${km}km 已记录！`, "success");
  renderExercise();
}

function deleteExerciseLog(index) {
  if (state.exercise?.log?.[index]) {
    state.exercise.log.splice(index, 1);
    Store.save();
    Utils.toast("记录已删除", "");
    renderExercise();
  }
}

// 打开跟练视频链接（避免 onclick 里拼接 URL 引号问题）
function openVideoLink(id) {
  const v = getVideoById(id);
  if (v && v.link) window.open(v.link, "_blank");
}

// 添加自定义跟练视频（页内表单）。catId 为默认选中的分类。
function addVideo(catId) {
  const categories = getVideoCategories();
  const catOptions = categories.map(c =>
    `<option value="${c.id}" ${c.id === catId ? 'selected' : ''}>${c.icon} ${c.name}</option>`
  ).join('');
  const body = `
    <label class="modal-label">所属模块 *</label>
    <select class="modal-input" id="vidCat">${catOptions}</select>
    <label class="modal-label">视频名称 *</label>
    <input class="modal-input" id="vidName" placeholder="例如：帕梅拉10分钟肩背训练" />
    <label class="modal-label">图标 emoji（可留空，默认 💪）</label>
    <input class="modal-input" id="vidIcon" placeholder="💪 🔥 🧘" maxlength="4" />
    <label class="modal-label">跟练链接（可留空；填了可直接点开跟练）</label>
    <input class="modal-input" id="vidLink" placeholder="https://..." />`;
  const actions = `
    <button class="btn btn-secondary" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="submitAddVideo()">添加</button>`;
  openModal("＋ 添加跟练视频", body, actions);
  setTimeout(() => { const e = document.getElementById("vidName"); if (e) e.focus(); }, 60);
}
function submitAddVideo() {
  const catId = document.getElementById("vidCat").value;
  const name = (document.getElementById("vidName").value || "").trim();
  if (!name) { Utils.toast("请填写视频名称", "warning"); return; }
  const icon = (document.getElementById("vidIcon").value || "").trim() || "💪";
  const link = (document.getElementById("vidLink").value || "").trim();
  if (!state.exercise.userVideos) state.exercise.userVideos = [];
  state.exercise.userVideos.push({ id: "uv" + Date.now(), catId, name, icon, link, desc: "自定义", user: true });
  // 若该分类之前被隐藏，添加视频后自动恢复显示
  if (state.exercise.disabledVideos) {
    state.exercise.disabledVideos = state.exercise.disabledVideos.filter(id => id !== catId);
  }
  Store.save();
  closeModal();
  Utils.toast("已添加跟练视频", "success");
  renderExercise();
}
function deleteVideo(id, isUser) {
  if (isUser) {
    const v = (state.exercise.userVideos || []).find(x => x.id === id);
    const name = v ? v.name : "该视频";
    openModal("删除视频",
      `<div style="color:var(--text-secondary);">确定删除「${name}」？相关打卡记录会保留。</div>`,
      `<button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-danger" onclick="confirmDeleteUserVideo('${id}')">删除</button>`);
  } else {
    const cat = getVideoCategories().find(x => x.id === id);
    const name = cat ? cat.name : "该分类";
    if (cat && cat.user) {
      openModal("删除模块",
        `<div style="color:var(--text-secondary);">确定删除「${name}」模块？该模块及其下的视频会被移除，打卡记录仍会保留。</div>`,
        `<button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-danger" onclick="confirmDeleteUserCategory('${id}')">删除</button>`);
    } else {
      // 默认分类：移入 disabled 列表，状态保留；可重新通过「＋ 添加视频」恢复
      openModal("隐藏分类",
        `<div style="color:var(--text-secondary);">确定隐藏「${name}」模块？该模块下的视频打卡记录会保留。后续可点「＋ 添加视频」重新加入。</div>`,
        `<button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-danger" onclick="confirmDeleteDefaultVideo('${id}')">隐藏</button>`);
    }
  }
}
function confirmDeleteUserVideo(id) {
  state.exercise.userVideos = (state.exercise.userVideos || []).filter(x => x.id !== id);
  Store.save();
  closeModal();
  renderExercise();
}
function confirmDeleteDefaultVideo(id) {
  if (!state.exercise.disabledVideos) state.exercise.disabledVideos = [];
  if (!state.exercise.disabledVideos.includes(id)) state.exercise.disabledVideos.push(id);
  Store.save();
  closeModal();
  renderExercise();
}
function confirmDeleteUserCategory(id) {
  if (!state.exercise.userCategories) state.exercise.userCategories = [];
  state.exercise.userCategories = state.exercise.userCategories.filter(x => x.id !== id);
  // 同时删除该模块下的用户视频
  state.exercise.userVideos = (state.exercise.userVideos || []).filter(x => x.catId !== id);
  Store.save();
  closeModal();
  renderExercise();
}

// 添加自定义锻炼模块（部位）
function addVideoCategory() {
  const iconOptions = ["💪", "🔥", "🦵", "🍑", "🧘", "🏋️", "🤸", "🩰", "🦶", "🫁", "❤️", "⭐"].map(emoji =>
    `<label class="icon-option" style="cursor:pointer;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);text-align:center;font-size:22px;background:var(--surface);"><input type="radio" name="catIcon" value="${emoji}" style="display:none;">${emoji}</label>`
  ).join('');
  const body = `
    <label class="modal-label">部位/模块名称 *</label>
    <input class="modal-input" id="catName" placeholder="例如：大腿、臀部、骨盆" />
    <label class="modal-label">图标 *</label>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;">${iconOptions}</div>`;
  const actions = `
    <button class="btn btn-secondary" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="submitAddVideoCategory()">添加</button>`;
  openModal("＋ 添加部位/模块", body, actions);
  setTimeout(() => { const e = document.getElementById("catName"); if (e) e.focus(); }, 60);
}
function submitAddVideoCategory() {
  const name = (document.getElementById("catName").value || "").trim();
  if (!name) { Utils.toast("请填写部位/模块名称", "warning"); return; }
  const iconEl = document.querySelector('input[name="catIcon"]:checked');
  const icon = iconEl ? iconEl.value : "💪";
  if (!state.exercise.userCategories) state.exercise.userCategories = [];
  const id = "uc" + Date.now();
  state.exercise.userCategories.push({ id, name, icon, desc: "自定义" });
  Store.save();
  closeModal();
  Utils.toast(`已添加「${name}」模块`, "success");
  renderExercise();
}

// 统计页的锻炼数据卡片
function renderExerciseStatsCard() {
  if (!state.exercise) state.exercise = { log: [] };
  const allLogs = state.exercise.log || [];
  const allRuns = allLogs.filter(e => e.type === "run");
  const allVideos = allLogs.filter(e => e.type === "video");
  const totalKm = allRuns.reduce((s, e) => s + (e.distance || 0), 0);
  const totalRunDays = new Set(allRuns.map(e => e.date)).size;
  const totalVideoCount = allVideos.length;

  const stats = getWeekExerciseStats();
  const runKmPct = Math.min(100, Math.round((stats.runKm / stats.runGoalKm) * 100));

  // 近4周跑步里程
  let weeklyRunHtml = "";
  for (let w = 3; w >= 0; w--) {
    const ws = new Date(getWeekStart());
    ws.setDate(ws.getDate() - w * 7);
    const we = new Date(ws);
    we.setDate(we.getDate() + 7);
    const weekRuns = allRuns.filter(e => {
      const d = new Date(e.date);
      return d >= ws && d < we;
    });
    const km = weekRuns.reduce((s, e) => s + (e.distance || 0), 0);
    const days = new Set(weekRuns.map(e => e.date)).size;
    const label = w === 0 ? "本周" : `${w}周前`;
    weeklyRunHtml += `
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);">
        <span style="font-size:13px;color:var(--text-secondary);">${label}</span>
        <span style="font-size:13px;">${km}km · ${days}天</span>
      </div>
    `;
  }

  return `
    <div class="grid grid-2" style="margin-top:20px;">
      <div class="card">
        <div class="card-title">💪 锻炼总览</div>
        <div class="grid grid-3" style="gap:12px;">
          <div class="stat-card" style="padding:16px;">
            <div class="stat-icon">🏃</div>
            <div class="stat-value" style="font-size:24px;">${totalKm}</div>
            <div class="stat-label">累计跑步(km)</div>
          </div>
          <div class="stat-card" style="padding:16px;">
            <div class="stat-icon">📅</div>
            <div class="stat-value" style="font-size:24px;">${totalRunDays}</div>
            <div class="stat-label">跑步天数</div>
          </div>
          <div class="stat-card" style="padding:16px;">
            <div class="stat-icon">💪</div>
            <div class="stat-value" style="font-size:24px;">${totalVideoCount}</div>
            <div class="stat-label">视频跟练次数</div>
          </div>
        </div>
        <div style="margin-top:16px;">
          <div class="exercise-progress-item">
            <div class="header">
              <span class="label">本周跑步里程</span>
              <span class="value">${stats.runKm} / ${stats.runGoalKm} km</span>
            </div>
            <div class="exercise-progress-bar">
              <div class="exercise-progress-fill run" style="width:${runKmPct}%;"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">📈 近4周跑步</div>
        ${weeklyRunHtml}
        <div style="margin-top:16px;">
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">本周视频跟练</div>
          ${getVideoCategories().map(v => {
            const count = stats.categoryCounts[v.id] || 0;
            return `
              <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);">
                <span style="font-size:13px;">${v.icon} ${v.name}</span>
                <span style="font-size:13px;font-weight:600;">${count} 次</span>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    </div>
  `;
}

// ==========================================
// 全局单词点击弹窗（模仿"不背单词"App：任意单词点一下即弹释义+例句）
// ==========================================

function lemmatizeWord(word) {
  const candidates = [word];
  const push = w => { if (w && w.length >= 2 && !candidates.includes(w)) candidates.push(w); };

  // 1. 派生词映射表（如 discussion -> discuss）
  if (DERIVED_FORMS && DERIVED_FORMS[word]) push(DERIVED_FORMS[word]);

  // 2. 基础词形变化（复数 / 三单 / 过去式 / 现在分词）
  if (word.endsWith('ies')) push(word.slice(0, -3) + 'y');
  else if (word.endsWith('es')) push(word.slice(0, -2));
  if (word.endsWith('s') && !word.endsWith('ss')) push(word.slice(0, -1));
  if (word.endsWith('ied')) push(word.slice(0, -3) + 'y');
  else if (word.endsWith('ed')) { push(word.slice(0, -2)); push(word.slice(0, -1)); }
  if (word.endsWith('ying')) push(word.slice(0, -4) + 'ie');
  else if (word.endsWith('ing')) { push(word.slice(0, -3)); push(word.slice(0, -3) + 'e'); }

  // 3. 常见派生后缀规则（补充映射表未覆盖的词）
  if (word.endsWith('ly')) push(word.slice(0, -2));
  if (word.endsWith('ness')) {
    push(word.slice(0, -4));
    push(word.slice(0, -4) + 'y');
  }
  if (word.endsWith('ment')) push(word.slice(0, -4));
  if (word.endsWith('ity')) {
    push(word.slice(0, -3) + 'e');
    push(word.slice(0, -3) + 'al');
    push(word.slice(0, -3) + 'ous');
  }
  if (word.endsWith('tion') || word.endsWith('sion')) {
    push(word.slice(0, -3));
    push(word.slice(0, -4) + 'e');
  }
  if (word.endsWith('er') || word.endsWith('or')) push(word.slice(0, -2));
  if (word.endsWith('ist')) push(word.slice(0, -3));
  if (word.endsWith('ism')) push(word.slice(0, -3));
  if (word.endsWith('ful') || word.endsWith('less')) push(word.slice(0, -3));
  if (word.endsWith('ous') || word.endsWith('ious')) {
    push(word.slice(0, -3));
    push(word.slice(0, -3) + 'e');
  }
  if (word.endsWith('ive')) {
    push(word.slice(0, -3));
    push(word.slice(0, -3) + 'e');
  }
  if (word.endsWith('al')) {
    push(word.slice(0, -2));
    push(word.slice(0, -2) + 'e');
  }
  if (word.endsWith('en')) push(word.slice(0, -2));
  if (word.endsWith('able') || word.endsWith('ible')) {
    push(word.slice(0, -4));
    push(word.slice(0, -4) + 'e');
  }
  if (word.endsWith('y') && word.length > 3) push(word.slice(0, -1) + 'e');

  return candidates;
}

function inferForm(clean, base) {
  if (clean === base) return '';

  // 优先使用派生映射表给出更准确的词形说明
  if (DERIVED_FORMS && DERIVED_FORMS[clean] === base) {
    if (clean.endsWith('ed')) return '（过去式 / 过去分词）';
    if (clean.endsWith('ing')) return '（现在分词 / 动名词）';
    if (clean.endsWith('ies')) return '（第三人称单数）';
    if (clean.endsWith('es') && (base + 'es' === clean || base + 's' === clean)) return '（第三人称单数 / 复数）';
    if (clean.endsWith('s') && base + 's' === clean) return '（复数 / 第三人称单数）';
    if (clean.endsWith('tion') || clean.endsWith('sion')) return '（名词：动作/状态）';
    if (clean.endsWith('ment')) return '（名词：行为/结果）';
    if (clean.endsWith('ness')) return '（名词：性质/状态）';
    if (clean.endsWith('ity')) return '（名词：属性）';
    if (clean.endsWith('er') || clean.endsWith('or')) return '（名词：人/物）';
    if (clean.endsWith('ist')) return '（名词：从业者）';
    if (clean.endsWith('ism')) return '（名词：主义/理论）';
    if (clean.endsWith('ful') || clean.endsWith('less')) return '（形容词）';
    if (clean.endsWith('ous') || clean.endsWith('ious')) return '（形容词）';
    if (clean.endsWith('ive')) return '（形容词）';
    if (clean.endsWith('al')) return '（形容词）';
    if (clean.endsWith('ly')) return '（副词）';
    if (clean.endsWith('y')) return '（形容词）';
    if (clean.endsWith('en')) return '（动词）';
    if (clean.endsWith('able') || clean.endsWith('ible')) return '（形容词）';
    return '（词形变化）';
  }

  if (clean.endsWith('s') && base + 's' === clean) return '（复数 / 三单）';
  if (clean.endsWith('es') && (base + 'es' === clean || base + 's' === clean)) return '（三单 / 复数）';
  if (clean.endsWith('ies') && base + 'ies' === clean) return '（三单）';
  if (clean.endsWith('ed')) return '（过去式 / 过去分词）';
  if (clean.endsWith('ing')) return '（现在分词 / 动名词）';
  return '（词形变化）';
}

function lookupWord(wordText) {
  const clean = (wordText || '').trim().toLowerCase().replace(/[^a-z\s\-']/g, '');
  if (!clean || clean.length < 2) return null;
  let w = VOCABULARY.find(v => v.word.toLowerCase() === clean);
  let lemmaNote = '';
  let ex;
  if (!w) {
    // 词形还原：把 appears / running / studied 等还原为原形再查
    for (const lm of lemmatizeWord(clean)) {
      w = VOCABULARY.find(v => v.word.toLowerCase() === lm);
      if (w) { lemmaNote = inferForm(clean, w.word.toLowerCase()); break; }
    }
  }
  if (!w) {
    // 兜底 1：通用词典（CET-4 词库之外的常见词）
    for (const lm of [clean, ...lemmatizeWord(clean)]) {
      const c = COMMON_WORDS[lm];
      if (c) {
        let meaning = c.meaning || (c.cn ? c.cn.replace(/。$/, '') : '');
        if (!meaning && c.en) meaning = '（释义待补充）';
        let pos = c.pos || guessPosFromWord(lm) || '';
        w = { word: clean, meaning, pos, phonetic: '', example: c };
        ex = { en: c.en, cn: c.cn };
        lemmaNote = lm !== clean ? inferForm(clean, lm) : '';
        break;
      }
    }
  }
  if (!w) {
    // 兜底 2：完全未知词
    const suffix = guessSuffixMeaning(clean);
    w = {
      word: clean,
      meaning: '暂未收录' + (suffix ? '（常见词缀：' + suffix + '）' : ''),
      pos: '',
      phonetic: '',
      example: null
    };
    ex = {
      en: `The word "${clean}" is not in the current dictionary yet.`,
      cn: `当前词库暂未收录 "${clean}"${suffix ? '（' + suffix + '）' : ''}，可尝试点击其原形。`
    };
  }
  if (!ex) {
    // 未知词/派生词若 meaning 无效，不再硬造例句，避免 "I noticed a quietly"
    const invalid = !w.meaning || w.meaning.includes('暂未收录') || w.meaning.includes('词缀');
    ex = invalid ? { en: '', cn: '' } : getExample(w.word, w.meaning);
  }
  if (lemmaNote && !w.meaning.includes(lemmaNote)) {
    w = Object.assign({}, w, { meaning: w.meaning + ' ' + lemmaNote });
  }
  // 派生词根据词形说明修正词性，避免 quietly 显示 adj.
  if (lemmaNote) {
    if (lemmaNote.includes('副词')) w = Object.assign({}, w, { pos: 'adv.' });
    else if (lemmaNote.includes('形容词')) w = Object.assign({}, w, { pos: 'adj.' });
    else if (lemmaNote.includes('名词')) w = Object.assign({}, w, { pos: 'n.' });
    else if (lemmaNote.includes('动词')) w = Object.assign({}, w, { pos: 'v.' });
  }
  return { w, ex, clean };
}

function showWordPopup(wordText, event) {
  const result = lookupWord(wordText);
  if (!result) return;
  const { w, ex } = result;

  // 移除之前弹窗
  const old = document.getElementById('wordPopup');
  if (old) old.remove();

  const popup = document.createElement('div');
  popup.id = 'wordPopup';
  popup.className = 'word-popup';
  const sensesHtml = renderSensesHtml(getWordSenses(w));
  popup.innerHTML = `
    <button class="wp-close" onclick="document.getElementById('wordPopup').remove()">✕</button>
    <div class="wp-word">${escapeHtml(w.word)}</div>
    ${w.phonetic ? `<div class="wp-phonetic">${escapeHtml(w.phonetic)}${w.pos ? ' · ' + escapeHtml(w.pos) : ''}</div>` : w.pos ? `<div class="wp-phonetic">${escapeHtml(w.pos)}</div>` : ''}
    ${sensesHtml || (ex && ex.en ? `<div class="wp-meaning">${escapeHtml(w.meaning)}</div><div class="wp-example"><div class="wp-example-en">${escapeHtml(ex.en)}</div>${ex.cn ? `<div class="wp-example-cn">${escapeHtml(ex.cn)}</div>` : ''}</div>` : '<div style="font-size:13px;color:var(--text-light);margin-bottom:10px;">暂无精选例句</div>')}
    <div class="wp-actions">
      <button class="btn btn-speech-sm" onclick="speakWord('${w.word}')">🔊 朗读</button>
      <button class="btn btn-speech-sm" onclick="document.getElementById('wordPopup').remove()">关闭</button>
    </div>
  `;
  document.body.appendChild(popup);

  // 定位：优先在点击位置下方/上方
  const mx = event.clientX || window.innerWidth / 2;
  const my = event.clientY || window.innerHeight / 3;
  const pw = Math.min(popup.offsetWidth || 280, 360);
  const ph = popup.offsetHeight || 200;
  let left = Math.min(mx - pw / 2, window.innerWidth - pw - 16);
  left = Math.max(left, 8);
  let top = my + 12;
  if (top + ph > window.innerHeight - 16) top = my - ph - 12;
  if (top < 8) top = 40;
  popup.style.left = left + 'px';
  popup.style.top = top + 'px';

  event.stopPropagation();
}

// 根据常见词缀推断词性（用于 COMMON_WORDS 缺少 pos 时的兜底）
function guessPosFromWord(word) {
  if (word.endsWith('tion') || word.endsWith('sion') || word.endsWith('ment') ||
      word.endsWith('ness') || word.endsWith('ity') || word.endsWith('er') ||
      word.endsWith('or') || word.endsWith('ist') || word.endsWith('ism') ||
      word.endsWith('ship') || word.endsWith('ance') || word.endsWith('ence')) return 'n.';
  if (word.endsWith('ly')) return 'adv.';
  if (word.endsWith('ful') || word.endsWith('less') || word.endsWith('ous') ||
      word.endsWith('ious') || word.endsWith('ive') || word.endsWith('al') ||
      word.endsWith('ic') || word.endsWith('able') || word.endsWith('ible') ||
      word.endsWith('y')) return 'adj.';
  if (word.endsWith('ize') || word.endsWith('ise') || word.endsWith('fy') ||
      word.endsWith('ify') || word.endsWith('ate') || word.endsWith('en')) return 'v.';
  return '';
}

// 根据常见词缀推断词性（兜底弹窗里给提示）
function guessSuffixMeaning(word) {
  if (word.endsWith('tion') || word.endsWith('sion')) return '名词（动作/状态）';
  if (word.endsWith('ment')) return '名词（行为/结果）';
  if (word.endsWith('ness')) return '名词（性质/状态）';
  if (word.endsWith('ity') || word.endsWith('ty')) return '名词（属性）';
  if (word.endsWith('er') || word.endsWith('or')) return '名词（人/物）';
  if (word.endsWith('ist')) return '名词（人）';
  if (word.endsWith('ism')) return '名词（主义/理论）';
  if (word.endsWith('ship')) return '名词（关系/状态）';
  if (word.endsWith('ance') || word.endsWith('ence')) return '名词（性质）';
  if (word.endsWith('able') || word.endsWith('ible')) return '形容词（能…的）';
  if (word.endsWith('ful')) return '形容词（充满…的）';
  if (word.endsWith('less')) return '形容词（无…的）';
  if (word.endsWith('ous') || word.endsWith('ious')) return '形容词（多…的）';
  if (word.endsWith('ive')) return '形容词（…的）';
  if (word.endsWith('al')) return '形容词（…的）';
  if (word.endsWith('ic')) return '形容词（…的）';
  if (word.endsWith('ly')) return '副词（…地）';
  if (word.endsWith('ize') || word.endsWith('ise')) return '动词（使…化）';
  if (word.endsWith('fy') || word.endsWith('ify')) return '动词（使…化）';
  if (word.endsWith('ate')) return '动词（使…）';
  if (word.endsWith('en')) return '动词（使成为）';
  if (word.endsWith('ing')) return '现在分词/动名词';
  if (word.endsWith('ed')) return '过去式/过去分词';
  return '';
}

// 点击页面空白处关闭弹窗
document.addEventListener('click', function(e) {
  const popup = document.getElementById('wordPopup');
  if (popup && !popup.contains(e.target) && !e.target.closest('.word-tappable')) {
    popup.remove();
  }
});

// 页面渲染后自动扫描容器中的英文单词，把它们变成可点击的
// 用 TreeWalker 一次性收集所有文本节点，再统一替换（避免 replaceChild 后 nextSibling 失效的 bug）
function activateWordTap(containerId) {
  const root = document.getElementById(containerId);
  if (!root) return;
  const skipTags = /^(SCRIPT|STYLE|TEXTAREA|INPUT|BUTTON|SELECT|OPTION|PRE|CODE|svg|path|IFRAME|NOSCRIPT)$/i;
  const skipClosest = '.word-tappable, .word-popup, .opt-letter, .opt-word, .opt-example, .wp-word, .wp-example, .word-en, .vt-name';

  // 收集所有需要处理的文本节点
  const textNodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: function(n) {
      const p = n.parentNode;
      if (!p || p.nodeType !== 1) return NodeFilter.FILTER_REJECT;
      if (skipTags.test(p.tagName)) return NodeFilter.FILTER_REJECT;
      if (p.closest && p.closest(skipClosest)) return NodeFilter.FILTER_REJECT;
      const text = n.textContent || '';
      if (!/[a-zA-Z]{2,}/.test(text)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let node;
  while ((node = walker.nextNode())) textNodes.push(node);

  // 逐个替换为可点击 spans
  textNodes.forEach(textNode => {
    const parent = textNode.parentNode;
    if (!parent) return; // 可能已被前面替换移除
    const text = textNode.textContent || '';
    // 匹配英文单词（≥2 字母的词），保留标点/空格
    const parts = text.split(/(\b[a-zA-Z][a-zA-Z\-']*[a-zA-Z]\b|\b[a-zA-Z]{2,}\b)/g);
    let hasMatch = false;
    const frag = document.createDocumentFragment();
    parts.forEach(part => {
      if (!part) return;
      // 判定：纯英文词（>=2 字母）、不全是数字/标点
      const trimmed = part.trim();
      const isWord = /^[a-zA-Z][a-zA-Z\-']*[a-zA-Z]$/.test(trimmed) || /^[a-zA-Z]{2,}$/.test(trimmed);
      if (isWord) {
        hasMatch = true;
        const span = document.createElement('span');
        span.className = 'word-tappable';
        span.textContent = part;
        span.setAttribute('data-word', trimmed);
        span.onclick = function(e) { e.stopPropagation(); showWordPopup(trimmed, e); };
        frag.appendChild(span);
      } else {
        frag.appendChild(document.createTextNode(part));
      }
    });
    if (hasMatch && parent) {
      try { parent.replaceChild(frag, textNode); } catch (e) { /* 节点已被替换，忽略 */ }
    }
  });
}

// ==========================================
// 初始化
// ==========================================
// 根据 settings 刷新侧边栏个人信息（头像 / 昵称 / 状态）
function renderSidebarProfile() {
  const s = state.settings || {};
  const name = s.username || "柯仪";
  const avatar = s.avatar || "👋";
  const status = s.status || "四级备考中";
  const nameEl = document.getElementById("sidebarName");
  const avatarEl = document.getElementById("sidebarAvatar");
  const metaEl = document.getElementById("sidebarMeta");
  if (nameEl) nameEl.textContent = name;
  if (metaEl) metaEl.textContent = status;
  if (avatarEl) {
    // 优先显示自定义头像图片；否则显示 emoji，再否则显示昵称首字
    const img = (state.settings && state.settings.avatarImage) || '';
    if (img) {
      avatarEl.innerHTML = '<img class="avatar-img" src="' + img + '" alt="头像" />';
    } else {
      avatarEl.textContent = avatar || name.charAt(0);
    }
  }
}

// ==========================================
// 外观主题（配色自定义）
// ==========================================
const THEMES = {
  amber:   { name: '暖阳橙', primary: '#f59e0b' },
  rose:    { name: '樱花粉', primary: '#ec4899' },
  mint:    { name: '薄荷绿', primary: '#10b981' },
  sky:     { name: '天空蓝', primary: '#0ea5e9' },
  violet:  { name: '葡萄紫', primary: '#8b5cf6' },
  emerald: { name: '森林绿', primary: '#22c55e' }
};

// 在 hex 颜色上叠加白(正)/黑(负) 得到深浅变体
function shadeHex(hex, percent) {
  hex = (hex || '#000000').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  let r = parseInt(hex.substr(0, 2), 16), g = parseInt(hex.substr(2, 2), 16), b = parseInt(hex.substr(4, 2), 16);
  if (isNaN(r)) r = 0; if (isNaN(g)) g = 0; if (isNaN(b)) b = 0;
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');
}

// 把 hex 转成 "r, g, b" 字符串，供 CSS rgba(var(--x-rgb), alpha) 使用
function hexToRgbTriplet(hex) {
  hex = (hex || '#000000').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const r = parseInt(hex.substr(0, 2), 16) || 0;
  const g = parseInt(hex.substr(2, 2), 16) || 0;
  const b = parseInt(hex.substr(4, 2), 16) || 0;
  return `${r}, ${g}, ${b}`;
}

// 由主色推导一整套协调的氛围色（背景、卡片、边框、文字、辅助色）
function buildThemeVars(primary) {
  return {
    '--primary': primary,
    '--primary-rgb': hexToRgbTriplet(primary),
    '--primary-dark': shadeHex(primary, -22),
    '--primary-dark-rgb': hexToRgbTriplet(shadeHex(primary, -22)),
    '--primary-light': shadeHex(primary, 30),
    '--primary-bg': shadeHex(primary, 92),
    '--primary-bg-rgb': hexToRgbTriplet(shadeHex(primary, 92)),
    '--bg': shadeHex(primary, 96),
    '--bg-rgb': hexToRgbTriplet(shadeHex(primary, 96)),
    '--surface': '#ffffff',
    '--surface-rgb': '255, 255, 255',
    '--surface-alt': shadeHex(primary, 94),
    '--surface-alt-rgb': hexToRgbTriplet(shadeHex(primary, 94)),
    '--border': shadeHex(primary, 72),
    '--text': shadeHex(primary, -62),
    '--text-secondary': shadeHex(primary, -45),
    '--text-light': shadeHex(primary, -22),
    '--warning': shadeHex(primary, 6),
    '--warning-rgb': hexToRgbTriplet(shadeHex(primary, 6)),
    '--warning-bg': shadeHex(primary, 90),
    '--warning-bg-rgb': hexToRgbTriplet(shadeHex(primary, 90)),
    '--success': '#22c55e',
    '--success-rgb': '34, 197, 94',
    '--success-dark': '#15803d',
    '--success-bg': '#dcfce7',
    '--danger': '#ef4444',
    '--danger-rgb': '239, 68, 68',
    '--danger-bg': '#fee2e2',
    '--info': '#0ea5e9',
    '--info-rgb': '14, 165, 233',
    '--info-bg': '#e0f2fe'
  };
}

function applyTheme(key, customHex) {
  let primary;
  if (key === 'custom' && customHex) {
    primary = customHex;
  } else {
    primary = (THEMES[key] && THEMES[key].primary) || THEMES.amber.primary;
  }
  const vars = buildThemeVars(primary);
  const root = document.documentElement;
  for (const k in vars) root.style.setProperty(k, vars[k]);
  // 同步手机顶部状态栏颜色（meta theme-color），使用更深的色保证白字对比度
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', shadeHex(primary, -22));
  // 同步 PWA manifest theme_color，让启动屏顶部状态栏也随主题变化
  updateManifestTheme(primary);
}

function updateManifestTheme(primary) {
  try {
    const themeColor = shadeHex(primary, -22);
    const manifest = {
      name: 'KeYi',
      short_name: 'KeYi',
      description: '英语四级 + 锻炼 + 理财 一站式学习工作台',
      lang: 'zh-CN',
      start_url: './index.html',
      scope: './',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#fffbeb',
      theme_color: themeColor,
      categories: ['education', 'productivity'],
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    };
    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    link.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(manifest));
  } catch (e) {}
}

function getThemeKey() { return (state.settings && state.settings.theme) || 'amber'; }

function pickTheme(key) {
  const hex = (key === 'custom') ? ((document.getElementById('setCustomAccent') || {}).value || '#f59e0b') : null;
  applyTheme(key, hex);
  const hidden = document.getElementById('setTheme');
  if (hidden) hidden.value = key;
  document.querySelectorAll('#setThemeSwatches .theme-swatch').forEach(b => b.classList.toggle('selected', b.getAttribute('data-theme') === key));
}

function pickCustomTheme(hex) {
  const hidden = document.getElementById('setTheme');
  if (hidden) hidden.value = 'custom';
  document.querySelectorAll('#setThemeSwatches .theme-swatch').forEach(b => b.classList.remove('selected'));
  applyTheme('custom', hex);
}

// 设置弹窗里的主题色板 HTML（在 openSettings 内以 ${renderThemeOptions()} 嵌入）
function renderThemeOptions() {
  const cur = getThemeKey();
  const custom = (state.settings && state.settings.customAccent) || '#f59e0b';
  let html = '<div id="setThemeSwatches" style="display:flex;flex-wrap:wrap;gap:10px;">';
  html += Object.keys(THEMES).map(function (k) {
    const t = THEMES[k];
    const tv = buildThemeVars(t.primary);
    const active = cur === k ? ' selected' : '';
    return '<button type="button" class="theme-swatch' + active + '" data-theme="' + k + '" onclick="pickTheme(\'' + k + '\')" title="' + t.name + '">'
      + '<span class="theme-swatch-dot" style="background:' + tv['--primary'] + ';box-shadow:0 0 0 2px ' + tv['--primary-light'] + ' inset;"></span>'
      + '<span class="theme-swatch-name">' + t.name + '</span></button>';
  }).join('');
  html += '<button type="button" class="theme-swatch' + (cur === 'custom' ? ' selected' : '') + '" data-theme="custom" onclick="pickTheme(\'custom\')">'
    + '<span class="theme-swatch-dot" style="background:' + custom + ';box-shadow:0 0 0 2px rgba(0,0,0,.12) inset;"></span>'
    + '<span class="theme-swatch-name">自定义</span></button>';
  html += '</div>';
  return html;
}

// ===== 云端同步（跨设备数据互通，基于 GitHub Gist）=====
// 合并策略：以「学习活跃度」更高的那份为基底，把另一份的数据做并集并入，
// 避免任一方数据丢失（换设备/双端各学一点都能汇合）。
function _cloudIdOf(x) {
  if (x && typeof x === 'object') return x.id || x.date || JSON.stringify(x);
  return x;
}
function _mergeInto(base, inc, fn) {
  base = base || {};
  if (inc) for (const k in inc) {
    if (inc[k] === undefined) continue;
    base[k] = (base[k] === undefined) ? inc[k] : fn(base[k], inc[k]);
  }
  return base;
}
function _unionArr(baseArr, incArr) {
  if (!incArr || !incArr.length) return baseArr || [];
  const arr = baseArr || [];
  const seen = new Set(arr.map(_cloudIdOf));
  incArr.forEach(x => { const id = _cloudIdOf(x); if (!seen.has(id)) { seen.add(id); arr.push(x); } });
  return arr;
}
function cloudMerge(local, remote) {
  const act = s => (s.progress && s.progress.wordsLearned || 0)
    + (s.progress && s.progress.streak || 0) * 2
    + Object.keys(s.studyLog || {}).length * 3
    + (s.progress && s.progress.totalTests || 0)
    + (s.weakWords || []).length;
  const useRemote = act(remote) > act(local);
  const base = JSON.parse(JSON.stringify(useRemote ? remote : local));
  const inc = useRemote ? local : remote;
  // 计数取 max
  ['wordsLearned', 'streak', 'totalStudyDays', 'totalTests', 'totalCorrect'].forEach(f => {
    if (base.progress && inc.progress && inc.progress[f] !== undefined)
      base.progress[f] = Math.max(base.progress[f] || 0, inc.progress[f] || 0);
  });
  // 对象型按 key 并集（wordStatus / studyLog / financeKnowledge.completed / 各 daily）
  base.wordStatus = _mergeInto(base.wordStatus, inc.wordStatus, (a, b) => (a && a.level || 0) >= (b && b.level || 0) ? a : b);
  base.studyLog = _mergeInto(base.studyLog, inc.studyLog, (a, b) => {
    const merged = Object.assign({}, a || {}, {
      words: Math.max((a && a.words || 0), (b && b.words || 0)), //  words 不再累加，取去重后的真实数更大者
      tests: (a && a.tests || 0) + (b && b.tests || 0),
      correct: (a && a.correct || 0) + (b && b.correct || 0),
      wrong: (a && a.wrong || 0) + (b && b.wrong || 0)
    });
    const aIds = (a && Array.isArray(a.wordIds)) ? a.wordIds : [];
    const bIds = (b && Array.isArray(b.wordIds)) ? b.wordIds : [];
    merged.wordIds = Array.from(new Set(aIds.concat(bIds)));
    return merged;
  });
  if (base.financeKnowledge && inc.financeKnowledge) {
    base.financeKnowledge.completed = _mergeInto(base.financeKnowledge.completed, inc.financeKnowledge.completed,
      (a, b) => Array.from(new Set((a || []).concat(b || []))));
    base.financeKnowledge.reviewed = _mergeInto(base.financeKnowledge.reviewed, inc.financeKnowledge.reviewed,
      (a, b) => Array.from(new Set((a || []).concat(b || []))));
    base.financeKnowledge.currentDay = Math.max(base.financeKnowledge.currentDay || 1, inc.financeKnowledge.currentDay || 1);
  }
  base.listening.daily = _mergeInto(base.listening.daily, inc.listening && inc.listening.daily, (a, b) => a && b ? Object.assign({}, a, b) : (a || b));
  base.translate.daily = _mergeInto(base.translate.daily, inc.translate && inc.translate.daily, (a, b) => a && b ? Object.assign({}, a, b) : (a || b));
  base.sentenceDaily = _mergeInto(base.sentenceDaily, inc.sentenceDaily, (a, b) => a && b ? Object.assign({}, a, b) : (a || b));
  // 数组合并集（去重）
  base.weakWords = _unionArr(base.weakWords, inc.weakWords);
  base.errorBook = _unionArr(base.errorBook, inc.errorBook);
  base.newWordSeen = _unionArr(base.newWordSeen, inc.newWordSeen);
  // 已读按新闻日期分桶合并（导入备份时，各日期的已读 id 分别取并集）
  base.news.readByDate = base.news.readByDate || {};
  const incRead = (inc.news && inc.news.readByDate) || {};
  Object.keys(incRead).forEach(d => {
    base.news.readByDate[d] = _unionArr(base.news.readByDate[d] || [], incRead[d]);
  });
  base.news.bookmarked = _unionArr(base.news.bookmarked, inc.news.bookmarked);
  base.news.important = _unionArr(base.news.important, inc.news.important);
  base.exercise.log = _unionArr(base.exercise.log, inc.exercise.log);
  base.exercise.userVideos = _unionArr(base.exercise.userVideos, inc.exercise.userVideos);
  base.reading.books = _unionArr(base.reading.books, inc.reading.books);
  base.reading.log = _unionArr(base.reading.log, inc.reading.log);
  base.weight.records = _unionArr(base.weight.records, inc.weight.records);
  // diet.log 是按日期的对象，并集
  if (base.diet && inc.diet) base.diet.log = _mergeInto(base.diet.log, inc.diet.log, (a, b) => a && b ? a.concat(b) : (a || b));
  // 心情取日期更新的
  if (inc.mood && inc.mood.date && (!base.mood || !base.mood.date || inc.mood.date > base.mood.date)) base.mood = inc.mood;
  return base;
}

const CloudSync = {
  base: 'https://api.github.com/gists',
  _timer: null,
  _busy: false,
  get cfg() { return (state.settings && state.settings.cloudSync) || null; },
  // 云端同步入口已下线，强制禁用避免无效 401
  get enabled() { return false; },
  get token() { const c = this.cfg; return c ? c.token : ''; },
  get syncId() { const c = this.cfg; return c ? c.syncId : ''; },
  get gistId() { const c = this.cfg; return c ? c.gistId : ''; },
  get fileName() { return (this.syncId || 'keyi') + '.json'; },

  schedulePush() {
    if (this._busy || !this.enabled) return;
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.syncNow(), 8000); // 8 秒防抖，节省 GitHub 额度
  },

  _headers() {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + this.token,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'keyi-study-app'
    };
  },

  // 在用户全部 gist 中找到文件名 == fileName 的那条，返回 gist id（两端用同一 syncId 即命中同一份）
  async _findGist() {
    let url = this.base + '?per_page=100';
    while (url) {
      const res = await fetch(url, { headers: this._headers() });
      if (!res.ok) throw new Error('读取 Gist 列表失败 HTTP ' + res.status + (res.status === 401 ? '（令牌无效或复制不完整，请重新生成并完整复制）' : (res.status === 403 ? '（令牌缺少 gist 权限，请重新生成令牌并勾选 gist）' : '')));
      const list = await res.json();
      if (Array.isArray(list)) {
        for (const g of list) {
          if (g.files && g.files[this.fileName]) return g.id;
        }
      }
      const link = res.headers.get('link');
      url = null;
      if (link) {
        const next = link.split(',').find(s => s.includes('rel="next"'));
        if (next) url = next.split(';')[0].replace(/[<>]/g, '').trim();
      }
    }
    return null;
  },

  async _resolveGistId() {
    if (this.gistId) return this.gistId;
    const id = await this._findGist();
    if (id) {
      if (!state.settings.cloudSync) state.settings.cloudSync = {};
      state.settings.cloudSync.gistId = id;
      Store.save();
    }
    return id;
  },

  // 从云端拉取并合并到本机（并集去重，不互相覆盖）
  async _mergeFromRemote() {
    const gistId = await this._resolveGistId();
    if (!gistId) return false;
    const res = await fetch(this.base + '/' + gistId, { headers: this._headers() });
    if (!res.ok) {
      if (res.status === 404) return false; // gist 尚未创建
      throw new Error('读取云端数据失败 HTTP ' + res.status);
    }
    const j = await res.json();
    const file = j.files && j.files[this.fileName];
    if (!file || !file.content) return false;
    let rec;
    try { rec = JSON.parse(file.content); } catch (e) { return false; }
    if (rec && rec.state && Object.keys(rec.state).length) {
      const merged = cloudMerge(state, rec.state);
      const keep = (state.settings && state.settings.cloudSync) || {};
      state = merged;
      state.settings = state.settings || {};
      state.settings.cloudSync = keep;
      Store.save();
      this._setLastSync(rec.syncedAt || Date.now());
      if (typeof navigate === 'function') navigate(currentPage);
      return true;
    }
    return false;
  },

  async push() {
    if (this._busy || !this.enabled) return;
    this._busy = true;
    try {
      // 先与云端合并，避免用本机（可能较旧/较空）数据覆盖对方
      await this._mergeFromRemote();
      const payload = { v: 1, syncedAt: Date.now(), state: state };
      const content = JSON.stringify(payload);
      const gistId = await this._resolveGistId();
      if (gistId) {
        const res = await fetch(this.base + '/' + gistId, {
          method: 'PATCH',
          headers: this._headers(),
          body: JSON.stringify({ files: { [this.fileName]: { content: content } } })
        });
        if (!res.ok) throw new Error('上传失败 HTTP ' + res.status);
      } else {
        const res = await fetch(this.base, {
          method: 'POST',
          headers: this._headers(),
          body: JSON.stringify({ description: 'keyi-sync:' + this.syncId, public: false, files: { [this.fileName]: { content: content } } })
        });
        if (!res.ok) throw new Error('创建云端备份失败 HTTP ' + res.status);
        const j = await res.json();
        if (j && j.id) {
          if (!state.settings.cloudSync) state.settings.cloudSync = {};
          state.settings.cloudSync.gistId = j.id;
          Store.save();
        }
      }
      this._setLastSync(Date.now());
      return true;
    } catch (e) {
      console.warn('云端同步推送失败', e);
      throw e; // 交给调用方显示真实错误
    } finally {
      this._busy = false;
    }
  },

  async pull() {
    if (this._busy || !this.enabled) return false;
    this._busy = true;
    try {
      return await this._mergeFromRemote();
    } catch (e) {
      console.warn('云端同步拉取失败', e);
      throw e;
    } finally {
      this._busy = false;
    }
  },

  async syncNow() {
    if (!this.enabled) { this._showStatus('请先启用云端同步并填写 GitHub 令牌与同步 ID 后保存', false); return; }
    this._showStatus('正在同步…', true);
    try {
      await this.push();
      this._showStatus('☁️ 已合并云端与本地数据并同步', true);
    } catch (e) {
      this._showStatus('同步出错：' + (e && e.message ? e.message : e), false);
    }
  },

  _setLastSync(ts) {
    if (!state.settings.cloudSync) state.settings.cloudSync = {};
    state.settings.cloudSync.lastSync = ts;
  },

  _showStatus(msg, ok) {
    const el = document.getElementById('cloudSyncStatus');
    if (el) {
      el.textContent = msg;
      el.style.color = ok ? 'var(--success)' : 'var(--danger)';
    }
  }
};

// 新闻本地缓存 key：成功拉取后持久化，避免网络波动时退回到过期的 HOT_NEWS 兜底
const NEWS_CACHE_KEY = "cet4_workspace_news_cache";

// 启动时优先从本地缓存恢复新闻（线上 fetch 失败时也能看到相对新的内容）
(function loadNewsCache() {
  try {
    const cached = localStorage.getItem(NEWS_CACHE_KEY);
    if (cached) {
      const arr = JSON.parse(cached);
      if (Array.isArray(arr) && arr.length) NEWS_DATA = arr;
    }
  } catch (e) { console.warn("新闻缓存读取失败", e); }
})();

// 运行时拉取 news.json（线上每日 8 点由自动化刷新），覆盖兜底/缓存数据
function loadNewsFromServer() {
  fetch('news.json?_=' + Date.now(), { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null)
    .then(d => {
      if (Array.isArray(d) && d.length) {
        NEWS_DATA = d;
        try { localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(d)); } catch (e) { /* 存储失败忽略 */ }
        lockTodayImportant(); // 尽早固化当天重点，避免后续重跑导致进度归零
        resetNewsIfDateChanged();
        if (currentPage === 'news') renderNews();
        else if (currentPage === 'home') renderDashboard();
      }
    })
    .catch(() => {
      // 拉取失败：若启动时已从缓存恢复，则继续用缓存；
      // 否则回退到 data.js 中的 HOT_NEWS 兜底，不影响使用。
    });
}

// 一次性修正旧数据：把今天按「轮次」记录的 words 改成按真实词 ID 去重计数。
// 规则：今天所有「已作为新词出示过(newWordSeen) + 已学(level>=1) + 最后学习日期为今天」的词。
function migrateStudyLogWordIds() {
  try {
    const today = Utils.today();
    const log = state.studyLog[today];
    if (!log) return;
    // 已经迁移过（有 wordIds 数组）就不再覆盖，避免抹掉用户手动修正
    if (Array.isArray(log.wordIds) && log.wordIds.length > 0) return;
    if (!Array.isArray(log.wordIds)) log.wordIds = [];
    const seen = state.newWordSeen || [];
    const ids = [];
    seen.forEach(id => {
      const s = state.wordStatus[id];
      if (s && s.level >= 1 && s.lastReview === today && !ids.includes(id)) ids.push(id);
    });
    log.wordIds = ids;
    // 同时让 words 与真实去重数对齐（兼容旧统计）
    log.words = ids.length;
    Store.save();
  } catch (e) { console.warn('migrateStudyLogWordIds error', e); }
}

// 手动修正今日背词数（供设置/统计页调用）
function fixTodayWordCount(newCount) {
  const n = parseInt(newCount, 10);
  if (isNaN(n) || n < 0) { alert('请输入有效的正整数'); return; }
  const today = Utils.today();
  if (!state.studyLog[today]) state.studyLog[today] = { words: 0, tests: 0, correct: 0, wrong: 0, wordIds: [] };
  const log = state.studyLog[today];
  log.words = n;
  if (!Array.isArray(log.wordIds)) log.wordIds = [];
  // 保留已有的真实 wordId，不足用 manual 占位补齐，超出则截断
  const realIds = log.wordIds.filter(id => typeof id === 'number' || (typeof id === 'string' && !id.startsWith('manual:')));
  const need = Math.max(0, n - realIds.length);
  const manual = [];
  for (let i = 0; i < need; i++) manual.push('manual:' + Date.now() + ':' + i);
  log.wordIds = realIds.concat(manual);
  Store.save();
  renderDashboard();
  alert(`今日背词数已修正为 ${n}`);
}

function init() {
  // 兜底：无论后续哪步卡住，启动页最多 1.5 秒后强制消失
  const splashEl = document.getElementById('appSplash');
  if (splashEl) {
    setTimeout(() => {
      splashEl.classList.add('hidden');
      setTimeout(() => splashEl.remove(), 300);
    }, 1500);
  }

  checkStreak();
  migrateStudyLogWordIds();
  // 语音初始化非首屏必需，延后执行以免阻塞启动
  setTimeout(() => Speech.initVoices(), 0);
  // 应用已保存的外观主题（配色自定义）
  applyTheme(getThemeKey(), state.settings && state.settings.customAccent);
  // 应用已保存的「设置背景图」「每日金句背景图」等自定义图片
  applyAppBackground();

  // 新闻换日期则重置「已读/重点」为当天内容（防止昨天已读误判成今天已读）
  resetNewsIfDateChanged();

  // 理财学习：新的一天首次打开时自动解锁到今天，但允许用户当天自由回看前几天
  advanceFinanceDayIfNeeded();

  // 首次/清空时自动预置 AI 分析的「今日重点」（新闻5+理财5），再写回固化
  ensureDefaultImportant();

  // 若 localStorage 是旧版本（缺新模块字段），mergeDefaults 已补齐，
  // 这里写回一次，固化缺失字段，之后刷新即稳定
  try { Store.save(); } catch (e) { /* 忽略保存失败 */ }

  // 绑定导航
  document.querySelectorAll(".nav-tab").forEach(tab => {
    // 历史层级交由 navigate 内部统一处理：
    // 首页→子板块 push（返回可回到首页），子板块互切 replace（不堆积）
    tab.addEventListener("click", () => navigate(tab.dataset.page));
  });

  // 侧边栏展开/折叠（手机端窄栏可展开显示文字，桌面端默认展开）
  const sidebarExpand = document.getElementById("sidebarExpand");
  const sidebarClose = document.getElementById("sidebarClose");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  function closeSidebarExpand() {
    if (sidebar) sidebar.classList.remove("open");
    if (overlay) overlay.classList.remove("show");
    if (sidebarExpand) sidebarExpand.textContent = "»";
  }
  if (sidebarExpand && sidebar && overlay) {
    sidebarExpand.addEventListener("click", () => {
      sidebar.classList.toggle("open");
      overlay.classList.toggle("show");
      sidebarExpand.textContent = sidebar.classList.contains("open") ? "«" : "»";
    });
  }
  if (sidebarClose && sidebar && overlay) {
    sidebarClose.addEventListener("click", closeSidebarExpand);
  }
  if (overlay && sidebar) {
    overlay.addEventListener("click", closeSidebarExpand);
  }

  // 发音评测设置入口
  const settingsBtn = document.getElementById("settingsBtn");
  if (settingsBtn) settingsBtn.addEventListener("click", openSettings);

  // 渲染侧边栏个人信息与可见性
  renderSidebarProfile();
  renderSidebarVisibility();

  // 渲染首页
  navigate("home");

  // 手机硬件返回键：优先关闭侧边栏/弹窗，其次在页面间逐级返回，首页再返回则退出 App
  if (typeof history !== 'undefined') {
    window.addEventListener('popstate', function (e) {
      const sidebar = document.getElementById("sidebar");
      const overlay = document.getElementById("sidebarOverlay");
      const modalRoot = document.getElementById("modalRoot");
      const sidebarOpen = sidebar && sidebar.classList.contains("open");
      const modalOpen = modalRoot && modalRoot.classList.contains("show");

      // 侧边栏打开：先关侧边栏，不退出
      if (sidebarOpen) {
        sidebar.classList.remove("open");
        if (overlay) overlay.classList.remove("show");
        const expandBtn = document.getElementById("sidebarExpand");
        if (expandBtn) expandBtn.textContent = "»";
        history.pushState({ page: currentPage }, '', '#p=' + currentPage);
        return;
      }

      // 弹窗打开：先关弹窗，不退出
      if (modalOpen) {
        closeModal();
        history.pushState({ page: currentPage }, '', '#p=' + currentPage);
        return;
      }

      // 正常页面返回
      const targetPage = (e.state && e.state.page) ? e.state.page : 'home';
      _navigatingFromHistory = true;
      navigate(targetPage, { pushHistory: false });
      _navigatingFromHistory = false;
    });
  }

  // 非首屏内容延迟加载
  setTimeout(() => {
    // 新闻模块已移除，不再拉取 news.json
    // loadNewsFromServer();
    // 每天首次打开时选择心情并展示金句
    checkDailyMood();
  }, 50);

  // 建立首页基础历史记录，保证从子板块按返回键能回到首页而不是退出 APP
  if (typeof history !== 'undefined') {
    history.replaceState({ page: 'home' }, '', location.pathname + location.search);
  }

  // 初始化完成，尽快隐藏启动遮罩，缩短 PWA 启动等待感知
  const splash = document.getElementById('appSplash');
  if (splash) {
    splash.classList.add('hidden');
    setTimeout(() => splash.remove(), 300);
  }
}

// 侧边栏模块清单（key 对应 data-page，label 用于设置页展示）
const SIDEBAR_MODULES = [
  { key: "home", label: "🏠 首页", group: "学习" },
  { key: "words", label: "📖 单词", group: "学习" },
  { key: "sentences", label: "🔄 句子", group: "学习" },
  { key: "listening", label: "🎧 听力", group: "学习" },
  { key: "translate", label: "📝 翻译", group: "学习" },
  { key: "errors", label: "❌ 错题本", group: "学习" },
  { key: "stats", label: "📊 统计", group: "学习" },
  { key: "exercise", label: "💪 锻炼", group: "生活" },
  { key: "reading", label: "📒 阅读笔记", group: "生活" },
  { key: "diet", label: "🍱 饮食", group: "生活" },
  { key: "weight", label: "⚖️ 体重", group: "生活" },
  { key: "news", label: "📰 热点新闻", group: "资讯" },
  { key: "finance", label: "💰 理财学习", group: "资讯" },
];

function getDefaultSidebarVisible() {
  const obj = {};
  SIDEBAR_MODULES.forEach(m => obj[m.key] = true);
  return obj;
}

function getSidebarVisible() {
  const def = getDefaultSidebarVisible();
  const cfg = state.sidebar && state.sidebar.visible ? state.sidebar.visible : {};
  return Object.assign({}, def, cfg);
}

function renderSidebarVisibility() {
  const visible = getSidebarVisible();
  SIDEBAR_MODULES.forEach(m => {
    const btn = document.querySelector(`.sidebar-nav .nav-tab[data-page="${m.key}"]`);
    if (btn) btn.style.display = visible[m.key] ? "" : "none";
  });
}

// ==========================================
// 饮食记录
// ==========================================
const DIET_MEALS = [
  { key: "breakfast", label: "🍳 早餐" },
  { key: "lunch", label: "🍱 午餐" },
  { key: "dinner", label: "🍲 晚餐" },
  { key: "snack", label: "🍎 加餐 / 其他" },
];

// 饮食记录的生活化份量（按日常参照选，不显示克数/热量）
const DIET_PORTIONS = [
  { key: "tiny", label: "🤏 一点点", ratio: 0.3, desc: "几口 · 1小把" },
  { key: "small", label: "🍽️ 小份", ratio: 0.6, desc: "半小碗 · 1个鸡蛋大小" },
  { key: "medium", label: "🍚 中份", ratio: 1.0, desc: "一小碗 · 1个拳头" },
  { key: "large", label: "🥣 大份", ratio: 1.8, desc: "一碗 · 1个手掌" },
  { key: "huge", label: "🍱 超大份", ratio: 3.0, desc: "一大碗/套餐 · 1个餐盘" },
];

function getPortionLabelFromAmount(amount) {
  const p = DIET_PORTIONS.reduce((best, cur) => {
    return Math.abs(cur.ratio * 100 - amount) < Math.abs(best.ratio * 100 - amount) ? cur : best;
  }, DIET_PORTIONS[2]);
  return p.label.split(" ")[1] || p.label;
}

function renderDiet() {
  const page = document.getElementById("page-diet");
  if (!page) return;
  const today = Utils.today();
  const log = state.diet.log || {};
  const todayItems = log[today] || [];

  const mealLabel = key => (DIET_MEALS.find(m => m.key === key) || { label: "其他" }).label;
  const formatDietDate = dateStr => {
    const [y, m, d] = dateStr.split("-").map(Number);
    return `${m}月${d}日`;
  };
  const renderItems = (date, items) => items.slice().reverse().map(x => `
    <div class="diet-log-item" onclick="openEditFood('${date}','${x.id}')">
      ${x.photo ? `<img class="diet-log-photo" src="${x.photo}" alt="">` : ""}
      <div class="diet-log-info">
        <div class="diet-log-top">
          <span class="diet-log-meal">${mealLabel(x.meal)}</span>
        </div>
        <div class="diet-log-name">${escapeHtml(x.name)}${x.portionLabel ? ` <span class="diet-log-amount">${escapeHtml(x.portionLabel)}</span>` : x.amount ? ` <span class="diet-log-amount">${getPortionLabelFromAmount(x.amount)}</span>` : ""}</div>
        ${x.note ? `<div class="diet-log-note">${escapeHtml(x.note)}</div>` : ""}
      </div>
      <button class="btn btn-xs btn-ghost" onclick="event.stopPropagation();deleteFood('${date}','${x.id}')">✕</button>
    </div>
  `).join("");

  const dates = Object.keys(log).filter(d => Array.isArray(log[d]) && log[d].length).sort().reverse();
  const pastDates = dates.filter(d => d !== today);
  const expanded = !!window.__dietHistoryExpanded;
  const openDay = window.__dietOpenDay || null;
  const pastHtml = pastDates.length ? `
    <div class="diet-log-title diet-history-toggle" onclick="toggleDietHistory()">
      <span>往日记录（${pastDates.length} 天）</span>
      <span class="diet-history-arrow">${expanded ? "▲" : "▼"}</span>
    </div>
    ${expanded ? pastDates.map(d => `
      <div class="diet-history-day">
        <div class="diet-history-date" onclick="toggleDietDay('${d}')">
          <span>${formatDietDate(d)}</span>
          <span class="diet-history-arrow">${openDay === d ? "▲" : "▼"}</span>
        </div>
        ${openDay === d ? renderItems(d, log[d]) : ""}
      </div>
    `).join("") : ""}
  ` : "";

  let html = `
    <div class="section-head">
      <h2>🍱 饮食记录</h2>
    </div>
    <button class="diet-record-btn" onclick="openAddFood()">＋ 记录饮食</button>
    <div class="diet-log">
      <div class="diet-log-title">今日记录</div>
      ${todayItems.length ? renderItems(today, todayItems) : '<div class="diet-empty">今天还没记录，点击上方按钮开始记录～</div>'}
      ${pastHtml}
    </div>
  `;
  page.innerHTML = html;
}

function toggleDietHistory() {
  window.__dietHistoryExpanded = !window.__dietHistoryExpanded;
  if (!window.__dietHistoryExpanded) window.__dietOpenDay = null;
  renderDiet();
}

function toggleDietDay(date) {
  window.__dietOpenDay = window.__dietOpenDay === date ? null : date;
  renderDiet();
}

function openDietTarget() {
  const cur = state.diet.kcalTarget || 1800;
  const body = `
    <label class="modal-label">每日热量目标（kcal）</label>
    <input class="modal-input" id="dietTargetInput" type="number" min="800" max="4000" value="${cur}" />
    <div class="addfood-tip">目标是指你每天建议摄入的热量，不是消耗。维持体重一般吃够每日总消耗即可。</div>
  `;
  const actions = `
    <button class="btn btn-secondary" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="saveDietTarget()">保存</button>
  `;
  openModal("设置热量目标", body, actions);
}

function saveDietTarget() {
  const val = parseInt(document.getElementById("dietTargetInput").value, 10);
  if (!val || val < 800 || val > 4000) { Utils.toast("请输入 800–4000 之间的整数", "warning"); return; }
  state.diet.kcalTarget = val;
  Store.save();
  closeModal();
  renderDiet();
  Utils.toast("热量目标已设为 " + val + " kcal", "success");
}

let foodStream = null;

// 将图片文件压缩为 base64 JPEG，限制最大边长与质量，避免 localStorage 被撑爆
function compressImageToBase64(file, maxSide = 1200, quality = 0.7) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith("image/")) { reject(new Error("不是图片文件")); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h && w > maxSide) { h = Math.round(h * maxSide / w); w = maxSide; }
        else if (h > maxSide) { w = Math.round(w * maxSide / h); h = maxSide; }
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("图片加载失败"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

// ===== 自定义图片（背景 / 金句背景 / 头像）=====
// 应用整体背景图：在 body 背景之上叠加一层图片 + 主题色半透明遮罩，保证文字可读
function applyAppBackground() {
  let layer = document.getElementById('appBgLayer');
  let scrim = document.getElementById('appBgScrim');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'appBgLayer';
    document.body.appendChild(layer);
  }
  if (!scrim) {
    scrim = document.createElement('div');
    scrim.id = 'appBgScrim';
    document.body.appendChild(scrim);
  }
  const img = (state.settings && state.settings.bgImage) || '';
  if (img) {
    layer.style.backgroundImage = 'url("' + img + '")';
    layer.classList.add('show');
    scrim.classList.add('show');
    document.body.classList.add('has-bg-image');
  } else {
    layer.style.backgroundImage = '';
    layer.classList.remove('show');
    scrim.classList.remove('show');
    document.body.classList.remove('has-bg-image');
  }
}

// 金句背景 & 头像的 live 应用：重渲染相关区域即可
function applyQuoteBackground() {
  if (typeof renderDashboard === 'function' && currentPage === 'home') renderDashboard();
}
function applyAvatarSetting() {
  if (typeof renderSidebarProfile === 'function') renderSidebarProfile();
  if (typeof renderDashboard === 'function' && currentPage === 'home') renderDashboard();
}

// 通用：从 <input type=file> 读取图片 → 压缩 → 写入 state.settings[key] → 应用 → 刷新预览
function imageFilePicked(input, key, maxSide, quality, applyFn, id) {
  if (!input || !input.files || !input.files[0]) return;
  compressImageToBase64(input.files[0], maxSide, quality).then(function (url) {
    state.settings[key] = url;
    Store.save();
    if (typeof applyFn === 'function') applyFn();
    const prev = document.getElementById('prev_' + id);
    if (prev) prev.innerHTML = '<img src="' + url + '" alt="预览" />';
    const rm = document.getElementById('rm_' + id);
    if (rm) rm.style.display = '';
  }).catch(function (e) {
    if (typeof Utils !== 'undefined' && Utils.toast) Utils.toast('图片读取失败：' + ((e && e.message) || e), 'error');
  });
}
function imageSettingCleared(key, applyFn, id) {
  state.settings[key] = '';
  Store.save();
  if (typeof applyFn === 'function') applyFn();
  const prev = document.getElementById('prev_' + id);
  if (prev) prev.innerHTML = '<span class="iu-empty">未设置</span>';
  const rm = document.getElementById('rm_' + id);
  if (rm) rm.style.display = 'none';
}

// 背景图（整体）
function onBgFileChange(input) { imageFilePicked(input, 'bgImage', 1500, 0.7, applyAppBackground, 'bg'); }
function clearBgImage() { imageSettingCleared('bgImage', applyAppBackground, 'bg'); }
// 每日金句背景图
function onQuoteBgFileChange(input) { imageFilePicked(input, 'quoteBgImage', 1200, 0.7, applyQuoteBackground, 'quoteBg'); }
function clearQuoteBgImage() { imageSettingCleared('quoteBgImage', applyQuoteBackground, 'quoteBg'); }
// 头像图片
function onAvatarFileChange(input) { imageFilePicked(input, 'avatarImage', 400, 0.85, applyAvatarSetting, 'avatarImg'); }
function clearAvatarImage() { imageSettingCleared('avatarImage', applyAvatarSetting, 'avatarImg'); }

function openAddFood(preselectMeal, editDate, editItem) {
  const isEdit = !!(editDate && editItem);
  const initMeal = (editItem && editItem.meal) || preselectMeal || "breakfast";
  const initName = isEdit ? (editItem.name || "") : "";
  const initNote = isEdit ? (editItem.note || "") : "";
  const initPhoto = isEdit ? (editItem.photo || null) : null;

  // 编辑时：根据记录的克数反选到对应份量；旧自定义克数记录映射到最接近的份量
  let initPortionIdx = 2;
  if (isEdit && editItem.amount) {
    const matched = DIET_PORTIONS.findIndex(p => Math.round(p.ratio * 100) === Math.round(editItem.amount));
    if (matched >= 0) {
      initPortionIdx = matched;
    } else {
      let best = 2, bestDiff = Infinity;
      DIET_PORTIONS.forEach((p, i) => {
        const diff = Math.abs(p.ratio * 100 - editItem.amount);
        if (diff < bestDiff) { bestDiff = diff; best = i; }
      });
      initPortionIdx = best;
    }
  }

  const mealBtns = DIET_MEALS.map(m =>
    `<button type="button" class="diet-meal-opt ${m.key === initMeal ? 'active' : ''}" data-meal="${m.key}" onclick="selectFoodMeal('${m.key}')">${m.label}</button>`
  ).join("");
  const portionBtns = DIET_PORTIONS.map((p, idx) =>
    `<button type="button" class="diet-portion-opt ${idx === initPortionIdx ? 'active' : ''}" data-key="${p.key}" data-ratio="${p.ratio}" data-gram="${Math.round(p.ratio * 100)}" onclick="selectFoodPortion('${p.key}')">
      <span class="dp-label">${p.label}</span>
      <span class="dp-desc">${p.desc}</span>
    </button>`
  ).join("");
  const body = `
    <label class="modal-label">选择餐段</label>
    <div class="diet-meal-opts">${mealBtns}</div>

    <div class="addfood-photo-wrap">
      <input type="file" id="foodFileInput" accept="image/*" style="display:none" onchange="selectFoodPhoto(this.files[0])">
      <div class="addfood-preview-box" style="position:relative;">
        <video id="foodVideo" class="addfood-video" autoplay playsinline muted style="display:none"></video>
        <img id="foodPhoto" class="addfood-photo-preview" style="display:none" alt="">
      </div>
      <canvas id="foodCanvas" style="display:none"></canvas>

      <div id="foodDropZone" class="food-drop-zone" onclick="document.getElementById('foodFileInput').click()"
           ondragover="handleFoodDragOver(event)" ondragleave="handleFoodDragLeave(event)" ondrop="handleFoodDrop(event)">
        <div class="food-drop-icon">🖼️</div>
        <div class="food-drop-title">点击选择照片 / 拖拽到此处</div>
        <div class="food-drop-sub">手机会唤起相册，也可直接拍照</div>
      </div>

      <div class="addfood-photo-btns">
        <button class="btn btn-sm btn-secondary" id="btnSnap" onclick="snapFoodPhoto()">📷 拍照</button>
        <button class="btn btn-sm btn-ghost" id="btnRetake" style="display:none" onclick="retakeFoodPhoto()">重选</button>
      </div>
      <div class="addfood-tip">照片只用来帮你回忆吃了什么，不会自动识别重量。</div>
    </div>

    <label class="modal-label">吃了什么 *</label>
    <input class="modal-input" id="afName" value="${escapeHtml(initName)}" placeholder="如：米饭、鸡胸肉、苹果" oninput="suggestFood(this.value)" />
    <div id="afSuggest" class="addfood-suggest"></div>

    <label class="modal-label">份量（不用称重，按日常参照选）</label>
    <div class="addfood-tip" style="margin-bottom:10px;">没有厨房秤也不用纠结，按「一小碗」「一个拳头」「一个手掌」这类日常感觉选即可。</div>
    <div class="diet-portion-opts">${portionBtns}</div>

    <label class="modal-label">备注（可选）</label>
    <input class="modal-input" id="afNote" value="${escapeHtml(initNote)}" placeholder="如：少油、外卖" />
  `;
  const actions = isEdit
    ? `<button class="btn btn-secondary" onclick="closeAddFood()">取消</button>
       <button class="btn btn-primary" onclick="submitFoodEdit('${editDate}','${editItem.id}')">保存修改</button>`
    : `<button class="btn btn-secondary" onclick="closeAddFood()">取消</button>
       <button class="btn btn-primary" onclick="submitFood()">保存</button>`;
  openModal(isEdit ? "编辑饮食记录" : "＋ 记录饮食", body, actions, "addfood-modal");
  window.__foodPhoto = initPhoto;
  window.__foodKcal = isEdit ? editItem.kcal100 : null;
  window.__selectedMeal = initMeal;
  window.__foodPortion = DIET_PORTIONS[initPortionIdx];
  window.__foodCustomGram = null;
  if (isEdit && initPhoto) {
    // 延迟一下，等 modal 渲染到 DOM 后再显示已有照片
    setTimeout(() => showFoodPhotoPreview(initPhoto), 0);
  }
  startFoodCamera();
  updateFoodKcalPreview();
}

function selectFoodMeal(key) {
  window.__selectedMeal = key;
  document.querySelectorAll(".diet-meal-opt").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.meal === key);
  });
}

function selectFoodPortion(key) {
  const p = DIET_PORTIONS.find(x => x.key === key);
  if (!p) return;
  window.__foodPortion = p;
  window.__foodCustomGram = null;
  document.querySelectorAll(".diet-portion-opt").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.key === key);
  });
  const customIn = document.getElementById("afAmount");
  const toggleBtn = document.getElementById("btnToggleCustomGram");
  if (customIn) customIn.style.display = "none";
  if (toggleBtn) toggleBtn.style.display = "inline-flex";
  updateFoodKcalPreview();
}

function toggleFoodCustomGram() {
  const input = document.getElementById("afAmount");
  const toggleBtn = document.getElementById("btnToggleCustomGram");
  if (!input) return;
  const show = input.style.display === "none";
  input.style.display = show ? "block" : "none";
  if (toggleBtn) toggleBtn.style.display = show ? "none" : "inline-flex";
  if (show) {
    input.value = Math.round((window.__foodPortion || DIET_PORTIONS[2]).ratio * 100);
    input.focus();
    selectFoodCustomGram(input.value);
  } else {
    window.__foodCustomGram = null;
    document.querySelectorAll(".diet-portion-opt").forEach(btn => btn.classList.remove("active"));
  }
}

function selectFoodCustomGram(val) {
  const g = parseFloat(val);
  if (!g || g <= 0) return;
  window.__foodCustomGram = g;
  window.__foodPortion = null;
  document.querySelectorAll(".diet-portion-opt").forEach(btn => btn.classList.remove("active"));
  updateFoodKcalPreview();
}

function getFoodPortionInfo() {
  const p = window.__foodPortion || DIET_PORTIONS[2];
  return { amount: Math.round(p.ratio * 100), label: p.label.split(" ")[1] || p.label };
}

function startFoodCamera() {
  // 不自动启动摄像头：默认显示「选择/拖拽」区域，用户点击「拍照」后再启动。
  // 这里只检查环境，如果完全无法拍照就隐藏按钮并更新提示。
  const v = document.getElementById("foodVideo");
  if (!v || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const tip = document.querySelector(".addfood-tip");
    if (tip) tip.textContent = "当前环境不支持摄像头，可点击上方区域从相册选择照片。";
    const btn = document.getElementById("btnSnap");
    if (btn) btn.style.display = "none";
  }
}

function openFoodCamera() {
  const v = document.getElementById("foodVideo");
  const drop = document.getElementById("foodDropZone");
  if (!v || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    Utils.toast("当前环境不支持摄像头", "warning"); return;
  }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
    .then(stream => {
      foodStream = stream; v.srcObject = stream; v.style.display = "block";
      if (drop) drop.style.display = "none";
      const img = document.getElementById("foodPhoto");
      if (img) img.style.display = "none";
      const retake = document.getElementById("btnRetake");
      if (retake) retake.style.display = "none";
      window.__foodPhoto = null;
    })
    .catch(() => {
      Utils.toast("无法访问摄像头，请授权或从相册选择", "warning");
    });
}

function showFoodPhotoPreview(dataUrl) {
  const img = document.getElementById("foodPhoto");
  const v = document.getElementById("foodVideo");
  const drop = document.getElementById("foodDropZone");
  const retake = document.getElementById("btnRetake");
  if (img) { img.src = dataUrl; img.style.display = "block"; }
  if (v) v.style.display = "none";
  if (drop) drop.style.display = "none";
  if (retake) retake.style.display = "inline-block";
  window.__foodPhoto = dataUrl;
}

function snapFoodPhoto() {
  const v = document.getElementById("foodVideo");
  if (!v || !v.videoWidth || v.style.display === "none") {
    openFoodCamera();
    return;
  }
  const c = document.getElementById("foodCanvas");
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
  const data = c.toDataURL("image/jpeg", 0.7);
  showFoodPhotoPreview(data);
}

function selectFoodPhoto(file) {
  if (!file) return;
  Utils.toast("正在处理图片...", "info");
  compressImageToBase64(file).then(data => {
    showFoodPhotoPreview(data);
    Utils.toast("图片已添加", "success");
  }).catch(err => {
    Utils.toast(err.message || "图片处理失败", "error");
  });
}

function handleFoodDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  const drop = document.getElementById("foodDropZone");
  if (drop) drop.classList.add("drag");
}

function handleFoodDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  const drop = document.getElementById("foodDropZone");
  if (drop) drop.classList.remove("drag");
}

function handleFoodDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  const drop = document.getElementById("foodDropZone");
  if (drop) drop.classList.remove("drag");
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) selectFoodPhoto(file);
}

function retakeFoodPhoto() {
  const v = document.getElementById("foodVideo");
  const img = document.getElementById("foodPhoto");
  const drop = document.getElementById("foodDropZone");
  const fileIn = document.getElementById("foodFileInput");
  if (fileIn) fileIn.value = "";
  if (img) { img.style.display = "none"; img.src = ""; }
  if (foodStream) {
    if (v) v.style.display = "block";
    if (drop) drop.style.display = "none";
  } else {
    if (v) v.style.display = "none";
    if (drop) drop.style.display = "flex";
  }
  const btnRetake = document.getElementById("btnRetake");
  if (btnRetake) btnRetake.style.display = "none";
  window.__foodPhoto = null;
}

function closeAddFood() {
  if (foodStream) { foodStream.getTracks().forEach(t => t.stop()); foodStream = null; }
  window.__foodPhoto = null;
  window.__foodKcal = null;
  closeModal();
}

// 常见烹饪做法词：输入「烤青椒」「炒蛋」时应能识别出核心食材
const COOKING_WORDS = ["烤","煮","炒","蒸","炸","煎","炖","红烧","凉拌","焗","烩","爆","熘","卤","腌","熏","拌","熬","煲","涮","煨","汆","炝","干锅","香辣","麻辣","糖醋","清蒸","蒜蓉","油焖","酱爆","白灼"];

function normalizeFoodQuery(query) {
  let q = (query || "").trim();
  if (!q) return q;
  // 去掉前后常见做法词，保留核心食材；如「烤青椒」→「青椒」
  for (const w of COOKING_WORDS) {
    if (q.startsWith(w)) q = q.slice(w.length).trim();
    if (q.endsWith(w)) q = q.slice(0, -w.length).trim();
  }
  return q || (query || "").trim();
}

function findFood(query) {
  const raw = (query || "").trim();
  if (!raw) return null;
  const normalized = normalizeFoodQuery(raw);
  const candidates = [raw, normalized];
  for (const q of candidates) {
    for (const f of FOOD_CALORIES) {
      if (f.name.indexOf(q) >= 0) return f;
      for (const a of (f.alias || [])) {
        if (a.indexOf(q) >= 0 || q.indexOf(a) >= 0) return f;
      }
    }
  }
  return null;
}

function suggestFood(q) {
  const box = document.getElementById("afSuggest");
  if (!box) return;
  const query = (q || "").trim();
  if (!query) { box.innerHTML = ""; updateFoodKcalPreview(); return; }
  const normalized = normalizeFoodQuery(query);
  const hits = [];
  for (const f of FOOD_CALORIES) {
    const match = f.name.indexOf(query) >= 0 || f.name.indexOf(normalized) >= 0 ||
      (f.alias || []).some(a => a.indexOf(query) >= 0 || a.indexOf(normalized) >= 0 || query.indexOf(a) >= 0 || normalized.indexOf(a) >= 0);
    if (match) hits.push(f);
    if (hits.length >= 8) break;
  }
  if (!hits.length) {
    box.innerHTML = '<div class="addfood-no">未匹配到常见食物，可手动填备注</div>';
    window.__foodKcal = null;
    updateFoodKcalPreview();
    return;
  }
  box.innerHTML = hits.map(f =>
    `<div class="addfood-suggest-item" onclick="pickFood('${f.name.replace(/'/g, "\\'")}',${f.kcal})">${f.name}</div>`
  ).join("");
  updateFoodKcalPreview();
}

function pickFood(name, kcal) {
  const inp = document.getElementById("afName");
  if (inp) inp.value = name;
  window.__foodKcal = kcal;
  const box = document.getElementById("afSuggest");
  if (box) box.innerHTML = "";
  updateFoodKcalPreview();
}

function updateFoodKcalPreview() {
  const el = document.getElementById("afKcalPreview");
  if (!el) return;
  const nameEl = document.getElementById("afName");
  const name = (nameEl && nameEl.value || "").trim();
  const { amount, label } = getFoodPortionInfo();
  let kcal100 = window.__foodKcal;
  if (kcal100 == null) { const f = findFood(name); if (f) kcal100 = f.kcal; }
  if (kcal100 == null) { el.textContent = "热量：—（未识别食物，可填备注）"; return; }
  const total = Math.round(kcal100 * amount / 100);
  el.textContent = `${label} · 每 100g ${kcal100} kcal ≈ ${total} kcal`;
}

function submitFood() {
  const meal = window.__selectedMeal || "breakfast";
  const name = (document.getElementById("afName").value || "").trim();
  if (!name) { Utils.toast("请填写吃了什么", "warning"); return; }
  const { amount, label } = getFoodPortionInfo();
  let kcal100 = window.__foodKcal;
  if (kcal100 == null) { const f = findFood(name); if (f) kcal100 = f.kcal; }
  const kcal = kcal100 != null ? Math.round(kcal100 * amount / 100) : 0;
  const note = (document.getElementById("afNote").value || "").trim();
  const photo = window.__foodPhoto || null;
  const today = Utils.today();
  if (!state.diet.log[today]) state.diet.log[today] = [];
  state.diet.log[today].push({ id: "f" + Date.now(), meal, name, amount, kcal, kcal100: kcal100 || null, portionLabel: label, note, photo });
  Store.save();
  if (foodStream) { foodStream.getTracks().forEach(t => t.stop()); foodStream = null; }
  window.__foodPhoto = null; window.__foodKcal = null; window.__selectedMeal = null;
  window.__foodPortion = DIET_PORTIONS[2]; window.__foodCustomGram = null;
  closeModal();
  renderDiet();
  Utils.toast("已记录：" + name + " " + label, "success");
}

function openEditFood(date, id) {
  const item = (state.diet.log[date] || []).find(x => x.id === id);
  if (!item) { Utils.toast("记录不存在", "warning"); return; }
  openAddFood(null, date, item);
}

function submitFoodEdit(date, id) {
  const list = state.diet.log[date];
  if (!list) return;
  const idx = list.findIndex(x => x.id === id);
  if (idx < 0) return;
  const meal = window.__selectedMeal || "breakfast";
  const name = (document.getElementById("afName").value || "").trim();
  if (!name) { Utils.toast("请填写吃了什么", "warning"); return; }
  const { amount, label } = getFoodPortionInfo();
  let kcal100 = window.__foodKcal;
  if (kcal100 == null) { const f = findFood(name); if (f) kcal100 = f.kcal; }
  const kcal = kcal100 != null ? Math.round(kcal100 * amount / 100) : 0;
  const note = (document.getElementById("afNote").value || "").trim();
  const photo = window.__foodPhoto || null;
  list[idx] = Object.assign({}, list[idx], { meal, name, amount, kcal, kcal100: kcal100 || null, portionLabel: label, note, photo });
  Store.save();
  if (foodStream) { foodStream.getTracks().forEach(t => t.stop()); foodStream = null; }
  window.__foodPhoto = null; window.__foodKcal = null; window.__selectedMeal = null;
  window.__foodPortion = DIET_PORTIONS[2]; window.__foodCustomGram = null;
  closeModal();
  renderDiet();
  Utils.toast("已更新：" + name + " " + label, "success");
}

function deleteFood(date, id) {
  if (!state.diet.log[date]) return;
  state.diet.log[date] = state.diet.log[date].filter(x => x.id !== id);
  if (!state.diet.log[date].length) delete state.diet.log[date];
  Store.save();
  renderDiet();
}

// ==========================================
// 体重记录
// ==========================================
function renderWeight() {
  const page = document.getElementById("page-weight");
  if (!page) return;
  const records = [...(state.weight.records || [])].sort((a, b) => a.date < b.date ? -1 : 1);
  const height = state.weight.height || 164;
  const latest = records.length ? records[records.length - 1] : null;
  const bmi = latest ? (latest.kg / Math.pow(height / 100, 2)) : null;

  let html = `
    <div class="section-head"><h2>⚖️ 体重记录</h2></div>
    <div class="weight-top">
      <div class="weight-stat">
        <div class="big">${latest ? (latest.kg * 2).toFixed(1) : "—"}</div>
        <div class="sub">最新体重 斤（${latest ? latest.date : "尚未记录"}）</div>
      </div>
      <div class="weight-stat">
        <div class="big">${bmi ? bmi.toFixed(1) : "—"}</div>
        <div class="sub">BMI（身高 ${height}cm）</div>
      </div>
      <button class="btn btn-primary" onclick="openAddWeight()">＋ 记录体重</button>
    </div>
    ${records.length >= 2 ? `
      <div class="weight-chart-card">
        <div class="weight-chart-title">体重变化趋势（斤）</div>
        <canvas id="weightChart" width="600" height="240"></canvas>
      </div>
    ` : `<div class="weight-hint">记录 2 次以上即可生成趋势图 📈</div>`}
    <div class="weight-advice">${weightAdvice(records, height)}</div>
    <div class="weight-list">
      ${records.length ? records.slice().reverse().map(r => `
        <div class="weight-row">
          <span class="weight-date">${r.date}</span>
          <span class="weight-kg">${(r.kg * 2).toFixed(1)} 斤</span>
          <span class="weight-bmi">BMI ${(r.kg / Math.pow(height / 100, 2)).toFixed(1)}</span>
          <button class="btn btn-xs btn-ghost" onclick="deleteWeight('${r.id}')">✕</button>
        </div>
      `).join("") : '<div class="diet-empty">还没有记录，记下第一天吧～</div>'}
    </div>
  `;
  page.innerHTML = html;
  if (records.length >= 2) drawWeightChart(records, height);
}

function openAddWeight() {
  const today = Utils.today();
  const body = `
    <label class="modal-label">日期</label>
    <input class="modal-input" id="wtDate" type="date" value="${today}" />
    <label class="modal-label">体重（斤）*</label>
    <input class="modal-input" id="wtJin" type="number" step="0.1" min="40" max="600" placeholder="如 105" />
    <div class="addfood-tip">身高固定 ${state.weight.height || 164}cm。体重秤读数一般为“斤”，这里填斤，系统自动换算成公斤保存。</div>
  `;
  const actions = `
    <button class="btn btn-secondary" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="submitWeight()">保存</button>
  `;
  openModal("＋ 记录体重", body, actions, "addweight-modal");
}

function submitWeight() {
  const date = document.getElementById("wtDate").value || Utils.today();
  const jin = parseFloat(document.getElementById("wtJin").value);
  if (!jin || jin < 40 || jin > 600) { Utils.toast("请填写有效体重（斤）", "warning"); return; }
  const kg = +(jin / 2).toFixed(2);
  if (!state.weight.records) state.weight.records = [];
  const existing = state.weight.records.find(r => r.date === date);
  if (existing) existing.kg = kg;
  else state.weight.records.push({ id: "w" + Date.now(), date, kg });
  Store.save();
  closeModal();
  renderWeight();
  Utils.toast("已记录体重 " + jin.toFixed(1) + " 斤", "success");
}

function deleteWeight(id) {
  state.weight.records = (state.weight.records || []).filter(r => r.id !== id);
  Store.save();
  renderWeight();
}

function weightAdvice(records, height) {
  if (!records.length) return "👉 先记录第一天的体重，之后每次想称都记一下，我会帮你画趋势、算 BMI、给建议。";
  const sorted = [...records].sort((a, b) => a.date < b.date ? -1 : 1);
  const latest = sorted[sorted.length - 1];
  const bmi = latest.kg / Math.pow(height / 100, 2);
  let cat, advice;
  if (bmi < 18.5) { cat = "偏瘦"; advice = "你目前 BMI 偏低，建议适当增重：保证充足碳水与优质蛋白（鸡蛋、牛奶、瘦肉），配合力量训练把体重慢慢拉到正常区间。"; }
  else if (bmi < 24) { cat = "正常"; advice = "你的体重在健康范围，保持就好：规律饮食 + 每周跑步 / 跟练，少油少糖，状态会很稳。"; }
  else if (bmi < 28) { cat = "偏胖"; advice = "BMI 略超正常上限，不用焦虑：每天制造约 300–500 kcal 缺口（少喝奶茶 / 零食、多动一动），每周 0.3–0.5kg 的速度最健康。"; }
  else { cat = "肥胖"; advice = "BMI 偏高，建议从可控的小目标开始：先戒掉含糖饮料、每天多走 2000 步，必要时咨询营养师制定方案。"; }
  let trend = "";
  if (sorted.length >= 2) {
    const prev = sorted[sorted.length - 2];
    const diff = +((latest.kg - prev.kg) * 2).toFixed(1);
    if (diff > 0) trend = ` 与上次（${prev.date} ${(prev.kg * 2).toFixed(1)}斤）相比 <b>上升 ${diff}斤</b>。`;
    else if (diff < 0) trend = ` 与上次（${prev.date} ${(prev.kg * 2).toFixed(1)}斤）相比 <b>下降 ${Math.abs(diff)}斤</b> 👍。`;
    else trend = ` 与上次基本持平。`;
  }
  return `当前 BMI <b>${bmi.toFixed(1)}</b>（${cat}）。${advice}${trend}`;
}

function drawWeightChart(records, height) {
  const canvas = document.getElementById("weightChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const pad = 38;
  const kgs = records.map(r => r.kg);
  let min = Math.min(...kgs), max = Math.max(...kgs);
  if (min === max) { min -= 1; max += 1; }
  const range = max - min;
  const x = i => pad + (W - 2 * pad) * (i / (records.length - 1));
  const y = kg => H - pad - (H - 2 * pad) * ((kg - min) / range);
  ctx.strokeStyle = "#fde68a"; ctx.fillStyle = "#a16207"; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
  for (let g = 0; g <= 4; g++) {
    const gy = pad + (H - 2 * pad) * (g / 4);
    const kgVal = max - range * (g / 4);
    ctx.beginPath(); ctx.moveTo(pad, gy); ctx.lineTo(W - pad, gy); ctx.stroke();
    ctx.fillText((kgVal * 2).toFixed(0) + "斤", 2, gy + 4);
  }
  ctx.strokeStyle = "#f97316"; ctx.lineWidth = 2.5; ctx.beginPath();
  records.forEach((r, i) => { const px = x(i), py = y(r.kg); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
  ctx.stroke();
  records.forEach((r, i) => {
    const px = x(i), py = y(r.kg);
    ctx.fillStyle = "#d97706"; ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#a16207"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(r.date.slice(5), px, H - pad + 14);
  });
}

// 启动
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
