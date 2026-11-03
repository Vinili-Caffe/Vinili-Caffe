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
import { Checkbox } from "@/components/ui";
import { Select } from "@/components/ui/Select";
import { Field, Notice, dangerBtn, fieldClass, labelClass, miniBtn, primaryMini } from "./bits";

const TYPE_LABELS: Record<FormFieldType, string> = {
  text_input: "Text Input",
  string_select: "String Select",
  user_select: "User Select",
  role_select: "Role Select",
  mentionable_select: "Mentionable Select",
  channel_select: "Channel Select",
  radio_group: "Radio Group",
  checkbox_group: "Checkbox Group",
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
      onToast("Titolo form non valido.", true);
      return;
    }
    const clean: FormField[] = [];
    for (const field of fields.slice(0, maxFields)) {
      const label = field.label.trim().slice(0, FORM_LIMITS.maxLabel);
      if (!label) {
        onToast("Titolo form non valido.", true);
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

  if (loading) return <p className="text-sm text-crema/45">Caricamento form…</p>;
  if (error && !bundle) return <Notice>{error}</Notice>;
  if (!bundle) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Form">
          <Select
            value={selected}
            onChange={setSelected}
            placeholder="Seleziona un form…"
            className={fieldClass}
            options={bundle.forms.map((f) => ({ value: f.id, label: f.title }))}
          />
        </Field>
        <form
          className="flex flex-1 flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = createName.trim().slice(0, FORM_LIMITS.maxTitle);
            if (!name) {
              onToast("Titolo form non valido.", true);
              return;
            }
            if (bundle.forms.length >= maxForms) {
              onToast(`Quota form raggiunta (max ${maxForms}).`, true);
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
          }}
        >
          <Field label="Nuovo titolo">
            <input name="create-form-title"
              value={createName}
              maxLength={FORM_LIMITS.maxTitle}
              onChange={(e) => setCreateName(e.target.value)}
              className={fieldClass}
            />
          </Field>
          <button type="submit" disabled={busy} className={primaryMini}>
            Crea
          </button>
        </form>
      </div>
      <p className="text-xs text-crema/40">
        <span className="lining-nums">
          {bundle.forms.length}/{maxForms}
        </span>{" "}
        form · max {maxFields} campi
      </p>

      {selected ? (
        <div className="space-y-3">
          <Field label="Titolo">
            <input name="title"
              value={title}
              maxLength={FORM_LIMITS.maxTitle}
              onChange={(e) => setTitle(e.target.value)}
              className={fieldClass}
            />
          </Field>
          <ul className="space-y-3">
            {fields.map((field, index) => (
              <li key={field.id} className="space-y-2 rounded-xl bg-espresso/40 p-3 ring-1 ring-sand/12">
                <div className="flex items-center justify-between gap-2">
                  <span className={labelClass}>Campo {index + 1}</span>
                  <button
                    type="button"
                    className={dangerBtn}
                    onClick={() => setFields((rows) => rows.filter((f) => f.id !== field.id))}
                  >
                    Rimuovi
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Tipo">
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
                  <Field label="Etichetta">
                    <input name="label"
                      value={field.label}
                      maxLength={FORM_LIMITS.maxLabel}
                      onChange={(e) => patchField(field.id, { label: e.target.value })}
                      className={fieldClass}
                    />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-sm text-crema/75">
                  <Checkbox
                    checked={field.required}
                    className="size-3.5"
                    onChange={(v) => patchField(field.id, { required: v })}
                  />
                  Obbligatorio
                </label>
                {field.type === "text_input" ? (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Field label="Stile">
                      <Select
                        value={field.style === "paragraph" ? "paragraph" : "short"}
                        onChange={(v) => {
                          const style = v === "paragraph" ? "paragraph" : "short";
                          const cap = style === "paragraph" ? 1024 : 255;
                          patchField(field.id, {
                            style,
                            maxLength: Math.min(field.maxLength ?? cap, cap),
                          });
                        }}
                        className={fieldClass}
                        options={[
                          { value: "short", label: "Short" },
                          { value: "paragraph", label: "Paragraph" },
                        ]}
                      />
                    </Field>
                    <Field label="Min">
                      <input name="field-min-length"
                        type="number"
                        min={0}
                        max={field.style === "paragraph" ? 1024 : 255}
                        value={field.minLength ?? 0}
                        onChange={(e) => patchField(field.id, { minLength: Number(e.target.value) || 0 })}
                        className={fieldClass}
                      />
                    </Field>
                    <Field label="Max">
                      <input name="field-max-length"
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
                {field.type === "text_input" ? (
                  <Field label="Placeholder">
                    <input name="field-placeholder"
                      value={field.placeholder || ""}
                      maxLength={FORM_LIMITS.maxPlaceholder}
                      onChange={(e) => patchField(field.id, { placeholder: e.target.value || null })}
                      className={fieldClass}
                    />
                  </Field>
                ) : null}
                {supportsMinMax(field.type) ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="Min selezioni">
                      <input name="field-min-values"
                        type="number"
                        min={0}
                        max={25}
                        value={field.minValues ?? 0}
                        onChange={(e) => patchField(field.id, { minValues: Number(e.target.value) || 0 })}
                        className={fieldClass}
                      />
                    </Field>
                    <Field label="Max selezioni">
                      <input name="field-max-values"
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
                  <div className="space-y-2">
                    <p className={labelClass}>{TYPE_LABELS[field.type]} Options</p>
                    {field.options.map((opt, oi) => (
                      <div key={`${field.id}-${oi}`} className="flex gap-2">
                        <input name="option-label"
                          value={opt.label}
                          placeholder="Label"
                          maxLength={100}
                          onChange={(e) => {
                            const options = field.options.slice();
                            options[oi] = { ...opt, label: e.target.value, value: e.target.value };
                            patchField(field.id, { options });
                          }}
                          className={fieldClass}
                        />
                        <button
                          type="button"
                          className={dangerBtn}
                          onClick={() =>
                            patchField(field.id, { options: field.options.filter((_, i) => i !== oi) })
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className={miniBtn}
                      onClick={() => {
                        const cap = maxOptions(field.type);
                        if (field.options.length >= cap) {
                          onToast(`Massimo ${cap} opzioni.`, true);
                          return;
                        }
                        patchField(field.id, {
                          options: [...field.options, { label: "", value: "", description: null }],
                        });
                      }}
                    >
                      Aggiungi opzione
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={miniBtn}
              disabled={fields.length >= maxFields}
              onClick={() => setFields((rows) => [...rows, blankField()])}
            >
              Aggiungi campo
            </button>
            <button type="button" className={primaryMini} disabled={busy} onClick={save}>
              Salva
            </button>
            <button
              type="button"
              className={dangerBtn}
              disabled={busy}
              onClick={async () => {
                if (!selected) return;
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
              Elimina {title || "form"}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-crema/45">Seleziona un form…</p>
      )}
    </div>
  );
}
