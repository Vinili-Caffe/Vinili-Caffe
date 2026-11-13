import type { Metadata } from "next";
import { MovedRedirect } from "@/components/MovedRedirect";

export const metadata: Metadata = { title: "FAQ bot · Dashboard", robots: { index: false } };

/* spostata nella pagina pubblica: chi ha il vecchio link ci arriva lo stesso */
export default function Page() {
  return <MovedRedirect to="/faq/#bot" label="Le FAQ del bot ora stanno nella pagina FAQ" />;
}
