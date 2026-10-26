/** 原站只有两个断点：769（SP/PC）与 950（XL）。不要引入第三个。 */
export const SP_BREAKPOINT = 769;
export const XL_BREAKPOINT = 950;
export const PC_MEDIA_QUERY = `(min-width: ${SP_BREAKPOINT}px)`;

class DeviceManager {
  #spQuery = window.matchMedia(`not screen and (min-width: ${SP_BREAKPOINT}px)`);

  get isSPLayout() {
    return this.#spQuery.matches;
  }

  get isMobile() {
    const ua = navigator.userAgent;
    return (
      ua.includes('iPhone') ||
      ua.includes('iPad') ||
      ua.includes('Android') ||
      navigator.platform === 'iPad' ||
      (navigator.platform === 'MacIntel' &&
        ua.includes('Safari') &&
        !ua.includes('Chrome') &&
        navigator.standalone !== undefined)
    );
  }

  onChange(fn) {
    this.#spQuery.addEventListener('change', fn);
    return () => this.#spQuery.removeEventListener('change', fn);
  }
}

export const deviceManager = new DeviceManager();
