# Warping Studio

Warping Studio is a vanilla JavaScript morphing playground for:

- 2D image morphing with points or directed feature lines
- 3D OBJ preview with compatible mesh interpolation and voxel fallback
- GPU-assisted image compositing via `WebGPU -> WebGL2 -> CPU`
- video export through `MediaRecorder`

## Run

```bash
npm install
npm run dev
```

For the generated-input regression suite:

```bash
npm run validate:generated
```

## Workspace Structure

- `index.html`: UI layout, controls, runtime panel, report entry point
- `main.js`: state management, backend selection, export flow, report snapshotting
- `morph2d.js`: Delaunay mesh warp, TPS warp, field morphing, interpolation
- `morph3d.js`: OBJ preview, compatible mesh interpolation, voxel fallback
- `report.html` / `report.js`: runtime reporting page

## 1. 2D Image Morphing

### Mesh Warping (Delaunay)

The mesh path creates an intermediate control mesh, triangulates it, then inverse-maps each triangle back to the source and destination images. The benefit is that every triangle stays affine, which makes the warp predictable and fast.

Tiny snippet from `morph2d.js`:

```js
const sourceMesh = [...sourcePoints.map(clonePoint), ...BOUNDARY_ANCHORS.map(clonePoint)];
const destinationMesh = [...destinationPoints.map(clonePoint), ...BOUNDARY_ANCHORS.map(clonePoint)];
const intermediateMesh = sourceMesh.map((point, index) => pointLerp(point, destinationMesh[index], t));
const triangles = buildDelaunay(intermediateMesh, cvInstance);
```

Why it matters:

- the boundary anchors keep the outer frame stable
- the intermediate mesh defines where features should be at time `t`
- inverse mapping avoids holes by sampling the source images instead of pushing pixels forward

### Thin-Plate Splines

TPS treats the control points as constraints on a smooth bending surface. Instead of piecewise triangles, it solves one global warp per image.

Tiny snippet from `morph2d.js`:

```js
const sourceSolver = buildTpsSolver(intermediateControls, sourceControls);
const destinationSolver = buildTpsSolver(intermediateControls, destinationControls);
const sourceCoord = sourceSolver(samplePoint);
const destinationCoord = destinationSolver(samplePoint);
```

Why it matters:

- good for smooth facial or organic deformations
- avoids visible triangle boundaries
- usually more expensive than mesh warping

### Field Morphing (Beier-Neely)

Field morphing uses directed line pairs instead of landmark points. Each pixel is displaced by a weighted combination of all feature lines.

Tiny snippet from `morph2d.js`:

```js
const sourceMapped = computeFieldMappedPoint(pixel, midLine, sourceLines[index]);
const destinationMapped = computeFieldMappedPoint(pixel, midLine, destinationLines[index]);
const weight = ((length ** p) / (a + dist)) ** b;
```

Why it matters:

- good for edges, contours, and elongated structures
- more intuitive than point placement for mouths, brows, or silhouettes
- the line direction matters, because it changes the normal field

## 2. Interpolation

After the warp computes fractional coordinates, the app samples source pixels with one of three interpolation modes.

Tiny snippet from `morph2d.js`:

```js
if (mode === 'nearest') return sampleNearest(imageData, x, y);
if (mode === 'bicubic') return sampleBicubic(imageData, x, y);
return sampleBilinear(imageData, x, y);
```

Practical differences:

- `Nearest`: sharp but jagged
- `Bilinear`: smoother, good default
- `Bicubic`: broader neighborhood, usually the best visual quality

## 3. 3D OBJ Morphing

### Compatible Mesh Interpolation

If two OBJ files share indexed topology, the result panel directly interpolates corresponding vertices.

Tiny snippet from `morph3d.js`:

```js
const blendedVertices = sourceModel.normalizedVertices.map((vertex, index) =>
  vertex.map((value, axis) => lerp(value, destinationModel.normalizedVertices[index][axis], alpha))
);
```

Why it matters:

- the result looks like a real moving surface instead of a diffuse blob
- this is only safe when the two meshes truly correspond vertex-by-vertex

### Voxel Fallback

If topology is incompatible, the app falls back to a voxel-style preview instead of pretending there is a direct vertex mapping.

Tiny snippet from `morph3d.js`:

```js
const sourceVoxels = voxelizeModel(sourceModel, resolution);
const destinationVoxels = voxelizeModel(destinationModel, resolution);
const blend = sourceValue * (1 - alpha) + destinationValue * alpha;
```

Why it matters:

- incompatible meshes still get a useful blended preview
- the voxel slider controls how dense that fallback field is

## 4. GPU Acceleration

Image mode now prefers `WebGPU`, then `WebGL2`, then CPU compositing. The warp solve itself is still CPU, but the final blend step can use GPU acceleration.

Tiny snippet from `main.js`:

```js
if (state.webgpuReady) {
  renderedWith = webgpuBlender.render(...) ? 'webgpu' : null;
}

if (!renderedWith && state.webglReady) {
  renderedWith = webglBlender.render(...) ? 'webgl2' : null;
}
```

Why it matters:

- newer Macs can use WebGPU directly
- browsers without WebGPU can still use the GPU through WebGL2
- the runtime widget tells you which renderer is actually active

## 5. Export

The export button records the currently visible result canvas from `t = 0` to `t = 1`.

Tiny snippet from `main.js`:

```js
const stream = canvas.captureStream(24);
const recorder = new MediaRecorder(stream, { mimeType: supportedType });
```

Why it matters:

- whatever renderer is active is what gets captured
- the report page helps you document exactly which path was used

## 6. Reporting Page

Open the runtime report from the workspace to see:

- current renderer and backend detail
- active algorithm and interpolation
- annotation counts and current mode
- current session snapshot as JSON
- a short explanation of each major process

## Presentation Notes

If you need to explain the system quickly:

1. Control points or lines define feature correspondence.
2. The chosen warp computes where features should move at time `t`.
3. Inverse mapping samples source pixels at those warped coordinates.
4. Interpolation decides how fractional sample locations are reconstructed.
5. The two warped images are blended using the active renderer.
6. OBJ mode either interpolates compatible meshes directly or falls back to voxels.
