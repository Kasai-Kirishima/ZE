# ZeroEngine 0.9.2

ZeroEngine is a browser-based game/scene editor prototype. The project uses Three.js and JSZip from CDN, so an internet connection is required.

## Run

Open `index.html` through a local static server or publish the repository root with GitHub Pages. Extract the ZIP before running the project.

## Separate 3D modeling workspace

The **3D-моделирование** entry is on the home screen. Choose an existing project or create one; the modeling workspace opens separately from the scene editor.

- Ten starter shapes: cube, UV sphere, plane, cylinder, cone, capsule, torus, torus knot, icosphere and a stylized monkey-head primitive.
- GLB/GLTF, FBX, OBJ and STL import. Imported models are centered and framed in the modeling viewport; GLB is recommended.
- Axis transform gizmo for move, rotate and scale, plus numeric transform fields.
- Mirror the selected object along X, Y or Z.
- Object duplication, copy/paste, rename, delete and grouping/join prototype.
- Component pick modes for vertices, edges and faces. Face selection uses a marker instead of drawing a triangle, since Three.js renders buffer geometry as triangles internally.
- Early face push/inset/bevel/sharpen/cut/joint tools, image reference planes, image texture assignment, basic canvas paint, material controls and UV repeat/offset.
- GLB export to project `Assets/Models`; saved assets are included in project ZIP export. A selected model can be converted into a `Player` entity.

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

This remains an early browser modeling workspace, not a Blender replacement. Component modes provide picking; face operations still affect the selected triangle in the current buffer geometry. Cut, joint, join and bevel are prototypes. There is no full topology kernel, boolean solver, edge-loop system, skin-weight editor, automatic UV unwrap or production-grade texture painting yet.

## Project data

Projects are stored locally in IndexedDB. Export ZIP regularly to back them up or move them to another device.
