"use client";

/** Sfondo immersivo: void + stelle + glow. */
export function EventoStarfield() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#05070f]" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 55% at 50% -10%, rgba(46,168,255,0.18), transparent 55%), radial-gradient(ellipse 60% 40% at 80% 90%, rgba(201,162,39,0.12), transparent 50%), radial-gradient(ellipse 50% 35% at 10% 80%, rgba(225,29,72,0.1), transparent 45%)",
        }}
      />
      <div
        className="absolute inset-0 animate-[vcSwTwinkle_8s_ease-in-out_infinite_alternate] motion-reduce:animate-none"
        style={{
          backgroundImage:
            "radial-gradient(1.5px 1.5px at 12% 18%, #f0e6c8 40%, transparent), radial-gradient(1px 1px at 28% 42%, #fff 50%, transparent), radial-gradient(1.5px 1.5px at 44% 12%, #c9a227 40%, transparent), radial-gradient(1px 1px at 61% 55%, #fff 50%, transparent), radial-gradient(1.2px 1.2px at 73% 28%, #f0e6c8 45%, transparent), radial-gradient(1px 1px at 88% 66%, #fff 50%, transparent), radial-gradient(1.4px 1.4px at 8% 72%, #2ea8ff 40%, transparent), radial-gradient(1px 1px at 51% 81%, #fff 50%, transparent), radial-gradient(1.3px 1.3px at 95% 14%, #f0e6c8 40%, transparent), radial-gradient(1px 1px at 33% 91%, #fff 50%, transparent)",
        }}
      />
      <div
        className="absolute inset-0 opacity-60 animate-[vcSwTwinkle_12s_ease-in-out_infinite_alternate-reverse] motion-reduce:animate-none"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 16% 30%, rgba(255,255,255,0.7) 50%, transparent), radial-gradient(1px 1px at 39% 8%, rgba(240,230,200,0.6) 50%, transparent), radial-gradient(1px 1px at 57% 48%, rgba(255,255,255,0.55) 50%, transparent), radial-gradient(1px 1px at 70% 78%, rgba(46,168,255,0.55) 50%, transparent), radial-gradient(1px 1px at 84% 36%, rgba(255,255,255,0.5) 50%, transparent), radial-gradient(1px 1px at 22% 58%, rgba(201,162,39,0.5) 50%, transparent)",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-44"
        style={{ background: "linear-gradient(to top, rgba(5,7,15,0.98), transparent)" }}
      />
    </div>
  );
}
