import { BaseFilter } from './filters/baseFilter.js';

const STAGE_WIDTH = 640;
const STAGE_HEIGHT = 480;
const BOUNDARY_ANCHORS = [
  { x: 0, y: 0 },
  { x: STAGE_WIDTH / 2, y: 0 },
  { x: STAGE_WIDTH - 1, y: 0 },
  { x: STAGE_WIDTH - 1, y: STAGE_HEIGHT / 2 },
  { x: STAGE_WIDTH - 1, y: STAGE_HEIGHT - 1 },
  { x: STAGE_WIDTH / 2, y: STAGE_HEIGHT - 1 },
  { x: 0, y: STAGE_HEIGHT - 1 },
  { x: 0, y: STAGE_HEIGHT / 2 }
];

function createSurface(width = STAGE_WIDTH, height = STAGE_HEIGHT) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return { canvas, context, width, height };
}

function clonePoint(point) {
  return { x: point.x, y: point.y };
}

function cloneLine(line) {
  return {
    start: clonePoint(line.start),
    end: clonePoint(line.end)
  };
}

function pointLerp(a, b, t) {
  return {
    x: BaseFilter.lerp(a.x, b.x, t),
    y: BaseFilter.lerp(a.y, b.y, t)
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizePoint(point) {
  return {
    x: BaseFilter.clamp(point.x, 0, STAGE_WIDTH - 1),
    y: BaseFilter.clamp(point.y, 0, STAGE_HEIGHT - 1)
  };
}

function clearSurface(surface, fillStyle = '#0d1220') {
  surface.context.save();
  surface.context.fillStyle = fillStyle;
  surface.context.fillRect(0, 0, surface.width, surface.height);
  surface.context.restore();
}

function getCanvasEventPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return normalizePoint({
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  });
}

function prepareStageAsset(asset) {
  const surface = createSurface();
  clearSurface(surface, '#0f1421');
  const fit = computeContainFit(asset.width, asset.height, STAGE_WIDTH, STAGE_HEIGHT);
  surface.context.drawImage(asset.canvas, fit.x, fit.y, fit.width, fit.height);

  return {
    ...asset,
    fit,
    stageCanvas: surface.canvas,
    stageImageData: surface.context.getImageData(0, 0, STAGE_WIDTH, STAGE_HEIGHT)
  };
}

function computeContainFit(srcWidth, srcHeight, destWidth, destHeight) {
  const scale = Math.min(destWidth / srcWidth, destHeight / srcHeight);
  const width = srcWidth * scale;
  const height = srcHeight * scale;
  return {
    height,
    width,
    x: (destWidth - width) / 2,
    y: (destHeight - height) / 2
  };
}

function drawStageImage(context, asset) {
  context.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
  context.fillStyle = '#0d1220';
  context.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
  if (asset?.stageCanvas) {
    context.drawImage(asset.stageCanvas, 0, 0);
  }
}

function drawPointOverlay(context, points, color) {
  points.forEach((point, index) => {
    context.save();
    context.beginPath();
    context.fillStyle = color;
    context.arc(point.x, point.y, 5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(255,255,255,0.85)';
    context.lineWidth = 1.5;
    context.stroke();
    context.fillStyle = '#f8fbff';
    context.font = '12px "IBM Plex Mono", monospace';
    context.fillText(String(index + 1), point.x + 8, point.y - 8);
    context.restore();
  });
}

function drawLineOverlay(context, lines, color, pendingStart = null) {
  context.save();
  context.lineWidth = 2;
  context.strokeStyle = color;
  context.fillStyle = color;

  lines.forEach((line, index) => {
    context.beginPath();
    context.moveTo(line.start.x, line.start.y);
    context.lineTo(line.end.x, line.end.y);
    context.stroke();
    drawArrowHead(context, line.start, line.end, color);
    context.font = '12px "IBM Plex Mono", monospace';
    context.fillText(`L${index + 1}`, line.end.x + 8, line.end.y - 8);
  });

  if (pendingStart) {
    context.beginPath();
    context.arc(pendingStart.x, pendingStart.y, 5, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

function drawArrowHead(context, start, end, color) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  context.save();
  context.translate(end.x, end.y);
  context.rotate(angle);
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(-12, -4);
  context.lineTo(-12, 4);
  context.closePath();
  context.fill();
  context.restore();
}

function barycentric(point, triangle) {
  const [a, b, c] = triangle;
  const denominator =
    (b.y - c.y) * (a.x - c.x) +
    (c.x - b.x) * (a.y - c.y);

  if (Math.abs(denominator) < 1e-5) {
    return null;
  }

  const w1 =
    ((b.y - c.y) * (point.x - c.x) +
      (c.x - b.x) * (point.y - c.y)) /
    denominator;
  const w2 =
    ((c.y - a.y) * (point.x - c.x) +
      (a.x - c.x) * (point.y - c.y)) /
    denominator;
  const w3 = 1 - w1 - w2;
  return [w1, w2, w3];
}

function triangleBounds(triangle) {
  return {
    maxX: Math.min(STAGE_WIDTH - 1, Math.ceil(Math.max(triangle[0].x, triangle[1].x, triangle[2].x))),
    maxY: Math.min(STAGE_HEIGHT - 1, Math.ceil(Math.max(triangle[0].y, triangle[1].y, triangle[2].y))),
    minX: Math.max(0, Math.floor(Math.min(triangle[0].x, triangle[1].x, triangle[2].x))),
    minY: Math.max(0, Math.floor(Math.min(triangle[0].y, triangle[1].y, triangle[2].y)))
  };
}

function samplePixel(imageData, x, y, mode) {
  if (mode === 'nearest') {
    return sampleNearest(imageData, x, y);
  }

  if (mode === 'bicubic') {
    return sampleBicubic(imageData, x, y);
  }

  return sampleBilinear(imageData, x, y);
}

function sampleNearest(imageData, x, y) {
  const clampedX = Math.round(BaseFilter.clamp(x, 0, imageData.width - 1));
  const clampedY = Math.round(BaseFilter.clamp(y, 0, imageData.height - 1));
  return readPixel(imageData, clampedX, clampedY);
}

function sampleBilinear(imageData, x, y) {
  const x0 = Math.floor(BaseFilter.clamp(x, 0, imageData.width - 1));
  const y0 = Math.floor(BaseFilter.clamp(y, 0, imageData.height - 1));
  const x1 = Math.min(imageData.width - 1, x0 + 1);
  const y1 = Math.min(imageData.height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const p00 = readPixel(imageData, x0, y0);
  const p10 = readPixel(imageData, x1, y0);
  const p01 = readPixel(imageData, x0, y1);
  const p11 = readPixel(imageData, x1, y1);
  return [0, 1, 2, 3].map((channel) =>
    Math.round(
      p00[channel] * (1 - fx) * (1 - fy) +
      p10[channel] * fx * (1 - fy) +
      p01[channel] * (1 - fx) * fy +
      p11[channel] * fx * fy
    )
  );
}

function sampleBicubic(imageData, x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const result = [0, 0, 0, 0];

  for (let channel = 0; channel < 4; channel += 1) {
    let value = 0;
    for (let row = -1; row <= 2; row += 1) {
      const sampleRow = [];
      for (let col = -1; col <= 2; col += 1) {
        const pixel = readPixel(
          imageData,
          BaseFilter.clamp(ix + col, 0, imageData.width - 1),
          BaseFilter.clamp(iy + row, 0, imageData.height - 1)
        );
        sampleRow.push(pixel[channel]);
      }
      value += cubicInterpolate(sampleRow[0], sampleRow[1], sampleRow[2], sampleRow[3], fx) * cubicWeight(row - fy);
    }
    result[channel] = Math.round(BaseFilter.clamp(value, 0, 255));
  }

  return result;
}

function cubicWeight(x) {
  const abs = Math.abs(x);
  if (abs <= 1) {
    return 1.5 * abs ** 3 - 2.5 * abs ** 2 + 1;
  }
  if (abs < 2) {
    return -0.5 * abs ** 3 + 2.5 * abs ** 2 - 4 * abs + 2;
  }
  return 0;
}

function cubicInterpolate(v0, v1, v2, v3, t) {
  return (
    v1 +
    0.5 *
      t *
      (v2 - v0 +
        t * (2 * v0 - 5 * v1 + 4 * v2 - v3 +
          t * (3 * (v1 - v2) + v3 - v0)))
  );
}

function readPixel(imageData, x, y) {
  const index = (Math.round(y) * imageData.width + Math.round(x)) * 4;
  const { data } = imageData;
  return [data[index], data[index + 1], data[index + 2], data[index + 3]];
}

function writePixel(buffer, x, y, rgba) {
  const index = (y * STAGE_WIDTH + x) * 4;
  buffer[index] = rgba[0];
  buffer[index + 1] = rgba[1];
  buffer[index + 2] = rgba[2];
  buffer[index + 3] = rgba[3];
}

function buildDelaunay(points, cvInstance) {
  if (cvInstance?.Subdiv2D && cvInstance?.Rect) {
    try {
      return buildOpenCvDelaunay(points, cvInstance);
    } catch {
      return buildBowyerWatson(points);
    }
  }

  return buildBowyerWatson(points);
}

function buildOpenCvDelaunay(points, cvInstance) {
  const subdiv = new cvInstance.Subdiv2D(new cvInstance.Rect(0, 0, STAGE_WIDTH, STAGE_HEIGHT));
  points.forEach((point) => subdiv.insert(new cvInstance.Point(point.x, point.y)));
  const triangleList = new cvInstance.Mat();
  subdiv.getTriangleList(triangleList);
  const triangles = [];
  const seen = new Set();

  for (let index = 0; index < triangleList.data32F.length; index += 6) {
    const triangle = [
      { x: triangleList.data32F[index], y: triangleList.data32F[index + 1] },
      { x: triangleList.data32F[index + 2], y: triangleList.data32F[index + 3] },
      { x: triangleList.data32F[index + 4], y: triangleList.data32F[index + 5] }
    ];

    if (triangle.some((point) => point.x < -1 || point.y < -1 || point.x > STAGE_WIDTH + 1 || point.y > STAGE_HEIGHT + 1)) {
      continue;
    }

    const mapped = triangle.map((point) => nearestPointIndex(points, point));
    if (mapped.some((value) => value < 0) || new Set(mapped).size !== 3) {
      continue;
    }

    const key = [...mapped].sort((a, b) => a - b).join(':');
    if (!seen.has(key)) {
      seen.add(key);
      triangles.push(mapped);
    }
  }

  triangleList.delete();
  subdiv.delete();

  return triangles.length ? triangles : buildBowyerWatson(points);
}

function nearestPointIndex(points, query) {
  let bestIndex = -1;
  let bestDistance = Infinity;

  points.forEach((point, index) => {
    const value = distance(point, query);
    if (value < bestDistance) {
      bestDistance = value;
      bestIndex = index;
    }
  });

  return bestDistance < 2 ? bestIndex : -1;
}

function buildBowyerWatson(points) {
  const superTriangle = [
    { x: -STAGE_WIDTH * 4, y: -STAGE_HEIGHT * 3 },
    { x: STAGE_WIDTH * 5, y: -STAGE_HEIGHT * 3 },
    { x: STAGE_WIDTH / 2, y: STAGE_HEIGHT * 6 }
  ];
  const extended = [...points, ...superTriangle];
  const superStart = points.length;
  let triangles = [[superStart, superStart + 1, superStart + 2]];

  points.forEach((point, index) => {
    const badTriangles = [];

    triangles.forEach((triangle, triangleIndex) => {
      if (pointInCircumcircle(point, triangle, extended)) {
        badTriangles.push(triangleIndex);
      }
    });

    const edgeCounts = new Map();

    for (const triangleIndex of badTriangles.reverse()) {
      const [a, b, c] = triangles[triangleIndex];
      [
        [a, b],
        [b, c],
        [c, a]
      ].forEach(([start, end]) => {
        const key = start < end ? `${start}:${end}` : `${end}:${start}`;
        edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
      });
      triangles.splice(triangleIndex, 1);
    }

    for (const [key, count] of edgeCounts.entries()) {
      if (count !== 1) {
        continue;
      }
      const [start, end] = key.split(':').map(Number);
      triangles.push([start, end, index]);
    }
  });

  return triangles.filter((triangle) => triangle.every((value) => value < points.length));
}

function pointInCircumcircle(point, triangle, points) {
  const [a, b, c] = triangle.map((index) => points[index]);
  const denominator =
    2 *
    (a.x * (b.y - c.y) +
      b.x * (c.y - a.y) +
      c.x * (a.y - b.y));

  if (Math.abs(denominator) < 1e-8) {
    return false;
  }

  const aSq = a.x * a.x + a.y * a.y;
  const bSq = b.x * b.x + b.y * b.y;
  const cSq = c.x * c.x + c.y * c.y;
  const center = {
    x:
      (aSq * (b.y - c.y) +
        bSq * (c.y - a.y) +
        cSq * (a.y - b.y)) /
      denominator,
    y:
      (aSq * (c.x - b.x) +
        bSq * (a.x - c.x) +
        cSq * (b.x - a.x)) /
      denominator
  };
  const radiusSquared =
    (center.x - a.x) * (center.x - a.x) +
    (center.y - a.y) * (center.y - a.y);
  const distanceSquared =
    (center.x - point.x) * (center.x - point.x) +
    (center.y - point.y) * (center.y - point.y);

  return distanceSquared <= radiusSquared + 1e-5;
}

function solveLinearSystem(matrix, values) {
  const size = matrix.length;
  const system = matrix.map((row, rowIndex) => [...row, values[rowIndex]]);

  for (let pivot = 0; pivot < size; pivot += 1) {
    let maxRow = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(system[row][pivot]) > Math.abs(system[maxRow][pivot])) {
        maxRow = row;
      }
    }

    [system[pivot], system[maxRow]] = [system[maxRow], system[pivot]];
    const pivotValue = system[pivot][pivot];

    if (Math.abs(pivotValue) < 1e-8) {
      continue;
    }

    for (let column = pivot; column <= size; column += 1) {
      system[pivot][column] /= pivotValue;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivot) {
        continue;
      }
      const factor = system[row][pivot];
      for (let column = pivot; column <= size; column += 1) {
        system[row][column] -= factor * system[pivot][column];
      }
    }
  }

  return system.map((row) => row[size]);
}

function tpsKernel(radius) {
  const r2 = radius * radius;
  return r2 === 0 ? 0 : r2 * Math.log(r2 + 1e-8);
}

function buildTpsSolver(fromPoints, toPoints) {
  const count = fromPoints.length;
  const size = count + 3;
  const matrix = Array.from({ length: size }, () => Array(size).fill(0));

  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      matrix[row][column] = tpsKernel(distance(fromPoints[row], fromPoints[column]));
    }
    matrix[row][count] = 1;
    matrix[row][count + 1] = fromPoints[row].x;
    matrix[row][count + 2] = fromPoints[row].y;
    matrix[count][row] = 1;
    matrix[count + 1][row] = fromPoints[row].x;
    matrix[count + 2][row] = fromPoints[row].y;
  }

  const targetX = [...toPoints.map((point) => point.x), 0, 0, 0];
  const targetY = [...toPoints.map((point) => point.y), 0, 0, 0];
  const solutionX = solveLinearSystem(matrix, targetX);
  const solutionY = solveLinearSystem(matrix, targetY);

  return (point) => {
    let mappedX = solutionX[count] + solutionX[count + 1] * point.x + solutionX[count + 2] * point.y;
    let mappedY = solutionY[count] + solutionY[count + 1] * point.x + solutionY[count + 2] * point.y;

    for (let index = 0; index < count; index += 1) {
      const radial = tpsKernel(distance(point, fromPoints[index]));
      mappedX += solutionX[index] * radial;
      mappedY += solutionY[index] * radial;
    }

    return { x: mappedX, y: mappedY };
  };
}

