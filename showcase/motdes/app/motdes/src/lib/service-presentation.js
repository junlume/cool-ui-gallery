import { SERVICE_CASES } from './service-cases.js';

const clamp01 = (value) => Math.max(0, Math.min(1, value));

/** The video's existing scroll coordinate: integer 1 is the first centered case. */
export function serviceScrollForProgress(progress, count = SERVICE_CASES.length) {
  return 0.5 + clamp01(progress) * (count + 0.5);
}

export function serviceIndexFromScroll(scroll, count = SERVICE_CASES.length) {
  return Math.max(0, Math.min(count - 1, Math.round(scroll - 1)));
}

export function serviceProgressForIndex(index, count = SERVICE_CASES.length) {
  return (Math.max(0, Math.min(count - 1, index)) + 0.5) / (count + 0.5);
}

/** Invert the same GL mapping using ScrollTrigger's measured document coordinates. */
export function serviceCaseStops(trigger, count = SERVICE_CASES.length) {
  if (!trigger || !Number.isFinite(trigger.start) || !Number.isFinite(trigger.end) || trigger.end <= trigger.start) return [];
  return Array.from({ length: count }, (_, index) => trigger.start
    + (trigger.end - trigger.start) * serviceProgressForIndex(index, count));
}
