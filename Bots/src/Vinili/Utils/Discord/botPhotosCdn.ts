/**
 * Asset brand in `Vinili/Photos` pubblicati su Cloudflare R2.
 * Path CDN: https://cdn.viniliecaffe.it/Photos/<file>
 */
const CDN_ORIGIN = String(process.env.VC_PHOTOS_CDN_ORIGIN || "https://cdn.viniliecaffe.it")
  .trim()
  .replace(/\/+$/, "");

function botPhotoCdnUrl(fileName?) {
  const name = String(fileName || "")
    .trim()
    .replace(/^\/+/, "");
  if (!name) return "";
  const encoded = name
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${CDN_ORIGIN || "https://cdn.viniliecaffe.it"}/Photos/${encoded}`;
}

export = { botPhotoCdnUrl, CDN_ORIGIN };
