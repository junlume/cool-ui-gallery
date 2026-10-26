export const PROFILE_CHAPTER_COUNT = 4;
export const PROFILE_CHAPTER_STOPS = [0.064, 0.208 / 1.5, 0.32 / 1.5, 0.288];
export const PROFILE_CASE_STOPS = [0.46, 0.57, 0.68, 0.79];
const CASE_EXIT_START = 0.797;
// About 70 percent of the growth travel is in the remaining Profile runway.
// Both sections sample one easing curve so the handoff never restarts growth.
const LOGO_GROWTH_HANDOFF = 0.7;
const caseSwapStarts = PROFILE_CASE_STOPS.slice(1).map((stop, index) => (PROFILE_CASE_STOPS[index] + stop) / 2 - 0.03);
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const smooth = (a, b, value) => { const t = clamp01((value - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Wide, shallow windows need extra room for the case copy's wrapped lines. */
export function profileSpaciousTrack(width, height) {
  return width <= 768 || height <= 500 || (width >= 1600 && height <= 780);
}

/** The left card holds while four right-hand entries travel past the midpoint. */
export function profileProcessFrame(progress) {
  const p = clamp01(progress * 1.5);
  return {
    opacity: smooth(0.014, 0.055, p) * (1 - smooth(0.55, 0.615, p)),
    reveal: smooth(0.014, 0.055, p),
    y: (1 - smooth(0.014, 0.055, p)) * 6 - smooth(0.55, 0.615, p) * 6,
    copyReveal: smooth(0.044, 0.1, p),
    locationReveal: smooth(0.066, 0.118, p),
  };
}
/** Two masked lines rise in sequence, entirely controlled by the same scroll. */
export function profileIntroLineFrame(progress, index = 0) {
  const p = clamp01(progress * 1.5);
  const reveal = smooth(0.012 + index * 0.014, 0.068 + index * 0.016, p);
  return { reveal, opacity: 0.18 + 0.82 * reveal, y: (1 - reveal) * 95 };
}
export function profileChapterFrame(progress, index, mobile = false) {
  const p = clamp01(progress * 1.5);
  const pitch = mobile ? 0.40 : 0.28;
  const y = (mobile ? 0.51 : 0.54) + index * pitch - (p - 0.04) * (pitch / 0.112);
  const headingReveal = smooth(0.88, 0.58, y);
  const labelReveal = smooth(0.82, 0.52, y);
  const bodyReveal = [smooth(0.64, 0.4, y), smooth(0.60, 0.4, y)];
  const past = smooth(0.1, -0.22, y);
  return {
    y: y * 100, opacity: profileProcessFrame(progress).opacity * (1 - past),
    reveal: headingReveal, headingReveal, labelReveal, bodyReveal,
  };
}
/** A fixed film stage changes content while the same two roles exchange sides. */
export function profileCaseFrame(progress, index = 0) {
  const p = clamp01(progress);
  // Finish the Process copy before the film and title approach their anchors.
  const enter = smooth(0.414, 0.460, p);
  const envelope = enter * (1 - smooth(0.817, 0.839, p));
  const swaps = caseSwapStarts.map((start) => clamp01((p - start) / 0.06));
  const fades = swaps.map((swap) => smooth(0.32, 0.68, swap));
  const incoming = index === 0 ? 1 : (fades[index - 1] ?? 0);
  const outgoing = fades[index] ?? 0;
  // Keep the old opaque film under the incoming film until it fully covers it.
  // Two half-transparent films would expose the background during a crossfade.
  const layer = outgoing < 1 ? incoming : 0;
  const caption = (t) => 1 - smooth(0, 0.22, t) + smooth(0.78, 1, t);
  const weight = envelope * incoming * (1 - outgoing);
  return {
    opacity: envelope * layer, weight, y: 0,
    titleEnterX: -12 * (1 - smooth(0.414, 0.458, p)),
    mediaEnterX: 12 * (1 - smooth(0.416, 0.460, p)),
    exit: index === PROFILE_CASE_STOPS.length - 1 ? smooth(CASE_EXIT_START, 0.839, p) : 0,
    flip: swaps.reduce((value, swap, swapIndex) => value + (swapIndex % 2 === 0 ? 1 : -1) * smooth(0.2, 0.8, swap), 0),
    textOpacity: swaps.reduce((value, swap) => value * caption(swap), 1),
    readable: weight > 0.04,
  };
}
export function profileBackdropFrame(progress) {
  const p = clamp01(progress);
  return { dark: smooth(0.004, 0.04, p) * (1 - smooth(0.96, 1, p)) };
}
/** The final outward exit starts M growing and rising from its faint bottom pose. */
export function profileLogoFrame(progress) {
  const p = clamp01(progress);
  const ink = 0.08 + 0.12 * smooth(0.06, 0.84, p);
  const grow = smooth(0, 1, LOGO_GROWTH_HANDOFF * clamp01((p - CASE_EXIT_START) / (1 - CASE_EXIT_START)));
  return { reveal: smooth(0.014 / 1.5, 0.055 / 1.5, p) * (ink + (1 - ink) * grow), layout: 1 - grow, yaw: 0, pitch: 0 };
}
/** Continue the same growth curve to full size then hold before turning. */
export function portfolioLogoFrame(progress) {
  const p = clamp01(progress);
  const grow = smooth(0, 1, LOGO_GROWTH_HANDOFF + (1 - LOGO_GROWTH_HANDOFF) * clamp01(p / 0.62));
  return { reveal: 0.20 + 0.80 * grow, layout: 1 - grow, turn: smooth(0.74, 1, p), yaw: 0, pitch: 0 };
}
export function profileLogoLayout(mobile, viewportHeight = Infinity) {
  if (viewportHeight <= 520) return { centerY: 0.935, height: 0.05, width: mobile ? 0.38 : 0.20 };
  if (viewportHeight <= 600) return { centerY: 0.925, height: 0.07, width: mobile ? 0.38 : 0.20 };
  return { centerY: mobile ? 0.91 : 0.875, height: mobile ? 0.10 : 0.12, width: mobile ? 0.38 : 0.20 };
}
export function profileEndFrame(progress) {
  const p = clamp01(progress);
  return { opacity: smooth(0.858, 0.90, p) * (1 - smooth(0.953, 0.995, p)) };
}
export function profileStoryFrame(progress) {
  const p = clamp01(progress);
  const chapter = PROFILE_CHAPTER_STOPS.reduce((current, stop, index) => p >= stop - 0.04 / 1.5 ? index : current, 0);
  return { opacity: smooth(0.004, 0.04, p) * (1 - smooth(0.98, 1, p)), chapter, progress: p };
}
