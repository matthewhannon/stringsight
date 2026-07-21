# Candidate alphaTab 1.8.4 release verification record

> Internal template only. The hosted notice is generated separately and must contain no template
> fields. A release remains gated until every post-deploy field below is populated from the hosted
> objects, not copied from the build manifest.

## Fixed release identity

- Package: `@coderline/alphatab@1.8.4`
- License: Mozilla Public License 2.0
- Exact upstream commit: `022a45c8e42370f9e12e68949d11eada370da83d`
- Source tree: `a13f13b60ea8b16b654a8c472c1b5826ef6b4c8f`
- Covered Software modification status: unmodified
- Sanitized source archive bytes: `67636224`
- Sanitized source archive SHA-256:
  `04766fe8ac5228889dfc5519fb17e2ed2af6eee4657dbce1cb05f4c56a88d518`
- Canonical member manifest SHA-256:
  `2eff922935df9f5a5566e042f71edcef093203f6d42996a1e1ed2f14d599d6bf`
- Received archive provenance SHA-256 only:
  `7cd6442dfaff5de12cb4bd621d626c60369ce65217ab5ed8276bdd7288387214`
- Source sanitization: 30 members removed, all and only under
  `packages/alphatab/font/sonivox/**` and `packages/alphatab/test-data/audio/**`
- Runtime audio policy: `PlayerMode.Disabled`, `soundFont: null`, no sound bank distributed

The public bundle must include the exact alphaTab MPL text, notices for TinySoundFont, SFZero, Haxe
Standard Library, SharpZipLib, NVorbis, and libvorbis, and the exact Bravura 1.38 OFL, FONTLOG, and
WOFF2 asset. No SONiVOX bank, audio fixture, nested archive, or renamed excluded hash may appear.

## Post-deploy verification gate

- Status: `[GATED | VERIFIED]`
- Product version/build: `[PRODUCT_VERSION_AND_BUILD]`
- Immutable hosted source URL: `[IMMUTABLE_HOSTED_URL]`
- Fetched source byte count: `[FETCHED_BYTES]`
- Fetched source SHA-256: `[FETCHED_SHA256]`
- Fetched member-manifest SHA-256: `[FETCHED_MEMBER_MANIFEST_SHA256]`
- Verification timestamp: `[UTC_TIMESTAMP]`
- Verification job or owner: `[RELEASE_JOB_OR_OWNER]`
- Final artifact release-policy result: `[PASS]`

Do not mark the status `VERIFIED` unless the fetched values exactly match the fixed identities
above and the immutable URL is recipient-accessible without a developer login.
