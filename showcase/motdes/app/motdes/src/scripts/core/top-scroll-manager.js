import { EventEmitter } from './event-emitter.js';
import { TOP_SCROLL_SECTIONS } from '../../lib/top-sections.js';
import { deviceManager } from './device-manager.js';
import { ScrollTriggerFactory } from './scroll-trigger-factory.js';
import { SNAP_DEFAULTS, missionVisionSnapArray, worksSnapStep } from './snap.js';
import { serviceCaseStops } from '../../lib/service-presentation.js';
import { lerper } from './lerper.js';

/**
 * 首页滚动编排。区段位置参考原站；WORKS 使用较轻的双向吸附，
 * SERVICE 则独立控制每次手势的案例切换。
 *
 * 区段顺序与 body[data-current_section] 的取值域：
 *   kv → works_intro → works → works_outro → mission_in → mission
 *      → mission_out → vision → vision_out → service_in → service → stellla
 */
export const SECTION_NAMES = [
  'kv',
  'works_intro',
  'works',
  'works_outro',
  'mission_in',
  'mission',
  'mission_out',
  'vision',
  'vision_out',
  'service_in',
  'service',
  'stellla',
];


/** 带 sp 覆写的配置：SP 布局下用 sp 里的字段覆盖同名项。 */
class SectionConfig {
  constructor(name, element, config) {
    this.name = name;
    this.element = element;
    this.config = config;
  }

  resolve() {
    const { triggerId, pathname, trigger, sp, ...rest } = this.config;
    const base = { triggerId, pathname, trigger, ...rest };
    if (!deviceManager.isSPLayout || !sp) return base;
    for (const [k, v] of Object.entries(sp)) {
      if (v === undefined) delete base[k];
      else base[k] = v;
    }
    return base;
  }
}

export class TopScrollManager extends EventEmitter {
  #sections = new Map();
  #configs = new Map();
  #currentSection = null;
  #profileMotionQuery = null;

  constructor() {
    super();
    ScrollTriggerFactory.setActivePage('/');
  }

  registerSection(name, element, config) {
    if (!element) {
      console.warn(`TopScrollManager: element for "${name}" not found`);
      return null;
    }
    this.#sections.get(name)?.scrollTrigger.kill();

    let resolved = config;
    if (config.sp) {
      const sc = new SectionConfig(name, element, config);
      this.#configs.set(name, sc);
      resolved = sc.resolve();
    }
    const scrollTrigger = ScrollTriggerFactory.create(resolved);
    const entry = { name, element, scrollTrigger };
    this.#sections.set(name, entry);
    return entry;
  }

