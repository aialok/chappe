# Chappe

Share files and text between two devices by pointing a camera at a screen.
No internet, no server, no upload. The data moves as a stream of QR codes.

Named after Claude Chappe, who built the optical telegraph in 1792: the first
system to send messages across distance by sight. Chappe does the same with a
screen and a camera.

## Why

Cloud sharing hands your file to a third party. Chappe never does. The file is
encoded in your browser and read back by the other device's camera. It works
with wifi off, so you can check for yourself that the data went nowhere but the
lens.

- No upload, no account, no server.
- Optional passphrase: AES-256-GCM (PBKDF2, 210k iterations) before the first code is drawn.
- SHA-256 check on arrival, so a damaged transfer is reported instead of saved.
- Nothing to install on the sending machine. It is a web page.

## How it works

```
file ─▶ gzip (if it helps) ─▶ AES-GCM (if passphrase) ─▶ fountain code ─▶ QR grid ─▶ screen
save ◀─ SHA-256 check      ◀─ decrypt                 ◀─ peeling decode ◀─ camera  ◀─ QR grid
```

- **Fountain code (LT, systematic).** The sender streams an endless set of
  blocks. The receiver rebuilds the file from any sufficient subset, in any
  order, so missed frames cost a little time and never stall the transfer.
- **Staggered grid.** Up to nine codes on screen, changed one at a time, so the
  camera rarely catches a half-drawn frame.
- **Two decoders.** The browser's `BarcodeDetector` where it exists (Chrome on
  Android and macOS). Elsewhere, including iPhone, `jsQR` scans the whole frame
  plus four overlapping corner tiles to read each code in a 2 × 2 grid.
- **No network, enforced.** A `connect-src 'none'` Content Security Policy in
  the production build, plus a runtime guard that blocks and counts any request.
  The count is shown in the header.

## Develop

```bash
bun install
bun dev            # http://localhost:5173
bun test           # transport, crypto, codec and end-to-end QR tests
bun run typecheck
bun run lint
bun run build      # static site in dist/
```

The camera and Web Crypto need a secure context: `localhost` or https. To test
from a phone during development, serve the dev server over https.

## Deploy

`bun run build` produces a static `dist/` folder with no server code. Any
static host with https works: Cloudflare Pages or Vercel with build command
`bun run build` and output directory `dist`.

## Limits

- Files up to 5 MB. Larger files work in principle but take minutes to beam.
- The 3 × 3 grid needs a receiver with `BarcodeDetector` (Chrome on Android).
- Speed depends on the screen, the camera and the light. Start with the defaults.