function lineLerp(a, b, t) {
  return {
    end: pointLerp(a.end, b.end, t),
    start: pointLerp(a.start, b.start, t)
  };
}

function lineVector(line) {
  return {
    x: line.end.x - line.start.x,
    y: line.end.y - line.start.y
  };
}

function lineLength(vector) {
  return Math.hypot(vector.x, vector.y) || 1e-6;
}

function lineNormal(vector) {
  const length = lineLength(vector);
  return {
    x: -vector.y / length,
    y: vector.x / length
  };
}

function computeFieldMappedPoint(point, referenceLine, targetLine) {
  const refVector = lineVector(referenceLine);
  const refLength = lineLength(refVector);
  const refNormal = lineNormal(refVector);
  const targetVector = lineVector(targetLine);
  const targetLength = lineLength(targetVector);
  const targetNormal = lineNormal(targetVector);
  const pointVector = {
    x: point.x - referenceLine.start.x,
    y: point.y - referenceLine.start.y
  };
  const u = (pointVector.x * refVector.x + pointVector.y * refVector.y) / (refLength * refLength);
  const v = pointVector.x * refNormal.x + pointVector.y * refNormal.y;

  return {
    x: targetLine.start.x + u * targetVector.x + (v * targetNormal.x * targetLength) / refLength,
    y: targetLine.start.y + u * targetVector.y + (v * targetNormal.y * targetLength) / refLength
  };
}

