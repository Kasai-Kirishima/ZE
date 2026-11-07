# ZeroEngine 0.9.7

ZeroEngine is a browser-based game and scene editor prototype. Three.js and JSZip are loaded from CDNs, so an internet connection is required.

## Run

Open `index.html` through a local static server or publish the project root with GitHub Pages. Extract the ZIP before running the project.

## Separate workspaces

The home screen separates **game projects** and **3D model projects**. Model projects open in the dedicated Model Studio; game projects open in the scene editor.

## 3D Model Studio

- Starter shapes: cube, UV sphere, plane, cylinder, cone, capsule, torus, torus knot and icosphere. The monkey-head primitive has been removed.
- Import GLB/GLTF, FBX, OBJ and STL files. GLB is recommended.
- Move, rotate, scale, move in XY/YZ/XZ planes and uniform scale from controls over the viewport. The chosen transform and component mode are remembered.
- Edit vertices, edges and coplanar faces directly in the viewport. Shift-click adds or removes selected vertices.
- Create points by splitting a selected triangle, create connecting edge objects from two selected vertices, and create a triangle face from three selected vertices.
- Face extrusion, inset and bevel rebuild the selected patch with a cap and connecting side walls. Additional tools include subdivision cut, sharpen, duplicate, delete, thickness, normal inversion and vertex welding.
- Mirror selected objects on X/Y/Z; double-click an object to frame it in the viewport.
- Texture UV workspace supports selecting a crop region by dragging on the image, plus numeric U/V offset and size controls. Material painting, image assignment, opacity, base-color reset, roughness and metalness are available.
- Export models as GLB into `Assets/Models`; convert a model to a Player.

## Scene editor and game preview

- Scene objects can be converted to Player from the inspector. Objects can be attached to a Player or game camera in a dedicated 3D attachment window.
- Skybox supports spherical panorama or cube background, tiling and smoothing settings.
- Material inspector supports transparency and removing the base-color override.
- Box colliders use rotated axis-aligned bounds. Basic physics advances in small fixed substeps to improve contact stability.
- Player movement has a simple procedural movement bob. Imported skeletal animations can be played separately when present in the model.
- ZeroBox direction, numeric and joystick inputs are passed into actions at runtime. Joystick exposes separate X and Y outputs. Data inputs are shown as small ports beside their corresponding fields.
- Keyboard bindings display modifier names and support combinations such as Ctrl+Shift+K.

## Known limitations

This is an early browser-based editor, not a full Blender or commercial game-engine replacement. The mesh workspace operates on triangulated BufferGeometry: selected planar patches are grouped for face editing, edge selection refers to triangle edges, and bevel/cut/thickness are basic mesh operations rather than a complete topology/boolean system. A created edge is represented by a visible child geometry between two selected vertices; it is not a full edge-loop/topology kernel. UV editing changes a shared texture's repeat/offset crop and does not provide automatic per-corner unwrap. Physics uses simplified AABB collision and is not a full rigid-body solver. Movement animation is procedural unless the imported model contains skeletal animation clips. A full browser interaction test was not performed for this release.

## Project data

Projects are stored locally in IndexedDB. Export ZIP regularly to back them up or move them to another device.
