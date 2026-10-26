import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

import { lerper } from './core/lerper.js';
import { topScrollManager } from './core/top-scroll-manager.js';
import { topScrollIndicator } from './controllers/scroll-indicator.js';
import { visionMissionController } from './controllers/mission-vision.js';
import { worksItemController } from './controllers/works-item.js';
import { serviceItemController } from './controllers/service-item.js';
import { servicePagerController } from './controllers/service-pager.js';
import { stelllaSectionController } from './controllers/stellla-section.js';
import { worksOutroController } from './controllers/works-outro.js';
import { scrambleController } from './controllers/scramble.js';
import { sideMenuController } from './controllers/side-menu.js';
import { loadingController } from './controllers/loading.js';
import { coinOpeningController } from './controllers/coin-opening.js';
import { siteSoundtrackController } from './controllers/site-soundtrack.js';
import { videoModalController } from './controllers/video-modal.js';
import { soundIntroController } from './controllers/sound-intro.js';
import { outroController } from './controllers/outro.js';
import { soundManager, bindSectionSounds } from './core/sound-manager.js';
import { soundToggleController } from './controllers/sound-toggle.js';
import { gl } from './gl/index.js';

gsap.registerPlugin(ScrollTrigger);

/**
 * 原站是 `new Lenis({})` —— 默认参数（lerp 0.1 / duration 1.2 / wheelMultiplier 1）。
 * 不要"优化"这些值，滚动手感的基准就在这里。
 */
export const lenis = new Lenis({});
window.__lenis = lenis; // 指示器与调试用

// Lenis 驱动 ScrollTrigger：关掉 GSAP 自己的 rAF，统一由 mainLoop 推进
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.lagSmoothing(0);

let rafId = 0;
let running = false;

function mainLoop(time) {
  lenis.raf(time);
  lerper.update(time);
  // lerper 先推进，再让吃阻尼值的控制器读 —— 顺序反了会差一帧
  visionMissionController.update();
  topScrollIndicator.update();
  coinOpeningController.update();
  gl.update();
  loadingController.update(1 / 60);
  rafId = requestAnimationFrame(mainLoop);
}

function startMainLoop() {
  if (running) return;
  running = true;
  rafId = requestAnimationFrame(mainLoop);
}

function stopMainLoop() {
  if (!running) return;
  running = false;
  cancelAnimationFrame(rafId);
}

// 原站的 visibilitychange 行为：隐藏时停掉整个循环
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopMainLoop();
  else startMainLoop();
});

/**
 * 开场时序，与原站一致：
 *
 *   1. 立刻显示 loading 层并开始画构造线
 *   2. 进度前半段 0 → 0.5：DOM 控制器就位、字体落地
 *   3. 进度后半段 0.5 → 1：着色器预编译（玻璃那几个编译要几百毫秒，
 *      不先编完，首次出现字标会卡一下）
 *   4. 等构造线与字标描边都走完 → 0.8s 淡出 loading
 *   5. 这之后才弹首访声音确认条 —— 不能更早，loading 层压在它上面
 *   6. 再 500ms 后初始化 outro
 */
async function boot() {
  if (document.body.dataset.page !== 'top') return;

  if (document.body.dataset.coinOpening === 'true') {
    await bootCoinOpening();
    return;
  }

  loadingController.init();
  loadingController.show();
  soundIntroController.init((soundOn) => {
    soundManager.init();                 // 用户交互之后才建音频上下文
    soundManager.setMute(!soundOn);
    if (soundOn) soundManager.startBGM();
    document.querySelector('[data-sound-toggle]')?.setAttribute('data-muted', String(!soundOn));
  });

  gl.init(document.getElementById('gl-canvas'));
  topScrollManager.on('section/change', ({ sectionName }) => gl.changeTopSection(sectionName));
  bindSectionSounds(topScrollManager);

  topScrollManager.in();
  gl.in(lenis);
  topScrollIndicator.in();
  visionMissionController.in();
  worksItemController.in();
  serviceItemController.in();
  servicePagerController.in(lenis);
  stelllaSectionController.in();
  worksOutroController.in();
  scrambleController.in();
  sideMenuController.in();
  soundToggleController.in();
  videoModalController.in(lenis);
  loadingController.setProgress(0.3);

  try {
    await document.fonts?.ready;
  } catch { /* 字体加载失败不该卡住开场 */ }
  loadingController.setProgress(0.5);

  await gl.precompile((p) => loadingController.setProgress(0.5 + p * 0.5));
  loadingController.setProgress(1);

  await loadingController.waitForComplete();

  // 顺序要紧：先让 GL 起擦除（3 秒），再让 DOM 那层用 0.8 秒淡出。
  // 两层画的是同一张图纸，所以交接看不出接缝 —— DOM 淡到一半时，
  // GL 里那个从中心长开的圆已经露出一小块场景，观感是连贯的一次推进。
  gl.onLoadingComplete();
  await loadingController.hide(lenis);

  document.body.setAttribute('data-gl_loading_end', 'true');
  soundIntroController.show();
  // 原站在 loading 收场后 500ms 才初始化 outro —— 那时 ScrollTrigger 的
  // 布局已经稳定，触发点算得准
  setTimeout(() => outroController.init(), 500);
  remeasure();
}

