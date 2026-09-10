// Same-origin check for state-changing requests, extracted as a pure function
// so the unit suite can exercise it without Next.js or database imports.
//
// Deployments behind trusted TLS ingress often deliver an internal Host header
// while the public hostname arrives in x-forwarded-host (the convention for
// Cloudflare, nginx, and ALB). The origin matches when it agrees with either
// value, so both direct and proxied same-origin browser writes pass while
// cross-site origins fail. sec-fetch-site=cross-site is rejected outright.
export function isSameOriginRequest(
  origin: string | null,
  host: string | null,
  forwardedHost: string | null,
  secFetchSite: string | null,
): boolean {
  if (secFetchSite === "cross-site") return false;
  if (!origin || !host || !URL.canParse(origin)) return false;
  const url = new URL(origin);
  if (!["http:", "https:"].includes(url.protocol)) return false;
  const forwarded = forwardedHost?.split(",")[0]?.trim();
  return url.host === host || (Boolean(forwarded) && url.host === forwarded);
}
