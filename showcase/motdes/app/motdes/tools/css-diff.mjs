/**
 * CSS 逐条对比。把 alche.studio 的产物 CSS 与本项目 CSS 按选择器归一后并排，
 * 只报「同名选择器但属性值不同」与「原站有、我没有」。
 *
 * 会自动展开 tokens.css 里的 var()，并把字体族归一成别名 —— 否则每条用了
 * 设计令牌的规则都会被误报成差异，工具就没法用了。
 *
 *   node tools/css-diff.mjs Header__
 *   node tools/css-diff.mjs Works__
 */
import fs from 'node:fs';

const parse = (css) => {
  const rules = new Map();
  let i = 0;
  while (i < css.length) {
    const b = css.indexOf('{', i);
    if (b < 0) break;
    let sel = css.slice(i, b).replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/^}/, '').trim();
    let d = 1;
    let j = b + 1;
    while (j < css.length && d) { if (css[j] === '{') d += 1; else if (css[j] === '}') d -= 1; j += 1; }
    // 规则体里的注释必须先剥掉，否则注释会被并进下一条属性的键名
    const body = css.slice(b + 1, j - 1).replace(/\/\*[\s\S]*?\*\//g, '');
    if (!body.includes('{')) {
      // ::after 与 :after 同义；引号归一，避免同一规则被当成两条
      sel = sel.replace(/\s+/g, ' ').replace(/'/g, '').replace(/::/g, ':');
      const props = {};
      body.split(';').forEach((p) => {
        const c = p.indexOf(':');
        if (c > 0) props[p.slice(0, c).trim()] = p.slice(c + 1).trim().replace(/\s+/g, ' ');
      });
      if (Object.keys(props).length) {
        sel.split(',').forEach((s) => {
          const k = s.trim();
          if (k) rules.set(k, { ...(rules.get(k) || {}), ...props });
        });
      }
    }
    i = j;
  }
  return rules;
};

// tokens.css 的 :root 变量表，用于展开 var()
const tokens = new Map();
// 只取第一次出现的定义 —— 后面的是移动端媒体查询里的覆盖值，
// 拿它去比桌面端样式会得到假阳性
for (const m of fs.readFileSync('src/styles/tokens.css', 'utf8').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
  if (!tokens.has(m[1])) tokens.set(m[1], m[2].trim());
}
const expand = (v) => {
  let out = v;
  for (let g = 0; g < 6 && out.includes('var('); g += 1) {
    out = out.replace(/var\((--[\w-]+)(?:\s*,\s*([^)]*))?\)/g, (whole, n, fb) => tokens.get(n) ?? fb ?? whole);
  }
  return out;
};

// 字体族归一：原站用 Adobe kit 名，我用自托管名，指代同一角色
const FONT_ALIAS = [
  [/google sans code[^;]*/g, 'CODE'],
  [/ibm plex mono[^;]*/g, 'MONO'],
  [/acumin-pro[a-z-]*,\s*sans-serif/g, 'DISPLAY'],
  [/archivo variable[^;]*/g, 'DISPLAY'],
  [/barlow[^;]*/g, 'NUM'],
  [/kozuka-gothic-pr6n[^;]*/g, 'CJK'],
  [/ibm-plex-sans-jp[^;]*/g, 'CJK'],
  [/noto sans sc variable[^;]*/g, 'CJK'],
  [/ibm plex sans variable[^;]*/g, 'CJK'],
];

// #rrggbbaa / #rgba → rgba()，否则同一个颜色的两种写法会被判成差异
const hexAlpha = (x) => x.replace(/#([0-9a-f]{6})([0-9a-f]{2})\b/g, (_, rgb, a) => {
  const n = (i) => parseInt(rgb.slice(i, i + 2), 16);
  return `rgba(${n(0)},${n(2)},${n(4)},${+(parseInt(a, 16) / 255).toFixed(2)})`;
}).replace(/#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])\b/g, (_, r, g, b, a) => {
  const n = (c) => parseInt(c + c, 16);
  return `rgba(${n(r)},${n(g)},${n(b)},${+(parseInt(a + a, 16) / 255).toFixed(2)})`;
});

const norm = (v) => {
  let x = expand(v).replace(/\s+/g, ' ').replace(/["']/g, '').trim().toLowerCase();
  FONT_ALIAS.forEach(([re, to]) => { x = x.replace(re, to); });
  x = hexAlpha(x);
  return x
    .replace(/rgba\(([\d]+),([\d]+),([\d]+),([\d.]+)\)/g, (_, r, g, b, a) => `rgba(${r},${g},${b},${+parseFloat(a).toFixed(2)})`)
    .replace(/#ffffff\b|#fff\b/g, 'white')
    .replace(/#000000\b|#000\b/g, 'black')
    .replace(/rgba\(255,\s*255,\s*255,\s*0?\.5\)/g, 'W50')
    .replace(/(^|[^\d.])0\.(\d)/g, '$1.$2')
    .replace(/\b0(em|px|rem)\b/g, '0')
    .replace(/,\s+/g, ',')
    .replace(/\s*!important/g, '!important');
};

const prefix = process.argv[2] || '';
const orig = parse(
  ['components.css', 'top-raw.css', 'inline.css'].map((f) => fs.readFileSync(`.ref/${f}`, 'utf8')).join('\n'),
);
const mine = parse(
  ['global', 'chrome', 'sections', 'tokens'].map((f) => fs.readFileSync(`src/styles/${f}.css`, 'utf8')).join('\n'),
);

// 同一条属性可能写在更宽泛的选择器上（例如 a{text-decoration:none} 覆盖了所有链接）
const globalProps = parse(fs.readFileSync('src/styles/global.css', 'utf8'));
const inheritedHas = (prop, value) => {
  for (const [, props] of globalProps) if (props[prop] !== undefined && norm(props[prop]) === norm(value)) return true;
  return false;
};

let missing = 0; let differ = 0; let ok = 0;
for (const [sel, props] of orig) {
  if (!sel.includes(prefix)) continue;
  const m = mine.get(sel);
  if (!m) { console.log(`\x1b[33m缺失\x1b[0m  ${sel}`); missing += 1; continue; }
  const diffs = [];
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('-webkit') || k === 'appearance') continue;
    const mv = m[k];
    if (mv === undefined) {
      if (!inheritedHas(k, v)) diffs.push(`    − ${k}: ${v}   \x1b[90m(我这边没有)\x1b[0m`);
    } else if (norm(mv) !== norm(v)) {
      diffs.push(`    ≠ ${k}\n        原站 ${expand(v)}\n        我的 ${expand(mv)}`);
    }
  }
  if (diffs.length) { console.log(`\x1b[31m差异\x1b[0m  ${sel}`); diffs.forEach((d) => console.log(d)); differ += 1; } else ok += 1;
}
console.log(`\n一致 ${ok} · 有差异 ${differ} · 完全缺失 ${missing}`);
