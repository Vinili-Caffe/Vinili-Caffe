"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { presenceStatus, subscribePresence, watchUser, type PresenceStatus } from "@/lib/presence";

function useStatus(id: string): PresenceStatus {
  return useSyncExternalStore(
    subscribePresence,
    () => presenceStatus(id),
    () => "offline",
  );
}

const TITLE: Record<PresenceStatus, string> = {
  online: "Online sul sito",
  idle: "Assente",
  offline: "Offline",
};

/**
 * Pallino online/idle sull'avatar (presenza sito, non Discord).
 * Watch solo se in viewport (meno query su liste lunghe).
 */
export function PresenceDot({
  userId,
  className,
  children,
}: {
  userId?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  const id = String(userId || "").trim();
  const wrap = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el || !id) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setInView(Boolean(entry?.isIntersecting)),
      { rootMargin: "120px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [id]);

  useEffect(() => {
    if (!id || !inView) return;
    return watchUser(id);
  }, [id, inView]);

  const status = useStatus(id);
  const show = Boolean(id) && (status === "online" || status === "idle");

  return (
    <span
      ref={wrap}
      className={cn(
        "relative inline-flex shrink-0 overflow-visible rounded-full align-middle leading-none",
        className,
      )}
      data-vc-presence-zone
      data-user-id={id || undefined}
      data-status={show ? status : undefined}
    >
      {children}
      {show ? (
        <span
          className={cn(
            "pointer-events-none absolute right-[-2px] bottom-[-2px] z-[8] box-border size-[0.72rem] rounded-full border-2 border-espresso shadow-[0_0_0_1px_rgba(0,0,0,0.25)]",
            "light:border-[#f3ebe3]",
            status === "online" ? "bg-[#23a559]" : "bg-[#f0b232]",
          )}
          data-status={status}
          title={TITLE[status]}
          aria-hidden
        />
      ) : null}
    </span>
  );
}
