import shaderCode from './shaders.wgsl?raw';
import { BlendFilter } from './filters/blendFilter.js';
import { ImageLoader } from './loaders/imageLoader.js';
import { OBJLoader } from './loaders/objLoader.js';
import { Morph2DSystem } from './morph2d.js';
import { Morph3DSystem } from './morph3d.js';

const WEBGL_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
out vec2 v_uv;

void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const WEBGL_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_source;
uniform sampler2D u_destination;
uniform float u_t;

in vec2 v_uv;
out vec4 outColor;

void main() {
  vec4 sourceColor = texture(u_source, v_uv);
  vec4 destinationColor = texture(u_destination, v_uv);
  outColor = mix(sourceColor, destinationColor, u_t);
}
`;

class WebGPUBlender {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = null;
    this.device = null;
    this.pipeline = null;
    this.sampler = null;
    this.uniformBuffer = null;
    this.sourceTexture = null;
    this.destinationTexture = null;
    this.textureSize = null;
    this.ready = false;
  }

  async initialize(timeoutMs = 1200) {
    if (!('gpu' in navigator)) {
      return false;
    }

    try {
      const adapter = await Promise.race([
        navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }),
        new Promise((resolve) => {
          window.setTimeout(() => resolve(null), timeoutMs);
        })
      ]);
      if (!adapter) {
        return false;
      }

      this.device = await Promise.race([
        adapter.requestDevice(),
        new Promise((resolve) => {
          window.setTimeout(() => resolve(null), timeoutMs);
        })
      ]);
      if (!this.device) {
        return false;
      }

      this.context = this.canvas.getContext('webgpu');
      if (!this.context) {
        return false;
      }

      const format = navigator.gpu.getPreferredCanvasFormat();
      this.context.configure({
        alphaMode: 'premultiplied',
        device: this.device,
        format
      });

      const shaderModule = this.device.createShaderModule({ code: shaderCode });
      this.pipeline = this.device.createRenderPipeline({
        layout: 'auto',
        fragment: {
          entryPoint: 'fs_main',
          module: shaderModule,
          targets: [{ format }]
        },
        primitive: {
          topology: 'triangle-list'
        },
        vertex: {
          entryPoint: 'vs_main',
          module: shaderModule
        }
      });

      this.sampler = this.device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear'
      });
      this.uniformBuffer = this.device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM
      });
      this.ready = true;
      return true;
    } catch {
      this.ready = false;
      return false;
    }
  }

  ensureTextures(width, height) {
    if (this.textureSize?.width === width && this.textureSize?.height === height) {
      return;
    }

    this.sourceTexture?.destroy();
    this.destinationTexture?.destroy();

    const descriptor = {
      format: 'rgba8unorm',
      size: [width, height],
      usage:
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT
    };

    this.sourceTexture = this.device.createTexture(descriptor);
    this.destinationTexture = this.device.createTexture(descriptor);
    this.textureSize = { height, width };
  }

  render(sourceCanvas, destinationCanvas, t, width, height) {
    if (!this.ready) {
      return false;
    }

    try {
      this.ensureTextures(width, height);
      this.device.queue.copyExternalImageToTexture(
        { source: sourceCanvas },
        { texture: this.sourceTexture },
        [width, height]
      );
      this.device.queue.copyExternalImageToTexture(
        { source: destinationCanvas },
        { texture: this.destinationTexture },
        [width, height]
      );
      this.device.queue.writeBuffer(
        this.uniformBuffer,
        0,
        new Float32Array([t, 0, 0, 0, 0, 0, 0, 0])
      );

      const bindGroup = this.device.createBindGroup({
        entries: [
          { binding: 0, resource: this.sourceTexture.createView() },
          { binding: 1, resource: this.destinationTexture.createView() },
          { binding: 2, resource: this.sampler },
          { binding: 3, resource: { buffer: this.uniformBuffer } }
        ],
        layout: this.pipeline.getBindGroupLayout(0)
      });

      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            clearValue: { a: 1, b: 0.08, g: 0.05, r: 0.04 },
            loadOp: 'clear',
            storeOp: 'store',
            view: this.context.getCurrentTexture().createView()
          }
        ]
      });

      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(6);
      pass.end();
      this.device.queue.submit([encoder.finish()]);
      return true;
    } catch {
      this.ready = false;
      return false;
    }
  }
}

class WebGLBlender {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.program = null;
    this.buffer = null;
    this.positionLocation = null;
    this.uvLocation = null;
    this.sourceTexture = null;
    this.destinationTexture = null;
    this.tLocation = null;
    this.ready = false;
  }

  initialize() {
    try {
      const gl = this.canvas.getContext('webgl2', {
        alpha: true,
        antialias: false,
        premultipliedAlpha: true
      });
      if (!gl) {
        return false;
      }

      const program = this.createProgram(gl, WEBGL_VERTEX_SHADER, WEBGL_FRAGMENT_SHADER);
      if (!program) {
        return false;
      }

      this.gl = gl;
      this.program = program;
      this.positionLocation = gl.getAttribLocation(program, 'a_position');
      this.uvLocation = gl.getAttribLocation(program, 'a_uv');
      this.tLocation = gl.getUniformLocation(program, 'u_t');
      this.buffer = gl.createBuffer();
      this.sourceTexture = this.createTexture(gl);
      this.destinationTexture = this.createTexture(gl);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
          -1, -1, 0, 1,
           1, -1, 1, 1,
          -1,  1, 0, 0,
          -1,  1, 0, 0,
           1, -1, 1, 1,
           1,  1, 1, 0
        ]),
        gl.STATIC_DRAW
      );

      gl.useProgram(program);
      gl.uniform1i(gl.getUniformLocation(program, 'u_source'), 0);
      gl.uniform1i(gl.getUniformLocation(program, 'u_destination'), 1);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      this.ready = true;
      return true;
    } catch {
      this.ready = false;
      return false;
    }
  }

  createProgram(gl, vertexSource, fragmentSource) {
    const vertexShader = this.compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertexShader || !fragmentShader) {
      return null;
    }

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return null;
    }

    return program;
  }

  compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  createTexture(gl) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  }

  updateTexture(textureUnit, texture, sourceCanvas) {
    const gl = this.gl;
    gl.activeTexture(textureUnit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // The quad UVs already account for canvas coordinates, so flipping again
    // in WebGL inverts the visible result on fallback browsers.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
  }

  render(sourceCanvas, destinationCanvas, t, width, height) {
    if (!this.ready) {
      return false;
    }

    try {
      const gl = this.gl;
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }

      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0.04, 0.05, 0.08, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.enableVertexAttribArray(this.positionLocation);
      gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(this.uvLocation);
      gl.vertexAttribPointer(this.uvLocation, 2, gl.FLOAT, false, 16, 8);
      this.updateTexture(gl.TEXTURE0, this.sourceTexture, sourceCanvas);
      this.updateTexture(gl.TEXTURE1, this.destinationTexture, destinationCanvas);
      gl.uniform1f(this.tLocation, t);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return true;
    } catch {
      this.ready = false;
      return false;
    }
  }
}

const dom = {
  annotationMode: document.getElementById('annotationMode'),
  annotationDeleteHelp: document.getElementById('annotationDeleteHelp'),
  annotationHelp: document.getElementById('annotationHelp'),
  annotationStatus: document.getElementById('annotationStatus'),
  appStatus: document.getElementById('appStatus'),
  backendDetail: document.getElementById('backendDetail'),
  clearAnnotations: document.getElementById('clearAnnotations'),
  destinationCanvas: document.getElementById('destinationCanvas'),
  destinationFile: document.getElementById('destinationFile'),
  destinationFileLabel: document.getElementById('destinationFileLabel'),
  destinationMeta: document.getElementById('destinationMeta'),
  exportStatus: document.getElementById('exportStatus'),
  exportVideo: document.getElementById('exportVideo'),
  interpolationMode: document.getElementById('interpolationMode'),
  modeStatus: document.getElementById('modeStatus'),
  morphSlider: document.getElementById('morphSlider'),
  openReport: document.getElementById('openReport'),
  opencvStatus: document.getElementById('opencvStatus'),
  pairStatus: document.getElementById('pairStatus'),
  pipelineStatus: document.getElementById('pipelineStatus'),
  processStatus: document.getElementById('processStatus'),
  resultCanvas2d: document.getElementById('resultCanvas2d'),
  resultCanvasGl: document.getElementById('resultCanvasGl'),
  resultCanvasGpu: document.getElementById('resultCanvasGpu'),
  resultMeta: document.getElementById('resultMeta'),
  sliderReadout: document.getElementById('sliderReadout'),
  sourceCanvas: document.getElementById('sourceCanvas'),
  sourceFile: document.getElementById('sourceFile'),
  sourceFileLabel: document.getElementById('sourceFileLabel'),
  sourceMeta: document.getElementById('sourceMeta'),
  tabs: [...document.querySelectorAll('[data-mode-tab]')],
  undoAnnotation: document.getElementById('undoAnnotation'),
  voxelHelp: document.getElementById('voxelHelp'),
  voxelReadout: document.getElementById('voxelReadout'),
  voxelResolution: document.getElementById('voxelResolution'),
  warpMode: document.getElementById('warpMode'),
  webgpuStatus: document.getElementById('webgpuStatus')
};

const state = {
  activeResultCanvas: dom.resultCanvas2d,
  accelerationBackend: 'cpu',
  exporting: false,
  lastRenderSummary: null,
  mode: 'image',
  opencv: null,
  opencvPromise: null,
  t: Number(dom.morphSlider.value),
  voxelResolution: Number(dom.voxelResolution.value),
  webglReady: false,
  webgpuReady: false
};

const result2dContext = dom.resultCanvas2d.getContext('2d', { willReadFrequently: true });
const morph2d = new Morph2DSystem({
  destinationCanvas: dom.destinationCanvas,
  sourceCanvas: dom.sourceCanvas
});
const morph3d = new Morph3DSystem({
  destinationCanvas: dom.destinationCanvas,
  resultCanvas: dom.resultCanvas2d,
  sourceCanvas: dom.sourceCanvas
});
const webgpuBlender = new WebGPUBlender(dom.resultCanvasGpu);
const webglBlender = new WebGLBlender(dom.resultCanvasGl);

function syncWebGpuStatus() {
  const labels = {
    cpu: 'CPU Active',
    webgl2: 'WebGL2 Active',
    webgpu: 'WebGPU Active'
  };
  dom.webgpuStatus.textContent = labels[state.accelerationBackend] || labels.cpu;
}

function getCurrentRendererLabel() {
  const labels = {
    cpu: 'CPU Active',
    webgl2: 'WebGL2 Active',
    webgpu: 'WebGPU Active'
  };
  return labels[state.accelerationBackend] || labels.cpu;
}

function getImageRuntimeSummary() {
  const summary = morph2d.getRuntimeSummary(Boolean(state.opencv));
  const blendStage =
    state.accelerationBackend === 'webgpu'
      ? 'WebGPU blend compositor'
      : state.accelerationBackend === 'webgl2'
        ? 'WebGL2 blend compositor'
        : 'CPU canvas blend';
  const solveStage = summary.canWarp ? `CPU ${summary.processLabel.toLowerCase()}` : 'Direct cross-dissolve baseline';

  return {
    annotationDeleteHelp:
      'Undo Last Pair removes the newest matched point or line pair. Clear Annotations removes everything.',
    annotationHelp: summary.nextAction,
    annotationStatus:
      summary.annotationMode === 'points'
        ? `${summary.sourceCounts.points}/${summary.destinationCounts.points} clicks mapped`
        : `${summary.sourceCounts.lines}/${summary.destinationCounts.lines} lines mapped`,
    backendDetail: summary.backendDetail,
    canUndo:
      summary.sourceCounts.points > 0 ||
      summary.destinationCounts.points > 0 ||
      summary.sourceCounts.lines > 0 ||
      summary.destinationCounts.lines > 0 ||
      summary.pending.sourceLineStart ||
      summary.pending.destinationLineStart,
    exportStatus: state.exporting
      ? 'Recording current image result…'
      : 'Exports the current image result canvas',
    pipelineStatus: `Warp solve: ${solveStage}. Composite: ${blendStage}.`,
    processStatus: summary.processLabel,
    reportProcess: {
      annotationMode: summary.annotationMode,
      backendDetail: summary.backendDetail,
      interpolation: summary.interpolation,
      pairs: summary.pairs,
      processLabel: summary.processLabel,
      warpMode: summary.warpMode
    }
  };
}

function getObjRuntimeSummary() {
  const summary = morph3d.getRuntimeSummary();

  return {
    annotationDeleteHelp: 'OBJ mode does not use point or line annotations.',
    annotationHelp: summary.hasBothModels
      ? 'Adjust the time slider to inspect the 3D morph and open the report for backend details.'
      : 'Load two OBJ files to compare their normalized topology and fallback mode.',
    annotationStatus: 'Annotations disabled in OBJ mode',
    backendDetail: summary.compatibleTopology
      ? 'Indexed mesh interpolation'
      : `${summary.resolution}^3 voxel fallback field`,
    canUndo: false,
    exportStatus: state.exporting
      ? 'Recording current OBJ preview…'
      : 'Exports the current OBJ result canvas',
    pipelineStatus: summary.hasBothModels
      ? `Render path: ${summary.processLabel} on CPU canvas rendering.`
      : 'Load both OBJ files to enable compatible mesh interpolation or voxel fallback.',
    processStatus: summary.processLabel,
    reportProcess: summary
  };
}

function getRuntimePanelData() {
  return state.mode === 'image' ? getImageRuntimeSummary() : getObjRuntimeSummary();
}

function buildReportData() {
  const runtime = getRuntimePanelData();
  const imageSummary = morph2d.getRuntimeSummary(Boolean(state.opencv));
  const objSummary = morph3d.getRuntimeSummary();

  return {
    annotationMode: dom.annotationMode.value,
    exportStatus: runtime.exportStatus,
    interpolation: dom.interpolationMode.value,
    mode: state.mode,
    modeStatus: dom.modeStatus.textContent,
    obj: objSummary,
    openCvStatus: dom.opencvStatus.textContent,
    pairStatus: dom.pairStatus.textContent,
    processStatus: runtime.processStatus,
    renderer: getCurrentRendererLabel(),
    resultMeta: dom.resultMeta.textContent,
    runtimeBackendDetail: runtime.backendDetail,
    runtimePipeline: runtime.pipelineStatus,
    sourceMeta: dom.sourceMeta.textContent,
    destinationMeta: dom.destinationMeta.textContent,
    status: dom.appStatus.textContent,
    t: state.t,
    timestamp: new Date().toISOString(),
    voxelResolution: state.voxelResolution,
    warpMode: dom.warpMode.value,
    image: imageSummary
  };
}

function persistReportSnapshot() {
  state.lastRenderSummary = buildReportData();
  try {
    window.localStorage.setItem('warpingStudioReport', JSON.stringify(state.lastRenderSummary));
  } catch {
    // Ignore storage failures and keep the in-memory snapshot.
  }
}

function updateRuntimePanel() {
  const runtime = getRuntimePanelData();
  dom.processStatus.textContent = runtime.processStatus;
  dom.backendDetail.textContent = runtime.backendDetail;
  dom.exportStatus.textContent = runtime.exportStatus;
  dom.pipelineStatus.textContent = runtime.pipelineStatus;
  dom.annotationHelp.textContent = runtime.annotationHelp;
  dom.annotationDeleteHelp.textContent = runtime.annotationDeleteHelp;
  dom.annotationStatus.textContent = runtime.annotationStatus;
  dom.undoAnnotation.disabled = !runtime.canUndo;
  dom.clearAnnotations.disabled = state.mode !== 'image';
}

function openReportPage() {
  persistReportSnapshot();
  window.open('/report.html', '_blank', 'noopener');
}

function setMode(mode) {
  state.mode = mode;
  dom.tabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.modeTab === mode));
  dom.sourceFile.accept = mode === 'image' ? 'image/*' : '.obj';
  dom.destinationFile.accept = mode === 'image' ? 'image/*' : '.obj';
  dom.modeStatus.textContent = mode === 'image' ? 'Image Morph' : 'OBJ Morph';
  renderActiveMode();
}

function setStatus(message) {
  dom.appStatus.textContent = message;
}

function getVoxelHelpText() {
  const detail =
    'Voxel Resolution controls the density of the OBJ voxel fallback grid. Higher values produce fuller previews for incompatible meshes, but increase CPU time and memory use.';
  return state.mode === 'image' ? `${detail} It does not affect 2D image morphing.` : detail;
}

function updateReadouts() {
  dom.sliderReadout.textContent = `t = ${state.t.toFixed(2)}`;
  dom.voxelReadout.textContent = `${state.voxelResolution}^3 OBJ voxels`;
  if (dom.voxelHelp) {
    dom.voxelHelp.textContent = getVoxelHelpText();
  }
  dom.voxelResolution.disabled = state.mode !== 'obj';

  if (state.mode === 'image') {
    const meta = morph2d.getMeta();
    const pairs = morph2d.getPairSummary();
    dom.sourceMeta.textContent = meta.source;
    dom.destinationMeta.textContent = meta.destination;
    dom.pairStatus.textContent = `${pairs.points} points / ${pairs.lines} lines`;
  } else {
    const meta = morph3d.getMeta();
    dom.sourceMeta.textContent = meta.source;
    dom.destinationMeta.textContent = meta.destination;
    dom.pairStatus.textContent = 'N/A for OBJ preview';
  }

  updateRuntimePanel();
}

function getActiveResultCanvas() {
  return state.activeResultCanvas;
}

function showResultCanvas(backend) {
  dom.resultCanvas2d.classList.toggle('is-hidden', backend !== 'cpu');
  dom.resultCanvasGpu.classList.toggle('is-hidden', backend !== 'webgpu');
  dom.resultCanvasGl.classList.toggle('is-hidden', backend !== 'webgl2');

  if (backend === 'webgpu') {
    state.activeResultCanvas = dom.resultCanvasGpu;
  } else if (backend === 'webgl2') {
    state.activeResultCanvas = dom.resultCanvasGl;
  } else {
    state.activeResultCanvas = dom.resultCanvas2d;
  }
}

function setAccelerationBackend(backend) {
  if (state.accelerationBackend !== backend) {
    state.accelerationBackend = backend;
    syncWebGpuStatus();
  }
}

function draw2dFallback(sourceCanvas, destinationCanvas, t) {
  BlendFilter.crossDissolveSurface(
    result2dContext,
    sourceCanvas,
    destinationCanvas,
    t,
    dom.resultCanvas2d.width,
    dom.resultCanvas2d.height
  );
}

async function renderActiveMode() {
  updateReadouts();

  if (state.mode === 'image') {
    morph2d.setOptions({
      annotationMode: dom.annotationMode.value,
      interpolation: dom.interpolationMode.value,
      t: state.t,
      warpMode: dom.warpMode.value
    });
    const renderState = morph2d.render(state.opencv);
    let renderedWith = null;

    if (state.webgpuReady) {
      const didRenderWebGpu = webgpuBlender.render(
        renderState.blendSource,
        renderState.blendDestination,
        state.t,
        renderState.width,
        renderState.height
      );
      if (didRenderWebGpu) {
        renderedWith = 'webgpu';
      } else {
        state.webgpuReady = false;
      }
    }

    if (!renderedWith && state.webglReady) {
      const didRenderWebGl = webglBlender.render(
        renderState.blendSource,
        renderState.blendDestination,
        state.t,
        renderState.width,
        renderState.height
      );
      if (didRenderWebGl) {
        renderedWith = 'webgl2';
      } else {
        state.webglReady = false;
      }
    }

    if (!renderedWith) {
      draw2dFallback(renderState.blendSource, renderState.blendDestination, state.t);
      renderedWith = 'cpu';
    }

    setAccelerationBackend(renderedWith);
    showResultCanvas(renderedWith);
    dom.resultMeta.textContent = renderState.warpSummary;
    setStatus(renderState.status);
  } else {
    morph3d.setOptions({
      resolution: state.voxelResolution,
      t: state.t
    });
    const renderState = morph3d.render();
    setAccelerationBackend('cpu');
    showResultCanvas('cpu');
    dom.resultMeta.textContent = renderState.warpSummary;
    setStatus(renderState.status);
  }

  updateRuntimePanel();
  persistReportSnapshot();
}

async function loadAsset(slot, file) {
  if (!file) {
    return;
  }

  const isObj = file.name.toLowerCase().endsWith('.obj');

  try {
    if (isObj) {
      setMode('obj');
      const model = await OBJLoader.loadFromFile(file);
      morph3d.setAsset(slot, model);
    } else {
      setMode('image');
      const image = await ImageLoader.loadFromFile(file);
      morph2d.setAsset(slot, image);
    }

    const label = slot === 'source' ? dom.sourceFileLabel : dom.destinationFileLabel;
    label.textContent = file.name;
    await renderActiveMode();
  } catch (error) {
    setStatus(error.message);
  }
}

async function exportVideo() {
  if (state.exporting) {
    return;
  }

  const canvas = getActiveResultCanvas();
  const stream = canvas.captureStream(24);
  const supportedType = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ].find((type) => MediaRecorder.isTypeSupported(type));

  if (!supportedType) {
    setStatus('This browser does not support MediaRecorder video export.');
    return;
  }

  const recorder = new MediaRecorder(stream, { mimeType: supportedType });
  const chunks = [];
  state.exporting = true;
  dom.exportVideo.disabled = true;
  const originalT = state.t;

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  const stopped = new Promise((resolve) => {
    recorder.onstop = resolve;
  });

  recorder.start();

  for (let frame = 0; frame <= 48; frame += 1) {
    state.t = frame / 48;
    dom.morphSlider.value = String(state.t);
    await renderActiveMode();
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  recorder.stop();
  await stopped;

  const blob = new Blob(chunks, { type: supportedType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `morph-${state.mode}.webm`;
  anchor.click();
  URL.revokeObjectURL(url);

  state.t = originalT;
  dom.morphSlider.value = String(state.t);
  await renderActiveMode();
  state.exporting = false;
  dom.exportVideo.disabled = false;
}

async function waitForOpenCv(timeoutMs = 15000) {
  const existingCv = window.cv;
  if (existingCv?.getBuildInformation) {
    return existingCv;
  }

  const sources = ['/opencv.js', 'https://docs.opencv.org/4.x/opencv.js'];

  const tryLoad = (sourceIndex) =>
    new Promise((resolve) => {
      const scriptSelector = `script[data-opencv-script="${sourceIndex}"]`;
      let script = document.querySelector(scriptSelector);

      const finish = (value) => {
        clearTimeout(timer);
        resolve(value);
      };

      const attachRuntimeHook = () => {
        const cvInstance = window.cv;
        if (!cvInstance) {
          finish(null);
          return;
        }

        if (cvInstance.getBuildInformation) {
          finish(cvInstance);
          return;
        }

        const previous = cvInstance.onRuntimeInitialized;
        cvInstance.onRuntimeInitialized = () => {
          previous?.();
          finish(cvInstance);
        };
      };

      if (!script) {
        script = document.createElement('script');
        script.src = sources[sourceIndex];
        script.async = true;
        script.dataset.opencvScript = String(sourceIndex);
        script.addEventListener(
          'load',
          () => {
            script.dataset.loaded = 'true';
          },
          { once: true }
        );
        document.head.appendChild(script);
      }

      const timer = window.setTimeout(() => finish(null), timeoutMs);
      if (window.cv?.getBuildInformation) {
        finish(window.cv);
        return;
      }

      if (script.dataset.loaded === 'true') {
        attachRuntimeHook();
        return;
      }

      script.addEventListener('load', attachRuntimeHook, { once: true });
      script.addEventListener(
        'error',
        () => {
          script.remove();
          finish(null);
        },
        { once: true }
      );
    });

  for (let index = 0; index < sources.length; index += 1) {
    const cvInstance = await tryLoad(index);
    if (cvInstance?.getBuildInformation) {
      return cvInstance;
    }
  }

  return null;
}

function bindEvents() {
  dom.tabs.forEach((tab) => {
    tab.addEventListener('click', () => setMode(tab.dataset.modeTab));
  });

  dom.sourceFile.addEventListener('change', (event) => loadAsset('source', event.target.files?.[0]));
  dom.destinationFile.addEventListener('change', (event) => loadAsset('destination', event.target.files?.[0]));
  dom.morphSlider.addEventListener('input', async (event) => {
    state.t = Number(event.target.value);
    await renderActiveMode();
  });
  dom.warpMode.addEventListener('change', renderActiveMode);
  dom.interpolationMode.addEventListener('change', renderActiveMode);
  dom.annotationMode.addEventListener('change', renderActiveMode);
  dom.voxelResolution.addEventListener('input', async (event) => {
    state.voxelResolution = Number(event.target.value);
    await renderActiveMode();
  });
  dom.undoAnnotation.addEventListener('click', async () => {
    if (state.mode !== 'image') {
      return;
    }
    morph2d.undoLastAnnotation();
    await renderActiveMode();
  });
  dom.clearAnnotations.addEventListener('click', async () => {
    morph2d.clearAnnotations();
    await renderActiveMode();
  });
  dom.exportVideo.addEventListener('click', exportVideo);
  dom.openReport.addEventListener('click', openReportPage);

  dom.sourceCanvas.addEventListener('click', async (event) => {
    if (state.mode !== 'image') {
      return;
    }
    morph2d.registerPointer('source', event);
    await renderActiveMode();
  });

  dom.destinationCanvas.addEventListener('click', async (event) => {
    if (state.mode !== 'image') {
      return;
    }
    morph2d.registerPointer('destination', event);
    await renderActiveMode();
  });
}

async function initialize() {
  bindEvents();
  syncWebGpuStatus();
  dom.opencvStatus.textContent = 'Deferred';
  await renderActiveMode();
  Promise.all([
    webgpuBlender.initialize(),
    Promise.resolve().then(() => webglBlender.initialize())
  ]).then(async ([webgpuReady, webglReady]) => {
    state.webgpuReady = Boolean(webgpuReady);
    state.webglReady = Boolean(webglReady);
    await renderActiveMode();
  });
  window.warpingStudio = {
    async loadOpenCv() {
      if (state.opencv) {
        return state.opencv;
      }

      if (state.opencvPromise) {
        return state.opencvPromise;
      }

      dom.opencvStatus.textContent = 'Loading…';
      state.opencvPromise = waitForOpenCv();
      state.opencv = await state.opencvPromise;
      state.opencvPromise = null;
      dom.opencvStatus.textContent = state.opencv ? 'Ready' : 'Fallback';
      await renderActiveMode();
      return state.opencv;
    },
    morph2d,
    morph3d,
    getReportData: buildReportData,
    renderActiveMode,
    setAccelerationState({ webglReady = state.webglReady, webgpuReady = state.webgpuReady } = {}) {
      state.webglReady = Boolean(webglReady);
      state.webgpuReady = Boolean(webgpuReady);
      return renderActiveMode();
    },
    state
  };
}

initialize();
