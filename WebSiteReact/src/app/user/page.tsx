import type { Metadata } from "next";
import { pageSocialMeta } from "@/lib/og";
import { Suspense } from "react";
import { ProfileView } from "@/components/profile/ProfileView";
import { SiteShell } from "@/components/SiteShell";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/user/", title: "Profilo", description: "Il profilo di un membro di Vinili & Caffè: livello, classifiche, rank card e ruoli." }),
};

export default function UserPage() {
  return (
    <SiteShell>
      {/* l'id arriva da ?id=…: la pagina è statica, il profilo si carica nel browser */}
      <Suspense>
        <ProfileView />
      </Suspense>
    </SiteShell>
  );
}
