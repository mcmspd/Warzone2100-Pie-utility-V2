# Warzone 2100 PIE 3D Engine & Inspector

An interactive 3D inspection engine designed specifically for Warzone 2100 **PIE** model files (supporting **PIE 2**, **PIE 3**, and **PIE 4** specifications) and their corresponding tileset texture pages.

## Features

- **Split-View Interface**:
  - **Left Side**: Syntax-highlighted PIE text viewer with line numbers and interactive token styling. Supports both live inspection and direct in-browser editing with real-time model recompilation.
  - **Right Upper Side**: Three.js WebGL 3D Viewport featuring full orbit controls, dynamic lighting, wireframe overlay, vertex/face normal vectors, connector points, and automatic camera centering.
  - **Right Lower Side**: Interactive 2D Tileset texture inspector (`page-12-player-buildings.png`) featuring smooth pan and zoom, pixel & UV coordinate readouts, full model UV overlay mesh, and isolated polygon/vertex focus.

- **Dual Inspection Modes (Faces Mode & Vertices Mode)**:
  - **Faces Mode** (Default):
    - Hovering a 3D face highlights the triangle in 3D, automatically scrolls to and illuminates the polygon definition line in the `POLYGONS` section of the PIE file, and renders the UV triangle with vertex pins on the tileset canvas.
    - Hovering a line in `POLYGONS` highlights the 3D face and UV triangle.
    - Hovering a UV triangle on the tileset highlights the 3D face and scrolls to the text line.
  - **Vertices Mode** (New):
    - Toggle with the **Vertices Mode** button in the header or by pressing **`V`** or **`Tab`**.
    - Renders interactive 3D vertex handles on all model points.
    - Hovering a 3D vertex highlights it with a glowing cyan marker, coordinate ring, and HUD readout showing its $(X, Y, Z)$ coordinates and all polygons sharing it.
    - Automatically scrolls to and highlights the exact line in the `POINTS` block of the PIE file (e.g. Line 10: `-50 77 128`), and subtly highlights all polygon lines that reference this vertex.
    - Hovering a line in the `POINTS` section of the text immediately highlights that vertex in 3D and shows its UV locations on the tileset image.
    - On the tileset image, highlights every UV location where this vertex appears, with dotted connection lines if multiple faces share the vertex.

- **Click-to-Pin Selection**:
  - Click on any face or vertex in 3D, in the text, or on the tileset to lock the selection. Press **Esc** or click again to unpin.

- **Live Editing Mode**:
  - Toggle to "Edit" mode in the left pane, modify vertex coordinates, UV values, or polygon flags, and click **"Apply Changes"** to re-parse and update the 3D geometry and UV map in real time.

- **Model Preset Selector & Drag-and-Drop**:
  - Comes pre-configured to load `warzone2100/Struct_Mod/stwpfcan.pie` with `page-12-player-buildings.png`.
  - Dropdown selector allows switching between other models in the Warzone 2100 repository.
  - Drag-and-drop any `.pie` or `.png` directly onto the browser window.
