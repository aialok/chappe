# Security and threat model

Chappe moves a file from one device to another as a stream of QR codes on a
screen, read by a camera. This page says plainly what that protects and what
it does not, so you can decide whether it fits your situation.

Chappe has **not** had an independent security audit. Treat it accordingly.

## What Chappe protects

- **No network.** The production page sets a Content Security Policy of
  `connect-src 'none'` and replaces `fetch`, XHR, WebSocket and
  `navigator.sendBeacon` with functions that refuse. Your file leaves the
  device only as light on the screen.
- **Contents and metadata, when you set a passphrase.** The file is encrypted
  with AES-256-GCM. The key comes from your passphrase through PBKDF2-SHA-256
  with 210,000 iterations and a random 16-byte salt. Each transfer uses a fresh
  salt and a fresh 12-byte IV. The file name, file type, whether it is text or
  a file, and whether it was compressed are all inside the encryption.
- **Integrity.** A transfer that arrives damaged or altered is refused, never
  saved. Encrypted transfers are checked by AES-GCM authentication and a
  SHA-256 of the encrypted data. Unencrypted transfers are checked against a
  SHA-256 of the contents.
- **No stored data.** No accounts, cookies, analytics or transfer history. The
  only thing kept in the browser is your preferred code density and speed.

## What an observer can still learn

Anyone who records the screen during an **encrypted** transfer can see:

- that a transfer happened, and roughly when;
- the approximate size of the file;
- a random transfer ID, the salt and the IV (none of these reveal the contents).

During an **unencrypted** transfer they can read everything, including the file
itself and its name.

## What Chappe does not protect against

- **Being seen.** The codes are visible to anyone with a line of sight to the
  screen, including cameras. Pointing a phone at a flickering code stands out.
- **Weak passphrases.** A recording is a permanent copy of the encrypted file.
  Someone who has it can try passphrases offline for as long as they like. Use
  four or more random words, and share the passphrase in person.
- **A passphrase that leaks later.** There is no forward secrecy. If the
  passphrase becomes known, any recording of that transfer can be decrypted.
- **Seized or compromised devices.** If a phone or computer is unlocked,
  infected, or taken, files saved on it, screenshots and download history are
  exposed. Chappe cannot protect data after it is saved.
- **A tampered copy of Chappe.** If you load a modified version, none of the
  above holds. See below for how to check your copy.
- **The browser and operating system.** Chappe relies on them for the camera,
  the screen and the cryptography.

## Hosted site and offline file

- **Hosted site.** You trust whoever serves the page at the moment it loads.
  After that it makes no network requests. Installing it (Install app or Add to
  Home Screen) keeps a copy that opens with no internet.
- **Offline file (`chappe.html`).** A single file with everything inside it.
  It never needs a network, and it can be passed from person to person over
  Bluetooth, a USB stick or a memory card. Its own Content Security Policy only
  allows the exact script it was built with.

## Check that your offline file is genuine

1. Download `chappe.html` from the
   [latest release](https://github.com/aialok/chappe/releases/latest). The
   release notes list its SHA-256 fingerprint.
2. Compute the fingerprint of your copy:
   - Mac or Linux: `shasum -a 256 chappe.html`
   - Windows: `certutil -hashfile chappe.html SHA256`
3. If it does not match exactly, do not use the file.

The build is deterministic. To confirm a release was built from this source,
check out the release tag, install Bun 1.4.3 and run:

```bash
bun install --frozen-lockfile
bun run build:single
shasum -a 256 dist/chappe.html
```

The fingerprint should match the one in the release notes.

## Reporting a vulnerability

Please do not open a public issue for security problems. Use the
[private vulnerability report](https://github.com/aialok/chappe/security/advisories/new)
on GitHub instead.
