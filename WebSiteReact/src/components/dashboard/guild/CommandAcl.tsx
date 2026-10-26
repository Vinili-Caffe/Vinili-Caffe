"use client";

import { useEffect, useState } from "react";
import type { ChannelPicker, CommandAcl, RolePicker } from "@/lib/dashboard-guild";
import { Select } from "@/components/ui/Select";
import { Field, MultiCheck, fieldClass, miniBtn, primaryMini } from "./bits";

const MODE_OPTIONS = [
  { value: "", label: "Nessun filtro" },
  { value: "include", label: "Solo questi ruoli" },
  { value: "exclude", label: "Tutti tranne questi" },
] as const;

const CHANNEL_MODE_OPTIONS = [
  { value: "", label: "Nessun filtro" },
  { value: "include", label: "Solo questi canali" },
  { value: "exclude", label: "Tutti tranne questi" },
] as const;

type Mode = "" | "include" | "exclude";

function asMode(value: string | null | undefined): Mode {
  return value === "include" || value === "exclude" ? value : "";
}

/** Permessi ruolo/canale di un comando (include / exclude), come la modale del sito vecchio. */
export function CommandAcl({
  acl,
  roles,
  channels,
  busy,
  categoryNames,
  onSave,
  onSaveCategory,
}: {
  acl: CommandAcl;
  roles: RolePicker[];
  channels: ChannelPicker[];
  busy?: boolean;
  categoryNames?: string[];
  onSave: (next: CommandAcl) => void;
  onSaveCategory?: (next: CommandAcl) => void;
}) {
  const [roleMode, setRoleMode] = useState<Mode>(asMode(acl.roleMode));
  const [channelMode, setChannelMode] = useState<Mode>(asMode(acl.channelMode));
  const [roleIds, setRoleIds] = useState<string[]>(acl.roleIds || []);
  const [channelIds, setChannelIds] = useState<string[]>(acl.channelIds || []);
  const [hint, setHint] = useState("");

  useEffect(() => {
    setRoleMode(asMode(acl.roleMode));
    setChannelMode(asMode(acl.channelMode));
    setRoleIds(acl.roleIds || []);
    setChannelIds(acl.channelIds || []);
    setHint("");
  }, [acl]);

  const draft = (): CommandAcl | null => {
    if (roleMode && roleIds.length === 0) {
      setHint("Seleziona almeno un ruolo.");
      return null;
    }
    if (channelMode && channelIds.length === 0) {
      setHint("Seleziona almeno un canale.");
      return null;
    }
    setHint("");
    return {
      enabled: acl.enabled !== false,
      roleMode: roleMode || null,
      roleIds: roleMode ? roleIds : [],
      channelMode: channelMode || null,
      channelIds: channelMode ? channelIds : [],
      boardFeatureLocked: acl.boardFeatureLocked,
    };
  };

  const channelOptions = channels.map((ch) => ({
    id: ch.id,
    label: `${ch.kind === "voice" ? "Vocale: " : "#"}${ch.name}`,
  }));

  return (
    <div className="mt-2 space-y-3 rounded-xl bg-espresso/35 p-3 ring-1 ring-sand/10">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ruoli">
          <Select
            value={roleMode}
            disabled={busy}
            onChange={(v) => setRoleMode(v as Mode)}
            className={fieldClass}
            options={[...MODE_OPTIONS]}
          />
          {roleMode ? (
            <div className="mt-2">
              <MultiCheck
                options={roles.map((r) => ({ id: r.id, label: `@${r.name}` }))}
                selected={roleIds}
                onChange={setRoleIds}
                empty="Nessuna opzione disponibile."
              />
            </div>
          ) : null}
        </Field>
        <Field label="Canali">
          <Select
            value={channelMode}
            disabled={busy}
            onChange={(v) => setChannelMode(v as Mode)}
            className={fieldClass}
            options={[...CHANNEL_MODE_OPTIONS]}
          />
          {channelMode ? (
            <div className="mt-2">
              <MultiCheck options={channelOptions} selected={channelIds} onChange={setChannelIds} />
            </div>
          ) : null}
        </Field>
      </div>
      {hint ? <p className="text-xs text-caramel">{hint}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className={primaryMini}
          onClick={() => {
            const next = draft();
            if (next) onSave(next);
          }}
        >
          Salva permessi
        </button>
        {onSaveCategory && categoryNames && categoryNames.length > 1 ? (
          <button
            type="button"
            disabled={busy}
            className={miniBtn}
            onClick={() => {
              const next = draft();
              if (next) onSaveCategory(next);
            }}
          >
            Applica a tutta la categoria
          </button>
        ) : null}
      </div>
    </div>
  );
}
