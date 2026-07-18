# Rack interface direction

## Decision

StringSight uses a realistic studio-hardware rack as its product workspace during core feature
development. The application opens directly into the rack; marketing, onboarding, and a public
landing page are deferred until the functionality is mature.

The selected direction uses brushed dark metal, physical rails and screws, engraved-style labels,
restrained status lights, compact instrument readouts, and ordinary accessible HTML controls. CSS
provides the chassis, materials, reflections, and transitions. Canvas or SVG is reserved for data
visualizations such as continuously sampled waveforms and spectra rather than the complete
interface.

## Explored alternatives

The design study compared three treatments using the same simulated module stack:

1. **Realistic rack:** physical studio hardware and dense operational controls. Selected.
2. **Modern rack:** streamlined surfaces, flat hierarchy, and product-instrument styling.
3. **Spectral rack:** smoked glass and a luminous signal spine for an experimental observatory feel.

The alternatives are recorded here as future reference but are not retained as active application
code.

## Active design system

The implementation lives in `src/ui/rack/`:

- `Rack` owns the outer frame and rails.
- `RackModule` owns module identity, chassis, status, actions, and content placement.
- `RackStatus`, `RackButton`, and `RackValue` provide common controls and readouts.
- `tokens.css` is the source of truth for color, spacing, radii, shadows, typography, and motion.
- `RackWorkspace.tsx` is the typed registry and assembly point for product modules.

Domain components own signal-processing state and behavior. The rack library owns presentation.
Future modules should use the extension recipe in `src/ui/rack/README.md`.
