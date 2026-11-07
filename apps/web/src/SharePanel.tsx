import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { inviteUrl, whatsAppHref } from "./code.ts"
import { Button } from "./ui.tsx"

export function SharePanel({ code }: { code: string }) {
  const url = inviteUrl(window.location.origin, code)
  const [copied, setCopied] = useState(false)
  const [svg, setSvg] = useState("")
  const [canShare, setCanShare] = useState(false)

  useEffect(() => {
    setCanShare(typeof navigator.share === "function")
  }, [])

  useEffect(() => {
    let cancel = false
    QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#1c1408", light: "#f6f0e4" } })
      .then((markup) => {
        if (!cancel) setSvg(markup)
      })
      .catch(() => {
        if (!cancel) setSvg("")
      })
    return () => {
      cancel = true
    }
  }, [url])

  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-black/20 p-4" aria-label="Invite">
      <h2 className="font-display text-3xl">Invite friends</h2>
      <p className="text-center font-display text-4xl tracking-[0.25em]" aria-label={`Room code ${code}`}>
        {code}
      </p>
      <a data-testid="room-link" className="break-all text-lg underline" href={url}>
        {url}
      </a>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          onClick={() => {
            navigator.clipboard
              ?.writeText(url)
              .then(() => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 2000)
              })
              .catch(() => setCopied(false))
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
        {canShare ? (
          <Button
            type="button"
            variant="quiet"
            onClick={() => {
              navigator.share?.({ title: "Hidden Partner", text: "You're invited to a Hidden Partner table", url }).catch(() => {})
            }}
          >
            Share
          </Button>
        ) : null}
        <a
          className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-cream/50 px-4 text-lg font-semibold"
          href={whatsAppHref(url)}
          target="_blank"
          rel="noreferrer"
        >
          WhatsApp
        </a>
      </div>
      {svg ? (
        <div
          className="qr mx-auto w-44 rounded-2xl bg-cream p-2"
          role="img"
          aria-label={`QR code for ${url}`}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : null}
    </section>
  )
}
