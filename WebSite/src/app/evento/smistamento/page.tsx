import { redirect } from "next/navigation";
import { page } from "@/lib/site";

/** Smistamento obbligatorio sull’hub — niente pagina dedicata. */
export default function EventoSmistamentoRedirectPage() {
  redirect(page("/evento/"));
}
