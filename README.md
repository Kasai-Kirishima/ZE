# ZeroEngine 0.10.5

ZeroEngine is a browser-based game/scene editor prototype. The project uses Three.js and JSZip from CDN, so an internet connection is required.

## Changes in 0.10.3 — mobile workflow and movement

- Replaced the test-mode “main menu” action with a full-screen preview control. The editor home/menu remains available from the 3D scene editor.
- Added mobile direct manipulation for selected objects: drag to move in translate mode, drag vertically to scale in scale mode, and pinch with two fingers for uniform scaling.
- Added arrow stepper buttons beside transform values for precise phone input. Imported asset cards now have a rename action.
- Changed new UI joystick bases and knobs to square shapes and simplified the mobile ZeroBox/UI Designer layout into dedicated “Blocks / Field / Properties” or “Elements / Screen / Properties” tabs.
- Corrected player joystick movement to use the live camera-facing horizontal basis, including older Player joystick scripts that used object-relative defaults. World-relative mode remains available.
- Reduced ZeroBox per-tick overhead by caching execution and incoming-data indexes while the graph topology is unchanged. Test-mode UI updates are still batched and do not trigger project saves on every movement tick.
- Default newly created UI controls and standard object materials remain white.
- Verified ES-module syntax, joystick camera-relative movement vectors, HTML structure, asset IDs, and ZIP integrity. A full end-to-end test in a physical Android browser is still recommended.

## Changes in 0.10.2 — button hotfix

- Fixed an unclosed `root.innerHTML` template in `renderInspector()`. It caused the ES module parser to reject the entire `app.js` file, so none of the editor's click handlers were installed.
- Closed the inspector template before the event-binding code. The inspector controls and the rest of the app now remain executable JavaScript.
- Verified the complete app script in ES-module syntax mode and ran the startup/binding path against a DOM test double: startup completed and 66 event listeners were registered, including the home, project, editor and Model Studio controls.
- This is a targeted stability hotfix; it does not claim that every modeling operation has been exhaustively tested in a real browser.

## Run

Open `index.html` through a local static server or publish the repository root with GitHub Pages. Extract the ZIP before running the project.

## Separate 3D modeling workspace

The **3D-моделирование** entry is on the home screen. Choose an existing project or create one; the modeling workspace opens separately from the scene editor.

- Twenty starter shapes: cube, UV sphere, plane, cylinder, cone, capsule, torus, torus knot, icosphere, monkey, circle, ring, pyramid, hexagonal prism, octahedron, dodecahedron, tetrahedron, tube, spring and wedge.
- GLB/GLTF, FBX, OBJ and STL import. Imported models are centered and framed in the modeling viewport; GLB is recommended.
- Axis transform gizmo for move, rotate and scale, plus numeric transform fields.
- Mirror the selected object along X, Y or Z.
- Object duplication, copy/paste, rename, delete and grouping/join prototype.
- Component pick modes for vertices, edges and faces. Face selection uses a marker instead of drawing a triangle, since Three.js renders buffer geometry as triangles internally.
- Early face push/inset/bevel/sharpen/cut/joint tools, image reference planes, image texture assignment, basic canvas paint, material controls and UV repeat/offset.
- GLB export to project `Assets/Models`; saved assets are included in project ZIP export. A selected model can be converted into a `Player` entity.

## Changes in 0.9.9

- Added 20 starter primitives and dedicated click-to-place tools for creating vertices, edges and faces. Pending picks are marked in the viewport; the tools can be cancelled with Escape or by tapping the active tool again.
- Extrude, inset and bevel now replace the original selected face region with the new cap and side geometry, avoiding hidden duplicate faces. Cut subdivides selected faces. Geometry operations have a 50,000-triangle workspace limit to protect the project from runaway mesh growth.
- Limited undo snapshots for heavy meshes to reduce memory usage; very dense models disable deep snapshot history to avoid browser crashes.
- Fixed the Skybox inspector so image-only skybox objects do not trigger missing material/collision controls. Skybox settings remain on the Skybox object rather than in Scene settings.
- Added a visible right-drag selection marquee and corrected the viewport hint: left mouse rotates, middle mouse pans, right-drag selects multiple scene objects, and the wheel zooms.
- Fixed the saved direction selector for Moving and improved tap targets for 3D viewport controls.
- The scene no longer has an implicit Y=0 floor; a player falls through empty space and is supported only by solid colliders.

## Changes in 0.9.8

