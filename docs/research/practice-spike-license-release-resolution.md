# Practice spike release-gate resolution

- **Status:** Retained spike-time engineering resolution; owner gates subsequently resolved by ADR
  0007; release execution checks remain open
- **Audited:** 2026-07-20
- **Package:** `@coderline/alphatab@1.8.4`
- **Source commit:** `022a45c8e42370f9e12e68949d11eada370da83d`
- **Platform:** Windows/browser distribution only; macOS is out of scope
- **Constraint:** No production code or manifest was changed
- **Not legal advice:** This is an engineering provenance and release-control record

In the disposable spike, this document supplemented `practice-spike-license-provenance-audit.md`.
It records what primary evidence resolved and does not turn an owner/legal gate into an engineering
approval. ADR 0007 subsequently accepts the bounded MPL/source profile and synthesis omission; the
unchecked release tasks below still apply when alphaTab is actually installed and distributed.

## Outcome

alphaTab notation and import can be shipped without either bundled SONiVOX bank. Player creation is
disabled by default, the soundfont setting is `null`, loading a bank is an explicit player action,
and none of the published JavaScript files contains a hard-coded reference to `sonivox`,
`dist/soundfont`, or `soundfont/sonivox`. The banks are separately exported package files copied by
the upstream build; they are not imported into the executable modules.

The release disposition is therefore:

| Candidate or asset                                                 | Engineering state                    | Release disposition                                                                                                                                    |
| ------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| alphaTab notation/import, player disabled, no bank copied          | **Technically cleared**              | **Owner-gated** on accepting MPL-2.0 and executing the source/notice procedure below                                                                   |
| alphaSynth code with no bundled bank                               | **Technically feasible**             | **Owner-gated**; still MPL-covered and not a usable production synth until a bank is selected                                                          |
| Packaged `sonivox.sf2` / `sonivox.sf3`                             | Technically optional                 | **Omit**; exact sample rights remain unproved                                                                                                          |
| Separately sourced replacement soundfont                           | Not selected                         | **Owner/legal-gated** until exact bytes, samples, authors, license, attribution, and modification history pass audit                                   |
| Exact unmodified Bravura 1.38 assets                               | **Provenance-cleared**               | Ship only with the pinned OFL and FONTLOG notice set                                                                                                   |
| Subset, converted, rebuilt, renamed, or otherwise modified Bravura | Not needed for the baseline          | **Omit** unless separately reviewed; `Bravura` is a Reserved Font Name                                                                                 |
| alphaTab's embedded MIT/BSD code                                   | Exact received source is pinned      | **Owner-gated** on accepting the alphaTab commit as authoritative received source where upstream revision was not recorded; ship reconstructed notices |
| `vexflow@5.0.0` fallback                                           | Package snapshot pinned only         | **Owner/legal-gated** pending its embedded-font audit and technical fit                                                                                |
| `opensheetmusicdisplay@2.0.0` fallback                             | Package/closure snapshot pinned only | **Owner/legal-gated** pending exact browser distribution graph, notices, and technical fit                                                             |

No primary evidence found supports distributing the packaged SONiVOX bytes. Their omission is a
complete technical path for notation/import and is the recommended release baseline.

## 1. Soundfont-free alphaTab path

The pinned source provides four independent controls:

1. `PlayerSettings.soundFont` defaults to `null`.
2. `PlayerSettings.playerMode` defaults to `PlayerMode.Disabled`.
3. `AlphaTabApiBase` creates a player only when the mode is not disabled.
4. `BrowserUiFacade` loads a configured soundfont URL only after the player becomes ready and only
   when the setting is non-null.

The package manifest exports `./soundfont/*` separately. Its Vite build uses a static-copy rule to
copy `font/sonivox/*` to `dist/soundfont`; no source module imports those files. A case-insensitive
scan of every published `.js` and `.mjs` returned zero references to the bank names or directory.

For a browser release, installing the npm package and copying the published package tarball are
different distribution acts technically. The production browser artifact can omit the bank even
though a build machine's npm cache or `node_modules` contains it. The final release check must scan
the actual hosted bundle/public tree, not infer scope from `npm ls`.

Required implementation/release controls:

- keep `playerMode: Disabled` for the notation/import baseline;
- do not import `@coderline/alphatab/soundfont/*`;
- do not configure a URL to either SONiVOX file;
- configure the asset-copy step to include only the selected Bravura formats and notices;
- prohibit packaging `node_modules`, npm tarballs, `dist/soundfont`, `.sf2`, or `.sf3` in the hosted
  artifact; and
- fail the final artifact scan if either recorded SONiVOX SHA-256 is present.

This clears omission of the sample banks. It does not remove alphaSynth implementation code from
the general alphaTab bundle, change that code's MPL status, or prove tree-shaking of synth code.

## 2. SONiVOX disposition and replacement requirements

The exact bank hashes remain those in the baseline. The pinned upstream README says the bank was
assembled from several phone/Android sources, a Creative Sound Blaster GM bank copied from floppy,
and a user-uploaded Musical Artifacts item. The adjacent Apache-2.0 SONiVOX notice establishes the
license of an AOSP software component, not the rights chain of every sample byte in these banks.

Primary evidence therefore supports only two paths:

- **Omit:** cleared and sufficient for notation/import.
- **Replace:** allowed only after a new audit records the original authoritative download URL,
  exact file hash, version/revision, every sample source and contributor grant, redistribution and
  modification terms, required attribution, and any conversion/build recipe.

Renaming or transcoding the current files is not a replacement because it does not repair their
source chain. A private developer-supplied bank may be used for non-distributed synthesis testing,
but it must not be copied into a public build or test fixture without its own distribution review.

## 3. Bravura exact provenance and release controls

The alphaTab source assets are exact Git-blob matches to upstream Bravura commit
`f97d82af70bbbfde5808b4119018dbe5553e620c`, dated 2020-06-25 and labeled Bravura 1.38, for:

- `Bravura.eot`
- `Bravura.otf`
- `Bravura.svg`
- `Bravura.woff`
- `Bravura.woff2`
- `Bravura-FONTLOG.txt`

The pinned OFL text has copyright `2015, Steinberg Media Technologies GmbH` and Reserved Font Name
`Bravura`. The exact unmodified files may be treated as the Original Version identified by that
upstream release. The safe release package preserves `Bravura-OFL.txt` and
`Bravura-FONTLOG.txt`, identifies the files as OFL-1.1 in the SBOM, and does not present Steinberg as
endorsing StringSight.

Subsetting, format conversion, glyph edits, hinting changes, metadata changes, or reconstruction
creates a modified-font question. The baseline should not do any of those. If a later optimization
requires them, use a non-reserved primary font name unless written permission supports the reserved
name, keep the result under OFL-1.1, and create a new exact provenance record.

Windows line-ending conversion changes the SVG and text-file bytes. A release checkout must set
`core.autocrlf=false` before checkout so the copied webfont and notice files remain identical to the
pinned upstream blobs.

## 4. Embedded-library reconstruction

alphaTab records origins and full per-file notices but not original upstream commit IDs. Repository
history establishes exact alphaTab introduction commits and bounds the possible upstream source.
It does not prove which upstream checkout the porter used. The following table intentionally calls
those revisions **bounded candidates**, not confirmed origins.

| Library               | Exact alphaTab introduction                                                      | Nearest upstream commit available before introduction                                   | Notice reconstruction                                              |
| --------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| TinySoundFont         | `d6fb0df5530da2280f0b14156de71400a7e0c918` (2019-08-27)                          | `d4ffcdc8a34d3f61f22e4b283b4c100f5adf4b82` (2019-06-06)                                 | MIT, Bernhard Schelling 2017-2018; its license also credits SFZero |
| SFZero                | inherited through the same alphaTab port                                         | `90ee4819988345299f73a6fb6076dfc13f2d4200` (2016-07-25)                                 | MIT, Steve Folta 2012                                              |
| Haxe standard library | XML first appears in `6b84a47c...`; TypeScript/Inflate received in `a1568068...` | `4ab1546158e00445fee178318dd0e843e6b49974` immediately before the 2020 TypeScript merge | MIT, Haxe Foundation; retain alphaTab's received 2005-2025 notice  |
| SharpZipLib           | `7e5a7a5039426a1bbbd4d49694c32ac998fa758e` (2020-12-30)                          | `fec479c2e1a2c7cd58ba8319450901fe40eb070f` (2020-12-19)                                 | MIT, SharpZipLib Contributors 2000-2018                            |
| NVorbis               | `a489bd2cdc26d1dd153c478f47d735b660e24453` (2025-01-13)                          | `432d100f83ee9322b40c0ba25daed2fe72fbbdd2` (2024-03-29)                                 | MIT, Andrew Ward 2020                                              |
| libvorbis             | nested through the NVorbis-derived decoder in the same alphaTab commit           | `bb4047de4c05712bf1fd49b9584c360b8e4e0adf` before integration                           | BSD-3-Clause, Xiph.org Foundation 2002-2020                        |