  createTriggers() {
    const q = (sel) => document.querySelector(sel);
    const enter = (name) => () => this.#onSectionEnter(name, 'enter');
    const enterBack = (name) => () => this.#onSectionEnter(name, 'enterBack');

    // ---- KV ----
    const kv = q('[data-top_section="kv"]');
    if (document.body.dataset.coinOpening !== 'true') this.registerSection('kv', kv, {
      triggerId: 'top_kv', pathname: '/', trigger: kv,
      start: 'top bottom', end: 'bottom bottom-=100px',
      onEnter: enter('kv'), onEnterBack: enterBack('kv'),
    });

    // ---- WORKS INTRO ----
    const worksIntro = q('[data-top_section="works_intro"]');
    if (document.body.dataset.coinOpening !== 'true') this.registerSection('works_intro', worksIntro, {
      triggerId: 'top_works_intro', pathname: '/', trigger: worksIntro,
      start: 'top bottom', end: 'bottom bottom',
      onEnter: enter('works_intro'), onEnterBack: enterBack('works_intro'),
    });

    // ---- WORKS（吸附 + 进度 + 每件作品各一个触发器）----
    const works = q('[data-top_section="works"]');
    const workItems = works.querySelectorAll('[data-top_works_item]');
    const workSnapStep = worksSnapStep(workItems.length);

    this.registerSection('works', works, {
      triggerId: 'top_works', pathname: '/', trigger: works,
      start: 'top top', end: 'bottom bottom',
      // 只在靠近中心时轻吸附；取消惯性预测，回拉不会仍被推向下一件。
      snap: {
        snapTo: { increment: workSnapStep, radius: workSnapStep * 0.2 },
        directional: false,
        inertia: false,
        delay: 0.32,
        duration: { min: 0.18, max: 0.4 },
        ease: 'power2.out',
      },
    });
    this.registerSection('works_event', works, {
      triggerId: 'top_works_event', pathname: '/', trigger: works,
      start: 'top bottom', end: 'bottom bottom',
      onEnter: enter('works'), onEnterBack: enterBack('works'),
    });
    this.registerSection('works_progress', works, {
      triggerId: 'top_works_progress', pathname: '/', trigger: works,
      start: 'top bottom', end: 'bottom top',
      onUpdate: (st) => this.emit('works/progress', st.progress),
    });
    workItems.forEach((item, i) => {
      this.registerSection(`works_item_${i}`, item, {
        triggerId: `top_works_item_${i}`, pathname: '/', trigger: item,
        start: 'top center', end: 'bottom center',
        onEnter: () => this.emit('works/item_enter', i),
        onEnterBack: () => this.emit('works/item_enter', i),
        onLeave: () => this.emit('works/item_leave', i),
        onLeaveBack: () => this.emit('works/item_leave', i),
      });
    });

    // ---- WORKS OUTRO ----
    const worksOutro = q('[data-top_section="works_outro"]');
    this.registerSection('works_outro', worksOutro, {
      triggerId: 'top_works_outro', pathname: '/', trigger: worksOutro,
      start: 'top bottom', end: 'bottom bottom',
      onEnter: enter('works_outro'), onEnterBack: enterBack('works_outro'),
    });

    // ---- MISSION ----
    const missionIn = q('[data-top_section="mission_in"]');
    this.registerSection('mission_in', missionIn, {
      triggerId: 'top_mission_in', pathname: '/', trigger: missionIn,
      start: 'top bottom', end: 'top top',
      onEnter: enter('mission_in'), onEnterBack: enterBack('mission_in'),
      onUpdate: (st) => this.emit('mission_in/progress', st.progress),
    });

    const mission = q('[data-top_section="mission"]');
    this.registerSection('mission', mission, {
      triggerId: 'top_mission', pathname: '/', trigger: mission,
      start: 'top bottom', end: 'bottom bottom',
      onEnter: enter('mission'), onEnterBack: enterBack('mission'),
    });
    if (mission.querySelector('[data-profile-story]')) this.registerSection('profile_progress', mission, {
      triggerId: 'top_profile_progress', pathname: '/', trigger: mission,
      start: 'top bottom', end: 'bottom bottom',
    });

    // ---- VISION ----
    const vision = q('[data-top_section="vision"]');
    this.registerSection('vision', vision, {
      triggerId: 'top_vision', pathname: '/', trigger: vision,
      start: 'top bottom', end: 'top top',
      onEnter: enter('vision'), onEnterBack: enterBack('vision'),
      sp: { start: 'top bottom', end: 'top 70%' },
    });

    const visionOut = q('[data-top_section="vision_out"]');
    this.registerSection('vision_out', visionOut, {
      triggerId: 'top_vision_out', pathname: '/', trigger: visionOut,
      start: 'top bottom', end: 'top top',
      onEnter: enter('vision_out'), onEnterBack: enterBack('vision_out'),
      sp: { start: 'top bottom-=50%', end: 'top top' },
    });

    // ---- works_outro → vision 的整体吸附（SP 下关闭）----
    document.querySelectorAll('[data-snapper]').forEach((wrapper) => {
      // A reading sequence must hold wherever the visitor stops, including between chapters.
      if (wrapper.hasAttribute('data-profile-sequence')) return;
      this.registerSection('mission_vision_snapper', wrapper, {
        triggerId: 'top_mission_vision_snapper', pathname: '/', trigger: wrapper,
        start: 'top top', end: 'bottom bottom',
        snap: { snapTo: missionVisionSnapArray(wrapper), ...SNAP_DEFAULTS },
        sp: { start: 'top top', end: 'bottom bottom', snap: undefined },
      });
    });

    // ---- vision_out + service_in 的两端吸附 ----
    const visionServiceWrap = q('[data-section_wrap="vision_service"]');
    const snapBeforeService = (progress) => {
      const firstCase = serviceCaseStops(this.getTrigger('service_progress'))[0];
      // The first GL case is centered just before service's DOM top. Once it is
      // reached, the preceding section must not pull the pager off that exact stop.
      if (Number.isFinite(firstCase) && window.scrollY >= firstCase - 4) return progress;
      return deviceManager.isSPLayout ? 1 : (progress < 0.5 ? 0 : 1);
    };
    this.registerSection('vision_service_wrap', visionServiceWrap, {
      triggerId: 'top_vision_service_wrap', pathname: '/', trigger: visionServiceWrap,
      start: 'top bottom', end: 'bottom top',
      snap: { snapTo: snapBeforeService, ...SNAP_DEFAULTS, inertia: false },
      sp: { start: 'top 30%', end: 'bottom top', snap: { snapTo: snapBeforeService, ...SNAP_DEFAULTS, inertia: false } },
    });

    // ---- SERVICE ----
    const serviceIn = q('[data-top_section="service_in"]');
    this.registerSection('service_in', serviceIn, {
      triggerId: 'top_service_in', pathname: '/', trigger: serviceIn,
      start: 'top bottom+=150%', end: 'top center',
      onEnter: enter('service_in'), onEnterBack: enterBack('service_in'),
    });

    const service = q('[data-top_section="service"]');
    const serviceItems = service.querySelectorAll('[data-service_scroll_item]');

    // SERVICE paging uses measured GL case stops and one input gesture per case.
    // A second inertial GSAP snap would compete with that Lenis transition.
    this.registerSection('service', service, {
      triggerId: 'top_service', pathname: '/', trigger: service,
      start: 'top top', end: 'bottom bottom',
    });
    this.registerSection('service_progress', service, {
      triggerId: 'top_service_progress', pathname: '/', trigger: service,
      start: 'top bottom', end: 'bottom top',
    });
    serviceItems.forEach((item, i) => {
      const name = item.getAttribute('data-service_scroll_item') || `service_${i}`;
      this.registerSection(`service_scroll_item_${i}`, item, {
        triggerId: `top_service_scroll_item_${i}`, pathname: '/', trigger: item,
        start: 'top bottom', end: 'bottom bottom',
        onEnter: () => { this.emit('service/item_enter', i); this.#onSectionEnter(name, 'enter'); },
        onEnterBack: () => { this.emit('service/item_enter', i); this.#onSectionEnter(name, 'enterBack'); },
        onLeave: () => this.emit('service/item_leave', i),
        onLeaveBack: () => this.emit('service/item_leave', i),
      });
    });

    // ---- stellla ----
    const stelllaIn = q('[data-service_scroll_item="stellla"]');
    this.registerSection('stellla_in', stelllaIn, {
      triggerId: 'top_stellla_in', pathname: '/', trigger: stelllaIn,
      start: 'top bottom', end: 'bottom bottom',
    });

    const stellla = q('[data-top_section="stellla"]');
    this.registerSection('stellla', stellla, {
      triggerId: 'top_stellla', pathname: '/', trigger: stellla,
      start: 'top bottom', end: 'bottom bottom',
      snap: { snapTo: [0.9], ...SNAP_DEFAULTS },
      onEnterBack: enterBack('stellla'),
      onLeave: () => this.#onSectionEnter('footer', 'enter'),
    });
  }

  in() {
    this.createTriggers();
    requestAnimationFrame(() => {
      this.checkCurrentSection();
      this.emit('scroll_triggers_initialized');
    });
  }

  out() {
    lerper.remove('profile_story_progress');
    this.#profileMotionQuery = null;
    ScrollTriggerFactory.killAll();
    this.#sections.clear();
    this.#configs.clear();
    this.#currentSection = null;
    document.body.removeAttribute('data-current_section');
  }

  /** 首屏或换页后同步一次当前区段，避免 body 属性缺失。 */
  checkCurrentSection() {
    this.#sections.forEach((entry, name) => {
      if (!entry.scrollTrigger.isActive) return;
      if (SECTION_NAMES.includes(name)) this.#onSectionEnter(name, 'enter');
      if (name.startsWith('works_item_')) {
        this.emit('works/item_enter', parseInt(name.replace('works_item_', ''), 10));
      } else if (name.startsWith('service_scroll_item_')) {
        this.emit('service/item_enter', parseInt(name.replace('service_scroll_item_', ''), 10));
      }
    });
  }

