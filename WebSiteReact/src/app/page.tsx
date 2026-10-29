import dynamic from "next/dynamic";
import { Hero } from "@/components/Hero";
import { LiveStats } from "@/components/LiveStats";
import { SiteShell } from "@/components/SiteShell";
import { loadBuildStats } from "@/lib/stats";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";

/* Below-fold: split dal chunk iniziale (home Speed Insights). */
const Why = dynamic(() => import("@/components/Why").then((m) => m.Why));
const HomeLoop = dynamic(() => import("@/components/HomeLoop").then((m) => m.HomeLoop));
const ReviewsMarquee = dynamic(() => import("@/components/ReviewsMarquee").then((m) => m.ReviewsMarquee));
const Explore = dynamic(() => import("@/components/Explore").then((m) => m.Explore));
const LiveCorner = dynamic(() => import("@/components/live/LiveCorner").then((m) => m.LiveCorner));
const ContestHomeCard = dynamic(
  () => import("@/components/contest/ContestHomeCard").then((m) => m.ContestHomeCard),
);

export default async function Home() {
  const stats = await loadBuildStats();
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/"
        title="Vinili & Caffè"
        description="Community Discord Italiana chill dove parlare di tutto. Ruoli, eventi, giveaway, bot esclusivi."
      />
      {/* LCP: poster hero promo (hoisted in <head>) */}
      <link rel="preload" as="image" href="/images/hero-promo-16x9.jpg" type="image/jpeg" />
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