function lineDistance(point, line) {
  const vector = lineVector(line);
  const lengthSquared = vector.x * vector.x + vector.y * vector.y || 1e-6;
  const t =
    ((point.x - line.start.x) * vector.x + (point.y - line.start.y) * vector.y) /
    lengthSquared;

  if (t < 0) {
    return distance(point, line.start);
  }
  if (t > 1) {
    return distance(point, line.end);
  }

  const projected = {
    x: line.start.x + vector.x * t,
    y: line.start.y + vector.y * t
  };
  return distance(point, projected);
}

function renderMeshWarp(sourceAsset, destinationAsset, sourcePoints, destinationPoints, t, interpolation, cvInstance) {
  const sourceImage = sourceAsset.stageImageData;
  const destinationImage = destinationAsset.stageImageData;
  const sourceFrame = new Uint8ClampedArray(sourceImage.data);
  const destinationFrame = new Uint8ClampedArray(destinationImage.data);
  const sourceMesh = [...sourcePoints.map(clonePoint), ...BOUNDARY_ANCHORS.map(clonePoint)];
  const destinationMesh = [...destinationPoints.map(clonePoint), ...BOUNDARY_ANCHORS.map(clonePoint)];
  const intermediateMesh = sourceMesh.map((point, index) => pointLerp(point, destinationMesh[index], t));
  const triangles = buildDelaunay(intermediateMesh, cvInstance);

  triangles.forEach((triangleIndices) => {
    const intermediateTriangle = triangleIndices.map((index) => intermediateMesh[index]);
    const sourceTriangle = triangleIndices.map((index) => sourceMesh[index]);
    const destinationTriangle = triangleIndices.map((index) => destinationMesh[index]);
    const bounds = triangleBounds(intermediateTriangle);

    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        const weights = barycentric({ x: x + 0.5, y: y + 0.5 }, intermediateTriangle);
        if (!weights || weights.some((value) => value < -0.001)) {
          continue;
        }

        const sourceCoord = weightedPoint(sourceTriangle, weights);
        const destinationCoord = weightedPoint(destinationTriangle, weights);
        writePixel(sourceFrame, x, y, samplePixel(sourceImage, sourceCoord.x, sourceCoord.y, interpolation));
        writePixel(destinationFrame, x, y, samplePixel(destinationImage, destinationCoord.x, destinationCoord.y, interpolation));
      }
    }
  });

  return {
    destinationFrame,
    sourceFrame
  };
}

