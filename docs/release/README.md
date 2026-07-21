# Release compliance controls

This directory retains release inputs and checklists that are intentionally separate from runtime
dependencies. Presence here does not mean the candidate package or asset is installed or shipped.

## alphaTab 1.8.4 hackathon profile

ADR 0007 accepts alphaTab 1.8.4 only when a production implementation and hosted release satisfy
all of these controls:

1. Pin `@coderline/alphatab@1.8.4`, registry integrity, git commit
   `022a45c8e42370f9e12e68949d11eada370da83d`, and the exact received-source identity recorded in
   `provenance/alphatab-1.8.4-license-audit-baseline.json`.
2. Keep alphaTab behind a StringSight adapter; do not persist its object graph or let its player own
   transport time.
3. Publish the sanitized corresponding preferred-form source, its canonical per-member manifest,
   MPL-2.0 text, alphaTab/embedded-library notices, Bravura OFL/FONTLOG, checksums, modification
   status, and retention information at an immutable, versioned, StringSight-controlled,
   recipient-accessible, hash-verified location. Sanitization removes all and only
   `packages/alphatab/font/sonivox/**` and `packages/alphatab/test-data/audio/**`; retained tar
   members remain byte-exact. The exact received archive hash is provenance evidence, not a public
   download identity. The selected website convention is `/open-source/`, and the application
   legal/notices surface links to it.
4. If covered alphaTab files are changed, publish their modified preferred form and corresponding
   build material; do not point only to unmodified upstream source.
5. Keep alphaSynth, reference synthesis, `sonivox.sf2`, `sonivox.sf3`, and every unreviewed sound bank
   out of the initial release. Renaming or transcoding the audited banks is not remediation.
6. Ship exact unmodified Bravura 1.38 only with its OFL/FONTLOG and SBOM identity. Any subset,
   rebuild, or modification requires a new RFN/OFL review.
7. Run the repository dependency check and the alphaTab release-policy check against the final
   built artifact before deployment. After deployment, the release job must record the immutable
   hosted URL, fetched byte count, fetched archive hash, fetched member-manifest hash, and
   verification timestamp; these fields remain explicitly gated until that succeeds.

The notice template is a candidate release input. Complete every placeholder from the final build
manifest; do not publish it verbatim. The detailed engineering resolution is in
`../research/practice-spike-license-release-resolution.md`. This record is not legal advice.
