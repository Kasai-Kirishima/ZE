# ZeroEngine 0.10.14

ZeroEngine is a browser-based scene and game-editor prototype. Extract the ZIP and serve the folder using a local static server or web host. Three.js and JSZip are loaded from CDNs, so an internet connection is required for the editor runtime.

## Changes in 0.10.13 — resizable workspace and safer scene interaction

- Added drag grips for the main editor panels, ZeroBox library/properties, UI Designer palette/properties, UI preview stage, Model Studio drawers, and modal windows.
- Panel sizes are stored locally and restored when the relevant work area or dialog is opened again. Right-hand panels resize in the expected direction; the bottom asset dock grows upward.
- Mobile ZeroBox and UI Designer panels now resize their actual floating panel bounds instead of changing an unused desktop grid variable.
- Compact numeric steppers now keep the value visible. Plus/minus moves to the next/previous valid step, respecting each input's `min`, `max`, and `step`; fields without a declared step use a value-sensitive increment.
- Added a per-object editor lock in the hierarchy and Inspector. Locked objects cannot be picked or transformed in the viewport, while still remaining available in the hierarchy for inspection and unlocking.
- Kept the global viewport inspection mode, which blocks scene selection and transform dragging while allowing camera orbit.
- Strengthened UI hit-testing for mobile side panels, Model Studio drawers/toolbars, context menus, workbench overlays, and modal dialogs so touches are not forwarded to geometry behind them.
- Fixed the workbench/modal stacking order so dialogs remain above ZeroBox and UI Designer.

## Notes and limitations

- Resizing is provided for the main editor panes and working surfaces listed above, not every individual label or input control. Individual UI elements keep their own size controls in the Inspector.
- Projects are still browser-local until exported as a ZIP. Panel layout preferences are stored locally in the browser and are not part of the exported project.
- The editor runtime loads Three.js and JSZip from CDNs. A connection is required when opening the project unless those dependencies are hosted locally.
- Full physical-device interaction testing is recommended, especially for browser-specific touch handling.

## Run

Open `index.html` through a local static server or publish the repository root with GitHub Pages. Extract the ZIP before running the project.


## Changes in 0.10.14 — UI access, ZeroBox categories, numeric controls, bevel and preview skybox

- Restored all ZeroBox and UI Designer panels on touch devices. The library, node canvas / UI preview, and properties now form one vertically scrollable workspace instead of being hidden behind removed mobile tabs.
- Kept UI screens in a dropdown selector, with per-screen orientation and resolution controls. The preview stage uses the selected screen's actual aspect ratio on mobile and desktop.
- Fixed numeric steppers: they now advance to the next or previous valid step using the correct step base, respect minimum and maximum values, and dispatch the change event before input so state-saving listeners can persist edits even when a render replaces the field.
- Fixed the test Skybox dome size so it remains inside the preview camera's far clipping range.
- Removed the unused Bend tool from Model Studio.
- Rebuilt bevel/sharpen face operations in the original mesh and added multiple connected rings for a smoother bevel profile; no separate rim/cap objects are created.
- Added category-specific colors to ZeroBox block library groups and the blocks placed on the graph.
- Removed duplicate UI resolution preset entries and made project orientation follow the selected base resolution by default.
- Kept material/texture controls hidden for light entities and kept Player Start out of the scene object creation palette.

## Notes and limitations

- Bevel/sharpen now rebuild selected face regions as connected mesh geometry; complex multi-loop selections and imported meshes with non-manifold topology may still need additional validation.
- A complete interactive browser and physical Android device test is not available in this build environment; JavaScript, HTML/CSS structure, and archive integrity are checked before delivery.
