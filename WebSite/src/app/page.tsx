import dynamic from "next/dynamic";
import { Hero } from "@/components/Hero";
import { LiveStats } from "@/components/LiveStats";
import { SiteShell } from "@/components/SiteShell";
import { loadBuildStats } from "@/lib/stats";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { cdnUrl } from "@/lib/site";
import { isChristmasSeason } from "@/lib/site-effects";

/* Below-fold: split dal chunk iniziale (home Speed Insights). */
const Why = dynamic(() => import("@/components/Why").then((m) => m.Why));
const HomeEditorial = dynamic(() => import("@/components/HomeEditorial").then((m) => m.HomeEditorial));
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
        description="Community italiana su Discord dove si parla di tutto: musica in vocale, eventi, giveaway e bot scritti apposta per il server."
      />
      {/* LCP: atmosfera hero (hoisted in <head>); in Natale il client scambia xmas in HeroBackdrop */}
      <link
        rel="preload"
        as="image"
        href={cdnUrl(
          isChristmasSeason()
            ? "/images/hero-cafe-atmosphere-xmas.jpg"
            : "/images/hero-cafe-atmosphere.jpg",
        )}
        type="image/jpeg"
      />
      <Hero />
      <LiveStats initial={stats} />
      <Why />
      <HomeEditorial />
      <HomeLoop />
      <ReviewsMarquee />
      <Explore />
      <LiveCorner />
      <ContestHomeCard />
    </SiteShell>
  );
}
