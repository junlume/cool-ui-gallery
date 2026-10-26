/**
 * 侧边菜单（SP 布局的汉堡菜单）。
 *
 * 开合完全由两个 data-open 属性驱动，动画写在 CSS 里 —— 控制器不碰任何样式值。
 * 关闭途径三条：再点汉堡、点背景遮罩、按 Esc；点任意菜单链接也会关。
 */
const MENU_PAGE_ORDER = ['top', 'news', 'works', 'about', 'stellla', 'contact'];

export class SideMenuController {
  #hamburger = null;
  #sideMenu = null;
  #backdrop = null;
  #links = null;
  #items = null;
  #isOpen = false;
  #onKeyDown = null;

  in() {
    this.out();

    this.#hamburger = document.querySelector('[data-hamburger]');
    this.#sideMenu = document.querySelector('[data-side-menu]');
    if (!this.#hamburger || !this.#sideMenu) return;

    this.#backdrop = this.#sideMenu.querySelector('[data-backdrop]');
    this.#links = this.#sideMenu.querySelectorAll('a');
    this.#items = this.#sideMenu.querySelectorAll('[class*="menu_item"]');

    this.#hamburger.addEventListener('click', this.#toggle);
    this.#backdrop?.addEventListener('click', this.#close);
    this.#links.forEach((a) => a.addEventListener('click', this.#onLinkClick));

    this.#onKeyDown = (e) => {
      if (e.key === 'Escape' && this.#isOpen) this.#close();
    };
    document.addEventListener('keydown', this.#onKeyDown);

    this.updateActiveMenuItem();
  }

  out() {
    this.#hamburger?.removeEventListener('click', this.#toggle);
    this.#backdrop?.removeEventListener('click', this.#close);
    this.#links?.forEach((a) => a.removeEventListener('click', this.#onLinkClick));
    if (this.#onKeyDown) document.removeEventListener('keydown', this.#onKeyDown);
    this.#onKeyDown = null;
    this.#hamburger = null;
    this.#sideMenu = null;
    this.#backdrop = null;
    this.#links = null;
    this.#items = null;
    this.#isOpen = false;
  }

  #toggle = () => (this.#isOpen ? this.#close() : this.#open());

  #onLinkClick = () => {
    if (this.#isOpen) this.#close();
  };

  #open = () => {
    if (!this.#hamburger || !this.#sideMenu) return;
    this.#isOpen = true;
    this.#hamburger.setAttribute('data-open', 'true');
    this.#sideMenu.setAttribute('data-open', 'true');
    document.body.style.overflow = 'hidden';
  };

  #close = () => {
    if (!this.#hamburger || !this.#sideMenu) return;
    this.#isOpen = false;
    this.#hamburger.removeAttribute('data-open');
    this.#sideMenu.removeAttribute('data-open');
    document.body.style.overflow = '';
  };

  /** 菜单项顺序固定，用位置对应页面名，而不是解析 href。 */
  updateActiveMenuItem() {
    if (!this.#items) return;
    const page = document.body.getAttribute('data-page') || '';
    this.#items.forEach((item, i) => {
      const name = MENU_PAGE_ORDER[i];
      if (!name) return;
      item.setAttribute('data-active', String(this.#isActive(name, page)));
    });
  }

  #isActive(name, page) {
    return Boolean(
      name === page
      || (name === 'news' && page === 'news-detail')
      || (name === 'works' && (page === 'works-detail' || page.startsWith('works'))),
    );
  }

  get isOpen() {
    return this.#isOpen;
  }
}

export const sideMenuController = new SideMenuController();
