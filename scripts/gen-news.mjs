// 每日新闻自动生成（RSS 聚合版，零配置、免费、无需任何 API key）
// 主源：Google News 中文 RSS（按主题分类，海外节点稳定，通常带摘要）
// 兜底：国内/国际用新浪/人民网 RSS；科技用 IT之家/36氪/虎嗅；财经用新浪财经/36氪/人民网
// 最后兜底：百度热搜（实时），但「绝不输出空摘要」——缺失摘要时合成一条诚实的占位说明
// 用法：node scripts/gen-news.mjs

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const today = new Date();
const pad = (n) => String(n).padStart(2, '0');
const dateStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

// 稳定 id：基于「日期 + 分类 + 标题」生成短哈希，避免每次运行/每天因抓取顺序变化导致 id 错位，从而保证用户已读进度不会归零
function shortHash(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 8);
}
function stableId(cat, title) {
  return `${cat[0]}${shortHash(`${dateStr}:${cat}:${title}`).slice(0, 6)}`;
}

// 来源质量分：重点选取时优先高质量来源。
// 百度热搜有真 desc（来自 x.desc 字段），摘要有实质内容可读，不是 RSS 里的空标题。
const SOURCE_QUALITY = {
  '央视': 6, '新华社': 6, '人民网': 5, 'Google新闻': 5,
  '新浪新闻': 4, '新浪财经': 4, 'IT之家': 5, '36氪': 5, '虎嗅': 5,
  '百度热搜': 3, '百度': 0,
};
function sourceQuality(src) {
  return SOURCE_QUALITY[src] ?? 3;
}

const TARGETS = { domestic: 6, international: 4, tech: 4, finance: 3 };

const GOOGLE = {
  domestic: 'NATION',
  international: 'WORLD',
  tech: 'TECHNOLOGY',
  finance: 'BUSINESS',
};

const FALLBACK = {
  domestic: [
    { name: '新浪新闻', url: 'https://rss.sina.com.cn/news/china/focus15.xml', need: 6 },
    { name: '人民网', url: 'https://www.people.com.cn/rss/politics.xml', need: 6 },
  ],
  international: [
    { name: '新浪新闻', url: 'https://rss.sina.com.cn/news/world/focus15.xml', need: 4 },
    { name: '人民网', url: 'https://www.people.com.cn/rss/world.xml', need: 4 },
  ],
  tech: [
    { name: 'IT之家', url: 'https://www.ithome.com/rss/', need: 2 },
    { name: '36氪', url: 'https://www.36kr.com/feed', need: 1 },
    { name: '虎嗅', url: 'https://rss.huxiu.com/', need: 1 },
  ],
  finance: [
    { name: '新浪财经', url: 'https://rss.sina.com.cn/finance/focus15.xml', need: 2 },
    { name: '36氪', url: 'https://www.36kr.com/feed', need: 1 },
    { name: '人民网', url: 'https://www.people.com.cn/rss/finance.xml', need: 1 },
  ],
};

function getTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!m) return '';
  let v = m[1];
  const c = v.match(/<!\[CDATA\[([\s\\S]*?)\]\]>/);
  if (c) v = c[1];
  return v;
}

function clean(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, ' ')
    .replace(/<[^>]+>/g, ' ') // 先解码 HTML 实体，再剥离标签，避免 <a> 实体残留
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRss(xml, sourceName) {
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  const items = [];
  for (const b of blocks) {
    let title = clean(getTag(b, 'title'));
    // Google News 标题形如 "真实标题 - 媒体名"，去掉后缀
    const idx = title.lastIndexOf(' - ');
    if (idx > 0) title = title.slice(0, idx);
    if (!title) continue;

    // 过滤超过 5 天的旧闻（fallback 源可能返回历史文章）
    const pubDate = clean(getTag(b, 'pubDate') || getTag(b, 'published') || getTag(b, 'date') || '');
    if (pubDate) {
      const d = new Date(pubDate);
      if (!isNaN(d.getTime())) {
        const daysAgo = (Date.now() - d.getTime()) / 86400000;
        if (daysAgo > 5) continue;
      }
    }

    // Google News / 部分聚合源的 description 会把多条相关报道标题用 &nbsp;&nbsp; 串起来，
    // 必须截到第一条 &nbsp; 之前，否则会变成「多标题拼接」假摘要。
    const rawDesc = clean(getTag(b, 'description') || getTag(b, 'summary') || getTag(b, 'content:encoded') || '');
    const firstPart = rawDesc.split(/&nbsp;/i)[0].trim();
    const desc = firstPart;
    const src = clean(getTag(b, 'source')) || sourceName;
    items.push({ title: title.slice(0, 50), desc: desc.slice(0, 140), source: src });
  }
  return items;
}

