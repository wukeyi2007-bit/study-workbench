// 每日新闻自动生成（RSS 聚合版，零配置、免费、无需任何 API key）
// 主源：Google News 中文 RSS（按主题分类，海外节点稳定，通常带摘要）
// 兜底：国内/国际用新浪/人民网 RSS；科技用 IT之家/36氪/虎嗅；财经用新浪财经/36氪/人民网
// 最后兜底：百度热搜（实时），但「绝不输出空摘要」——缺失摘要时合成一条诚实的占位说明
// 用法：node scripts/gen-news.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const today = new Date();
const pad = (n) => String(n).padStart(2, '0');
const dateStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

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

    const desc = clean(getTag(b, 'description') || getTag(b, 'summary') || getTag(b, 'content:encoded') || '');
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
  // 1) 主源 Google News 中文（带一次重试）
  const topic = GOOGLE[cat];
  const gurl = `https://news.google.com/rss/headlines/section/topic/${topic}?hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;
  try {
    const xml = await fetchTextRetry(gurl, 12000, 1);
    const items = parseRss(xml, 'Google新闻');
    if (items.length >= 3) {
      console.log(`  ✓ Google News ${cat} 抓到 ${items.length} 条`);
      const seen = new Set();
      return items.filter((it) => {
        if (seen.has(it.title)) return false;
        seen.add(it.title);
        return true;
      });
    }
    console.warn(`  ⚠ Google News ${cat} 条数过少，转兜底`);
  } catch (e) {
    console.warn(`  ⚠ Google News ${cat} 失败: ${e.message}，转兜底`);
  }
  // 2) RSS 兜底（有摘要、有过滤）
  const rssItems = await collectFallback(cat);
  if (rssItems.length >= TARGETS[cat]) {
    return rssItems.slice(0, TARGETS[cat]);
  }
  // 3) 国内/国际最后兜底百度热搜（实时，且已保证非空摘要）
  if (cat === 'domestic' || cat === 'international') {
    try {
      const all = await fetchBaiduHot();
      const start = cat === 'domestic' ? 0 : 6;
      const picked = all.slice(start, start + TARGETS[cat]);
      console.log(`    ✓ 百度热搜 ${cat} 取 ${picked.length} 条`);
      return picked;
    } catch (e) {
      console.warn(`    ✗ 百度热搜 ${cat} 失败: ${e.message}`);
    }
  }
  return rssItems;
}

// 保证摘要非空：缺失时合成诚实占位，绝不写出空 summary
function safeSummary(it) {
  const s = (it.desc || '').trim();
  if (s) return s.slice(0, 140);
  return `【${it.source}】${it.title}`;
}

(async () => {
  console.log(`生成 ${dateStr} 新闻...`);
  const news = [];
  for (const cat of ['domestic', 'international', 'tech', 'finance']) {
    const items = (await collectFor(cat)).slice(0, TARGETS[cat]);
    items.forEach((it, i) => {
      news.push({
        id: `${cat[0]}${pad(news.length + 1)}`,
        cat,
        important: (cat === 'domestic' && i < 2) || (cat !== 'domestic' && i === 0),
        title: it.title,
        summary: safeSummary(it),
        source: it.source,
        date: dateStr,
      });
    });
  }

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
