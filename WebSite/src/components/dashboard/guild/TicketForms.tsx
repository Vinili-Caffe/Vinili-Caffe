"use client";

import { useEffect, useState } from "react";
import {
  FORM_FIELD_TYPES,
  FORM_LIMITS,
  createTicketForm,
  deleteTicketForm,
  loadTicketForms,
  saveTicketForm,
  type FormField,
  type FormFieldType,
  type TicketFormsBundle,
} from "@/lib/dashboard-guild";
import { confirmDialog } from "@/components/ui";
import { cn } from "@/lib/cn";
import { Select } from "@/components/ui/Select";
import { EditorHeader, Field, FormGroup, Notice, SettingRow, Toggle, dangerBtn, fieldClass, labelClass, miniBtn, primaryMini } from "./bits";

const TYPE_LABELS: Record<FormFieldType, string> = {
  text_input: "Testo libero",
  string_select: "Menu di opzioni",
  user_select: "Scelta di un utente",
  role_select: "Scelta di un ruolo",
  mentionable_select: "Utente o ruolo",
  channel_select: "Scelta di un canale",
  radio_group: "Una sola opzione",
  checkbox_group: "Più opzioni (caselle)",
};

function needsOptions(type: FormFieldType) {
  return type === "string_select" || type === "radio_group" || type === "checkbox_group";
}

function supportsMinMax(type: FormFieldType) {
  return (
    type === "string_select" ||
    type === "user_select" ||
    type === "role_select" ||
    type === "mentionable_select" ||
    type === "channel_select" ||
    type === "checkbox_group"
  );
}

function maxOptions(type: FormFieldType) {
  if (type === "radio_group" || type === "checkbox_group") return FORM_LIMITS.maxOptionsGroup;
  if (type === "string_select") return FORM_LIMITS.maxOptions;
  return 0;
}

function minOptions(type: FormFieldType) {
  if (type === "radio_group") return 2;
  if (type === "string_select" || type === "checkbox_group") return 1;
  return 0;
}