function weightedPoint(triangle, weights) {
  return {
    x: triangle[0].x * weights[0] + triangle[1].x * weights[1] + triangle[2].x * weights[2],
    y: triangle[0].y * weights[0] + triangle[1].y * weights[1] + triangle[2].y * weights[2]
  };
}

function renderTpsWarp(sourceAsset, destinationAsset, sourcePoints, destinationPoints, t, interpolation) {
  const sourceFrame = new Uint8ClampedArray(STAGE_WIDTH * STAGE_HEIGHT * 4);
  const destinationFrame = new Uint8ClampedArray(STAGE_WIDTH * STAGE_HEIGHT * 4);
  const sourceImage = sourceAsset.stageImageData;
  const destinationImage = destinationAsset.stageImageData;
  const sourceControls = [...sourcePoints.map(clonePoint), ...BOUNDARY_ANCHORS.map(clonePoint)];
  const destinationControls = [...destinationPoints.map(clonePoint), ...BOUNDARY_ANCHORS.map(clonePoint)];
  const intermediateControls = sourceControls.map((point, index) => pointLerp(point, destinationControls[index], t));
  const sourceSolver = buildTpsSolver(intermediateControls, sourceControls);
  const destinationSolver = buildTpsSolver(intermediateControls, destinationControls);

  for (let y = 0; y < STAGE_HEIGHT; y += 1) {
    for (let x = 0; x < STAGE_WIDTH; x += 1) {
      const samplePoint = { x, y };
      const sourceCoord = sourceSolver(samplePoint);
      const destinationCoord = destinationSolver(samplePoint);
      writePixel(sourceFrame, x, y, samplePixel(sourceImage, sourceCoord.x, sourceCoord.y, interpolation));
      writePixel(destinationFrame, x, y, samplePixel(destinationImage, destinationCoord.x, destinationCoord.y, interpolation));
    }
  }

  return {
    destinationFrame,
    sourceFrame
  };
}

