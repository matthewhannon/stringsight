# alphaTab 1.8.4 source and license notice

StringSight includes alphaTab 1.8.4 as a replaceable notation and bounded import adapter. The
alphaTab player remains disabled, no soundfont is configured, and no synthesis bank is distributed.

- Copyright: Daniel Kuschny and contributors
- License: Mozilla Public License 2.0
- Package: `@coderline/alphatab@1.8.4`
- Exact upstream commit: `022a45c8e42370f9e12e68949d11eada370da83d`
- Exact upstream tree: `a13f13b60ea8b16b654a8c472c1b5826ef6b4c8f`
- Covered Software modification status: unmodified
- Preferred Source Code Form:
  `/open-source/alphatab-1.8.4/alphatab-1.8.4-source.tar`
- Sanitized source archive bytes: `67636224`
- Sanitized source archive SHA-256:
  `04766fe8ac5228889dfc5519fb17e2ed2af6eee4657dbce1cb05f4c56a88d518`
- Canonical member manifest: `/open-source/alphatab-1.8.4/source-members.json`
- Member manifest SHA-256:
  `2eff922935df9f5a5566e042f71edcef093203f6d42996a1e1ed2f14d599d6bf`
- MPL-2.0 text: `/open-source/alphatab-1.8.4/LICENSE-MPL-2.0.txt`
- Integrated-library notices: `/open-source/alphatab-1.8.4/THIRD_PARTY_NOTICES.txt`
- SBOM: `/open-source/alphatab-1.8.4/SBOM.json`

The alphaTab executable is distributed as part of a Larger Work. The alphaTab Covered Software is
available under MPL-2.0 at the Source Code Form location above. StringSight-owned adapter files are
not modifications of alphaTab Covered Software.

## Source-package sanitization

The published source tar preserves every retained upstream tar member exactly and removes 30 tar
members, all and only beneath these declared non-source audio prefixes:

- `packages/alphatab/font/sonivox/**`
- `packages/alphatab/test-data/audio/**`

These removals include the SONiVOX banks and upstream audio/test fixtures. They do not alter any
alphaTab Covered Software source file. The exact received archive is retained as internal
provenance evidence only: 92,037,120 bytes, SHA-256
`7cd6442dfaff5de12cb4bd621d626c60369ce65217ab5ed8276bdd7288387214`. It is not the public source
download because it contains the excluded payloads.

## Bravura font

StringSight distributes the exact unmodified Bravura 1.38 WOFF2 asset from alphaTab's accepted
source at upstream Bravura commit `f97d82af70bbbfde5808b4119018dbe5553e620c`.

- Copyright © 2015, Steinberg Media Technologies GmbH
- License: SIL Open Font License 1.1
- Reserved Font Name: Bravura
- OFL text: `/open-source/alphatab-1.8.4/Bravura-OFL.txt`
- FONTLOG: `/open-source/alphatab-1.8.4/Bravura-FONTLOG.txt`

No endorsement by Steinberg Media Technologies GmbH is stated or implied.

## Post-deploy verification

Status: GATED — the release job must populate and verify every field below after immutable hosting.

- immutable hosted URL: not populated before deployment
- fetched byte count: not populated before deployment
- fetched SHA-256: not populated before deployment
- fetched member-manifest SHA-256: not populated before deployment
- verification timestamp: not populated before deployment

The source archive and notices must remain available for every StringSight release that makes the
corresponding alphaTab executable available.
