import { BlendFilter } from './filters/blendFilter.js';

const STAGE_WIDTH = 640;
const STAGE_HEIGHT = 480;
const VIEW_ROTATION = { x: -0.45, y: 0.8 };
const WARM_COLOR = [255, 132, 82];
const COOL_COLOR = [78, 205, 196];
const LIGHT_DIRECTION = normalizeVector([0.35, -0.4, 1]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function mixColors(a, b, t) {
  return a.map((value, index) => Math.round(lerp(value, b[index], t)));
}

function subtractVectors(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function crossProduct(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function dotProduct(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalizeVector(vector) {
  const length = Math.hypot(...vector) || 1;
  return vector.map((value) => value / length);
}

function rotatePoint(point, rotation = VIEW_ROTATION) {
  const cosY = Math.cos(rotation.y);
  const sinY = Math.sin(rotation.y);
  const cosX = Math.cos(rotation.x);
  const sinX = Math.sin(rotation.x);
  const x1 = point[0] * cosY + point[2] * sinY;
  const z1 = -point[0] * sinY + point[2] * cosY;
  const y1 = point[1] * cosX - z1 * sinX;
  const z2 = point[1] * sinX + z1 * cosX;
  return [x1, y1, z2];
}

function projectRotatedPoint(point) {
  return {
    depth: point[2],
    x: STAGE_WIDTH / 2 + point[0] * 150,
    y: STAGE_HEIGHT / 2 - point[1] * 150
  };
}

function projectPoint(point, rotation = VIEW_ROTATION) {
  return projectRotatedPoint(rotatePoint(point, rotation));
}

function clearCanvas(context) {
  context.save();
  context.fillStyle = '#0c1220';
  context.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
  context.restore();
}

function drawGuideGrid(context) {
  context.save();
  context.strokeStyle = 'rgba(255,255,255,0.05)';
  context.lineWidth = 1;
  for (let x = 0; x <= STAGE_WIDTH; x += 64) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, STAGE_HEIGHT);
    context.stroke();
  }
  for (let y = 0; y <= STAGE_HEIGHT; y += 64) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(STAGE_WIDTH, y);
    context.stroke();
  }
  context.restore();
}

function drawEmptyState(context, message) {
  context.save();
  context.fillStyle = 'rgba(255,255,255,0.6)';
  context.font = '16px "IBM Plex Mono", monospace';
  context.fillText(message, 24, 40);
  context.restore();
}

function drawModelPreview(context, model, color, label) {
  clearCanvas(context);
  drawGuideGrid(context);

  if (!model) {
    drawEmptyState(context, 'Awaiting OBJ input');
    return;
  }

  const projected = model.normalizedVertices.map((vertex) => projectPoint(vertex));
  const sortedEdges = [...model.edges].sort(
    ([a1, b1], [a2, b2]) =>
      (projected[a1].depth + projected[b1].depth) / 2 -
      (projected[a2].depth + projected[b2].depth) / 2
  );

  context.save();
  context.strokeStyle = color;
  context.lineWidth = 1.1;
  context.globalAlpha = 0.7;
  for (const [startIndex, endIndex] of sortedEdges) {
    context.beginPath();
    context.moveTo(projected[startIndex].x, projected[startIndex].y);
    context.lineTo(projected[endIndex].x, projected[endIndex].y);
    context.stroke();
  }

  context.globalAlpha = 1;
  context.fillStyle = '#f8fbff';
  context.font = '12px "IBM Plex Mono", monospace';
  context.fillText(
    `${label} | ${model.vertexCount}v / ${model.faceCount}f`,
    18,
    STAGE_HEIGHT - 18
  );
  context.restore();
}

function canDirectlyMorphMeshes(sourceModel, destinationModel) {
  if (!sourceModel || !destinationModel) {
    return false;
  }

  if (!sourceModel.faces.length || !destinationModel.faces.length) {
    return false;
  }

  return (
    sourceModel.vertexCount === destinationModel.vertexCount &&
    sourceModel.faceCount === destinationModel.faceCount &&
    sourceModel.topologySignature === destinationModel.topologySignature
  );
}

function renderInterpolatedMeshPreview(context, sourceModel, destinationModel, t) {
  clearCanvas(context);
  drawGuideGrid(context);

  if (!sourceModel || !destinationModel) {
    drawEmptyState(context, 'Load both OBJ files for mesh interpolation');
    return;
  }

  const alpha = BlendFilter.sigmoidMix(t, 12);
  const baseColor = mixColors(WARM_COLOR, COOL_COLOR, alpha);
  const blendedVertices = sourceModel.normalizedVertices.map((vertex, index) =>
    vertex.map((value, axis) => lerp(value, destinationModel.normalizedVertices[index][axis], alpha))
  );
  const rotatedVertices = blendedVertices.map((vertex) => rotatePoint(vertex));
  const projectedVertices = rotatedVertices.map((vertex) => projectRotatedPoint(vertex));
  const faces = [];

  for (const [ia, ib, ic] of sourceModel.faces) {
    const a = rotatedVertices[ia];
    const b = rotatedVertices[ib];
    const c = rotatedVertices[ic];
    const normal = normalizeVector(crossProduct(subtractVectors(b, a), subtractVectors(c, a)));
    const light = clamp(dotProduct(normal, LIGHT_DIRECTION) * 0.55 + 0.45, 0.18, 1);
    const depth = (a[2] + b[2] + c[2]) / 3;
    faces.push({ depth, ia, ib, ic, light });
  }

  faces.sort((a, b) => a.depth - b.depth);

  context.save();
  for (const face of faces) {
    const depthFade = clamp(0.88 - face.depth * 0.14, 0.56, 1.08);
    const fillColor = baseColor.map((channel) =>
      Math.round(clamp(channel * (0.34 + face.light * 0.62) * depthFade + 14, 0, 255))
    );
    context.fillStyle = `rgba(${fillColor[0]}, ${fillColor[1]}, ${fillColor[2]}, ${0.22 + face.light * 0.34})`;
    context.beginPath();
    context.moveTo(projectedVertices[face.ia].x, projectedVertices[face.ia].y);
    context.lineTo(projectedVertices[face.ib].x, projectedVertices[face.ib].y);
    context.lineTo(projectedVertices[face.ic].x, projectedVertices[face.ic].y);
    context.closePath();
    context.fill();
  }

  const sortedEdges = [...sourceModel.edges].sort(
    ([a1, b1], [a2, b2]) =>
      (projectedVertices[a1].depth + projectedVertices[b1].depth) / 2 -
      (projectedVertices[a2].depth + projectedVertices[b2].depth) / 2
  );
  context.strokeStyle = `rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, 0.58)`;
  context.lineWidth = 1.1;
  for (const [startIndex, endIndex] of sortedEdges) {
    context.beginPath();
    context.moveTo(projectedVertices[startIndex].x, projectedVertices[startIndex].y);
    context.lineTo(projectedVertices[endIndex].x, projectedVertices[endIndex].y);
    context.stroke();
  }

  context.fillStyle = '#f8fbff';
  context.font = '12px "IBM Plex Mono", monospace';
  context.fillText(`Mesh blend ${alpha.toFixed(2)} | matched topology`, 18, STAGE_HEIGHT - 18);
  context.restore();
}

function voxelIndex(x, y, z, resolution) {
  return z * resolution * resolution + y * resolution + x;
}

function sampleTriangleFace(triangle, resolution, occupancy) {
  const [a, b, c] = triangle;
  const areaVector = [
    (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
    (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  ];
  const area = Math.hypot(...areaVector) * 0.5;
  const steps = Math.max(4, Math.ceil(area * resolution * 6));

  for (let i = 0; i <= steps; i += 1) {
    for (let j = 0; j <= steps - i; j += 1) {
      const u = i / steps;
      const v = j / steps;
      const w = 1 - u - v;
      const point = [
        a[0] * u + b[0] * v + c[0] * w,
        a[1] * u + b[1] * v + c[1] * w,
        a[2] * u + b[2] * v + c[2] * w
      ];
      const x = Math.round(((point[0] + 1) * 0.5) * (resolution - 1));
      const y = Math.round(((point[1] + 1) * 0.5) * (resolution - 1));
      const z = Math.round(((point[2] + 1) * 0.5) * (resolution - 1));
      occupancy[voxelIndex(x, y, z, resolution)] = 1;
    }
  }
}

function voxelizeModel(model, resolution) {
  const cacheKey = String(resolution);
  model.voxels ??= new Map();
  if (model.voxels.has(cacheKey)) {
    return model.voxels.get(cacheKey);
  }

  const occupancy = new Float32Array(resolution * resolution * resolution);

  if (model.faces.length) {
    model.faces.forEach(([ia, ib, ic]) => {
      sampleTriangleFace(
        [
          model.normalizedVertices[ia],
          model.normalizedVertices[ib],
          model.normalizedVertices[ic]
        ],
        resolution,
        occupancy
      );
    });
  } else {
    model.normalizedVertices.forEach((vertex) => {
      const x = Math.round(((vertex[0] + 1) * 0.5) * (resolution - 1));
      const y = Math.round(((vertex[1] + 1) * 0.5) * (resolution - 1));
      const z = Math.round(((vertex[2] + 1) * 0.5) * (resolution - 1));
      occupancy[voxelIndex(x, y, z, resolution)] = 1;
    });
  }

  model.voxels.set(cacheKey, occupancy);
  return occupancy;
}

function renderVoxelPreview(context, sourceModel, destinationModel, t, resolution) {
  clearCanvas(context);
  drawGuideGrid(context);

  if (!sourceModel || !destinationModel) {
    drawEmptyState(context, 'Load both OBJ files for voxel morphing');
    return;
  }

  const sourceVoxels = voxelizeModel(sourceModel, resolution);
  const destinationVoxels = voxelizeModel(destinationModel, resolution);
  const alpha = BlendFilter.sigmoidMix(t, 12);
  const projected = [];

  for (let z = 0; z < resolution; z += 1) {
    for (let y = 0; y < resolution; y += 1) {
      for (let x = 0; x < resolution; x += 1) {
        const index = voxelIndex(x, y, z, resolution);
        const sourceValue = sourceVoxels[index];
        const destinationValue = destinationVoxels[index];
        const blend = sourceValue * (1 - alpha) + destinationValue * alpha;
        if (blend < 0.42) {
          continue;
        }
        const point = [
          (x / (resolution - 1)) * 2 - 1,
          (y / (resolution - 1)) * 2 - 1,
          (z / (resolution - 1)) * 2 - 1
        ];
        const screen = projectPoint(point);
        projected.push({
          blend,
          colorMix: destinationValue > sourceValue ? alpha : 1 - alpha,
          depth: screen.depth,
          x: screen.x,
          y: screen.y
        });
      }
    }
  }

  projected.sort((a, b) => a.depth - b.depth);

  context.save();
  projected.forEach((voxel) => {
    const color = mixColors(WARM_COLOR, COOL_COLOR, voxel.colorMix);
    context.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${Math.max(0.15, voxel.blend)})`;
    context.fillRect(voxel.x, voxel.y, 4, 4);
  });

  context.fillStyle = '#f8fbff';
  context.font = '12px "IBM Plex Mono", monospace';
  context.fillText(`Voxel fallback ${alpha.toFixed(2)} | ${resolution}^3 voxels`, 18, STAGE_HEIGHT - 18);
  context.restore();
}

export class Morph3DSystem {
  constructor({ sourceCanvas, destinationCanvas, resultCanvas }) {
    this.sourceCanvas = sourceCanvas;
    this.destinationCanvas = destinationCanvas;
    this.resultCanvas = resultCanvas;
    this.sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
    this.destinationContext = destinationCanvas.getContext('2d', { willReadFrequently: true });
    this.resultContext = resultCanvas.getContext('2d', { willReadFrequently: true });
    this.sourceModel = null;
    this.destinationModel = null;
    this.resolution = 24;
    this.t = 0.5;
    this.render();
  }

  setAsset(slot, model) {
    if (slot === 'source') {
      this.sourceModel = model;
    } else {
      this.destinationModel = model;
    }
    this.render();
  }

  setOptions({ resolution, t }) {
    if (typeof resolution === 'number') {
      this.resolution = resolution;
    }
    if (typeof t === 'number') {
      this.t = t;
    }
  }

  getMeta() {
    return {
      destination: this.destinationModel
        ? `${this.destinationModel.vertexCount}v / ${this.destinationModel.faceCount}f`
        : 'Awaiting input',
      source: this.sourceModel
        ? `${this.sourceModel.vertexCount}v / ${this.sourceModel.faceCount}f`
        : 'Awaiting input'
    };
  }

  getRuntimeSummary() {
    const compatible =
      this.sourceModel && this.destinationModel
        ? canDirectlyMorphMeshes(this.sourceModel, this.destinationModel)
        : false;

    return {
      compatibleTopology: Boolean(compatible),
      hasBothModels: Boolean(this.sourceModel && this.destinationModel),
      processLabel: compatible ? 'Compatible mesh interpolation' : 'Voxel fallback blend',
      resolution: this.resolution,
      source: this.sourceModel
        ? `${this.sourceModel.vertexCount}v / ${this.sourceModel.faceCount}f`
        : 'Awaiting input',
      destination: this.destinationModel
        ? `${this.destinationModel.vertexCount}v / ${this.destinationModel.faceCount}f`
        : 'Awaiting input'
    };
  }

  render() {
    drawModelPreview(this.sourceContext, this.sourceModel, '#ff8452', 'Source');
    drawModelPreview(this.destinationContext, this.destinationModel, '#4ecdc4', 'Destination');

    if (!this.sourceModel || !this.destinationModel) {
      renderVoxelPreview(
        this.resultContext,
        this.sourceModel,
        this.destinationModel,
        this.t,
        this.resolution
      );

      return {
        status: 'Load two OBJ files to enable 3D morphing.',
        warpSummary: `obj / ${this.resolution}^3 voxels`
      };
    }

    if (canDirectlyMorphMeshes(this.sourceModel, this.destinationModel)) {
      renderInterpolatedMeshPreview(
        this.resultContext,
        this.sourceModel,
        this.destinationModel,
        this.t
      );

      return {
        status: 'OBJ morph active with compatible mesh interpolation.',
        warpSummary: 'obj / mesh blend'
      };
    }

    renderVoxelPreview(
      this.resultContext,
      this.sourceModel,
      this.destinationModel,
      this.t,
      this.resolution
    );

    return {
      status: `OBJ fallback active with ${this.resolution}^3 voxel blending for incompatible topology.`,
      warpSummary: `obj / ${this.resolution}^3 voxels`
    };
  }
}