  #onSectionEnter(name, direction) {
    this.emit('section/enter', { sectionName: name, direction });
    if (this.#currentSection === name) return;
    this.#currentSection = name;
    // 这一个属性是全站的总线：header 翻色、指示器高亮、音效触发都读它
    document.body.setAttribute('data-current_section', name);
    this.emit('section/change', { sectionName: name, direction });
  }

  getTrigger(name) {
    return this.#sections.get(name)?.scrollTrigger ?? null;
  }

  /** One damped reading progress keeps the copy, films and closed M in sync. */
  getProfileProgress() {
    const trigger = this.getTrigger('profile_progress');
    const target = Math.max(0, Math.min(1, trigger?.progress ?? 0));
    this.#profileMotionQuery ??= window.matchMedia('(prefers-reduced-motion: reduce)');
    const current = lerper.set('profile_story_progress', target, 0.7);
    const state = lerper.get('profile_story_progress');
    // Do not carry an unfinished reading frame into the next section or page.
    if (!trigger?.isActive || target === 0 || target === 1 || this.#profileMotionQuery.matches
      || Math.abs(current - target) < 0.00001) {
      state.current = target;
      state.velocity = 0;
    }
    return state.current;
  }

  get currentSection() {
    return this.#currentSection;
  }
}

export const topScrollManager = new TopScrollManager();
