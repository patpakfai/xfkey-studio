# XFKEY Studio

A Mac-friendly web configurator for small USB macro pads. It talks to the pad
directly from Chrome using WebHID — no drivers, no vendor app.

| Pad | USB ID | Chrome lists it as | Status |
|---|---|---|---|
| **XFKEY** (vendor configurator `xuanfang.co/xfp-web`) | `AF88:6688` | XFKEY | Supported |
| **CH57x** "MINI_KEYBOARD" pads | `514C:8850` | USB Composite Device | 1-key pad tested; other layouts experimental |
| Other CH57x versions | `1189:8840/8842/8850/8851/8890`, `514C:8851` | USB Composite Device | Recognized, not supported yet |

Settings are stored on the pad, so it keeps working on any computer afterwards.

**Use it online: <https://patpakfai.github.io/xfkey-studio/>**

## Use it

Open the site in **Google Chrome** (or Edge, Brave, Arc, Opera — Safari and
Firefox don't support WebHID) and click **Find my keyboard**. Pick your pad in
Chrome's list; the site works out which model it is and lists it under
**Keyboards found**. Click **Customize**, edit the keys and press **Save to
keyboard**. Pads you allowed before are listed straight away.

No pad at hand? Try the editor against simulated pads:
<https://patpakfai.github.io/xfkey-studio/?demo> lists a 2-key XFKEY and a
1-key CH57x pad. Pick others with a list, e.g. `?demo=12-18,ch57x-12-2`
(XFKEY `<keys>-<variant>`, CH57x `ch57x-<keys>[-<knobs>]`, `ch57x-other` for an
unsupported one).

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
- **Lighting** — eight effects and a colour (XFKEY).
- **Profiles** — export/import JSON; the last saved XFKEY profile is remembered per pad.
- **Key tester** — see what the pad sends without leaving the page.
- Memory meter: XFKEY USB pads have 124 bytes for all keys, and long sequences use it up.

CH57x pads differ:

- The site **reads the keys back** from the pad, so the editor opens with what
  the pad really holds, and every save is read back and checked.
- Up to **18 steps per key**. Each modifier and each ⇧ capital takes a step.
- A modifier step is held for the next key (⌘ then C sends ⌘C).
- One key per shortcut, no "different shortcut on release", no repeat, no
  lighting control (no command for it is known).
- These pads have three layers; the site writes every key to all three.
- A key set by the vendor app to something the site can't edit (e.g. a mouse
  action) is kept byte for byte when you save.

## Things to know

- XFKEY pads can't report their current settings. The site shows what this
  browser last saved to that pad, or the factory mapping (A, B, …) if it never saved.
- On XFKEY pads, modifier steps (⌘, ⇧ …) in a sequence are tapped on their own;
  they don't combine with the next key. Use a Shortcut for ⌘C and friends.
- Many small pads don't power up on a USB-C to USB-C cable; use USB-A to USB-C.
- The pad types keys, not characters: text assumes a US/ABC layout, and only
  characters on a US keyboard can be typed. Switch macOS to the ABC input
  source first — with a Chinese input method on, letters go into the IME.
- Some shortcuts never reach the page while recording (⌘Tab, ⌘Space, ⌘Q, ⌘W…).
  Use the presets or the key list for those.
- F13–F20 are handy for custom shortcuts; macOS usually ignores F21–F24.
- XFKEY Bluetooth models and "repeat forever" follow the vendor app's protocol but
  haven't been tested on hardware. Neither have CH57x layouts other than the
  1-key pad, or the CH57x per-step delay.

## Command line (optional)

`tools/xfkey.mjs` uses the same protocol code over `node-hid`:

```bash
npm install                                   # installs node-hid
node tools/xfkey.mjs info                     # family, model, key count
node tools/xfkey.mjs read > profile.json      # CH57x: save what the pad holds as a profile
node tools/xfkey.mjs bytes profile.json       # show what would be sent
node tools/xfkey.mjs save profile.json        # write a profile exported from the site
```

## Development

```bash
npm test
```

The XFKEY tests compare every packet with a port of the vendor's own encoder
(`test/reference.mjs`); the CH57x tests use bytes captured from real pads. Both
protocols are documented in [docs/PROTOCOL.md](docs/PROTOCOL.md).

| Path | |
|---|---|
| `src/protocol.js` | XFKEY packet encoding, shared by browser and Node |
| `src/ch57x-protocol.js` | CH57x identify / read / write records |
| `src/client.js` | XFKEY request/ack loop and CH57x write/read-back over any transport |
| `src/drivers.js` | Supported pads: USB filters, identify, load / save sessions, demo pads |
| `src/transports.js` | WebHID transport (report IDs, padded reports, timeouts, serialized requests) and the demo pads |
| `src/hid-usages.js` | Key, modifier and media tables with macOS labels |
| `src/models.js` | Pad models, layouts and what each family can do |
| `src/app.js`, `src/components/` | The UI (Preact + htm, no build step) |
| `vendor/preact-htm.js` | htm 3.1.1 standalone build (Preact + hooks + htm) |

## License

MIT — see [LICENSE](LICENSE). The vendored htm/Preact build keeps its own
licenses (`vendor/LICENSE-htm.txt`, `vendor/LICENSE-preact.txt`).

Unofficial; not affiliated with the pads' manufacturers. CH57x support builds on
[ch57x-keyboard-tool](https://github.com/kriomant/ch57x-keyboard-tool) (MIT).
