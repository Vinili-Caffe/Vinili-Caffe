"use client";

import type { ReactNode } from "react";
import { DialogProvider } from "./dialog";
import { EmojiPickerProvider } from "./emoji-picker";
import { LightboxProvider } from "./lightbox";
import { ToastProvider } from "./toast";
import { TooltipLayer } from "./tooltip-layer";

/** Provider dei tool globali (toast, dialog, lightbox, emoji, tooltip). Montato da SiteShell. */
export function UiProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <DialogProvider>
        <LightboxProvider>
          <EmojiPickerProvider>
            {children}
            <TooltipLayer />
          </EmojiPickerProvider>
        </LightboxProvider>
      </DialogProvider>
    </ToastProvider>
  );
}
