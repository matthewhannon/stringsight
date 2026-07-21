# Candidate alphaTab 1.8.4 release notice

> Template only. Replace every bracketed field, verify all copied files and URLs, and obtain the
> owner approvals recorded in the release-gate resolution before shipping.

## alphaTab

This product includes alphaTab 1.8.4.

- Copyright: Daniel Kuschny and contributors
- License: Mozilla Public License 2.0
- Exact upstream commit: `022a45c8e42370f9e12e68949d11eada370da83d`
- Source tree: `a13f13b60ea8b16b654a8c472c1b5826ef6b4c8f`
- Preferred Source Code Form: `[IMMUTABLE_PUBLIC_SOURCE_URL]`
- Source archive SHA-256:
  `7cd6442dfaff5de12cb4bd621d626c60369ce65217ab5ed8276bdd7288387214`
- Modification status: `[UNMODIFIED | MODIFIED—SEE MODIFICATION MANIFEST URL]`
- MPL-2.0 text: `[SHIPPED_RELATIVE_PATH_OR_IMMUTABLE_URL]`

The alphaTab executable is distributed as part of a Larger Work. The alphaTab Covered Software is
available under MPL-2.0 at the Source Code Form location above.

## Integrated code notices

The alphaTab executable incorporates or adapts these works. The release notice bundle must include
the complete license text, not only this table.

| Work                  | Notice                                                      | License      | Full-text file in release |
| --------------------- | ----------------------------------------------------------- | ------------ | ------------------------- |
| TinySoundFont         | Copyright (C) 2017-2018 Bernhard Schelling; based on SFZero | MIT          | `[PATH]`                  |
| SFZero                | Copyright (C) 2012 Steve Folta                              | MIT          | `[PATH]`                  |
| Haxe Standard Library | Copyright (C) 2005-2025 Haxe Foundation                     | MIT          | `[PATH]`                  |
| SharpZipLib           | Copyright © 2000-2018 SharpZipLib Contributors              | MIT          | `[PATH]`                  |
| NVorbis               | Copyright (c) 2020 Andrew Ward                              | MIT          | `[PATH]`                  |
| libvorbis             | Copyright (c) 2002-2020 Xiph.org Foundation                 | BSD-3-Clause | `[PATH]`                  |

The authoritative received source is the adapted source in the exact alphaTab commit above.
Original upstream revision candidates are recorded in
`license-audit-baseline.json`; alphaTab did not record confirmed original upstream commit IDs.

## Bravura font

This product bundles unmodified Bravura 1.38 font files from upstream commit
`f97d82af70bbbfde5808b4119018dbe5553e620c`.

- Copyright © 2015, Steinberg Media Technologies GmbH
- License: SIL Open Font License 1.1
- Reserved Font Name: `Bravura`
- OFL text: `[SHIPPED_PATH_TO_BRAVURA_OFL.txt]`
- FONTLOG: `[SHIPPED_PATH_TO_BRAVURA_FONTLOG.txt]`

No endorsement by Steinberg Media Technologies GmbH is stated or implied.

## Explicit exclusions

This release does **not** distribute alphaTab's packaged SONiVOX `sonivox.sf2` or `sonivox.sf3`
files. `[IDENTIFY_ANY_SEPARATELY_AUDITED_REPLACEMENT_BANK_OR_STATE_NO_SYNTHESIS_BANK_SHIPS]`.

## Release verification record

- Product version/build: `[PRODUCT_VERSION]`
- Browser artifact SHA-256: `[SHA256]`
- SBOM URL/path: `[SBOM]`
- Third-party notice bundle SHA-256: `[SHA256]`
- Source URL availability checked at: `[UTC_TIMESTAMP]`
- Source URL response hash verified by: `[RELEASE_JOB_OR_OWNER]`
- Final artifact SONiVOX scan result: `[PASS]`
- Final Bravura hash scan result: `[PASS]`
- alphaTab clean-build comparison result: `[PASS_WITH_ONLY_DOCUMENTED_TIMESTAMP_VARIANCE]`