function nid() {
  return `f${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function blankField(): FormField {
  return {
    id: nid(),
    type: "text_input",
    label: "",
    description: null,
    placeholder: null,
    required: true,
    style: "short",
    minLength: 0,
    maxLength: 255,
    minValues: 0,
    maxValues: 1,
    options: [],
  };
}

export function TicketForms({
  guildId,
  token,
  onToast,
}: {
  guildId: string;
  token: string;
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [bundle, setBundle] = useState<TicketFormsBundle | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");
  const [title, setTitle] = useState("");
  const [fields, setFields] = useState<FormField[]>([]);
  const [createName, setCreateName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const res = await loadTicketForms(token, guildId);
      if (cancel) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.message || "Impossibile caricare i form.");
        return;
      }
      setBundle(res.data);
      setError("");
      setSelected((cur) => cur || res.data.forms[0]?.id || "");
    })();
    return () => {
      cancel = true;
    };
  }, [token, guildId]);

  useEffect(() => {
    const form = bundle?.forms.find((f) => f.id === selected);
    if (!form) {
      setTitle("");
      setFields([]);
      return;
    }
    setTitle(form.title);
    setFields(form.fields.map((f) => ({ ...f, options: f.options.map((o) => ({ ...o })) })));
  }, [bundle, selected]);

  const maxFields = bundle?.quotas.maxFields || FORM_LIMITS.maxFields;
  const maxForms = bundle?.quotas.maxForms || FORM_LIMITS.maxForms;

  const patchField = (id: string, patch: Partial<FormField>) => {
    setFields((rows) => rows.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const save = async () => {
    if (!selected) return;
    const cleanTitle = title.trim().slice(0, FORM_LIMITS.maxTitle);
    if (!cleanTitle) {
      onToast("Il form deve avere un titolo.", true);
      return;
    }
    const clean: FormField[] = [];
    for (const field of fields.slice(0, maxFields)) {
      const label = field.label.trim().slice(0, FORM_LIMITS.maxLabel);
      if (!label) {
        onToast("Ogni domanda deve avere un testo.", true);
        return;
      }
      const options = field.options
        .map((o) => ({
          label: o.label.trim().slice(0, 100),
          value: (o.value || o.label).trim().slice(0, 100),
          description: o.description,
        }))
        .filter((o) => o.label && o.value);
      const need = minOptions(field.type);
      const cap = maxOptions(field.type);
      if (needsOptions(field.type) && options.length < need) {
        onToast(need === 2 ? "Aggiungi almeno 2 opzioni." : "Aggiungi almeno 1 opzione.", true);
        return;
      }
      if (cap && options.length > cap) {
        onToast(`Massimo ${cap} opzioni.`, true);
        return;
      }
      clean.push({ ...field, label, options: needsOptions(field.type) ? options : [] });
    }
    setBusy(true);
    const res = await saveTicketForm(token, guildId, selected, { title: cleanTitle, fields: clean });
    setBusy(false);
    if (!res.ok) {
      onToast(res.message || "Salvataggio non riuscito.", true);
      return;
    }
    setBundle(res.data);
    onToast("Form aggiornato.");
  };

  if (loading) return <p className="text-sm text-crema/60">Caricamento form…</p>;
  if (error && !bundle) return <Notice>{error}</Notice>;
  if (!bundle) return null;

  const current = bundle.forms.find((f) => f.id === selected) || null;
  const moveField = (from: number, to: number) =>
    setFields((rows) => {
      if (to < 0 || to >= rows.length) return rows;
      const next = rows.slice();
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      return next;
    });

  const createForm = async () => {
    const name = createName.trim().slice(0, FORM_LIMITS.maxTitle);
    if (!name) {
      onToast("Scrivi il titolo del nuovo form.", true);
      return;
    }
    if (bundle.forms.length >= maxForms) {
      onToast(`Hai già ${maxForms} form, il massimo.`, true);
      return;
    }
    setBusy(true);
    const res = await createTicketForm(token, guildId, name);
    setBusy(false);
    if (!res.ok) {
      onToast(res.message || "Creazione form non riuscita.", true);
      return;
    }
    setBundle(res.data);
    setCreateName("");
    const created = res.data.forms.find((f) => f.title === name);
    if (created) setSelected(created.id);
    onToast("Form creato.");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      {/* elenco dei form (colonna a sinistra, come una barra laterale) */}
      <aside className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-crema">Form</h3>
          <span className="text-xs tabular-nums text-crema/60">
            {bundle.forms.length}/{maxForms}
          </span>
        </div>
        {bundle.forms.length === 0 ? (
          <p className="rounded-xl border border-dashed border-sand/20 px-3 py-4 text-center text-xs text-crema/60">
            Nessun form. Le domande che il bot fa prima di aprire un ticket.
          </p>
        ) : (
          <ul className="space-y-1" role="listbox" aria-label="Form">
            {bundle.forms.map((f) => {
              const on = f.id === selected;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => setSelected(f.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      on ? "bg-caramel/12 font-semibold text-crema ring-1 ring-caramel/25" : "text-crema/75 hover:bg-crema/[0.04] hover:text-crema",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{f.title}</span>
                    <span className="shrink-0 text-xs tabular-nums text-crema/60">{f.fields.length}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void createForm();
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">Titolo del nuovo form</span>
            <input
              name="create-form-title"
              value={createName}
              maxLength={FORM_LIMITS.maxTitle}
              placeholder="Nuovo form…"
              onChange={(e) => setCreateName(e.target.value)}
              className={cn(fieldClass, "mt-0 py-2")}
            />
          </label>
          <button type="submit" disabled={busy || !createName.trim()} className={primaryMini} aria-label="Crea form">
            Crea
          </button>
        </form>
      </aside>

      <div className="min-w-0">
        {current ? (
          <div className="space-y-4">
            <EditorHeader
              inColumn
              backLabel="Form"
              onBack={() => setSelected("")}
              title={title || "Form senza titolo"}
              subtitle={`${fields.length} ${fields.length === 1 ? "domanda" : "domande"} · massimo ${maxFields}`}
              actions={
                <>
                  <button
                    type="button"
                    className={dangerBtn}
                    disabled={busy}
                    onClick={async () => {
                      if (!selected) return;
                      if (!(await confirmDialog({ message: "Eliminare questo form? I pannelli che lo usano non faranno più domande. Non si può annullare.", danger: true }))) return;
                      setBusy(true);
                      const res = await deleteTicketForm(token, guildId, selected);
                      setBusy(false);
                      if (!res.ok) {
                        onToast(res.message || "Eliminazione non riuscita.", true);
                        return;
                      }
                      setBundle(res.data);
                      setSelected(res.data.forms[0]?.id || "");
                      onToast("Form eliminato.");
                    }}
                  >
                    Elimina
                  </button>
                  <button type="button" className={primaryMini} disabled={busy} onClick={save}>
                    Salva modifiche
                  </button>
                </>
              }
            />

            <FormGroup title="Titolo del form" description="Compare in cima alla finestra con le domande su Discord.">
              <input
                name="title"
                aria-label="Titolo del form"
                value={title}
                maxLength={FORM_LIMITS.maxTitle}
                onChange={(e) => setTitle(e.target.value)}
                className={cn(fieldClass, "mt-0")}
              />
            </FormGroup>

            {fields.length === 0 ? (
              <p className="rounded-xl border border-dashed border-sand/20 px-4 py-8 text-center text-sm text-crema/60">
                Nessuna domanda: aggiungi la prima qui sotto.
              </p>
            ) : (
              <ol className="space-y-3">
                {fields.map((field, index) => (
                  <li key={field.id} className="rounded-xl bg-espresso/45 ring-1 ring-sand/10">
                    <div className="flex items-center gap-2 border-b border-sand/[0.08] px-4 py-2.5">
                      <span className="flex size-6 items-center justify-center rounded-md bg-caramel/15 text-xs font-bold tabular-nums text-ember">{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-crema">{field.label || "Domanda senza titolo"}</span>
                      <span className="hidden text-xs text-crema/60 sm:inline">{TYPE_LABELS[field.type]}</span>
                      <button
                        type="button"
                        className="rounded-md px-1.5 py-1 text-crema/60 transition hover:bg-crema/[0.06] hover:text-crema disabled:opacity-30"
                        disabled={index === 0}
                        onClick={() => moveField(index, index - 1)}
                        aria-label={`Sposta su la domanda ${index + 1}`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="rounded-md px-1.5 py-1 text-crema/60 transition hover:bg-crema/[0.06] hover:text-crema disabled:opacity-30"
                        disabled={index === fields.length - 1}
                        onClick={() => moveField(index, index + 1)}
                        aria-label={`Sposta giù la domanda ${index + 1}`}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="rounded-md px-2 py-1 text-xs font-semibold text-[#f0a493] transition hover:bg-[#a83a2c]/15 light:text-[#a83a2c]"
                        onClick={() => setFields((rows) => rows.filter((f) => f.id !== field.id))}
                      >
                        Rimuovi
                      </button>
                    </div>
                    <div className="space-y-4 p-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Domanda">
                          <input
                            name="label"
                            value={field.label}
                            maxLength={FORM_LIMITS.maxLabel}
                            onChange={(e) => patchField(field.id, { label: e.target.value })}
                            className={fieldClass}
                          />
                        </Field>
                        <Field label="Tipo di risposta">
                          <Select
                            value={field.type}
                            onChange={(type) => {
                              const next = type as FormFieldType;
                              patchField(field.id, {
                                type: next,
                                style: next === "text_input" ? field.style || "short" : null,
                                minValues: next === "radio_group" ? 1 : next === "string_select" ? 1 : 0,
                                maxValues: next === "radio_group" || next === "string_select" ? 1 : 25,
                              });
                            }}
                            className={fieldClass}
                            options={FORM_FIELD_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
                          />
                        </Field>
                      </div>

                      {field.type === "text_input" ? (
                        <div className="grid gap-4 sm:grid-cols-[1fr_7rem_7rem]">
                          <Field label="Testo di esempio" hint="Si vede in grigio nel campo vuoto">
                            <input
                              name="field-placeholder"
                              value={field.placeholder || ""}
                              maxLength={FORM_LIMITS.maxPlaceholder}
                              onChange={(e) => patchField(field.id, { placeholder: e.target.value || null })}
                              className={fieldClass}
                            />
                          </Field>
                          <Field label="Min caratteri">
                            <input
                              name="field-min-length"
                              type="number"
                              min={0}
                              max={field.style === "paragraph" ? 1024 : 255}
                              value={field.minLength ?? 0}
                              onChange={(e) => patchField(field.id, { minLength: Number(e.target.value) || 0 })}
                              className={fieldClass}
                            />
                          </Field>
                          <Field label="Max caratteri">
                            <input
                              name="field-max-length"
                              type="number"
                              min={1}
                              max={field.style === "paragraph" ? 1024 : 255}
                              value={field.maxLength ?? 255}
                              onChange={(e) => patchField(field.id, { maxLength: Number(e.target.value) || 1 })}
                              className={fieldClass}
                            />
                          </Field>
                        </div>
                      ) : null}

                      {supportsMinMax(field.type) ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Scelte minime">
                            <input
                              name="field-min-values"
                              type="number"
                              min={0}
                              max={25}
                              value={field.minValues ?? 0}
                              onChange={(e) => patchField(field.id, { minValues: Number(e.target.value) || 0 })}
                              className={fieldClass}
                            />
                          </Field>
                          <Field label="Scelte massime">
                            <input
                              name="field-max-values"
                              type="number"
                              min={1}
                              max={25}
                              value={field.maxValues ?? 1}
                              onChange={(e) => patchField(field.id, { maxValues: Number(e.target.value) || 1 })}
                              className={fieldClass}
                            />
                          </Field>
                        </div>
                      ) : null}

                      {needsOptions(field.type) ? (
                        <div>
                          <p className={labelClass}>
                            Opzioni · {field.options.length}/{maxOptions(field.type)}
                          </p>
                          <ul className="mt-1.5 space-y-1.5">
                            {field.options.map((opt, oi) => (
                              <li key={`${field.id}-${oi}`} className="flex items-center gap-2">
                                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-crema/60">{oi + 1}.</span>
                                <input
                                  name="option-label"
                                  aria-label={`Opzione ${oi + 1}`}
                                  value={opt.label}
                                  placeholder="Testo dell'opzione"
                                  maxLength={100}
                                  onChange={(e) => {
                                    const options = field.options.slice();
                                    options[oi] = { ...opt, label: e.target.value, value: e.target.value };
                                    patchField(field.id, { options });
                                  }}
                                  className={cn(fieldClass, "mt-0 py-2")}
                                />
                                <button
                                  type="button"
                                  className="rounded-md px-2 py-1.5 text-sm text-crema/60 transition hover:bg-[#a83a2c]/15 hover:text-[#f0a493]"
                                  aria-label={`Rimuovi opzione ${oi + 1}`}
                                  onClick={() => patchField(field.id, { options: field.options.filter((_, i) => i !== oi) })}
                                >
                                  ✕
                                </button>
                              </li>
                            ))}
                          </ul>
                          <button
                            type="button"
                            className={cn(miniBtn, "mt-2")}
                            onClick={() => {
                              const cap = maxOptions(field.type);
                              if (field.options.length >= cap) {
                                onToast(`Massimo ${cap} opzioni.`, true);
                                return;
                              }
                              patchField(field.id, { options: [...field.options, { label: "", value: "", description: null }] });
                            }}
                          >
                            + Aggiungi opzione
                          </button>
                        </div>
                      ) : null}

                      <div className="divide-y divide-sand/[0.07] border-t border-sand/[0.07] pt-3">
                        <SettingRow title="Risposta obbligatoria">
                          <Toggle size="sm" checked={field.required} label="Risposta obbligatoria" onChange={(v) => patchField(field.id, { required: v })} />
                        </SettingRow>
                        {field.type === "text_input" ? (
                          <SettingRow title="Risposta lunga" description="Campo su più righe, fino a 1024 caratteri.">
                            <Toggle
                              size="sm"
                              checked={field.style === "paragraph"}
                              label="Risposta lunga"
                              onChange={(on) => {
                                const style = on ? "paragraph" : "short";
                                const cap = on ? 1024 : 255;
                                patchField(field.id, { style, maxLength: Math.min(field.maxLength ?? cap, cap) });
                              }}
                            />
                          </SettingRow>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            <button
              type="button"
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-sand/25 px-4 py-3 text-sm font-semibold text-crema/75 transition hover:border-caramel/40 hover:text-crema disabled:opacity-40"
              disabled={fields.length >= maxFields}
              onClick={() => setFields((rows) => [...rows, blankField()])}
            >
              + Aggiungi domanda {fields.length >= maxFields ? `(massimo ${maxFields})` : ""}
            </button>
          </div>
        ) : (
          <div className="flex h-full min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-sand/20 px-4 py-10 text-center">
            <p className="text-sm font-semibold text-crema">Scegli un form a sinistra</p>
            <p className="mt-1 text-xs text-crema/60">oppure creane uno nuovo: puoi collegarlo a un pannello in Pannelli → Dove si apre.</p>
          </div>
        )}
      </div>
    </div>
  );
}