function renderFieldWarp(sourceAsset, destinationAsset, sourceLines, destinationLines, t, interpolation) {
  const sourceFrame = new Uint8ClampedArray(STAGE_WIDTH * STAGE_HEIGHT * 4);
  const destinationFrame = new Uint8ClampedArray(STAGE_WIDTH * STAGE_HEIGHT * 4);
  const sourceImage = sourceAsset.stageImageData;
  const destinationImage = destinationAsset.stageImageData;
  const intermediateLines = sourceLines.map((line, index) => lineLerp(line, destinationLines[index], t));
  const a = 0.02;
  const b = 2;
  const p = 0.5;

  for (let y = 0; y < STAGE_HEIGHT; y += 1) {
    for (let x = 0; x < STAGE_WIDTH; x += 1) {
      const pixel = { x, y };
      let sourceDx = 0;
      let sourceDy = 0;
      let destinationDx = 0;
      let destinationDy = 0;
      let weightSum = 0;

      for (let index = 0; index < intermediateLines.length; index += 1) {
        const midLine = intermediateLines[index];
        const sourceMapped = computeFieldMappedPoint(pixel, midLine, sourceLines[index]);
        const destinationMapped = computeFieldMappedPoint(pixel, midLine, destinationLines[index]);
        const dist = lineDistance(pixel, midLine);
        const length = lineLength(lineVector(midLine));
        const weight = ((length ** p) / (a + dist)) ** b;
        sourceDx += (sourceMapped.x - pixel.x) * weight;
        sourceDy += (sourceMapped.y - pixel.y) * weight;
        destinationDx += (destinationMapped.x - pixel.x) * weight;
        destinationDy += (destinationMapped.y - pixel.y) * weight;
        weightSum += weight;
      }

      const sourceCoord = {
        x: pixel.x + sourceDx / (weightSum || 1),
        y: pixel.y + sourceDy / (weightSum || 1)
      };
      const destinationCoord = {
        x: pixel.x + destinationDx / (weightSum || 1),
        y: pixel.y + destinationDy / (weightSum || 1)
      };

      writePixel(sourceFrame, x, y, samplePixel(sourceImage, sourceCoord.x, sourceCoord.y, interpolation));
      writePixel(destinationFrame, x, y, samplePixel(destinationImage, destinationCoord.x, destinationCoord.y, interpolation));
    }
  }

  return {
    destinationFrame,
    sourceFrame
  };
}

