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