The exact, auditable received source for all six is the adapted source in alphaTab commit
`022a45c...`. That commit contains the code actually compiled and the origin headers. Full MIT and
BSD-3-Clause texts can be reconstructed from the upstream license blobs recorded in
`license-audit-baseline.json`; they should be included in the shipped third-party notice bundle.

What remains unresolvable from primary public evidence is the original upstream checkout used by
each porter. No alphaTab commit, PR message, tag, submodule, lockfile, or file header records those
SHAs. Do not relabel the bounded candidates as exact. The owner must decide whether ADR 0005 accepts
the exact received alphaTab source plus bounded origin evidence, or requires upstream confirmation.

## 5. Reproducible MPL Source Code Form and clean-build procedure

The canonical Source Code Form is the Git tree at `022a45c...`, not the minified npm package.
The deterministic archive record is:

| Field                            | Value                                                              |
| -------------------------------- | ------------------------------------------------------------------ |
| Git tree                         | `a13f13b60ea8b16b654a8c472c1b5826ef6b4c8f`                         |
| `git archive --format=tar` bytes | `92,037,120`                                                       |
| Archive SHA-256                  | `7cd6442dfaff5de12cb4bd621d626c60369ce65217ab5ed8276bdd7288387214` |
| Root lockfile SHA-256            | `40169c8fc2728bf3652e95dd7484e747bfe5191ceef79d398cc11fd2578ef632` |
| Publisher-recorded Node/npm      | `24.18.0` / `11.16.0`                                              |
| Publisher `GITHUB_RUN_NUMBER`    | `34`                                                               |

Use a clean Windows worker and a new empty directory:

```powershell
git -c core.autocrlf=false clone --branch v1.8.4 --depth 1 https://github.com/CoderLine/alphaTab.git alphatab-1.8.4
git -C alphatab-1.8.4 config core.autocrlf false
git -C alphatab-1.8.4 checkout --detach 022a45c8e42370f9e12e68949d11eada370da83d
git -C alphatab-1.8.4 rev-parse HEAD
git -C alphatab-1.8.4 rev-parse HEAD^{tree}
git -C alphatab-1.8.4 archive --format=tar --output=alphatab-v1.8.4-source.tar HEAD
Get-FileHash alphatab-v1.8.4-source.tar -Algorithm SHA256
Get-FileHash alphatab-1.8.4/package-lock.json -Algorithm SHA256
Push-Location alphatab-1.8.4
npm ci --ignore-scripts
$env:GITHUB_RUN_NUMBER = '34'
npm run build
npm run build-vite
npm run build-webpack
Pop-Location
```

The validated Windows build produced exact published bytes for declarations, wrapper modules,
worker/worklet modules, fonts, soundfonts, and notices when LF checkout and build number 34 were
used. Four core bundles differed only in the generated ISO timestamp written by
`scripts/generate-typescript.ts`; each had equal length and exactly nine differing byte positions.
This is identified nondeterminism, not an unexplained executable difference. Compare those four
after replacing only `Environment.date` with a fixed token, then compare SHA-256. Do not normalize
any other content.

The npm `prepack` script changes `packages/alphatab/package.json` from module to commonjs and copies
plugin outputs. Run it only after all builds, on a disposable checkout. A second build in the same
checkout requires restoring that manifest first. Record every command, stdout/stderr, exit code,
tool version, environment value, output hash, and the timestamp-only normalization result.

Publication procedure:

1. Upload the exact source tar to an immutable StringSight-controlled URL.
2. Verify the uploaded object has the recorded SHA-256 and is downloadable without a developer
   login by an ordinary recipient.
3. Publish the exact MPL-2.0 text, the candidate release notice, the embedded-library license texts,
   and Bravura OFL/FONTLOG beside it.
4. Put the immutable source URL, source hash, alphaTab version/commit, and modification status in
   the shipped About/third-party-notices surface.