- Reworked the on-screen joystick as a radial analog stick. Its knob can be dragged in any direction, is clamped to the circular travel area, and returns to the center on release/cancel. X reports left/right; Y reports forward/backward.
- Added a standalone `Joystick Movement` ZeroBox script. Add a `Joystick` to the UI, add this script to ZeroBox, select the joystick and target object; it reads the active control every frame and moves the target using collision-aware movement. No execution wire is required.
- Added movement speed, dead-zone and orientation options: target object Y rotation, camera yaw, or world axes. Diagonal movement is normalized.
- Kept the `Joystick` data source with separate X and Y outputs for wiring into other blocks.
- Added `src/js/joystick-movement.js` as the separate movement runtime module.

## Changes in 0.9.6

- Added a delete control beside every model in the Model Studio object list.
- Fixed component editing tools and transform gizmo behavior for vertex, edge and face selections; selected components can be translated, rotated and scaled directly in the viewport.
- Component deletion now removes affected triangles from the mesh instead of collapsing them into a point.
- The Joystick block exposes separate numeric X and Y outputs.
- Expanded typed ZeroBox data ports for numbers, directions, booleans, colors, text and assets; added Text and Asset source blocks. Moving accepts connected X/Y/Z, speed and direction values.

## Changes in 0.9.4

- Responsive editor layout for desktop, phone portrait and phone landscape; the editor follows the real viewport orientation and uses compact landscape controls.
- Added device and resolution preferences (PC, tablet, phone portrait/landscape, automatic and custom resolution). The selected target resolution controls the UI Designer preview aspect ratio.
- Model Studio uses touch-friendly tabs on small screens: 3D view, tools and properties. The viewport is resized when changing tabs, touch gestures rotate/zoom/pan, and larger transform handles are used on touch devices.
- UI Designer elements can be moved by touch and resized with eight on-element handles. Position and size fields remain available in properties.

## Fixes in 0.9.2

- New Player objects start at ground level; older Players are snapped to a nearby floor or solid collider when Play Mode starts.
- Physics tracks grounded contact. The `Jumpup` ZeroBox action is ignored while airborne and only launches from the world floor or a solid, non-trigger collider.
- Fixed the preview camera input: desktop mouse uses pointer lock, while touch uses pointer capture; third-person camera pitch now changes the orbit as well as yaw.
- Added optional seamless-edge blending for assigned textures. Enable **Сглаживать стыки текстуры** in the Material inspector and adjust the blend width; the original texture asset is preserved.

## Fixes in 0.9.1

- Removed editor selection BoxHelpers when preview/test mode starts, so the selection outline is not visible in the game preview.
- Fixed the Model Studio camera target and automatic framing for added/imported objects.
- Updated TransformControls attachment to the current Three.js helper API, restoring the axis arrows/gizmo.
- Added dedicated left-side transform and mirror buttons.
- Moved Model Studio access out of the scene editor toolbar and into the home menu.
- Improved model undo snapshots to preserve nested meshes and groups.

## Modeling limitations

This remains an early browser modeling workspace, not a Blender replacement. Component modes support vertex, edge and coplanar face selection with direct transforms. Face operations work on the selected triangulated face region; cut, joint, join and bevel remain early prototypes. There is no full topology kernel, boolean solver, edge-loop system, skin-weight editor, automatic UV unwrap or production-grade texture painting yet.

## Project data

Projects are stored locally in IndexedDB. Export ZIP regularly to back them up or move them to another device.

## ZeroEngine 0.9.6

- ZeroBox and UI Designer now open as exclusive full-screen workspaces; the scene is blocked until the workspace is closed.
- Play Mode first persists the project and refuses to start if saving fails or no ZeroBox exists.
- ZeroBox supports touch multi-selection, copying selected blocks, moving nodes by touch, and dragging palette blocks onto the workspace.
- Added a `Joystick` logic block with selectable UI joystick and X/Y data ports. Connect its X/Y outputs to the matching data inputs on `Moving` to drive movement from that joystick.
- UI Designer supports multiple named interfaces, duplication/deletion, and screen-navigation buttons.
- Mobile workspaces use a desktop-like tool layout adapted into stacked panels, keeping the canvas and properties accessible.


## 0.9.6
- Project deletion is available directly in the 3D Model Studio project picker.
- Mobile Model Studio panels now occupy one full-screen layer at a time; the viewport no longer leaves a stray side panel visible.
- Face extrusion, inset and bevel now create a translated cap and connecting side walls while preserving the original face, preventing the selected face from being pulled away and leaving a hole.
- Added plane translation and uniform scaling controls alongside axis transforms.


