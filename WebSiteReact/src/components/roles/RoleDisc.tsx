import type { CustomRole } from "@/lib/roles";
import { cn } from "@/lib/cn";

/** Badge circolare del ruolo: colore + icona/emoji. */
export function RoleDisc({ role, className, eager }: { role: CustomRole; className?: string; eager?: boolean }) {
  const c = role.roleColor || "#c4a07a";
  return (
    <span className={cn("relative block rounded-full bg-[repeating-radial-gradient(circle,#0b0705_0_1.5px,#1e140e_1.5px_3px)] shadow-[0_14px_30px_-14px_rgba(0,0,0,0.95)] ring-1 ring-black/60", className)}>
      {/* riflesso */}
      <span className="absolute inset-0 rounded-full bg-[conic-gradient(from_210deg,transparent,rgba(255,240,220,0.12)_40deg,transparent_80deg,transparent_200deg,rgba(255,240,220,0.06)_230deg,transparent_260deg)]" />
      {/* etichetta: colore del ruolo schiarito un po' (alcuni ruoli sono quasi neri) */}
      <span
        className="absolute inset-[30%] flex items-center justify-center overflow-hidden rounded-full ring-1 ring-white/20"
        style={{ background: `radial-gradient(circle at 35% 30%, color-mix(in oklab, ${c} 55%, #f4e9d8), ${c} 70%)` }}
      >
        {role.roleIconUrl ? (
          <img src={role.roleIconUrl} alt="" loading={eager ? "eager" : "lazy"} className="size-[62%] object-contain drop-shadow" />
        ) : role.roleEmoji ? (
          <span className="text-[1.4em] leading-none">{role.roleEmoji}</span>
        ) : null}
        <span className="absolute size-[9%] rounded-full bg-espresso" />
      </span>
    </span>
  );
}
