import { useMemo } from 'react'
import { encode } from 'uqr'

interface HandoffQrCodeProps {
  url: string
}

/**
 * Renders a QR code entirely on-device: no image requests, canvas, or QR API.
 */
export default function HandoffQrCode({ url }: HandoffQrCodeProps) {
  const qr = useMemo(() => encode(url, { ecc: 'M', border: 4 }), [url])
  const size = qr.size

  return (
    <svg
      role="img"
      aria-label="Device handoff QR code"
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="h-48 w-48 rounded-lg bg-white"
    >
      <rect width={size} height={size} fill="#ffffff" />
      {qr.data.flatMap((row, y) =>
        row.map((dark, x) =>
          dark ? (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={1}
              height={1}
              fill="#000000"
            />
          ) : null,
        ),
      )}
    </svg>
  )
}
