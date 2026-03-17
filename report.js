const PROCESS_DETAILS = [
  {
    key: 'mesh',
    title: 'Mesh Warping (Delaunay)',
    detail:
      'Pairs of control points are triangulated, then each intermediate triangle is inverse-mapped back to the source and destination images. This gives piecewise-affine motion that keeps features aligned.',
    tags: ['2D', 'Points', 'Piecewise affine']
  },
  {
    key: 'tps',
    title: 'Thin-Plate Splines',
    detail:
      'Control points drive a smooth radial-basis warp. The mapping minimizes bending energy, which makes broad deformations smoother than piecewise mesh warps.',
    tags: ['2D', 'Points', 'Smooth warp']
  },
  {
    key: 'field',
    title: 'Field Morphing (Beier-Neely)',
    detail:
      'Directed line pairs define a vector field. Each output pixel is pulled back toward the source and destination according to weighted distances from those lines.',
    tags: ['2D', 'Lines', 'Feature field']
  },
  {
    key: 'interpolation',
    title: 'Interpolation Modes',
    detail:
      'Nearest is fast but blocky, bilinear mixes four neighbors, and bicubic samples a wider neighborhood for smoother high-frequency detail during inverse mapping.',
    tags: ['Sampling', 'Nearest', 'Bilinear', 'Bicubic']
  },
  {
    key: 'obj',
    title: 'OBJ Morphing',
    detail:
      'When the two OBJ meshes share indexed topology, the result uses direct vertex interpolation. Otherwise the renderer falls back to a voxel-style preview so incompatible topologies still have a blended 3D view.',
    tags: ['3D', 'Mesh blend', 'Voxel fallback']
  },
  {
    key: 'runtime',
    title: 'Acceleration and Export',
    detail:
      'Image mode prefers WebGPU, then WebGL2, then CPU. Export records the currently visible result canvas, so the report snapshot tells you exactly which renderer and process were active at capture time.',
    tags: ['WebGPU', 'WebGL2', 'CPU', 'MediaRecorder']
  }
];

function loadSnapshot() {
  try {
    const raw = window.localStorage.getItem('warpingStudioReport');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function createSummaryCards(snapshot) {
  const cards = [
    ['Mode', snapshot?.modeStatus || 'Unavailable'],
    ['Renderer', snapshot?.renderer || 'Unavailable'],
    ['Process', snapshot?.processStatus || 'Unavailable'],
    ['Backend', snapshot?.runtimeBackendDetail || 'Unavailable'],
    ['Result Meta', snapshot?.resultMeta || 'Unavailable'],
    ['Annotations', snapshot?.pairStatus || 'Unavailable'],
    ['Interpolation', snapshot?.interpolation || 'Unavailable'],
    ['Export', snapshot?.exportStatus || 'Unavailable']
  ];

  return cards
    .map(
      ([label, value]) => `
        <article class="report-card">
          <p class="eyebrow">${label}</p>
          <h3>${value}</h3>
        </article>
      `
    )
    .join('');
}

function createProcessCards(snapshot) {
  const activeProcess = snapshot?.warpMode || snapshot?.obj?.processLabel || '';
  const activeInterpolation = snapshot?.interpolation || '';

  return PROCESS_DETAILS.map((entry) => {
    const isActive =
      activeProcess.toLowerCase().includes(entry.key) ||
      (entry.key === 'interpolation' && activeInterpolation);
    const tagMarkup = entry.tags
      .map((tag) => `<span class="file-pill">${tag}</span>`)
      .join('');

    return `
      <article class="process-card${isActive ? ' is-active' : ''}">
        <div class="panel-heading compact">
          <h3>${entry.title}</h3>
          <span class="mono">${isActive ? 'Active / Relevant' : 'Reference'}</span>
        </div>
        <p class="status-copy">${entry.detail}</p>
        <div class="process-tags">${tagMarkup}</div>
      </article>
    `;
  }).join('');
}

function renderReport() {
  const snapshot = loadSnapshot();
  const timestamp = document.getElementById('reportTimestamp');
  const summary = document.getElementById('reportSummary');
  const processGrid = document.getElementById('processGrid');
  const reportJson = document.getElementById('reportJson');

  if (!snapshot) {
    summary.innerHTML = '';
    processGrid.innerHTML = createProcessCards(null);
    reportJson.textContent = JSON.stringify({ message: 'No snapshot available yet.' }, null, 2);
    return;
  }

  timestamp.textContent = `Snapshot captured ${new Date(snapshot.timestamp).toLocaleString()}. Current status: ${snapshot.status}`;
  summary.innerHTML = createSummaryCards(snapshot);
  processGrid.innerHTML = createProcessCards(snapshot);
  reportJson.textContent = JSON.stringify(snapshot, null, 2);
}

renderReport();
