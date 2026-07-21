# StringSight rack library

This folder is the reusable visual shell for StringSight tools. Product modules own their domain
state and behavior; the rack library owns chassis, spacing, typography, hardware details, and common
status/control presentation.

## Public components

- `Rack`: the physical outer frame and rails.
- `RackModule`: the standard module chassis, identity header, status area, and content slot.
- `RackStatus`: a consistent status light and label.
- `RackButton`: hardware and primary button treatments for rack-level actions.
- `RackValue`: a compact label/value readout.
- `RackRockerSwitch`, `RackStatusLamp`, `RackSegmentedMeter`, `RackUtilityKey`,
  `RackRecordPunch`, `RackSourceSelector`, and `RackDetailKey`: controlled physical input controls
  that do not own domain lifecycle state.
- `rackEmbeddedClassNames`: stable, domain-neutral styling hooks for embedded product surfaces.

Import these through `src/ui/rack/index.ts`, not their individual files.

## Adding a product module

1. Keep signal processing and state outside the rack library.
2. Give the product component an `embedded` presentation when its standalone title or outer card is
   redundant inside a `RackModule`. Apply `rackEmbeddedClassNames.section` to its root and
   `surface` or `clippedSurface` to the inner cards that should receive the rack treatment.
3. Add one typed entry to `WorkspaceModuleRegistry` in `rackWorkspaceModules.ts`. Optional module
   state stores only the registry ID; never place components or domain state in the saved layout.
4. Choose `standard` for compact readouts and `expanded` for tools with controls, diagnostics, or
   timelines.
5. Use a stable `moduleId`, unit label, functional title, short operational description, and honest
   status.
6. Verify keyboard operation, narrow-screen stacking, and the module's domain tests.

## Workspace customization

`Session control` and `Audio input` are required modules and always occupy the first two rack
positions. Every module below the management strip is optional, unique, removable, and reorderable.
The validated `WorkspaceLayout` preference is stored separately from audio sessions, so hiding a
module never deletes evidence or stops its domain controller. Pointer dragging is an enhancement;
every reorder operation must also be available through labeled keyboard controls.

## Design tokens

`tokens.css` is the source of truth for rack colors, spacing, radii, shadows, typography, and motion.
New rack components should consume those variables rather than introduce near-duplicate values.

The current library intentionally models one selected direction: realistic studio hardware. Visual
experiments stay outside this public component surface until they are chosen for the product.
