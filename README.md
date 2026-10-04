# XFKEY Studio

A Mac-friendly web configurator for **XFKEY** USB macro pads (USB `0xAF88:0x6688`,
sold with the vendor configurator at `xuanfang.co/xfp-web`). It talks to the pad
directly from Chrome using WebHID — no drivers, no vendor app.

Settings are stored on the pad, so it keeps working on any computer afterwards.

**Use it online: <https://patpakfai.github.io/xfkey-studio/>**

## Use it

Open the site in **Google Chrome** (or Edge, Brave, Arc, Opera — Safari and
Firefox don't support WebHID), click **Connect**, pick **XFKEY**, edit the keys
and press **Save to keyboard**.

No pad at hand? Try the editor against a simulated pad:
<https://patpakfai.github.io/xfkey-studio/?demo> (or `?demo=12-18` for the
12-key model).

### Run it locally

Needs Node.js 18+:

```bash
npm start
```

Then open <http://localhost:8137>. `npm start -- --open` opens Chrome for you.
WebHID only works on secure pages; `http://localhost` counts as one, but opening
`index.html` as a file doesn't.

## What it can do

- **Shortcuts** — modifiers (⌃ ⌥ ⇧ ⌘, left or right) plus up to 6 keys. Record
  a shortcut straight from your keyboard, pick keys from a searchable list, or
  use the Mac presets (copy/paste, screenshots, Spotlight, Mission Control,
  input-source switching, Zoom/Teams/Meet mute…).
- **Different shortcut on release** — e.g. ⌘A when pressed, ⌘C when released.
- **Text & sequences** — type a string, or build a key sequence with a delay
  and repeat count.
- **Media keys** — play/pause, tracks, volume, brightness, eject, plus the
  Windows-oriented ones from the vendor app, or any consumer usage up to `0x23C`.
- **Lighting** — eight effects and a colour.
- **Profiles** — export/import JSON; the last saved profile is remembered per pad.
- **Key tester** — see what the pad sends without leaving the page.
- Memory meter: USB pads have 124 bytes for all keys, and long sequences use it up.

## Things to know

- The pad can't report its current settings. The site shows what this browser
  last saved to that pad, or the factory mapping (A, B, …) if it never saved.
- In a sequence, modifier steps (⌘, ⇧ …) are tapped on their own; they don't
  combine with the next key. Use a Shortcut for ⌘C and friends.
- The pad types keys, not characters: text assumes a US/ABC layout, and only
  characters on a US keyboard can be typed. Switch macOS to the ABC input
  source first — with a Chinese input method on, letters go into the IME.
- Some shortcuts never reach the page while recording (⌘Tab, ⌘Space, ⌘Q, ⌘W…).
  Use the presets or the key list for those.
- F13–F20 are handy for custom shortcuts; macOS usually ignores F21–F24.
- Bluetooth models and "repeat forever" follow the vendor app's protocol but
  haven't been tested on hardware.

## Command line (optional)

`tools/xfkey.mjs` uses the same protocol code over `node-hid`:

```bash
npm install                                   # installs node-hid
node tools/xfkey.mjs info                     # model, key count, ID
node tools/xfkey.mjs bytes profile.json       # show what would be sent
node tools/xfkey.mjs save profile.json        # write a profile exported from the site
```

## Development

```bash
npm test
```

The tests compare every packet with a port of the vendor's own encoder
(`test/reference.mjs`). The protocol is documented in
[docs/PROTOCOL.md](docs/PROTOCOL.md).

| Path | |
|---|---|
| `src/protocol.js` | Packet encoding, shared by browser and Node |
| `src/client.js` | Request/ack loop over any transport |
| `src/transports.js` | WebHID transport (padded reports, timeouts, serialized requests) and the demo pad |
| `src/hid-usages.js` | Key, modifier and media tables with macOS labels |
| `src/models.js` | Pad models and layouts |
| `src/app.js`, `src/components/` | The UI (Preact + htm, no build step) |
| `vendor/preact-htm.js` | htm 3.1.1 standalone build (Preact + hooks + htm) |

## License

MIT — see [LICENSE](LICENSE). The vendored htm/Preact build keeps its own
licenses (`vendor/LICENSE-htm.txt`, `vendor/LICENSE-preact.txt`).

Unofficial; not affiliated with the pad's manufacturer.
