import { LANG_FLAG, LANG_LABEL, flagUrl, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/cn";

/** Bandiera PNG (flagcdn) — leggibile anche su Windows dove le emoji-bandiera collassano in IT/GB. */
export function FlagImg({ locale, className, size = 40 }: { locale: Locale; className?: string; size?: 20 | 40 | 80 }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={flagUrl(locale, size)}
      alt=""
      title={LANG_LABEL[locale]}
      width={size === 20 ? 20 : size === 80 ? 80 : 28}
      height={size === 20 ? 15 : size === 80 ? 60 : 21}
      loading="lazy"
      decoding="async"
      className={cn("inline-block rounded-[3px] object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.25)]", className)}
      data-flag={LANG_FLAG[locale]}
    />
  );
}
