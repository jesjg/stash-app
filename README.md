# Stash

All your tickets in one place, on the right day. For the QR tickets that won't go into Apple Wallet: ferries, waterparks, gigs, trains.

- **Share → Stubs** from Mail, Files or Photos (or tap **+**).
- Codes are found on-device: QR, Aztec, PDF417, Data Matrix and barcodes, across every page of a PDF. One code per passenger becomes one swipeable ticket.
- Reads the ticket text on-device (PDF text, or Apple's OCR for images) and fills in the date, time, seat, row, section, gate or entrance, platform, coach and booking reference. You check it and save.
- Share a ticket **link** from Safari or Mail (or + → Ticket link): it opens inside Stubs, you sign in if needed, scroll to the code and tap Capture.
- Optional: Stubs checks new screenshots for ticket codes when you open it and offers to add them.
- On the day, a Live Activity pins the ticket (with its code) to the lock screen and Dynamic Island once Stubs has been opened that day; tapping the morning reminder counts.
- A reminder at 8am on the day, or 2 hours before if there's a time. Tap it and the code is on screen at full brightness.
- **Stays** (Airbnb, hotels, campsites): screenshot the check-in screens or paste the host's message (+ → Paste check-in details, or Share → Stash with text). Stash reads the address, check-in/out, door or key-box code, Wi-Fi and host's number into one card with Directions and Call. Stays stay on Today until check-out; the door code never goes on the lock screen.
- Tidy by default: past tickets clear themselves after 30 days (or 1 week / 90 days / never). Swipe to delete, with undo.
- Nothing leaves the phone. No account, no server.

## Stack

Expo SDK 57 · Expo Router · TypeScript. iPhone first.

| Piece | Where |
| --- | --- |
| Screens | `src/app/` (home, ticket, add/edit, original, settings, share landing) |
| Ticket store, auto-clear, undo | `src/lib/store.ts` (JSON in the app's Documents folder) |
| Import pipeline | `src/lib/importer.ts` |
| Reminders | `src/lib/reminders.ts` |
| On-device scanner (Swift: PDFKit + Vision codes and OCR) | `modules/stubs-scanner/` |
| Ticket text → date, time, seat, gate, ref | `src/lib/extract.ts` |
| Lock screen Live Activity | `src/live/TicketActivity.tsx`, `src/lib/lockscreen.ts` |
| Screenshot check | `src/lib/screenshots.ts` |
| Link capture | `src/app/web.tsx` |
| Design tokens (Tear-off) | `src/theme.ts` |

Receiving shares uses `expo-sharing`'s share extension (experimental on iOS in SDK 57). It needs the App Group `group.com.jesjg.stash`; EAS sets this up when it creates the credentials.

## Running it (no Mac needed)

The app uses native code (share extension, scanner), so it runs as a **development build**, not in Expo Go.

```bash
npm install
npx eas-cli@latest login
npx eas-cli@latest init          # links a NEW Expo project for Stubs (separate from other apps)
npx eas-cli@latest device:create # register your iPhone once
npm run build:dev                # cloud build; install it from the link/QR EAS gives you
npm start                        # then open the Stubs dev build on your phone
```

For a build to try without the dev server: `npm run build:preview`.

## Updates without a new build

JavaScript-only changes (anything under `src/` or `assets/`) ship over the air: pushing to `main` runs `.github/workflows/ship-update.yml`, which publishes an EAS Update to the `production` channel. Phones pick it up the next time Stubs opens and show "Stubs update ready → Restart".

Needs one repo secret: `EXPO_TOKEN` (expo.dev → Account settings → Access tokens).

Changes to `package.json`, `app.json`, `eas.json` or `modules/` need a new build: bump `version` in `app.json` (it's the runtime version) and run `eas build`.

## Checks

```bash
npm run typecheck
npm run lint
```

## Not in v1 (next up)

1. Starting the lock screen card without opening the app (needs a small push server).
2. Apple Wallet export, home-screen widget.
3. iCloud backup.
4. Forward-to-email and inbox scanning.

Rotating codes (e.g. Ticketmaster SafeTix) can't work in any third-party app; those stay in the official app.
