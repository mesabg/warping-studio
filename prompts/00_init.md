Act as an expert Computer Graphics and Computer Vision engineer. Your task is to write the code for a web-based Morphing and Warping application using HTML5, CSS3, and raw Vanilla JavaScript (no React or heavy frameworks). The application must leverage OpenCV.js for mathematical operations/feature extraction and WebGPU for hardware-accelerated rendering and pixel/voxel processing.
1. General UI & Architecture Requirements:
Layout: A clean, side-by-side workspace displaying Source (A), Destination (B), and Result (Morph) canvases.
Inputs: Allow the user to upload either two 2D images (e.g., face photos) OR two 3D .obj files.
Interactive Slider: A real-time slider representing time t (from 0.0 to 1.0) to manually transition the morph from A to B.
Export: A "Export to Video" button that captures the canvas sequence from t=0 to t=1 and exports an .mp4 or .webm file using the MediaRecorder API or similar vanilla JS approach.
2. 2D Image Morphing Pipeline (Pixels):
Feature Selection: Allow users to click on the Source and Destination canvases to define corresponding control points (landmarks like eyes, nose, mouth) or draw corresponding directed line segments.
Warping Algorithms (Dropdown 1):
Mesh Warping: Implement Delaunay Triangulation using OpenCV.js to connect control points, ensuring the mesh is topologically equivalent in both images to avoid fold-overs. Apply affine transformations per triangle.
Thin-Plate Splines (TPS): Implement a smooth, physics-based warp minimizing bending energy using radial basis functions.
Field Morphing (Beier-Neely): Implement feature-line based warping where each line exerts a gravitational influence on the pixels.
Interpolation Methods (Dropdown 2): Implement algorithms for sub-pixel estimation during inverse mapping:
Nearest Neighbor: Fast, but yields aliasing/jagged edges.
Bilinear: Averages the 4 closest pixels (smooth but slightly blurred).
Bicubic: Evaluates 16 nearest neighbors for high-quality, sharp transitions.
Process: Use Inverse Mapping (backward mapping) calculated in WebGPU compute shaders to fetch the exact fractional coordinates from the source images to prevent "holes", followed by a linear cross-dissolve based on the t slider.
3. 3D Object Morphing Pipeline (Voxels/Vertices):
Parsing & Alignment: Parse the uploaded .obj files. Implement a basic rigid alignment (like Iterative Closest Point) to superimpose the models initially.
Voxelization/Deformation: Since 3D meshes often have incompatible topologies (different vertex counts), implement a volumetric approach. Convert the .obj surfaces into a dense 3D grid (voxelization) processed via WebGPU.
3D Blending: Implement a Non-Linear (Sigmoid) Cross-Dissolve for the 3D volume transition to prevent the "ghosting" effect (e.g., internal structures appearing prematurely due to exponential opacity rendering).
4. Implementation Steps to Output: Please provide the code in modular blocks:
index.html (UI layout, canvas setup, controls, and OpenCV.js CDN import).
styles.css (Clean, modern dark-mode styling).
main.js (Event listeners, UI state management, and video export logic).
morph2d.js (OpenCV.js integration for Delaunay, TPS, line generation, and cross-dissolving).
morph3d.js (OBJ parser, voxelization logic).
shaders.wgsl (WebGPU compute/fragment shaders for accelerated inverse mapping and interpolation).

--------------------------------------------------------------------------------
How this prompt covers your needs based on our discussion:
Web UI & Framework: Specifies raw Vanilla JavaScript, keeping the stack lightweight and free of frameworks like React, while organizing the code modularly.
Device Acceleration: Expressly commands the use of WebGPU through .wgsl shaders to handle the heavy lifting of inverse mapping and matrix calculations, and OpenCV.js for the complex mathematical triangulations
.
Different Types of Data (2D/3D): Requires support for both images and .obj files, explicitly detailing the need to address topologic mismatches in 3D through voxelization
.
Methods & Interpolation: Enforces the inclusion of Nearest Neighbor, Bilinear, and Bicubic interpolations, along with the major warping methods (Mesh/Delaunay, TPS, Beier-Neely) we discussed
.
Transition & Export: Mandates an interactive t parameter slider to control the cross-dissolve and structural warp in real-time
, plus the MediaRecorder API to dump the frame sequence into a downloadable video file
.

--------------------------------------------------

NOTE: Use brother project for UI and design reference `/Users/mercadolibre/ucv/pdi/image-processing` and also use playwright mcp to guarantee there's an stable version at the beginning.

Also from the brother project you can copy the loaders and filter classes examples.
