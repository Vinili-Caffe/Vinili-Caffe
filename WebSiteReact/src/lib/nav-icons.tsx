import type { LucideIcon } from "lucide-react";
import {
  CircleHelp,
  ClipboardList,
  FileText,
  Gamepad2,
  Gem,
  Gift,
  Grid3x3,
  Handshake,
  Heart,
  Inbox,
  Lightbulb,
  Map,
  MessagesSquare,
  Scale,
  Shield,
  Sparkles,
  Star,
  ThumbsUp,
  Ticket,
  Trophy,
  Users,
} from "lucide-react";

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
  "nav.wordle": Grid3x3,
  "nav.evento": Sparkles,
  "nav.appeals": Scale,
  "nav.applications": ClipboardList,
  "nav.suggestions": Lightbulb,
  "nav.tickets": Ticket,
};

export function NavIcon({ labelKey, className = "size-3.5 shrink-0 opacity-80" }: { labelKey: string; className?: string }) {
  const Icon = NAV_ICONS[labelKey];
  if (!Icon) return null;
  return <Icon className={className} aria-hidden strokeWidth={2} />;
}