async function bootCoinOpening() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  document.body.dataset.gl_loading_end = 'false';
  coinOpeningController.init({
    gl,
    lenis,
    onReveal: () => {
      siteSoundtrackController.releaseOpening();
      // 浏览器可能在加载视频期间恢复刷新前的位置；甩手交接始终落在第一件。
      lenis.scrollTo(0, { immediate: true, force: true });
      window.scrollTo(0, 0);
      ScrollTrigger.update();
      topScrollManager.checkCurrentSection();
      worksItemController.reveal(0);
      gl.changeTopSection('works');
    },
  });

  siteSoundtrackController.init();

  gl.init(document.getElementById('gl-canvas'));
  topScrollManager.on('section/change', ({ sectionName }) => gl.changeTopSection(sectionName));
  topScrollManager.in();
  gl.in(lenis);
  topScrollIndicator.in();
  visionMissionController.in();
  serviceItemController.in();
  servicePagerController.in(lenis);
  stelllaSectionController.in();
  worksOutroController.in();
  scrambleController.in();
  sideMenuController.in();
  soundToggleController.in();
  videoModalController.in(lenis);
  gl.completeLoadingImmediately();

  const resourcesReady = (async () => {
    try { await document.fonts?.ready; } catch { /* 使用字体回退 */ }
    // 拆字、页底 SVG 和触发器测量都在硬币加载期间完成。
    // 提前测量触发的 item_enter 暂不播放，甩手时才放出首件文字。
    worksItemController.in({ deferEnter: true });
    outroController.init();
    await Promise.all([gl.precompile(), gl.prepareCoinWorks()]);
    remeasure();
    lenis.scrollTo(0, { immediate: true, force: true });
    ScrollTrigger.update();
  })();
  await coinOpeningController.run(resourcesReady);
}



/**
 * 开发期验证钩子。无头/隐藏面板下 requestAnimationFrame 不触发，
 * 主循环一帧都不会跑，所有吃阻尼值的动效都会冻在初值。
 * __tick(n) 手动泵 n 帧，让状态收敛后再核对。
 */
if (import.meta.env.DEV) {
  window.__tick = (n = 90, step = 16.7) => {
    let t = performance.now();
    for (let i = 0; i < n; i += 1) {
      t += step;
      ScrollTrigger.update();      // 触发器进度
      gsap.ticker.tick();          // service / stellla 挂在 gsap.ticker 上
      lerper.update(t);            // 阻尼器
      visionMissionController.update();
      topScrollIndicator.update();
      coinOpeningController.update();
      gl.update(step / 1000);      // WebGL：喂合成 dt，否则 Clock 恒返回 0
      loadingController.update(step / 1000);
    }
    return { frames: n, ms: Math.round(n * step) };
  };

  /**
   * 手动 tick 不会推进 GSAP 自己的时钟（它按真实经过时间算），
   * 所以补间只会原地爬。__settle() 直接把在跑的补间推到终点。
   */
  window.__settle = (n = 40) => {
    window.__tick(n);
    gsap.globalTimeline.getChildren(true, true, true).forEach((t) => {
      try { t.progress(1); } catch { /* 已被 kill 的补间忽略 */ }
    });
  };
  // 滚动触发器与阻尼器 —— 排查"某个 uniform 为什么是 0"时几乎每次都要看这两个
  window.__topScroll = topScrollManager;
  window.__lerper = lerper;
  window.__gsap = gsap;
  window.__gl = gl;
  window.__loading = loadingController;
}

startMainLoop();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

// Swup 换页后重建触发器
document.addEventListener('swup:page:view', () => {
  siteSoundtrackController.dispose();
  servicePagerController.out();
  videoModalController.out();
  coinOpeningController.dispose();
  topScrollManager.out();
  gl.out();
  topScrollIndicator.out();
  visionMissionController.out();
  worksItemController.out();
  serviceItemController.out();
  stelllaSectionController.out();
  worksOutroController.out();
  scrambleController.out();
  sideMenuController.out();
  soundToggleController.out();
  outroController.dispose();
  boot();
});

/**
 * Lenis 在构造时就缓存了文档高度。字体与首屏图片落地后文档会变高，
 * 不重新量尺寸的话 lenis.limit 会停在旧值，页面滚不到底。
 */
function remeasure() {
  lenis.resize();
  ScrollTrigger.refresh();
}

window.addEventListener('resize', () => gl.resize());
window.addEventListener('resize', remeasure);
window.addEventListener('load', remeasure);
document.fonts?.ready.then(remeasure);

// 首屏图片是异步的，用 ResizeObserver 兜住文档高度的后续变化
const ro = new ResizeObserver(() => remeasure());
ro.observe(document.documentElement);
