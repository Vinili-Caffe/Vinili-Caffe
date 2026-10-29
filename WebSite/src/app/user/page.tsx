import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Suspense } from "react";
import { SiteShell } from "@/components/SiteShell";
import { BoardSkeleton } from "@/components/ui/EmptyState";

const ProfileView = dynamic(
  () => import("@/components/profile/ProfileView").then((m) => m.ProfileView),
  { loading: () => <BoardSkeleton className="mx-auto max-w-5xl px-6 py-10" /> },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/user/", title: "Profilo", description: "Il profilo di un membro di Vinili & Caffè: livello, classifiche, rank card e ruoli." }),
};

export default function UserPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/user/"
        title="Profilo"
        description="Il profilo di un membro di Vinili & Caffè: livello, classifiche, rank card e ruoli."
      />
      {/* l'id arriva da ?id=…: la pagina è statica, il profilo si carica nel browser */}
      <Suspense fallback={<BoardSkeleton className="mx-auto max-w-5xl px-6 py-10" />}>
        <ProfileView />
      </Suspense>
    </SiteShell>
  );
}
