/**
 * 搜索匹配逻辑。
 * 与 Android 端 `editor/SearchMatch.kt` 保持同一套打分顺序，
 * 额外支持拼音全拼 / 首字母，以及 2 个字符以内的错别字容错。
 */
import { CARD_CONTENTS } from './data.js';

export function findBestMatch(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return null;

  let best = null;
  CARD_CONTENTS.forEach((content, index) => {
    const score = scoreMatch(q, content);
    if (score > 0 && (best === null || score > best.score)) {
      best = { index, score };
    }
  });
  return best;
}

function scoreMatch(q, c) {
  const title = c.title.toLowerCase();
  const sub = c.subtitle.toLowerCase();
  const tag = c.tag.toLowerCase();
  const pFull = c.pinyinFull.toLowerCase();
  const pAbbr = c.pinyinAbbr.toLowerCase();

  if (title === q) return 1000;
  if (pFull === q) return 950;
  if (pAbbr === q) return 900;

  if (title.startsWith(q)) return 800;
  if (pFull.startsWith(q)) return 750;
  if (pAbbr.startsWith(q)) return 700;
  if (sub.startsWith(q)) return 650;
  if (tag.startsWith(q)) return 600;

  if (title.includes(q)) return 550;
  if (sub.includes(q)) return 450;
  if (tag.includes(q)) return 400;
  if (pFull.includes(q)) return 380;
  if (pAbbr.includes(q)) return 350;

  if (q.length >= 2) {
    const dTitle = editDistance(q, title);
    if (dTitle <= 2) return 250 - dTitle * 40;
    const dFull = editDistance(q, pFull);
    if (dFull <= 2) return 200 - dFull * 40;
  }
  return 0;
}

/** Levenshtein 距离，用于错别字容错。 */
function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;

  for (let i = 1; i <= m; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    const swap = prev;
    prev = cur;
    cur = swap;
  }
  return prev[n];
}
