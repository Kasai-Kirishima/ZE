# ZeroEngine 0.9.0

ZeroEngine is a browser-based game/scene editor prototype. The project uses Three.js and JSZip from CDN, so an internet connection is required.

## Run

Open `index.html` through a local static server or publish the repository root with GitHub Pages. Do not upload the ZIP as a single website file: extract it and upload the folder contents.

## Zero Model Studio

Open a project and choose **3D-модели** in the editor toolbar. The separate studio includes:

- Ten starter shapes: cube, UV sphere, plane, cylinder, cone, capsule, torus, torus knot, icosphere and a stylized monkey-head primitive.
- Import of GLB/GLTF, FBX, OBJ and STL files (GLB is recommended; GLTF with external dependencies may need those files to be available).
- Object-level move, rotate, scale, numeric position/rotation/scale fields, duplicate, copy/paste and delete.
- Object grouping/join prototype, component selection modes for vertices, edges and faces, and early face push/inset/bevel/sharpen/cut/joint tools.
- Image reference planes, image texture assignment, basic canvas paint layer, material color/roughness/metalness, and UV repeat/offset controls.
- GLB export directly into the project `Assets/Models` library. The saved asset is included in project ZIP export.
- Convert the selected model into a `Player` entity. The generated Player uses the imported model asset and receives a capsule collision preset and a back-mounted camera setting.

## Modeling limitations

This is an early browser modeling workspace, not a full Blender replacement. Vertex/edge/face modes currently provide component picking, and face operations act on the selected triangle of the current buffer geometry. The cut, joint, join and bevel operations are prototypes; there is no full topology kernel, boolean solver, edge-loop system, skin-weight editor, automatic UV unwrap, or production-grade texture painting yet. Imported mesh data is preserved best when exported as GLB.

## Project data

Projects are stored locally in IndexedDB. Export ZIP regularly to back them up or move them to another device. Models saved from the Model Studio are regular project assets and are included in ZIP exports.
