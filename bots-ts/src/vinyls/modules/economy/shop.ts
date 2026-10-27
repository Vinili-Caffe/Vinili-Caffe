export interface ShopItem {
  id: string;
  name: string;
  price: number;
  description: string;
}

/** Shop core (no GIF). Estendibile via VC_TS_SHOP_JSON. */
const DEFAULT_ITEMS: ShopItem[] = [
  { id: "coffee", name: "Caffè", price: 50, description: "Un espresso virtuale." },
  { id: "vinyl", name: "Vinile", price: 500, description: "Collezionabile base." },
  { id: "boost_token", name: "Boost token", price: 2_000, description: "Token cosmetico." },
];

export function listShopItems(): ShopItem[] {
  const raw = String(process.env.VC_TS_SHOP_JSON || "").trim();
  if (!raw) return DEFAULT_ITEMS;
  try {
    const parsed = JSON.parse(raw) as ShopItem[];
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.filter((i) => i?.id && i.name && Number(i.price) > 0);
    }
  } catch {
    /* fallback */
  }
  return DEFAULT_ITEMS;
}

export function getShopItem(id: string): ShopItem | undefined {
  return listShopItems().find((i) => i.id === id || i.name.toLowerCase() === id.toLowerCase());
}
