import { Explore } from "@/components/Explore";
import { Hero } from "@/components/Hero";
import { LiveCorner } from "@/components/live/LiveCorner";
import { LiveStats } from "@/components/LiveStats";
import { SiteShell } from "@/components/SiteShell";
import { ReviewsMarquee } from "@/components/ReviewsMarquee";
import { Why } from "@/components/Why";
import { loadBuildStats } from "@/lib/stats";
import { HomeLoop } from "@/components/HomeLoop";
import { ContestHomeCard } from "@/components/contest/ContestHomeCard";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";

export default async function Home() {
  const stats = await loadBuildStats();
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/"
        title="Vinili & Caffè"
        description="Community Discord Italiana chill dove parlare di tutto. Ruoli, eventi, giveaway, bot esclusivi."
      />
      {/* LCP: preload sfondo hero (hoisted in <head>) */}
      <link
        rel="preload"
        as="image"
        href="/images/sfondo-still.webp"
        type="image/webp"
        imageSrcSet="/images/sfondo-mobile-still.webp 640w, /images/sfondo-still.webp 1920w"
        imageSizes="100vw"
      />
      <Hero />
      <LiveStats initial={stats} />
      <Why />
      <HomeLoop />
      <ReviewsMarquee />
      <Explore />
      <LiveCorner />
      <ContestHomeCard />
    </SiteShell>
  );
}
