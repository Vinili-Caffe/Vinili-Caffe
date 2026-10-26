import { Explore } from "@/components/Explore";
import { Hero } from "@/components/Hero";
import { LiveCorner } from "@/components/live/LiveCorner";
import { LiveStats } from "@/components/LiveStats";
import { SiteShell } from "@/components/SiteShell";
import { ReviewsMarquee } from "@/components/ReviewsMarquee";
import { Why } from "@/components/Why";
import { loadBuildStats } from "@/lib/stats";
import { HomeLoop } from "@/components/HomeLoop";

export default async function Home() {
  const stats = await loadBuildStats();
  return (
    <SiteShell>
      <Hero />
      <LiveStats initial={stats} />
      <Why />
      <HomeLoop />
      <ReviewsMarquee />
      <Explore />
      <LiveCorner />
    </SiteShell>
  );
}
