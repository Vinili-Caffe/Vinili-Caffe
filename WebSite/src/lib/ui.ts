/**
 * Classi CTA condivise (Emil craft-floor: press, hover lift, no transition-all).
 * Preferire queste su pill caramel / ghost nuove o in refactor.
 */
export const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-semibold text-ink shadow-[0_12px_30px_-10px_rgba(232,160,90,0.55)] transition-[transform,filter,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:brightness-[1.05] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

export const BTN_PRIMARY_LG =
  "inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-6 py-3.5 font-semibold text-ink shadow-[0_12px_30px_-10px_rgba(232,160,90,0.7)] transition-[transform,filter,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:brightness-[1.05] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

export const BTN_GHOST =
  "inline-flex items-center justify-center gap-2 rounded-full bg-crema/8 px-4 py-2 text-sm font-semibold text-crema/90 ring-1 ring-sand/25 transition-[transform,background-color,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:bg-crema/12 hover:ring-sand/40 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

export const BTN_INK =
  "inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition-[transform,filter] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

export const CHIP_PRESS =
  "transition-[transform,background-color,box-shadow,color] duration-200 ease-out active:scale-[0.96]";

/** Pannello board / gate: stesso calore midnight café della home. */
export const PANEL =
  "rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast ring-1 ring-sand/15";

export const PANEL_SOFT =
  "rounded-3xl bg-gradient-to-b from-caramel/[0.08] via-roast/70 to-roast/80 ring-1 ring-sand/12";