## 0.9.7
- Исправлена мобильная компоновка окна 3D-моделирования: рабочая область не выходит за пределы места под шапкой и вкладками, неактивные боковые панели скрываются полностью.
- Уменьшен размер манипулятора на сенсорных экранах, чтобы его плоскости не перекрывали большую часть сцены.
- Перерасчёт размера canvas привязан к реальной видимой области 3D-сцены и изменению размеров visual viewport.


## 0.10.2

- Expanded the scene primitive menu to 20 basic shapes, matching Model Studio.
- Kept right-button drag marquee selection in the scene viewport; every object whose projected bounds intersect the selection frame is selected.
- Removed the implicit world floor: a player can fall into empty space and is supported only by actual solid colliders.
- Added clear +X/-X, +Y/-Y and +Z/-Z axis views to Model Studio; camera zoom and vertical orbit stay within configured bounds.
- Added explicit per-object multi-selection checkboxes, Join Selected and Separate Group actions.
- Added visible click markers and a click-by-click preview for creating vertices, edges and faces, including touch input.
- Topology points and edge overlays now follow the complete world transform of nested meshes.
- Numeric model transforms and material values update while editing and are committed to model history on change.
- Fixed persistence and visual indication of the `Moving` block direction.
- Added a direct return-to-main-menu action in Play Mode; Model Studio retains its return-to-home action.
- Skybox settings are attached only to the dedicated Skybox object. The inspector provides image, sphere/box shape, tiling, rotation, brightness and smoothing; legacy scene-level Skybox image settings are migrated.
- Enlarged the Skybox volume so the scene camera remains inside it throughout its supported zoom range.
- ZIP exports now write canonical resource paths under `Assets/`, update the manifest to match those paths, sort resources/scenes/scripts, and include a short README. ZIP import also recognizes older duplicated `Assets/Assets/` resource paths.
- Model saves update an existing model resource at the same path instead of creating duplicate copies.
- Added translations for the new controls and messages in the supported UI languages (Russian, Ukrainian, English and Kazakh).

### Known limits

- Join Selected groups the chosen objects under one parent; it does not perform a destructive Boolean/mesh weld. Separate Group restores its children.
- New vertex/edge/face tools create visible geometry on the selected mesh; they are not a full professional retopology system.
- Face operations have a polygon safety cap to prevent large operations from freezing the browser.


## Changes in 0.10.4 — Z-up modeling, sculpt brush and cutting

- The 3D Model Studio now uses Z as the vertical axis and XY as the ground plane. Grid, camera, primitive orientation and orthographic view buttons follow the same convention.
- Primitive creation is separated from the modeling tool tab. Mobile Model Studio has four tabs: 3D view, Add, Tools and Properties.
- Edge selection now raycasts the visible topology edge overlay and selects the actual edge endpoints. Component selection mode and the active modeling action remain selected until the user changes them.
- Added a hold-and-drag sculpt brush with adjustable radius, strength, circle/square/triangle footprint and raise/dent direction. Low-density objects are subdivided before sculpting.
- Replaced the old face-subdivision action with a screen-space cut stroke that splits a mesh into two mesh objects and creates a simple cap. Nested imported meshes are promoted to separate workspace objects after cutting. Added a 2D parallel-cut pattern editor with line count, spacing and angle controls.
- Face creation now accepts three or more placed points and requires an explicit Finish Face action.
- Added touch-friendly controls to finish or cancel multi-point creation and persistent tool status.

Some geometric operations (especially caps for highly concave or non-manifold imported meshes) remain approximate. Test on a copy before applying complex cuts to important assets.


## Changes in 0.10.5 — 3D modeling workflow