function paintFrameToSurface(surface, frame) {
  surface.context.putImageData(new ImageData(frame, STAGE_WIDTH, STAGE_HEIGHT), 0, 0);
}

export class Morph2DSystem {
  constructor({ sourceCanvas, destinationCanvas }) {
    this.sourceCanvas = sourceCanvas;
    this.destinationCanvas = destinationCanvas;
    this.sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
    this.destinationContext = destinationCanvas.getContext('2d', { willReadFrequently: true });
    this.sourceAsset = null;
    this.destinationAsset = null;
    this.points = {
      destination: [],
      source: []
    };
    this.lines = {
      destination: [],
      source: []
    };
    this.pendingLineStart = {
      destination: null,
      source: null
    };
    this.annotationMode = 'points';
    this.interpolation = 'bilinear';
    this.t = 0.5;
    this.warpMode = 'mesh';
    this.sourceBlendSurface = createSurface();
    this.destinationBlendSurface = createSurface();
    drawStageImage(this.sourceContext, null);
    drawStageImage(this.destinationContext, null);
  }

  setAsset(slot, asset) {
    const prepared = asset ? prepareStageAsset(asset) : null;
    if (slot === 'source') {
      this.sourceAsset = prepared;
    } else {
      this.destinationAsset = prepared;
    }
    this.drawPanels();
  }

