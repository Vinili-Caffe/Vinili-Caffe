import type { KeyboardEvent as ReactKeyboardEvent } from "react";

type SendKeyLike = {
  key: string;
  shiftKey: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  defaultPrevented?: boolean;
  isComposing?: boolean;
  nativeEvent?: { isComposing?: boolean };
};

/** Enter = invia, Shift+Enter = a capo (stile Windows / Discord desktop). */
export function shouldComposerSend(e: SendKeyLike): boolean {
  if (e.defaultPrevented) return false;
  if (e.key !== "Enter") return false;
  if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return false;
  if (e.isComposing || e.nativeEvent?.isComposing) return false;
  return true;
}

/** onKeyDown per textarea/composer chat: Enter invia, Shift+Enter va a capo. */
export function onComposerEnterSend(e: ReactKeyboardEvent, send: () => void): void {
  if (!shouldComposerSend(e)) return;
  e.preventDefault();
  send();
}