- Confirmed Z-up coordinates in Model Studio: XY is the ground plane and positive Z points upward. The grid, camera, primitive orientation and X/Y/Z view shortcuts use the same convention. Camera orbit has unrestricted azimuth for a full 360-degree turn around the model.
- Moved primitive creation into its own **Add** panel; modeling actions and component selection remain in the dedicated **Tools** panel. Mobile panel tabs are hidden on desktop and shown on touch/small-screen layouts.
- Edge mode now draws the full triangle wireframe and supports a wider ray-pick tolerance on touch devices, so internal mesh edges can be selected as well as outer edges. Faces and edges retain the same persistent component-selection mode as vertices.
- Added a hold/drag sculpt brush with radius, strength, circle, square and triangle footprints, and raise/dent actions. Brush settings remain available without resetting the active sculpt tool.
- Added drawn-line mesh cutting and a 2D parallel-cut layout with editable line count, spacing and angle. Parallel cuts are kept within the projected model area. Meshes are split into separate objects and capped with approximate planar fans.
- Face creation accepts three or more clicks and only finishes when **Завершить грань** is pressed. Tool and component modes remain active until explicitly changed or cancelled.
- GLTF, FBX and OBJ imports are wrapped and rotated from their common Y-up convention into Model Studio's Z-up orientation. STL imports are left in their supplied orientation because STL files are not consistently authored to one up-axis. GLB export converts the workspace back to Y-up for compatibility with the game scene and external glTF tools.
- Increased edge picking tolerance for touch input and ensured X, Y and Z are all enabled in transform gizmos.

### Known limits in 0.10.5

- The sculpt brush subdivides low-density mesh geometry before deformation. It is an early sculpt tool, not a production remesher; large imported meshes may remain coarse.
- The cut operation is an approximate screen-space plane cut. Concave, open, thin or non-manifold meshes may produce imperfect caps or fail to split cleanly. Save a copy before complex cuts.
- The 2D cut editor currently exposes line count, spacing and angle; it is a configurable parallel-line template rather than a general freehand 2D CAD plane.
- OBJ/FBX up-axis conventions vary between exporters. Automatic Y-up conversion is the common case; if an imported model appears on its side, rotate it manually in the inspector.


## 0.10.7

- Workspace panel visibility, resizing and persistence improved for desktop and touch devices.
- Numeric controls now include compact plus/minus steppers; range inputs use full available width.
- Project camera offsets are now consistently editable for head, back, top and custom mounts.
- Physics-enabled bodies can be pushed without a separate collision toggle.
- Model Studio face transforms now move coincident boundary vertices on adjacent faces to keep topology welded.
- Fixed screen-stroke cut selection, added sculpt brush feedback and wider radius/strength ranges.
- Added temporary camera-navigation mode and model grid visibility control.
- Removed plane and uniform-axis transform buttons; added visible bend-joint markers.

## 0.10.8
- Customizable workspace panel visibility, swapping and asset dock top/bottom placement, with persisted panel sizing.
- Fixed new Player camera presets and camera floor clearance; camera mode changes apply stable preset offsets.
- Ground support now recognizes physics-enabled solid bodies.
- NumericArray variables accept comma-separated values and Specificarray only lists true numeric arrays.

## 0.10.9
- Fixed first-person camera height: pitching the view no longer moves the camera anchor down toward the floor.
- Player camera defaults use a valid third-person offset; changing the mount mode applies stable presets.
- Player Start ground ring and Model Studio Plane primitive / duplicate axis view controls removed.
- Bend tool now switches automatically to vertex mode; bevel/sharpen automatically switch to face mode.

## 0.10.10
- ZeroBox Model and Changeofmodel blocks now include texture tiling controls and apply them when spawning/replacing models.

### 0.10.10 — additional stability fixes

- Dynamic rigid bodies now receive push impulses while the moving body remains at the contact boundary, rather than passing through one another. Collider offsets are optional-safe for physics-only entities.
- Recognition and Specificarray fields retain their selected condition after reopening the block editor.
- Range controls use a full-width track with visible end stops, including WebKit and Firefox styling.
- The editor keeps the common panel workspace on touch and desktop devices; ZeroBox and UI Designer remain dedicated workbenches.
- On touch devices, Model Studio panels now open independently around the same 3D viewport instead of behaving as mutually exclusive tabs. Assets stay on the left, tools at the upper right and properties at the lower right.


## 0.10.11 — Model Studio hotfix

- Restored six orthographic camera presets: +X, −X, +Y, −Y, +Z and −Z.
- Reworked sculpting to deform the selected mesh in world-space brush coordinates, with a practical default radius/strength range and a clear press/hold stroke.
- Reworked line cutting around a screen-space stroke plane, so the stroke can start/end slightly outside the visible mesh and still cut through it.
- Reworked 2D preset cuts to use the same screen-line cutter as manual cuts.
- Rebuilt split geometry with per-side caps triangulated from the actual intersection contour.
- Disabled orbit controls while sculpting/cutting and restored them after pointer release.

The editor remains an early-access browser engine; verify final interaction on the target Android device and desktop browser.
