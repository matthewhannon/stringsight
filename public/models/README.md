# Model assets

Before adding a model, add an entry to the inventory below with its source URL, exact upstream
version, SHA-256 checksum, license and required notices, expected size, input/output contract, and
update procedure. Confirm the selected weight file has no terms separate from its code repository.
Unknown, non-commercial, and research-only model terms are not accepted without explicit owner
approval and an architecture decision record.

| Model               | Asset file             | Source                                    | Version                                               | SHA-256                                                            | License    | Size          | Input/output                                                                                                                          | Update procedure            |
| ------------------- | ---------------------- | ----------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ | ---------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Spotify Basic Pitch | `model.json`           | https://github.com/spotify/basic-pitch-ts | `v1.0.1` / `16d4c6a68e2c070726ba7c26a64c13eab4a434c4` | `1ED1AAEE3409EC1DC098C8B01F430C0911F6FE9412E7AF8086750F9E8F302F68` | Apache-2.0 | 174,537 bytes | Float mono `[batch, 43844, 1]` at 22,050 Hz to contours `[batch, 172, 264]`, frames `[batch, 172, 88]`, and onsets `[batch, 172, 88]` | Follow the procedure below. |
| Spotify Basic Pitch | `group1-shard1of1.bin` | https://github.com/spotify/basic-pitch-ts | `v1.0.1` / `16d4c6a68e2c070726ba7c26a64c13eab4a434c4` | `B142A95737A52E1E412D5F92E73D8BB80DFE8D04941ACC0702F11F4524FB377C` | Apache-2.0 | 742,392 bytes | Weights referenced by the graph above.                                                                                                | Follow the procedure below. |

## Basic Pitch update procedure

1. Select an official tagged release from `spotify/basic-pitch-ts` and record its commit.
2. Confirm the model files have no terms separate from the repository's Apache-2.0 license.
3. Copy only `model/model.json` and `model/group1-shard1of1.bin` from that commit.
4. Record byte sizes and SHA-256 hashes here and update the adapted-source notices.
5. Confirm tensor names, shapes, 22,050 Hz input, window size, overlap, and post-processing constants.
6. Run numeric parity fixtures, public corpus evaluation, browser cold/warm performance, and the
   private guitar corpus before accepting changed bytes.

The selected tag contains no separate model license or `NOTICE` file. Spotify's Apache-2.0 source
headers are retained in adapted inference and post-processing files, and the license is distributed
with the application.

See `docs/decisions/0005-mit-open-source-and-license-policy.md` for the complete policy.
