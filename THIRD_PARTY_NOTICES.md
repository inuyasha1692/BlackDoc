# Third-party notices

BlackDoc includes or redistributes third-party software and assets. They remain under their respective licenses; the GPL-3.0-only license for BlackDoc does not replace those terms. Versions and dependency relationships are recorded in `package-lock.json` and `src-tauri/Cargo.lock`. The Windows build's third-party license text snapshot and package index are in [`third_party_licenses/`](third_party_licenses/INDEX.tsv).

## Frontend components

| Component | Version | Declared license |
| --- | ---: | --- |
| BlockNote core, React, Mantine, diagram and math packages | 0.54.2 | MPL-2.0 |
| `@blocknote/xl-multi-column` | 0.54.0 | GPL-3.0 OR PROPRIETARY; BlackDoc uses the GPL-3.0 option |
| Excalidraw | 0.18.1 | MIT |
| Mantine | 9.6.2 | MIT |
| React / React DOM | 19.3.0 | MIT |
| Tauri JavaScript API | 2.11.1 | Apache-2.0 OR MIT |
| Tauri updater JavaScript plugin | 2.12.0 | MIT OR Apache-2.0 |
| Tiptap find-and-replace | 3.31.3 | MIT |
| Lucide React | 1.47.0 | ISC |

The frontend also bundles fonts distributed with Excalidraw, including Excalifont, Xiaolai, Virgil, Assistant, Cascadia, Comic Shanns, Liberation, Lilita and Nunito. Each font retains its own license and attribution requirements. Excalifont identifies SIL Open Font License 1.1 in its upstream source.

## Rust components

The Windows desktop build includes Tauri and its dialog, opener, single-instance and updater plugins (Apache-2.0 OR MIT). Other direct Rust dependencies are recorded with their declared licenses in `src-tauri/Cargo.lock`; most use MIT OR Apache-2.0. The lockfile is the version record for the build.

## License texts and scope

This file is a license summary, not a replacement for the license texts. The current lockfiles contain 308 production npm package versions and 311 Windows Rust crate versions; collected license files cover 268 npm packages and 299 Rust crates. The remaining 52 dependency entries have no root license file in the installed package or crate source and are listed in [`MISSING_LICENSE_FILES.tsv`](third_party_licenses/MISSING_LICENSE_FILES.tsv). Verify and add their upstream notices before distributing a new binary. This includes bundled fonts and transitive components. Refresh this snapshot whenever dependencies change.

The sample `.bdoc` document and screenshots are project materials, not software dependencies. Their authorship and any embedded third-party material should be checked separately before redistribution.