  setOptions({ annotationMode, interpolation, t, warpMode }) {
    if (annotationMode) {
      this.annotationMode = annotationMode;
    }
    if (interpolation) {
      this.interpolation = interpolation;
    }
    if (typeof t === 'number') {
      this.t = BaseFilter.clamp(t, 0, 1);
    }
    if (warpMode) {
      this.warpMode = warpMode;
    }
  }

  clearAnnotations() {
    this.points = { destination: [], source: [] };
    this.lines = { destination: [], source: [] };
    this.pendingLineStart = { destination: null, source: null };
    this.drawPanels();
  }

  registerPointer(slot, event) {
    const point = getCanvasEventPoint(slot === 'source' ? this.sourceCanvas : this.destinationCanvas, event);
    if (this.annotationMode === 'points') {
      this.points[slot].push(point);
    } else {
      if (!this.pendingLineStart[slot]) {
        this.pendingLineStart[slot] = point;
      } else {
        this.lines[slot].push({
          end: point,
          start: this.pendingLineStart[slot]
        });
        this.pendingLineStart[slot] = null;
      }
    }

    this.drawPanels();
  }

  getPairSummary() {
    return {
      lines: Math.min(this.lines.source.length, this.lines.destination.length),
      points: Math.min(this.points.source.length, this.points.destination.length)
    };
  }

  undoLastAnnotation() {
    if (this.annotationMode === 'points') {
      if (this.points.source.length > this.points.destination.length) {
        this.points.source.pop();
      } else if (this.points.destination.length > this.points.source.length) {
        this.points.destination.pop();
      } else if (this.points.source.length > 0) {
        this.points.source.pop();
        this.points.destination.pop();
      }
    } else {
      if (this.pendingLineStart.source) {
        this.pendingLineStart.source = null;
      } else if (this.pendingLineStart.destination) {
        this.pendingLineStart.destination = null;
      } else if (this.lines.source.length > this.lines.destination.length) {
        this.lines.source.pop();
      } else if (this.lines.destination.length > this.lines.source.length) {
        this.lines.destination.pop();
      } else if (this.lines.source.length > 0) {
        this.lines.source.pop();
        this.lines.destination.pop();
      }
    }

    this.drawPanels();
  }

  getRuntimeSummary(hasOpenCv = false) {
    const pairs = this.getPairSummary();
    const pointRequirementMet = pairs.points >= 3;
    const lineRequirementMet = pairs.lines >= 1;
    const canWarp =
      (this.warpMode === 'mesh' && pointRequirementMet) ||
      (this.warpMode === 'tps' && pointRequirementMet) ||
      (this.warpMode === 'field' && lineRequirementMet);

    let processLabel = 'Cross-dissolve baseline';
    let backendDetail = 'Direct blend because correspondences are incomplete';

    if (canWarp && this.warpMode === 'mesh') {
      processLabel = 'Mesh warp';
      backendDetail = hasOpenCv ? 'OpenCV Delaunay triangulation' : 'Bowyer-Watson Delaunay fallback';
    } else if (canWarp && this.warpMode === 'tps') {
      processLabel = 'Thin-plate spline warp';
      backendDetail = 'Radial basis spline solve';
    } else if (canWarp && this.warpMode === 'field') {
      processLabel = 'Field morph';
      backendDetail = 'Beier-Neely directed line field';
    }

    let nextAction = 'Add matching annotations on both canvases.';
    if (this.annotationMode === 'points') {
      if (this.points.source.length > this.points.destination.length) {
        nextAction = 'Add the matching point on Destination.';
      } else if (this.points.destination.length > this.points.source.length) {
        nextAction = 'Add the matching point on Source.';
      } else {
        nextAction = 'Click Source, then Destination, to add the next control point pair.';
      }
    } else if (this.pendingLineStart.source) {
      nextAction = 'Finish the current Source line with its endpoint.';
    } else if (this.pendingLineStart.destination) {
      nextAction = 'Finish the current Destination line with its endpoint.';
    } else if (this.lines.source.length > this.lines.destination.length) {
      nextAction = 'Draw the matching directed line on Destination.';
    } else if (this.lines.destination.length > this.lines.source.length) {
      nextAction = 'Draw the matching directed line on Source.';
    } else {
      nextAction = 'Click line start and end on Source, then repeat on Destination.';
    }

    return {
      annotationMode: this.annotationMode,
      backendDetail,
      canWarp,
      destinationCounts: {
        lines: this.lines.destination.length,
        points: this.points.destination.length
      },
      interpolation: this.interpolation,
      nextAction,
      pairs,
      pending: {
        destinationLineStart: Boolean(this.pendingLineStart.destination),
        sourceLineStart: Boolean(this.pendingLineStart.source)
      },
      processLabel,
      sourceCounts: {
        lines: this.lines.source.length,
        points: this.points.source.length
      },
      warpMode: this.warpMode
    };
  }

