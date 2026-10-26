/**
 * 首页的区段分组表 —— 左侧滚动指示器和滚动管理器**共用这一份**。
 *
 * 单独放在 lib 里是因为 index.astro 要在服务端渲染时读它，
 * 而 top-scroll-manager.js 在模块顶层就摸 window，服务端一 import 就炸。
 *
 * label 是露给用户看的字（跟着大标题走）；id / scrollTriggerIds 是内部标识，
 * 改了整套触发器都会断。
 */
import { PROFILE_CHAPTER_STOPS } from './profile-timeline.js';

export const TOP_SCROLL_SECTIONS = [
  { id: 'kv', label: 'TOP', scrollTriggerIds: ['works_intro'], subsections: [{ index: 0 }, { index: 1 }] },
  { id: 'works', label: 'WORKS', scrollTriggerIds: ['works', 'works_outro', 'mission_in'], subsections: [{ index: 0 }, { index: 1 }] },
  { id: 'mission', label: 'ABOUT', scrollTriggerIds: ['mission'], subsections: PROFILE_CHAPTER_STOPS.map((progress, index) => ({ index, progress })) },
  // label 是**露给用户看的字**，和大标题保持一致；
  // id / scrollTriggerIds 是内部标识，改了整套触发器都会断，别动。
  { id: 'vision', label: 'PORTFOLIO', scrollTriggerIds: ['vision', 'vision_out', 'service_in'], subsections: [{ index: 0 }, { index: 1 }] },
  { id: 'service', label: 'SERVICE', scrollTriggerIds: ['service', 'stellla'], subsections: [{ index: 0 }, { index: 1 }] },
];
