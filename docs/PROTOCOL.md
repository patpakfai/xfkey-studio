# Pad configuration protocols

XFKEY pads come first; CH57x pads (514C:8850) are [further down](#ch57x-pads-514c8850).

## XFKEY

Reverse-engineered from the vendor's web configurator
(<https://xuanfang.co/xfp-web/>, bundle `assets/js/app.8e792937.js`) and checked
against a real 2-key pad on macOS. `src/protocol.js` implements it, and
`test/reference.mjs` keeps a port of the vendor's encoder so the tests can
compare our packets with theirs byte for byte.

### Device

| | |
|---|---|
| USB IDs | VID `0xAF88`, PID `0x6688` |
| Strings | manufacturer `XFFP`, product `XFKEY`, serial `XFKEY` (same on every unit) |
| Interfaces | 0: keyboard (boot, 6KRO) · 1: mouse (report IDs 1, 2) · 2: consumer control (report ID 5, one 16-bit usage, max `0x23C`) · 3: **config** |
| Config interface | usage page `0xFF00`, usage `0x01`, 64-byte input and output reports, no report IDs |

WebHID can open the config interface on macOS, Windows and Linux (it is not on
Chrome's blocklist). Filter with `{ vendorId: 0xAF88, productId: 0x6688, usagePage: 0xFF00 }`.

### Framing

Every request is one output report starting with `0xAF`. The pad answers every
request with one input report:

- byte 0 is `0xAF` on success (the vendor site checks only this byte);
- byte 1 echoes the command;
- for `WRITE` the reply echoes the request bytes.

Requests are short, but we zero-pad them to 64 bytes, which is what Chrome on
Windows sends. The pad also accepts unpadded reports on macOS.

### Commands

| Bytes | Meaning |
|---|---|
| `AF 01` | Info. Reply `AF 01 <keyCount> <variant> <id0..id5>`. Bytes 4–9 differ per unit (chip ID?) |
| `AF 02 <offset> <len> <data…>` | Write part of the config block (USB models) |
| `AF 04` | Commit: store the config block in flash (USB models) |
| `AF 0D 00 <mode> <r> <g> <b> 00` | Lighting (Bluetooth models) |
| `AF 09 <slot> …`, `AF 02 <slot> …`, `AF 04 <slot> …` | Per-key header / data / finish (Bluetooth models) |

There is no known command to read the configuration back.

`keyCount` + `variant` select the model; see `src/models.js` for the table.
Variant `4` marks the Bluetooth models (`1-4`, `2-4`, `3-4`), which use the
per-key protocol. Everything else uses the USB block protocol.

### USB models: the 128-byte config block

Sent as `AF 02 00 3C <bytes 0–59>`, `AF 02 3C 3C <bytes 60–119>`,
`AF 02 78 08 <bytes 120–127>`, then `AF 04`.

| Bytes | Content |
|---|---|
| 0–123 | Key entries, back to back, key 1 first; unused bytes are 0 |
| 124 | Lighting mode |
| 125–127 | Lighting colour R, G, B |

The vendor site doesn't check the 124-byte limit and lets long macros overwrite
the lighting bytes; XFKEY Studio refuses to save instead.

#### Key entries

| Action | Bytes |
|---|---|
| Nothing | `00 00 00 00` |
| Shortcut on press | `00 01 <mods> <n> <key1..keyN>` |
| Shortcut on release | `00 02 <mods> <n> <key1..keyN>` |
| Press + release | `00 03 <mods> <n> <keys…> <mods2> <n2> <keys2…>` |
| Media | `02 <usage lo> <usage hi>` (consumer page `0x0C`) |
| Sequence | `03 <delay hi> <delay lo> <repeat> <n> <step1..stepN>` |

- `mods` is the usual HID modifier byte: `01` LCtrl, `02` LShift, `04` LAlt,
  `08` LGUI (⌘), `10` RCtrl, `20` RShift, `40` RAlt, `80` RGUI.
- Keys are keyboard-page usages (`04` = A … `73` = F24); up to 6 per shortcut.
- Sequence delay is in milliseconds (big-endian); `repeat` 0 means forever
  (untested).

#### Sequence steps

| Step | Meaning |
|---|---|
| `01`–`7F` | Tap that key |
| usage + `80` (for usages ≤ `38`) | Tap the key with Shift held, e.g. `84` = `A`, `9E` = `!` |
| `C9`–`D0` (201–208) | Tap LCtrl, LShift, LAlt, LGUI, RCtrl, RShift, RAlt, RGUI on its own |

Verified on hardware: `[CA, 05, 06, 9E]` types `bc!` — the modifier step is
pressed and released by itself and does not combine with the next step.

### Bluetooth models (not verified on hardware)

```
AF 0D 00 <mode> <r> <g> <b> 00                       lighting
for each key slot s = 1..N:
  shortcut:  AF 09 s <mods> 00 00 00 00 | AF 02 s 00 0F <15-byte key bitmap> | AF 04 s 00 01 01
  media:     AF 09 s 02 00 00 00 00     | AF 02 s 00 02 <lo> <hi>          | AF 04 s 02 02 01
  special:   AF 09 s 00 00 00 00 00     | AF 02 s 00 01 <code>             | AF 04 s 04 01 01
  sequence:  AF 09 s 00 00 00 <dh> <dl> | AF 02 s <offset> <len> <≤32 steps>… | AF 04 s 03 <n> <repeat>
```

The key bitmap sets bit `usage & 7` of byte `usage >> 3`. Bluetooth models
can't trigger on release. Special codes: 6/7 next/previous page, 2–5 swipe
up/down/left/right (iPhone), 8–11 the same for Android.

### Lighting modes

| Value | Effect | Uses colour |
|---|---|---|
| 1 | Rainbow cycle | |
| 2 | Solid colour | ✓ |
| 3 | Colour flow | ✓ |
| 4 | Flash on press | ✓ |
| 5 | Neon flow | |
| 6 | Off | |
| 7 | Light while pressed | ✓ |
| 8 | Toggle on press | ✓ |

### Why the vendor site struggles on a Mac

The vendor site already uses WebHID, so it isn't Windows-only by design. Things
that go wrong:

- Safari and Firefox don't implement WebHID; the site only says to use 360,
  Edge or Chrome.
- It calls `sendReport()` and only then installs `oninputreport`, so a fast
  reply can be missed and the "saving" overlay never closes.
- The download section only links the Windows app.

## CH57x pads (514C:8850)

The "MINI_KEYBOARD" pads sold with a Windows app. Several protocol versions
exist under USB vendor IDs `0x1189` and `0x514C`; this site supports the one
on `514C:8850`, which ch57x-keyboard-tool calls `k8850` and macropad-rebind
calls `ch57x-3`. Write format from
[ch57x-keyboard-tool](https://github.com/kriomant/ch57x-keyboard-tool)'s
`k8850_4x4.rs` (MIT; built from USB captures of the vendor app, issue #153).
Identify, read-back, the modifier behaviour and the 1-key layout were checked
on a real 1-key pad on macOS. `src/ch57x-protocol.js` implements it.

### Device

| | |
|---|---|
| USB IDs | VID `0x514C`, PID `0x8850`; product "USB Composite Device", no manufacturer string |
| Interfaces | 0: **config** · 1: keyboard (report IDs 1, 4), mouse (2), consumer control (5, max usage `0x2FF`) |
| Config interface | usage page `0xFF00`, usage `0x01`, report ID 3, 64-byte input and output reports |

Filter with `{ vendorId: 0x514C, productId: 0x8850, usagePage: 0xFF00 }`.
Offsets below exclude the report ID (WebHID strips it; hidapi on macOS puts it
in front of input reports).

### Commands

| Request | Reply |
|---|---|
| `FB FB FB` identify | `FB <keys> <knobs> ??` — the 1-key pad answers `FB 01 00 0B` |
| `FA <keys> <knobs> <layer>` read one layer (1–3) | one record per slot, see below |
| `FD <slot> <layer> <type> …` write one record | none |
| `FD FE FF` commit | none |

Every record is followed by a commit. The pad never acknowledges writes, so
the site reads every layer back after saving and compares.

Never send `0xEF` (enters the bootloader; there is no firmware image to recover
with) or `0xFC` (sets the key/knob geometry; a wrong value makes a working pad
look broken). Both are documented by
[macropad-rebind](https://github.com/jvspier/macropad-rebind/blob/main/docs/PROTOCOL.md).

### Records

Reads and writes share one layout; only byte 0 differs (`FA` read, `FD` write).

| Bytes | Content |
|---|---|
| 0 | `FA` / `FD` |
| 1 | slot: keys `1`–`16`, then knob *n* (0-based) at `17 + 3n` + 0 ⟲, 1 press, 2 ⟳ |
| 2 | layer, 1-based |
| 3 | type: `1` keyboard, `2` media, `3` mouse |
| 4 | `00` when written; the factory records read back `01` |
| 5 | entry count (≥ 1; at most 18 are stored) |
| 6… | 3-byte entries: delay in ms (big-endian), then a code |

- **Keyboard**: codes are keyboard-page usages, or `F1`–`F8` for LCtrl, LShift,
  LAlt, LGui, RCtrl, RShift, RAlt, RGui. A modifier entry is held for the next
  key: `00 00 F2 | 00 00 04` types "A" (verified). A key that does nothing is
  one entry `00 00 00`.
- **Media**: two entries, the consumer usage's low then high byte:
  `02 00 02 | 00 00 lo | 00 00 hi`.
- **Mouse**: bytes 4 + 5 together count five entries (modifier, buttons, x, y,
  wheel). The site doesn't edit mouse records; it keeps them byte for byte.

Factory state of the 1-key pad: `FA 01 <layer> 01 01 01 00 00 28` (Return) on
all three layers. The per-entry delay is written but not yet verified on
hardware.

### Telling protocol versions apart

Other CH57x versions keep the entry count at byte 9 and leave byte 5 at 0, so
their records fail the layout check above. The site reads layer 1 before
showing the editor and refuses to write to a pad whose records don't match:
macropad-rebind reports that sending the wrong version's records is accepted
without error and leaves the keys dead (see also ch57x-keyboard-tool #194, a
12-key 514C:8850 pad).
