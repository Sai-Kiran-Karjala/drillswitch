import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * We call a URL that a customer typed in, from our server. Refuse anything that points
 * back into private networks (SSRF). Local development can opt out with
 * DRILLSWITCH_ALLOW_PRIVATE_FLAGSMITH=1 to connect a second local Flagsmith organisation.
 */
const allowPrivate = () => process.env.DRILLSWITCH_ALLOW_PRIVATE_FLAGSMITH === "1";

function isPrivate(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivate(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  );
}

/** Returns the normalised Flagsmith API base URL (no trailing /api/v1), or throws a user-facing message. */
export async function checkFlagsmithUrl(raw: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("That is not a valid URL.");
  }
  if (url.username || url.password) throw new Error("Remove credentials from the URL.");
  if (url.protocol !== "https:" && !(allowPrivate() && url.protocol === "http:")) {
    throw new Error("Use an https:// URL.");
  }
  if (!allowPrivate()) {
    const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
    if (!addresses.length) throw new Error(`Could not resolve ${url.hostname}.`);
    if (addresses.some((a) => isPrivate(a.address))) throw new Error("That address is on a private network.");
  }
  const path = url.pathname.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
  return `${url.origin}${path}`;
}
