# ADR 0005: MIT open source and license policy

**Status:** Accepted  
**Date:** 2026-07-18
**Amended:** 2026-07-20 by ADR 0007 for the bounded alphaTab 1.8.4 hackathon profile

## Context

StringSight is being prepared for OpenAI Build Week and is intended to be easy for judges,
contributors, and future users to inspect and run. The application distributes compiled browser
code and will later distribute local inference models. Source code, packages, model weights,
evaluation media, documentation, and branding can each have different rights and obligations.

The current production dependency tree is MIT-licensed. Planned candidates such as Spotify Basic
Pitch, TensorFlow.js, MediaPipe, and current OpenCV releases use permissive licenses, but no future
package or model is approved solely because its project name appears in this document.

## Decision

StringSight-owned source code and documentation are released under the repository's MIT License.
The public repository may be used, modified, redistributed, and used commercially under those
terms. The StringSight name and branding are not separately granted as trademarks by the software
license.

Every distributed third-party component must retain its own license. Production code is accepted by
default only under MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, MIT-0, BlueOak-1.0.0, or
CC0-1.0. CC-BY assets may be accepted when attribution is practical and preserved. MPL-2.0 may be
used for isolated development tooling. ADR 0007 accepts one focused production exception: exact
alphaTab 1.8.4 behind a replaceable adapter for the bounded hackathon profile, subject to the
retained source, notice, modification, provenance, and final-artifact controls in
`../research/practice-spike-license-release-resolution.md`. No other MPL package is accepted by
that exception.

GPL, LGPL, AGPL, SSPL, BSL, non-commercial, research-only, custom, missing, or unknown terms require
explicit owner approval and a new or amended ADR before entering a production bundle. This is a
review trigger, not a claim that every such license is incompatible in every circumstance.

Model files require a source URL, exact upstream version, cryptographic checksum, license, expected
size, input/output contract, and update procedure before they enter `public/models/`. Package
metadata does not substitute for checking the selected model asset for separate terms.

Public evaluation media must be project-owned or explicitly redistributable, with provenance and
consent recorded where people are identifiable. Recordings labeled `private-evaluation-only` stay
outside the repository and deployment. An open-source code license does not relicense user media.

The deployed application carries `THIRD_PARTY_LICENSES.txt`. Dependency checks reject missing or
unapproved production license metadata and require notices for every production package in the lock
file. Contributions are accepted under the repository's MIT License as described in
`CONTRIBUTING.md`; no contributor license agreement is required for the hackathon.

When alphaTab client code is distributed, the deployed legal/notices surface links to an immutable,
versioned, StringSight-controlled, recipient-accessible, hash-verified source location (the selected
convention is `/open-source/`). That location
must publish the exact corresponding preferred-form alphaTab source, MPL-2.0 terms, received and
reconstructed notices, Bravura OFL/FONTLOG material, checksums, modification status, and retention
information. Modified covered files require their modified preferred form and corresponding build
material. The final artifact must exclude the audited SONiVOX `.sf2`/`.sf3` names and hashes and all
other unreviewed sound banks. These controls are checked again at release; installing a package or
passing the ordinary lockfile notice check is insufficient.

## Goal

At every public release, 100% of distributed code, models, fixtures, documentation, and visual
assets are either StringSight-owned or covered by recorded, commercially compatible terms; required
notices ship with the release; and private evaluation media is absent.

## Consequences

- Judges can inspect, run, and reuse the complete local application under a familiar permissive
  license.
- Commercial forks and private modifications are permitted, and released MIT versions cannot be
  withdrawn from recipients.
- The project retains flexibility to charge for hosting, support, or future services, while the MIT
  code remains open.
- Adding a package or model includes a small provenance and notice task.
- The exact Basic Pitch runtime and model remain an Item 7 engineering decision, not a licensing
  assumption.
