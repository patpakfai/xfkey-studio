// Inline SVG icons (24×24, 2px stroke, Lucide-style outlines). Each entry is a
// function so every render gets fresh vnodes (Preact must not reuse a vnode).

import { html } from '../vendor/preact-htm.js';

const PATHS = {
  keyboard: () => html`<rect x="2" y="5" width="20" height="14" rx="2" /><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M10 13h4M7 16h10" />`,
  plug: () => html`<path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v5" />`,
  check: () => html`<path d="M20 6 9 17l-5-5" />`,
  x: () => html`<path d="M18 6 6 18M6 6l12 12" />`,
  plus: () => html`<path d="M12 5v14M5 12h14" />`,
  alert: () => html`<path d="m10.3 3.9-8.1 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />`,
  info: () => html`<circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />`,
  record: () => html`<circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" fill="currentColor" />`,
  download: () => html`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />`,
  upload: () => html`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />`,
  undo: () => html`<path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />`,
  reset: () => html`<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />`,
  save: () => html`<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" />`,
  bulb: () => html`<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />`,
  type: () => html`<path d="M4 7V4h16v3M9 20h6M12 4v16" />`,
  command: () => html`<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />`,
  music: () => html`<path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />`,
  ban: () => html`<circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" />`,
  sparkle: () => html`<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z" />`,
  search: () => html`<circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />`,
  zap: () => html`<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />`,
  code: () => html`<path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />`,
  // Media
  playPause: () => html`<path d="M3 5v14l9-7z" fill="currentColor" /><path d="M16 5v14M21 5v14" />`,
  previous: () => html`<path d="M19 20 9 12l10-8v16z" fill="currentColor" /><path d="M5 19V5" />`,
  next: () => html`<path d="m5 4 10 8-10 8V4z" fill="currentColor" /><path d="M19 5v14" />`,
  rewind: () => html`<path d="m11 19-9-7 9-7v14zM22 19l-9-7 9-7v14z" fill="currentColor" />`,
  fastForward: () => html`<path d="m13 19 9-7-9-7v14zM2 19l9-7-9-7v14z" fill="currentColor" />`,
  stop: () => html`<rect x="5" y="5" width="14" height="14" rx="1.5" fill="currentColor" />`,
  mute: () => html`<path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="m23 9-6 6M17 9l6 6" />`,
  volumeDown: () => html`<path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" />`,
  volumeUp: () => html`<path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />`,
  brightnessDown: () => html`<circle cx="12" cy="12" r="4" /><path d="M12 4h.01M20 12h.01M12 20h.01M4 12h.01M17.7 6.3h.01M17.7 17.7h.01M6.3 17.7h.01M6.3 6.3h.01" />`,
  brightnessUp: () => html`<circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />`,
  eject: () => html`<path d="M5 15h14L12 6z" fill="currentColor" /><path d="M5 19h14" />`,
  monitor: () => html`<rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />`,
  calculator: () => html`<rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01" />`,
  globe: () => html`<circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20" />`,
  mail: () => html`<rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" />`,
  refresh: () => html`<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" /><path d="M21 3v5h-5" />`,
  speaker: () => html`<rect x="5" y="2" width="14" height="20" rx="2" /><circle cx="12" cy="14" r="4" /><path d="M12 6h.01" />`,
  arrowLeft: () => html`<path d="M19 12H5M12 19l-7-7 7-7" />`,
  arrowRight: () => html`<path d="M5 12h14M12 5l7 7-7 7" />`,
  arrowUp: () => html`<path d="M12 19V5M5 12l7-7 7 7" />`,
  arrowDown: () => html`<path d="M12 5v14M19 12l-7 7-7-7" />`,
};

/** Decorative by default; pass `label` when the icon carries meaning on its own. */
export function Icon({ name, size = 18, label, class: className = '' }) {
  return html`<svg class=${`icon ${className}`} width=${size} height=${size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
    role=${label ? 'img' : undefined} aria-label=${label} aria-hidden=${label ? undefined : 'true'}
    focusable="false">${(PATHS[name] ?? PATHS.sparkle)()}</svg>`;
}