  getMeta() {
    return {
      destination: this.destinationAsset
        ? `${this.destinationAsset.width}x${this.destinationAsset.height}`
        : 'Awaiting input',
      source: this.sourceAsset
        ? `${this.sourceAsset.width}x${this.sourceAsset.height}`
        : 'Awaiting input'
    };
  }

  drawPanels() {
    drawStageImage(this.sourceContext, this.sourceAsset);
    drawStageImage(this.destinationContext, this.destinationAsset);
    drawPointOverlay(this.sourceContext, this.points.source, '#ff8452');
    drawPointOverlay(this.destinationContext, this.points.destination, '#4ecdc4');
    drawLineOverlay(this.sourceContext, this.lines.source, '#ff8452', this.pendingLineStart.source);
    drawLineOverlay(this.destinationContext, this.lines.destination, '#4ecdc4', this.pendingLineStart.destination);
  }

  render(cvInstance = null) {
    this.drawPanels();

    clearSurface(this.sourceBlendSurface, '#0d1220');
    clearSurface(this.destinationBlendSurface, '#0d1220');

    if (!this.sourceAsset || !this.destinationAsset) {
      if (this.sourceAsset) {
        this.sourceBlendSurface.context.drawImage(this.sourceAsset.stageCanvas, 0, 0);
      }
      if (this.destinationAsset) {
        this.destinationBlendSurface.context.drawImage(this.destinationAsset.stageCanvas, 0, 0);
      }

      return {
        blendDestination: this.destinationBlendSurface.canvas,
        blendSource: this.sourceBlendSurface.canvas,
        status: 'Load both images to enable warping.',
        width: STAGE_WIDTH,
        warpSummary: 'Cross-dissolve scaffold',
        height: STAGE_HEIGHT
      };
    }

    let frames = null;
    const pairCount = Math.min(this.points.source.length, this.points.destination.length);
    const lineCount = Math.min(this.lines.source.length, this.lines.destination.length);

    if (this.warpMode === 'mesh' && pairCount >= 3) {
      frames = renderMeshWarp(
        this.sourceAsset,
        this.destinationAsset,
        this.points.source.slice(0, pairCount),
        this.points.destination.slice(0, pairCount),
        this.t,
        this.interpolation,
        cvInstance
      );
    } else if (this.warpMode === 'tps' && pairCount >= 3) {
      frames = renderTpsWarp(
        this.sourceAsset,
        this.destinationAsset,
        this.points.source.slice(0, pairCount),
        this.points.destination.slice(0, pairCount),
        this.t,
        this.interpolation
      );
    } else if (this.warpMode === 'field' && lineCount >= 1) {
      frames = renderFieldWarp(
        this.sourceAsset,
        this.destinationAsset,
        this.lines.source.slice(0, lineCount).map(cloneLine),
        this.lines.destination.slice(0, lineCount).map(cloneLine),
        this.t,
        this.interpolation
      );
    }

    if (frames) {
      paintFrameToSurface(this.sourceBlendSurface, frames.sourceFrame);
      paintFrameToSurface(this.destinationBlendSurface, frames.destinationFrame);
    } else {
      this.sourceBlendSurface.context.drawImage(this.sourceAsset.stageCanvas, 0, 0);
      this.destinationBlendSurface.context.drawImage(this.destinationAsset.stageCanvas, 0, 0);
    }

    const status =
      frames
        ? `${this.warpMode.toUpperCase()} warp active with ${pairCount} point pairs and ${lineCount} line pairs.`
        : 'Insufficient correspondences for warp. Showing direct cross-dissolve baseline.';

    return {
      blendDestination: this.destinationBlendSurface.canvas,
      blendSource: this.sourceBlendSurface.canvas,
      height: STAGE_HEIGHT,
      status,
      warpSummary: frames
        ? `${this.warpMode} / ${this.interpolation}`
        : `cross-dissolve / ${this.interpolation}`,
      width: STAGE_WIDTH
    };
  }
}
