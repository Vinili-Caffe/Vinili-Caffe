const catalogJson = require("./emojiCatalog.json") as Record<
  string,
  { id: string; animated?: boolean; name?: string; note?: string }
>;

type EmojiEntry = {
  id: string;
  animated?: boolean;
  name?: string;
  note?: string;
};

type EmojiCatalog = Record<string, EmojiEntry>;

const emojiCatalog = catalogJson as EmojiCatalog;

function getEmojiEntry(key: string): EmojiEntry | null {
  const k = String(key || "").trim();
  if (!k) return null;
  const entry = emojiCatalog[k];
  return entry?.id ? entry : null;
}

function emojiId(key: string): string | null {
  return getEmojiEntry(key)?.id || null;
}

function emoji(key: string): string {
  const entry = getEmojiEntry(key);
  if (!entry?.id) return "";
  const name = String(entry.name || key.split("__")[0] || key).trim();
  return `${entry.animated ? "<a:" : "<:"}${name}:${entry.id}>`;
}

function e(key: string): string {
  return emoji(key);
}

const E: Record<string, string> = new Proxy(
  {},
  {
    get(_t, prop) {
      if (typeof prop !== "string") return "";
      return emoji(prop);
    },
    ownKeys() {
      return Reflect.ownKeys(emojiCatalog);
    },
    getOwnPropertyDescriptor(_t, prop) {
      if (typeof prop !== "string" || !(prop in emojiCatalog)) return undefined;
      return { configurable: true, enumerable: true, value: emoji(prop) };
    },
  },
);

function listEmojiKeys(): string[] {
  return Object.keys(emojiCatalog).sort((a, b) => a.localeCompare(b));
}

export = {
  emojiCatalog,
  getEmojiEntry,
  emojiId,
  emoji,
  e,
  E,
  listEmojiKeys,
};
