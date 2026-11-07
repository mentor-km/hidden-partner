export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  })
}

export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}
