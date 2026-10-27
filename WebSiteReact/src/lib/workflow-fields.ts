/** Parse Q&A da body/preview inbox (parity staff-inbox-page.js). */

export type WorkflowField = { name: string; value: string };

function cleanText(text: string, keepNewlines = true): string {
  let s = String(text || "")
    .replace(/\*\*/g, "")
    .replace(/`+/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!keepNewlines) s = s.replace(/\s+/g, " ").trim();
  else s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

function fieldsUseful(fields: WorkflowField[]): boolean {
  if (!fields.length) return false;
  if (fields.length === 1) {
    const only = fields[0]!;
    const name = cleanText(only.name, false);
    const value = cleanText(only.value, false);
    if (!name || !value) return false;
    if (value.length < 8 && name.length < 24) return false;
  }
  return fields.some((f) => cleanText(f.name, false) || cleanText(f.value, false));
}

/** Appelli: label domande anche se il body è tutto su una riga. */
export function parseAppealSections(text: string): WorkflowField[] {
  const raw = cleanText(text, true);
  if (!raw) return [];

  const withBreaks = raw
    .replace(/\s+(Come mai sei stato (?:bannato|mutato)\s*\?)/gi, "\n$1")
    .replace(/\s+(Le tue scuse allo staff e alla community)/gi, "\n$1")
    .replace(/\s+(Informazioni aggiuntive(?:\s*\(opzionale\))?)/gi, "\n$1")
    .trim();

  const labels: { re: RegExp; title: string }[] = [
    { re: /^Utente\s*:/i, title: "1. ID Discord" },
    { re: /^(?:\d{1,2}\.\s*)?ID(?:\s+Discord)?\s*:?/i, title: "1. ID Discord" },
    { re: /^Come mai sei stato bannato\s*\?/i, title: "Come mai sei stato bannato?" },
    { re: /^Come mai sei stato mutato\s*\?/i, title: "Come mai sei stato mutato?" },
    { re: /^Le tue scuse allo staff e alla community/i, title: "Le tue scuse allo staff e alla community" },
    { re: /^Informazioni aggiuntive(?:\s*\(opzionale\))?/i, title: "Informazioni aggiuntive" },
  ];

  const lines = withBreaks
    .replace(/\n+/g, "\n")
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length >= 2) {
    const blocks: WorkflowField[] = [];
    let current: WorkflowField | null = null;
    for (const line of lines) {
      const matched = labels.find((lab) => lab.re.test(line));
      if (matched) {
        if (current) blocks.push(current);
        const rest = line.replace(matched.re, "").trim();
        current = { name: matched.title, value: rest };
      } else if (current) {
        current.value = current.value ? `${current.value}\n${line}` : line;
      }
    }
    if (current) blocks.push(current);
    if (blocks.length >= 2) {
      return blocks.map((b) => ({ name: b.name, value: String(b.value || "").trim() || "—" }));
    }
  }

  const compact = withBreaks.replace(/\s+/g, " ").trim();
  const hits: { index: number; end: number; title: string }[] = [];
  for (const lab of labels) {
    const m = compact.match(lab.re);
    if (!m) continue;
    const idx = compact.search(lab.re);
    if (idx < 0) continue;
    hits.push({ index: idx, end: idx + m[0].length, title: lab.title });
  }
  hits.sort((a, b) => a.index - b.index);
  if (hits.length < 2) return [];
  return hits.map((hit, i) => {
    const value = compact.slice(hit.end, i + 1 < hits.length ? hits[i + 1]!.index : compact.length).trim();
    return { name: hit.title, value: value || "—" };
  });
}

/** Candidature: blocchi numerati 1. 2. 3. … */
export function parseNumberedQa(text: string): WorkflowField[] {
  const raw = cleanText(text, true);
  if (!raw) return [];
  const normalized = raw
    .replace(/(\d{1,2})\\\./g, "$1.")
    .replace(/\*\*/g, "")
    .trim();
  const lines = normalized.split("\n");
  const blocks: WorkflowField[] = [];
  let expected = 1;
  let current: WorkflowField | null = null;

  const flush = () => {
    if (!current) return;
    const name = String(current.name || "").trim();
    let value = String(current.value || "").trim();
    if (!name && !value) {
      current = null;
      return;
    }
    const qInline = name.match(/^(\d{1,2}\.\s*[\s\S]{1,280}?\?)\s+([\s\S]+)$/);
    if (qInline && !value) {
      blocks.push({ name: qInline[1]!.trim(), value: qInline[2]!.trim() || "—" });
    } else {
      blocks.push({ name: name || `Domanda ${blocks.length + 1}`, value: value || "—" });
    }
    current = null;
  };

  for (const line of lines) {
    const m = String(line || "").match(/^(\d{1,2})\.\s*(.*)$/);
    const num = m ? Number(m[1]) : 0;
    if (m && Number.isFinite(num) && num === expected) {
      flush();
      const rest = String(m[2] || "").trim();
      /* idDiscordLabelFix1: "ID Discord" non deve matchare come name=ID value=Discord. */
      const idLine =
        rest.match(/^(ID\s+Discord)(?:\s+(.+))?$/i) || rest.match(/^(ID)(?:\s+(.+))?$/i);
      const ageLine = rest.match(/^(Et[aà])(?:\s+(.+))?$/i);
      if (idLine) current = { name: `${num}. ${idLine[1]}`, value: String(idLine[2] || "").trim() };
      else if (ageLine) current = { name: `${num}. ${ageLine[1]}`, value: String(ageLine[2] || "").trim() };
      else current = { name: `${num}. ${rest}`.trim(), value: "" };
      expected += 1;
      continue;
    }
    if (!current) continue;
    current.value = current.value ? `${current.value}\n${line}` : line;
  }
  flush();
  return blocks;
}

/** Campi strutturati per lo sheet inbox (API fields + parse body). */
export function resolveWorkflowDetailFields(
  queue: string,
  item: {
    fields?: WorkflowField[] | null;
    content?: string;
    body?: string;
    preview?: string;
    userId?: string;
  },
): WorkflowField[] {
  let fields = Array.isArray(item.fields) ? item.fields.map((f) => ({ name: String(f?.name || ""), value: String(f?.value || "") })) : [];
  const source = String(item.content || item.body || item.preview || "");

  if (queue === "appelli") {
    const parsed = parseAppealSections(source);
    if (parsed.length) fields = parsed;
    else if (!fieldsUseful(fields)) fields = parseNumberedQa(source);
    fields = fields.map((field) => {
      const fname = String(field.name || "").trim();
      if (/utente/i.test(fname) || /^(?:\d{1,2}\.\s*)?id(?:\s+discord)?$/i.test(fname)) {
        const id = String(item.userId || "").trim() || cleanText(field.value, false).replace(/\D/g, "").slice(0, 22);
        return { name: "1. ID Discord", value: id || field.value || "—" };
      }
      return {
        name: field.name,
        value: String(field.value || "")
          .replace(/\(\s*`?\d{16,20}`?\s*\)/g, "")
          .replace(/\s{2,}/g, " ")
          .trim() || field.value || "—",
      };
    });
    if (!fields.some((f) => /id discord/i.test(f.name))) {
      const id = String(item.userId || "").trim();
      if (id) fields = [{ name: "1. ID Discord", value: id }, ...fields];
    }
  } else if (queue === "candidature") {
    const parsed = parseNumberedQa(source);
    if (parsed.length >= 2) fields = parsed;
    else if (!fieldsUseful(fields) && source) fields = parseNumberedQa(source);
    fields = fields
      .filter((f) => !/^(utente|user)$/i.test(String(f.name || "").trim()))
      .map((field) => {
        const fname = String(field.name || "").trim();
        if (/^(?:\d{1,2}\.\s*)?id(?:\s+discord)?$/i.test(fname)) {
          const rawVal = cleanText(field.value, true);
          const lines = rawVal
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean);
          /* Vecchi parse: value = "Discord\\n<id>" → ripara label + snowflake. */
          let id = "";
          if (lines.length >= 2 && /^discord$/i.test(lines[0]!)) {
            id = lines[1]!.replace(/\D/g, "").slice(0, 22);
          } else {
            id = rawVal.replace(/\D/g, "").slice(0, 22);
          }
          if (!id) id = String(item.userId || "").trim();
          return { name: "1. ID Discord", value: id || field.value || "—" };
        }
        return field;
      });
  } else if (!fieldsUseful(fields) && source) {
    fields = parseNumberedQa(source);
  }

  return fields.filter((f) => cleanText(f.name, false) || cleanText(f.value, false));
}
