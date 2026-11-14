# Built-in extension sources

Imported on 2026-11-06 from the user's existing Aijite IDE checkout. This tree is versioned application input; preparation and the shipped site never read that checkout.

| Local path | Original path relative to `aijite-editor-release/aijite-editor-release/packages` | Accompanying license |
| --- | --- | --- |
| `extensions/{activateBuzzer,atomizer,pirSensor,flameSensor,raindropSensor,moreComments}/` | `external-resources-v3/extensions/<same ID>/` | `extensions/LICENSE` — MIT, OpenBlock.cc 2021 |
| `aijite/aijiteEsp32S3.original.cjs` | `aijite-vm/src/devices/aijiteEsp32S3/aijiteEsp32S3.js` | `aijite/LICENSE.vm` — MIT, OpenBlock.cc 2022 |
| `aijite/aijiteEsp32S3.png` | `aijite-gui/src/lib/libraries/devices/aijiteEsp32S3/aijiteEsp32S3.png` | `aijite/LICENSE.gui` — MIT, OpenBlock.cc 2022; `aijite/LICENSE.MIT.gui` contains BSD 3-Clause text, MIT 2016 |

Module images retain their original `assets/<id>.png` paths. The old module directories did not supply individual image attribution; these are the accompanying repository licenses, not a claim of independent verification of every photograph's creator. No Mind+ source code or images were copied. `source-hashes.json` records the exact copied inputs.

The original classic scripts are preserved verbatim. Preparation converts the buzzer RGB colour spelling to its identical hex value for the pinned Blockly parser; the runtime chooses valid board defaults only for new toolbox blocks. `scripts/openblock-hooks.mjs` removes their `exports`/CommonJS scaffolding and emits independent ESM functions during preparation; it does not execute `index.js` as a browser plugin. The unused old `activateBuzzer` `library: 'lib'` declaration is not included in the live catalog because no such library is used or present. Only `activateBuzzer` is registered; `activeBuzzer` is excluded to avoid colliding opcodes.

The adapter in `src/extensions/aijite.ts` reuses the official ESP32-S3 base and ports the original IO3 filters. No old VM engine, serializer, board compiler or resource server is included.

Hardware v0.2 adds an external FireBeetle ESP32-E description derived from the pinned official ordinary ESP32 class. The board label to GPIO facts are documented in `docs/design/hardware-frontend.md`; no Mind+ `main.js`, firmware, artwork or runtime was copied. Its current icon intentionally reuses the official generic ESP32 asset, rather than asserting a photograph of the user's physical board. Build-time `device-descriptions.json` is derived from the integrity-checked official GUI source map, records each description/enumeration source SHA-256 and retains the shipped upstream license files. Original VM modules and source map are never patched; `openblock-hooks.mjs` now rejects any non-GUI hook source.
