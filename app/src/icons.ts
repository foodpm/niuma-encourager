/**
 * 内联 SVG 图标库（stroke currentColor，圆头线帽，贴纸风）
 */

const S = (inner: string) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const icons = {
  gear: S(
    `<circle cx="12" cy="12" r="3.1"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1.04H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.04 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1.04-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1.04H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1.04z"/>`
  ),
  back: S(`<path d="M15 18l-6-6 6-6"/>`),
  clock: S(`<circle cx="12" cy="12" r="8.6"/><path d="M12 7.4V12l3 2"/>`),
  target: S(
    `<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4.4"/><circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none"/>`
  ),
  palette: S(
    `<path d="M12 3a9 9 0 1 0 0 18c1.3 0 2-.9 2-1.8 0-.6-.3-1-.6-1.4-.3-.4-.6-.8-.6-1.4 0-1 .9-1.8 2-1.8h2.2A4 4 0 0 0 21 11c-.4-4.5-4.3-8-9-8z"/><circle cx="7.6" cy="10.5" r="0.8" fill="currentColor" stroke="none"/><circle cx="12" cy="7.6" r="0.8" fill="currentColor" stroke="none"/><circle cx="16.4" cy="10.5" r="0.8" fill="currentColor" stroke="none"/>`
  ),
  db: S(
    `<ellipse cx="12" cy="5.6" rx="7.6" ry="2.8"/><path d="M4.4 5.6v12.8c0 1.55 3.4 2.8 7.6 2.8s7.6-1.25 7.6-2.8V5.6"/><path d="M4.4 12c0 1.55 3.4 2.8 7.6 2.8s7.6-1.25 7.6-2.8"/>`
  ),
  user: S(
    `<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.4c.7-3.6 3.9-5.6 7.5-5.6s6.8 2 7.5 5.6"/>`
  ),
  sparkle: S(
    `<path d="M12 3.5l1.8 5 5 1.8-5 1.8-1.8 5-1.8-5-5-1.8 5-1.8z"/><path d="M18.8 16.2l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>`
  ),
  coin: S(
    `<circle cx="12" cy="12" r="8.6"/><path d="M9 8.6h6M9 12h6M12 8.6c-1.6 1-2.6 2-2.6 3.4 0 1.7 1.2 2.6 2.6 3.4 1.4-.8 2.6-1.7 2.6-3.4 0-1.4-1-2.4-2.6-3.4z"/>`
  ),
  moon: S(`<path d="M20.2 13.6A8.3 8.3 0 1 1 10.4 3.8a6.8 6.8 0 0 0 9.8 9.8z"/>`),
  export: S(`<path d="M12 14.5V3.5M7.5 7.5L12 3l4.5 4.5"/><path d="M5 14.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4.5"/>`),
  folder: S(
    `<path d="M3 7.2A2.2 2.2 0 0 1 5.2 5h3.9l2 2.2h8A2.2 2.2 0 0 1 21.3 9.4v8.4A2.2 2.2 0 0 1 19.1 20H5.2A2.2 2.2 0 0 1 3 17.8z"/>`
  ),
  play: S(`<path d="M8 5.5l11 6.5-11 6.5z"/>`),
  pause: S(`<path d="M8.5 5.5v13M15.5 5.5v13"/>`),
} as const;

export type IconName = keyof typeof icons;
