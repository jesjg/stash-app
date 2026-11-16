# For the next full build

Changes that need new iPhone code, so they wait for the next `eas build` (version 1.0.1 or 1.1.0):

- **Boarding countdown in minutes only.** The flight lock screen card says "Boards in 56 min, 26 sec".
  iOS's plain relative countdown always shows seconds under an hour. iOS 18 can show minutes only
  (`Text(.currentDate, format: .reference(to: boardsAt, allowedFields: [.hour, .minute]))`), but
  Expo UI's Text doesn't offer that, so it needs a patch to `@expo/ui` (TextView.swift) via
  patch-package, plus `dateStyle` support for it in `src/live/TicketActivity.tsx`.

Remember: a new build changes the app version, so bump `version` in app.json and submit to the App Store.
