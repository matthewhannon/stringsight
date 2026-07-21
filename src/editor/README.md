# Renderer-independent editor core

This folder owns authored Practice Document editing before any notation renderer, transport, or
persistence implementation becomes authoritative.

## Public workflow

Use the exports from `index.ts` to:

1. create a blank native score with `createPracticeEditorWorkflow`, or open a verified native score
   with `openPracticeEditorWorkflow`;
2. submit validated command transactions through `applyPracticeEditorTransaction`;
3. undo or redo through `undoPracticeEditorWorkflow` and `redoPracticeEditorWorkflow`;
4. render `state.inspection.tree` or `state.inspection.rows` as ordinary semantic HTML and use the
   navigation helpers for tree keyboard focus; and
5. save with `savePracticeEditorWorkflow`, which marks history clean only after storage succeeds.

The workflow keeps the Practice Document revision and editor working revision identical. Every
accepted edit, undo, or redo receives one new monotonic identity and recomputed qualified hashes.
Invalid commands, stale semantic focus or selection, tampered source identities, and failed saves
leave the caller's state unchanged.

## Boundary

Authored truth includes the score, guitar configuration, musical maps, metadata, and named loop
presets. Selection and semantic focus belong to editor history. Layout, zoom, sidebar state,
practice range, playhead, renderer geometry, SVG/canvas nodes, transport clocks, audio graphs, and
storage implementations remain outside the Practice Document.

The UI may bind buttons and keyboard shortcuts to the same command API, but it must never edit a
renderer-owned graph. Item 13 can now connect a replaceable notation adapter to this canonical
workflow and its stable semantic focus targets.
