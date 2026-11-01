import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  CircleHelp,
  ClipboardList,
  FileText,
  Flag,
  Gamepad2,
  Gem,
  Gift,
  GraduationCap,
  Grid3x3,
  Handshake,
  Heart,
  Home,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  Map,
  MessagesSquare,
  Scale,
  Shield,
  Sparkles,
  Star,
  Swords,
  ThumbsUp,
  Ticket,
  Trophy,
  Pin,
  Users,
} from "lucide-react";
import type { EventoPageId } from "@/lib/evento-starwars";

/** Icone snav — stesse voci del sito vecchio (Font Awesome → Lucide). */
export const NAV_ICONS: Record<string, LucideIcon> = {
  "nav.wiki": Map,
  "nav.sponsor": Handshake,
  "nav.support": Heart,
  "nav.community": Users,
  "nav.games": Gamepad2,
  "nav.requests": Inbox,
  "nav.main": Map,
  "nav.voteServer": ThumbsUp,
  "nav.reviews": Star,
  "nav.donations": Gift,
  "nav.perks": Gem,
  "nav.users": Trophy,
  "nav.roles": Shield,
  "nav.rules": FileText,
  "nav.faq": CircleHelp,
  "nav.confessionale": MessagesSquare,
  "nav.bachecaWall": Pin,
  "nav.wordle": Grid3x3,
  "nav.evento": Sparkles,
  "nav.appeals": Scale,
  "nav.applications": ClipboardList,
  "nav.suggestions": Lightbulb,
  "nav.tickets": Ticket,
};

/** Icone distinte per le voci nav dell’evento Star Wars. */
export const EVENTO_NAV_ICONS: Record<EventoPageId | "sito", LucideIcon> = {
  hub: LayoutDashboard,
  avvento: CalendarDays,
  smistamento: Swords,
  accademia: GraduationCap,
  gara: Flag,
  miniera: Gem,
  puzzle: Grid3x3,
  sito: Home,
};

export function NavIcon({ labelKey, className = "size-3.5 shrink-0 opacity-80" }: { labelKey: string; className?: string }) {
  const Icon = NAV_ICONS[labelKey];
  if (!Icon) return null;
  return <Icon className={className} aria-hidden strokeWidth={2} />;
}

export function EventoNavIcon({
  id,
  className = "size-3.5 shrink-0 opacity-75",
}: {
  id: EventoPageId | "sito";
  className?: string;
}) {
  const Icon = EVENTO_NAV_ICONS[id] || Sparkles;
  return <Icon className={className} aria-hidden strokeWidth={2} />;
}
