# ZeroEngine 0.10.16

Browser-based game engine and editor prototype.

## Changes in 0.10.16

- Removed the decorative and workspace alignment grids from the home screen, scene viewport, Model Studio and node workspaces.
- Numeric inputs hide browser-native up/down spinners; custom `−` and `+` buttons remain.
- Scene and material assets can be renamed from the asset panel.
- UI Designer includes screen templates for desktop, tablet and phone aspect ratios, with portrait/landscape dimensions and custom screen settings.
- UI elements support layer ordering, parent assignment and nested child elements in a hierarchy tree.
- UI buttons support face color, edge/border color and an imported texture with cover/contain/repeat modes.
- ZeroBox includes an `ExitGame` terminal block that stops the active play test and returns to the editor.

## Run

Serve this folder from a local HTTP server (ES modules and imported assets require HTTP(S)); do not open `index.html` directly as a `file://` URL.

## Notes

This remains an iterative prototype. Browser and device runtime behavior should be tested in the target browser, especially texture loading and touch interactions.


## 0.10.17 — Scene hierarchy drag & drop

- Drag an object by the `⋮⋮` handle in the Hierarchy panel.
- Drop on the center of another row to parent the object under it.
- Drop near the top or bottom edge of a row to reorder it before or after that sibling.
- Drop on empty space inside the Hierarchy panel to move the object to the scene root.
- Reparenting preserves the object's world transform and stores its local transform relative to the new parent.
- Parent-child relationships are restored when a scene is loaded and are included in project saves and undo snapshots.
- Cyclic parenting is rejected. Deleting a parent moves its children to the deleted object's parent while preserving their world transforms.
- Supports mouse and touch dragging via Pointer Events.
