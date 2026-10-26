"use client";

import { useEffect } from "react";
import { Loader2, LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth";

type Props = {
  /** Apre un pannello sulla scheda staff del profilo (?staffOpen=). */
  staffOpen?: string;
  /** Dentro StaffShell: niente pt-28 / titolo duplicato. */
  embedded?: boolean;
};

/** Come sul sito vecchio: l'area staff si apre sulla scheda Staff del profilo (/user/?id=…&tab=staff). */
export function StaffProfileRedirect({ staffOpen, embedded }: Props = {}) {
  const { ready, user, login } = useAuth();
  useEffect(() => {
    if (!ready) return;
    const q = new URLSearchParams(location.search);
    const id = q.get("id") || q.get("userId") || user?.id;
    if (!id) return;
    const dest = new URLSearchParams({ id, tab: "staff" });
    const open = staffOpen || q.get("staffOpen");
    if (open) dest.set("staffOpen", open);
    location.replace(`/user/?${dest.toString()}`);
  }, [ready, user, staffOpen]);

  if (ready && !user && !new URLSearchParams(typeof location !== "undefined" ? location.search : "").get("id")) {
    if (embedded) {
      return <p className="text-sm text-crema/60">Accedi con Discord dalla barra in alto per aprire il profilo staff.</p>;
    }
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 pt-28 text-center">
        <h1 className="font-display text-4xl font-semibold">Area staff</h1>
        <p className="mt-3 text-crema/60">Accedi con Discord per aprire il tuo profilo staff.</p>
        <button type="button" onClick={login} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#5865f2] px-6 py-3 font-semibold text-white">
          <LogIn className="size-4" /> Accedi con Discord
        </button>
      </div>
    );
  }
  return (
    <div className={embedded ? "flex h-40 items-center justify-center gap-2 text-crema/55" : "flex min-h-[60vh] items-center justify-center gap-2 pt-28 text-crema/55"}>
      <Loader2 className="size-5 animate-spin" /> Apro il profilo staff…
    </div>
  );
}
