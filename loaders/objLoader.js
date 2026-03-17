export class OBJLoader {
  static async loadFromFile(file) {
    const text = await file.text();
    return this.parse(text, file.name);
  }

  static parse(text, fileName = 'model.obj') {
    const vertices = [];
    const normals = [];
    const faces = [];

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }

      const parts = line.split(/\s+/);
      const keyword = parts[0];

      if (keyword === 'v' && parts.length >= 4) {
        vertices.push(parts.slice(1, 4).map(Number));
      } else if (keyword === 'vn' && parts.length >= 4) {
        normals.push(parts.slice(1, 4).map(Number));
      } else if (keyword === 'f' && parts.length >= 4) {
        const polygon = parts.slice(1).map((token) => {
          const [vertexIndex, , normalIndex] = token.split('/');
          return {
            normalIndex: normalIndex ? Number(normalIndex) - 1 : null,
            vertexIndex: Number(vertexIndex) - 1
          };
        });

        for (let index = 1; index < polygon.length - 1; index += 1) {
          faces.push([
            polygon[0].vertexIndex,
            polygon[index].vertexIndex,
            polygon[index + 1].vertexIndex
          ]);
        }
      }
    }

    if (vertices.length === 0) {
      throw new Error(`No vertices found in ${fileName}`);
    }

    const bounds = this.computeBounds(vertices);
    const normalizedVertices = this.normalize(vertices, bounds);
    const edges = this.buildEdges(faces);

    return {
      bounds,
      edges,
      faces,
      fileName,
      normals,
      normalizedVertices,
      topologySignature: this.buildTopologySignature(faces),
      vertexCount: vertices.length,
      faceCount: faces.length,
      vertices
    };
  }

  static computeBounds(vertices) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];

    for (const vertex of vertices) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], vertex[axis]);
        max[axis] = Math.max(max[axis], vertex[axis]);
      }
    }

    return { min, max };
  }

  static normalize(vertices, bounds) {
    const center = bounds.min.map((value, axis) => (value + bounds.max[axis]) / 2);
    const extent = Math.max(
      bounds.max[0] - bounds.min[0],
      bounds.max[1] - bounds.min[1],
      bounds.max[2] - bounds.min[2],
      1
    );
    const scale = 2 / extent;

    return vertices.map((vertex) => vertex.map((value, axis) => (value - center[axis]) * scale));
  }

  static buildEdges(faces) {
    const seen = new Set();
    const edges = [];

    for (const face of faces) {
      const pairs = [
        [face[0], face[1]],
        [face[1], face[2]],
        [face[2], face[0]]
      ];

      for (const [a, b] of pairs) {
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push([a, b]);
        }
      }
    }

    return edges;
  }

  static buildTopologySignature(faces) {
    let hash = 2166136261;

    for (const face of faces) {
      const canonical = [...face].sort((a, b) => a - b);
      for (const index of canonical) {
        hash ^= index + 1;
        hash = Math.imul(hash, 16777619) >>> 0;
      }
      hash ^= 255;
      hash = Math.imul(hash, 16777619) >>> 0;
    }

    return `${faces.length}:${hash}`;
  }
}
