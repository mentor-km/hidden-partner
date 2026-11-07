export function normalizeSite(value) {
  const trimmed = value.trim()
  if (!trimmed) return ""
  let url
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error(
      "PUBLIC_SITE_URL must be an https address with no path, such as https://hidden-partner.example.workers.dev",
    )
  }
  if (url.protocol !== "https:") throw new Error("PUBLIC_SITE_URL must start with https://")
  if (url.username || url.password) throw new Error("PUBLIC_SITE_URL must not include a username or password")
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("PUBLIC_SITE_URL must be the origin only, with no path or query")
  }
  return url.origin
}

export function readPublicSiteUrl(toml) {
  const match = toml.match(/^PUBLIC_SITE_URL\s*=\s*"([^"]*)"\s*$/m)
  if (!match) throw new Error("Set PUBLIC_SITE_URL in apps/server/wrangler.toml. See DEPLOY.md.")
  return normalizeSite(match[1] ?? "")
}

export function assetUrl(site, path) {
  const file = path.startsWith("/") ? path : `/${path}`
  return site ? `${site}${file}` : file
}
