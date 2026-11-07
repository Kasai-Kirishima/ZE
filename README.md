# ZeroEngine 0.10.0

ZeroEngine is a browser-based game/scene editor prototype. The project uses Three.js and JSZip from CDN, so an internet connection is required.

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


## 0.10.0

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