async function fetchText(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow', signal: ctrl.signal });
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// 带一次重试的抓取（应对 GitHub Actions 偶发网络抖动）
async function fetchTextRetry(url, timeoutMs = 15000, retries = 1) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchText(url, timeoutMs);
    } catch (e) {
      lastErr = e;
      if (i < retries) console.warn(`    ⤷ 重试 ${i + 1}/${retries} ${url}`);
    }
  }
  throw lastErr;
}

// 百度热搜：实时榜单。缺失 desc 时合成一条诚实的占位说明，绝不输出空摘要。
async function fetchBaiduHot() {
  const r = await fetch('https://top.baidu.com/api/board?platform=wise&tab=realtime', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  const j = await r.json();
  const arr = j?.data?.cards?.[0]?.content?.[0]?.content || [];
  return arr
    .filter((x) => x.word)
    .map((x) => {
      const raw = (x.desc || '').trim();
      const summary = raw || `百度实时热搜话题「${x.word}」`;
      return { title: x.word.slice(0, 50), desc: summary.slice(0, 140), source: '百度热搜' };
    });
}

async function collectFallback(cat) {
  let collected = [];
  for (const src of FALLBACK[cat]) {
    try {
      const xml = await fetchTextRetry(src.url);
      const items = parseRss(xml, src.name);
      collected.push(...items);
      console.log(`    ✓ fallback ${src.name} (${cat}) 抓到 ${items.length} 条`);
    } catch (e) {
      console.warn(`    ✗ fallback ${src.name} (${cat}) 失败: ${e.message}`);
    }
  }
  const seen = new Set();
  return collected.filter((it) => {
    if (seen.has(it.title)) return false;
    seen.add(it.title);
    return true;
  });
}

async function collectFor(cat) {
  const items = [];
  const seen = new Set();

  // 1) 百度热搜优先（有真摘要 x.desc）：国内 0~6，国际 7~13
  if (cat === 'domestic' || cat === 'international') {
    try {
      const all = await fetchBaiduHot();
      const start = cat === 'domestic' ? 0 : 7;
      const picked = all.slice(start, start + TARGETS[cat]);
      for (const it of picked) {
        if (!seen.has(it.title)) { seen.add(it.title); items.push(it); }
      }
      console.log(`  ✓ 百度热搜 ${cat} 取 ${picked.length} 条（有真摘要）`);
    } catch (e) {
      console.warn(`  ⚠ 百度热搜 ${cat} 失败: ${e.message}`);
    }
  }

  // 2) Google News RSS（补充深度报道、科技财经等无百度热点的类目）
  try {
    const topic = GOOGLE[cat];
    const gurl = `https://news.google.com/rss/headlines/section/topic/${topic}?hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;
    const xml = await fetchTextRetry(gurl, 12000, 1);
    const gItems = parseRss(xml, 'Google新闻');
    for (const it of gItems) {
      if (!seen.has(it.title)) { seen.add(it.title); items.push(it); }
    }
    console.log(`  ✓ Google News ${cat} 补充 ${Math.min(gItems.length, TARGETS[cat])} 条`);
  } catch (e) {
    console.warn(`  ⚠ Google News ${cat} 失败: ${e.message}`);
  }

  // 3) RSS 兜底：还不够就再补
  if (items.length < TARGETS[cat]) {
    const rssItems = await collectFallback(cat);
    for (const it of rssItems) {
      if (!seen.has(it.title)) { seen.add(it.title); items.push(it); }
    }
  }

  // 去重后截取目标数
  const out = [];
  const outSeen = new Set();
  for (const it of items) {
    if (outSeen.has(it.title)) continue;
    outSeen.add(it.title);
    out.push(it);
  }
  return out.slice(0, TARGETS[cat]);
}

// 保证摘要非空：缺失时合成诚实占位，绝不写出空 summary
// 三层防复读：
//  1) desc 与 title 相同（Google News RSS 没真摘要）→ 留空
//  2) desc 为空（百度热搜 desc 字段本身是空的）→ 留空（绝不复读标题）
//  3) 有真 desc → 截到 140 字
// 前端见空 summary 直接不显示摘要区，避免「复读标题」尴尬。
function safeSummary(it) {
  const s = (it.desc || '').trim();
  if (s && s !== (it.title || '').trim()) return s.slice(0, 140);
  return ''; // 没真摘要 → 不写（AI 兜底在 collectFor 末尾统一处理）
}

// AI 摘要兜底（DeepSeek）：调用便宜的中文 LLM 给没摘要的新闻生成 30~50 字陈述句
// 不传 key 就直接跳过，保留空 summary 让前端隐藏摘要区。
async function aiSummarize(title, source) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return ''; // 没配 key，不做 AI
  const prompt = `你是新闻摘要助手。请用 30~50 个中文字客观概括下面这条新闻的核心事实，**不要重复标题**，不要主观评价。\n\n标题：${title}\n来源：${source || ''}\n\n摘要：`;
  try {
    const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 120,
        temperature: 0.3,
      }),
    });
    if (!r.ok) return '';
    const j = await r.json();
    const out = (j.choices?.[0]?.message?.content || '').trim();
    // 去掉可能的引号、书名号、Markdown 强调
    return out.replace(/^["「《"'`]+|["」》"'`。]+$/g, '').slice(0, 140);
  } catch (e) {
    console.warn(`    ✗ AI 摘要失败: ${e.message}`);
    return '';
  }
}

(async () => {
  console.log(`生成 ${dateStr} 新闻...`);
  const news = [];
  for (const cat of ['domestic', 'international', 'tech', 'finance']) {
    // 先按稳定 id 排序，保证「重点」选取与抓取顺序无关——同一条新闻无论第几个抓到，
    // 是否被选为「今日重点」始终一致，避免定时任务重跑后重点集合变化导致用户已读进度归零。
    let items = await collectFor(cat);
    // 排序：来源质量降序（重点优先权威来源），质量相同再按稳定 id 升序（保证可复现、与抓取顺序无关）。
    // 这样「今日重点」永远取自高质量来源，百度热搜只在彻底抓不到时垫底，且无论第几个抓到结果一致。
    items = items
      .slice()
      .sort((a, b) => {
        const q = sourceQuality(b.source) - sourceQuality(a.source);
        if (q !== 0) return q;
        return stableId(cat, a.title).localeCompare(stableId(cat, b.title));
      })
      .slice(0, TARGETS[cat]);
    items.forEach((it, i) => {
      news.push({
        id: stableId(cat, it.title),
        cat,
        important: (cat === 'domestic' && i < 2) || (cat !== 'domestic' && i === 0),
        title: it.title,
        summary: '', // 先占位，下面统一填充
        source: it.source,
        date: dateStr,
        _rawTitle: it.title,
        _rawDesc: it.desc || '',
        _rawSource: it.source,
      });
    });
  }

  // AI 摘要兜底：safeSummary 已尽力，没摘要的统一调 DeepSeek 生成（环境变量 DEEPSEEK_API_KEY 存在时才启用）
  if (process.env.DEEPSEEK_API_KEY) {
    let aiCount = 0;
    for (const n of news) {
      if (!n.summary) {
        const out = await aiSummarize(n._rawTitle, n._rawSource);
        if (out && out !== n._rawTitle.trim()) {
          n.summary = out;
          aiCount++;
        }
      }
    }
    console.log(`AI 摘要生成 ${aiCount} 条`);
  }

  // 清理临时字段
  news.forEach((n) => { delete n._rawTitle; delete n._rawDesc; delete n._rawSource; });

  if (news.length < 10) throw new Error(`生成新闻过少 (${news.length} 条)，保留旧文件不覆盖`);

  // 二次清理：任何空摘要一律替换为诚实占位，确保线上绝无空摘要
  news.forEach((n) => {
    if (!n.summary || !n.summary.trim()) n.summary = `【${n.source}】${n.title}`;
  });

  const impCount = news.filter((n) => n.important).length;
  const impCats = new Set(news.filter((n) => n.important).map((n) => n.cat));
  console.log(
    `分类: domestic=${news.filter((n) => n.cat === 'domestic').length} intl=${news.filter((n) => n.cat === 'international').length} tech=${news.filter((n) => n.cat === 'tech').length} finance=${news.filter((n) => n.cat === 'finance').length}`
  );
  console.log(`important 总数=${impCount}, 覆盖=${[...impCats].join(',')}`);
  console.log(`空摘要条数=${news.filter((n) => !n.summary || !n.summary.trim()).length}`);

  const tmp = path.join(root, 'news.json.tmp');
  fs.writeFileSync(tmp, JSON.stringify(news, null, 2));
  fs.renameSync(tmp, path.join(root, 'news.json'));

  const ts = `${dateStr.replace(/-/g, '')}-${pad(today.getHours())}${pad(today.getMinutes())}${pad(today.getSeconds())}`;
  const vPath = path.join(root, 'version.json');
  const v = JSON.parse(fs.readFileSync(vPath, 'utf8'));
  v.v = ts;
  v.version = ts;
  v.buildTime = today.toISOString();
  fs.writeFileSync(vPath, JSON.stringify(v, null, 2));

  console.log(`✅ 新闻已生成 ${news.length} 条，version=${ts}`);
})().catch((e) => {
  console.error('❌ 生成失败:', e.message);
  process.exit(1);
});
