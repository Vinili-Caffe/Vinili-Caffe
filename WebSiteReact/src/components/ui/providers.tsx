"use client";

import type { ReactNode } from "react";
import { DialogProvider } from "./dialog";
import { EmojiPickerProvider } from "./emoji-picker";
import { LightboxProvider } from "./lightbox";
import { ToastProvider } from "./toast";

/** Provider dei tool globali (toast, dialog, lightbox, emoji). Montato da SiteShell. */
export function UiProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <DialogProvider>
        <LightboxProvider>
          <EmojiPickerProvider>{children}</EmojiPickerProvider>
        </LightboxProvider>
      </DialogProvider>
    </ToastProvider>
  );
}
