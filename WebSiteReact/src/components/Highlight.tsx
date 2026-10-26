/** Confronto senza accenti né maiuscole ("caffe" trova "Caffè"). */
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Evidenzia le parole cercate dentro un pezzo di testo. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = norm(query.trim());
  if (!q) return <>{text}</>;
  const n = norm(text);
  const out: React.ReactNode[] = [];
  let i = 0;
  for (let at = n.indexOf(q); at !== -1; at = n.indexOf(q, i)) {
    out.push(text.slice(i, at));
    out.push(
      <mark key={at} className="rounded bg-caramel/30 px-0.5 text-crema">
        {text.slice(at, at + q.length)}
      </mark>,
    );
    i = at + q.length;
  }
  out.push(text.slice(i));
  return <>{out}</>;
}
