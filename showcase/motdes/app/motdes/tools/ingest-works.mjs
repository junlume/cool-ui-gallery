/**
 * 把 brand/works/ 里的图转成作品缩略图。
 *
 * 目标规格是照着原站占位图量的：800×450（16:9）。
 * 尺寸不能随便改 —— 砖墙着色器按 uWorks1Aspect / uWorks2Aspect 做适配，
 * 给一张比例不对的图，它会在面板上被拉伸而不是裁切。
 *
 *   node tools/ingest-works.mjs
 */
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = resolve(root, 'brand/works');
const outDir = resolve(root, 'public/cms-media');
// 这台机器的 ffmpeg 没编进 libaom-av1，出不了 AVIF，用 JPEG。
// 800×450 的照片在 q=4 下 20–55KB，和 AVIF 差得不多。
const EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.heic', '.tif', '.tiff']);

if (!existsSync(srcDir)) { console.error(`没有 ${srcDir}`); process.exit(1); }
mkdirSync(outDir, { recursive: true });

const files = readdirSync(srcDir)
  .filter((f) => EXT.has(extname(f).toLowerCase()))
  .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN', { numeric: true }));

if (!files.length) {
  console.log('brand/works/ 里没有图片。把作品图丢进去再跑一次。');
  process.exit(0);
}

files.slice(0, 6).forEach((f, i) => {
  const out = resolve(outDir, `w${i + 1}.jpg`);
  // 先按短边铺满再居中裁 16:9 —— increase + crop 的顺序不能反，
  // 反了就是先裁再放大，边缘会糊。
  execFileSync('ffmpeg', [
    '-v', 'error', '-i', resolve(srcDir, f),
    '-vf', 'scale=800:450:force_original_aspect_ratio=increase,crop=800:450',
    '-frames:v', '1', '-q:v', '4', out, '-y',
  ]);
  console.log(`  w${i + 1}.jpg  ←  ${basename(f)}`);
});

if (files.length > 6) console.log(`\n多出 ${files.length - 6} 张没用上（只有 6 个槽位）。`);
if (files.length < 6) console.log(`\n只换了前 ${files.length} 个槽位。`);
console.log('注意：换了静帧之后，src/pages/index.astro 里对应条目的 video 字段也要一起换，');
console.log('否则环绕的屏幕放的还是旧片子 —— 两者是分开的两份素材。');
console.log('\n标题 / 日期 / 分类在 src/pages/index.astro 顶部的 works 数组里改。');
