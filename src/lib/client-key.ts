// Pure derivation of the per-network key used by the session-mint throttle
// (pass-10 F-1/F-2). Kept free of Next/db imports so the node:test suite can
// load it directly — same pattern as origin.ts / title.ts / throttle.ts.
//
// Trust model (matches the repo's trusted-ingress convention):
// - `cf-connecting-ip` is set — and overwritten — by the documented
//   Cloudflare ingress, so a client cannot forge it through that ingress.
// - Otherwise the RIGHTMOST `x-forwarded-for` value wins: appending proxies
//   (Cloudflare, nginx proxy_add_x_forwarded_for) place the address they
//   observed at the end, while client-supplied values survive at the FRONT
//   and must never be trusted.
// - No usable value (direct/dev traffic) falls back to the shared "direct"
//   bucket; spoofing is then possible but meaningless outside a trusted
//   ingress, and the ingress remains the documented rate-limit boundary.
// Values must parse as IPv4/IPv6: non-IP shapes fall through to the next
// source, which also bounds every retained key to 45 characters (the IPv6
// textual maximum) so oversized junk can never occupy limiter memory.

const IPV4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
// Hex digits, colons, and dots (IPv4-mapped tails like ::ffff:192.0.2.1).
// This is deliberately a shape bound for a throttle key, not full RFC 4291
// validation: the requirement is that keys are short, stable, and never
// attacker-chosen junk.
const IPV6 = /^[0-9A-Fa-f:.]{2,45}$/;

function validIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const candidate = value.trim();
  if (candidate.length === 0 || candidate.length > 45) return null;
  if (IPV4.test(candidate)) return candidate;
  if (IPV6.test(candidate) && candidate.includes(":")) return candidate;
  return null;
}

export function clientNetworkKey(
  cfConnectingIp: string | null | undefined,
  xForwardedFor: string | null | undefined,
): string {
  const direct = validIp(cfConnectingIp);
  if (direct) return direct;
  const forwarded = xForwardedFor?.split(",") ?? [];
  for (let i = forwarded.length - 1; i >= 0; i--) {
    const candidate = validIp(forwarded[i]);
    if (candidate) return candidate;
  }
  return "direct";
}