5. If alphaTab files are modified, archive the preferred form of those modified files plus build
   scripts and a modification manifest; do not point only to unmodified upstream source.
6. Retain the source and notices for as long as the executable release is available.

The source archive is reproducible from Git; the published npm gzip is not used as the source
artifact and need not be regenerated. The package tarball remains pinned separately by npm SRI and
SHA-256.

## 6. Concrete release checklist

- [ ] Owner records acceptance or rejection of MPL-2.0 for this browser Larger Work.
- [ ] Production lockfile pins exactly `@coderline/alphatab@1.8.4` and recorded integrity.
- [ ] Release adapter uses no copied alphaTab implementation and records whether alphaTab is
      unmodified.
- [ ] Player remains disabled for the notation/import baseline.
- [ ] Final hosted artifact contains no `.sf2`, `.sf3`, `dist/soundfont`, SONiVOX filename, or
      recorded SONiVOX hash.
- [ ] Bravura files match the baseline hashes and ship with exact OFL/FONTLOG.
- [ ] Checkout used `core.autocrlf=false` before files were materialized.
- [ ] Source archive tree, byte count, SHA-256, lockfile hash, Node/npm, and build number match this
      record.
- [ ] Clean-build comparison has no difference other than the documented generated timestamp.
- [ ] StringSight-controlled source URL is immutable, public to recipients, and hash-verified.
- [ ] Shipped notices include MPL-2.0, alphaTab version/commit/source URL/modification status,
      TinySoundFont, SFZero, Haxe, SharpZipLib, NVorbis, libvorbis, and Bravura.
- [ ] SBOM includes embedded code and Bravura even though alphaTab declares zero npm dependencies.
- [ ] Final browser/public artifact is scanned, not merely `node_modules` or the dependency graph.
- [x] ADR 0007 records the accepted received-source/bounded-upstream-revision exception.

## 7. Spike-time owner decisions — resolved by ADR 0007

At spike completion, three decisions remained for this path:

1. Accept MPL-2.0 with the pinned source/notice/retention procedure, or reject alphaTab for
   production.
2. Accept alphaTab commit `022a45c...` as exact received source for embedded-code policy while
   recording the unconfirmed upstream candidates, or require an upstream maintainer confirmation.
3. Keep synthesis out of the first release, or separately fund selection and audit of a replacement
   soundfont. The bundled SONiVOX files should remain omitted either way.

No further decision is needed to omit SONiVOX or to use unmodified Bravura 1.38 with its notices.

ADR 0007 accepts decisions 1 and 2 for the bounded hackathon profile and selects synthesis omission
for decision 3. It does not close the unchecked final hosted-artifact, notice, source-retention, or
SBOM release tasks above.

## Primary evidence

- [Pinned alphaTab player settings](https://github.com/CoderLine/alphaTab/blob/022a45c8e42370f9e12e68949d11eada370da83d/packages/alphatab/src/PlayerSettings.ts)
- [Pinned alphaTab browser player loading](https://github.com/CoderLine/alphaTab/blob/022a45c8e42370f9e12e68949d11eada370da83d/packages/alphatab/src/platform/javascript/BrowserUiFacade.ts)
- [Pinned package manifest and separate soundfont export](https://github.com/CoderLine/alphaTab/blob/022a45c8e42370f9e12e68949d11eada370da83d/packages/alphatab/package.json)
- [Pinned static-copy build rule](https://github.com/CoderLine/alphaTab/blob/022a45c8e42370f9e12e68949d11eada370da83d/packages/alphatab/vite.config.ts)
- [Bravura 1.38 upstream commit](https://github.com/steinbergmedia/bravura/commit/f97d82af70bbbfde5808b4119018dbe5553e620c)
- [alphaTab embedded-library notice](https://github.com/CoderLine/alphaTab/blob/022a45c8e42370f9e12e68949d11eada370da83d/packages/alphatab/LICENSE.header)
- [alphaTab source build workflow](https://github.com/CoderLine/alphaTab/blob/022a45c8e42370f9e12e68949d11eada370da83d/.github/workflows/~publish_web.yml)
- [Mozilla Public License 2.0](https://www.mozilla.org/en-US/MPL/2.0/)
- [SIL Open Font License 1.1](https://openfontlicense.org/open-font-license-official-text/)
