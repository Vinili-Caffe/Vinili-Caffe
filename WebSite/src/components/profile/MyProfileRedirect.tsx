"use client";

import { useEffect } from "react";
import { Disc3, LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { page } from "@/lib/site";

/** `/profilo/` → `/user/?id=<utente loggato>` (login se serve). */
export function MyProfileRedirect() {
  const { ready, user, login } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (user?.id) {
      const tab = new URLSearchParams(location.search).get("tab");
      const dest = page(`/user/?id=${encodeURIComponent(user.id)}${tab === "staff" ? "&tab=staff" : ""}`);
      location.replace(dest);
      return;
    }
    login();
  }, [ready, user, login]);

  if (!ready) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 pt-28 text-center">
        <span className="flex size-16 animate-pulse items-center justify-center rounded-full bg-caramel/15 text-ember ring-1 ring-caramel/25">
          <Disc3 className="size-8" />
        </span>
        <p className="mt-6 text-crema/60">Apro il tuo profilo…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 pt-28 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-caramel/15 text-ember ring-1 ring-caramel/25">
          <LogIn className="size-8" />
        </span>
        <h1 className="mt-6 font-display text-3xl font-semibold">Il tuo profilo</h1>
        <p className="mt-3 text-crema/60">Accedi con Discord per aprire la tua scheda.</p>
        <button
          type="button"
          onClick={login}
          className="mt-7 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-semibold text-ink"
        >
          <LogIn className="size-4" /> Accedi con Discord
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 pt-28 text-center">
      <span className="flex size-16 animate-pulse items-center justify-center rounded-full bg-caramel/15 text-ember ring-1 ring-caramel/25">
        <Disc3 className="size-8" />
      </span>
      <p className="mt-6 text-crema/60">Reindirizzamento…</p>
    </div>
  );
}
