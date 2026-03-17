import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const SVG_WIDTH = 640;
const SVG_HEIGHT = 480;
const SOURCE_POINTS = [
  { x: 172, y: 170 },
  { x: 468, y: 170 },
  { x: 320, y: 232 },
  { x: 222, y: 328 },
  { x: 418, y: 328 }
];
const DESTINATION_POINTS = [
  { x: 152, y: 154 },
  { x: 492, y: 188 },
  { x: 320, y: 246 },
  { x: 210, y: 344 },
  { x: 432, y: 304 }
];
const SOURCE_LINES = [
  { start: { x: 110, y: 112 }, end: { x: 246, y: 96 } },
  { start: { x: 208, y: 322 }, end: { x: 432, y: 320 } }
];
const DESTINATION_LINES = [
  { start: { x: 92, y: 108 }, end: { x: 266, y: 72 } },
  { start: { x: 192, y: 344 }, end: { x: 452, y: 298 } }
];
const MOTION_SOURCE_POINTS = [
  { x: 120, y: 150 },
  { x: 260, y: 150 },
  { x: 260, y: 290 },
  { x: 120, y: 290 },
  { x: 190, y: 220 }
];
const MOTION_DESTINATION_POINTS = [
  { x: 380, y: 150 },
  { x: 520, y: 150 },
  { x: 520, y: 290 },
  { x: 380, y: 290 },
  { x: 450, y: 220 }
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function logStep(message) {
  console.error(`[validate] ${message}`);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function commandBinary(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function viteBinary() {
  return path.join(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'vite.cmd' : 'vite'
  );
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ stderr, stdout });
      } else {
        reject(
          new Error(
            `Command failed (${command} ${args.join(' ')}):\n${stdout}\n${stderr}`.trim()
          )
        );
      }
    });
  });
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the preview server responds.
    }
    await wait(250);
  }

  throw new Error(`Timed out waiting for preview server at ${url}`);
}

function startPreviewServer(port) {
  const child = spawn(viteBinary(), ['preview', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderr = '';
  let stdout = '';
  child.stdout?.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('exit', (code, signal) => {
    if (signal === 'SIGTERM' || signal === 'SIGKILL') {
      return;
    }
    if (code === 143) {
      return;
    }
    if (code !== 0 && code !== null) {
      console.error(`Preview server exited unexpectedly:\n${stdout}\n${stderr}`.trim());
    }
  });

  return child;
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    wait(2000).then(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    })
  ]);
}

function svgFixture({ eyebrow, faceFill, faceRx, faceRy, mouthCurve, noseColor, points, lines }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" width="${SVG_WIDTH}" height="${SVG_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#071018" />
      <stop offset="100%" stop-color="#16263b" />
    </linearGradient>
    <radialGradient id="halo" cx="50%" cy="40%" r="55%">
      <stop offset="0%" stop-color="#ffe2b8" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#f39b63" stop-opacity="0.15" />
    </radialGradient>
  </defs>
  <rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" fill="url(#bg)" />
  <circle cx="320" cy="220" r="210" fill="url(#halo)" />
  <ellipse cx="320" cy="236" rx="${faceRx}" ry="${faceRy}" fill="${faceFill}" stroke="#fdf6ea" stroke-width="8" />
  <path d="M ${lines[0].start.x} ${lines[0].start.y} Q 178 74 ${lines[0].end.x} ${lines[0].end.y}" fill="none" stroke="${eyebrow}" stroke-width="16" stroke-linecap="round" />
  <circle cx="${points[0].x}" cy="${points[0].y}" r="28" fill="#071018" />
  <circle cx="${points[1].x}" cy="${points[1].y}" r="28" fill="#071018" />
  <circle cx="${points[0].x}" cy="${points[0].y}" r="9" fill="#9ce8ff" />
  <circle cx="${points[1].x}" cy="${points[1].y}" r="9" fill="#9ce8ff" />
  <path d="M ${points[2].x} ${points[2].y - 18} L ${points[2].x + 28} ${points[2].y + 36} L ${points[2].x - 28} ${points[2].y + 36} Z" fill="${noseColor}" opacity="0.88" />
  <path d="M ${points[3].x} ${points[3].y} Q 320 ${mouthCurve} ${points[4].x} ${points[4].y}" fill="none" stroke="#071018" stroke-width="18" stroke-linecap="round" />
  <path d="M ${lines[1].start.x} ${lines[1].start.y} Q 322 ${mouthCurve - 18} ${lines[1].end.x} ${lines[1].end.y}" fill="none" stroke="#ffd0a6" stroke-width="10" stroke-linecap="round" />
  <circle cx="118" cy="252" r="18" fill="#9ce8ff" opacity="0.35" />
  <circle cx="524" cy="252" r="18" fill="#9ce8ff" opacity="0.35" />
</svg>`;
}

function squareMotionFixture(x, y) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" width="${SVG_WIDTH}" height="${SVG_HEIGHT}">
  <rect width="${SVG_WIDTH}" height="${SVG_HEIGHT}" fill="#08101b"/>
  <rect x="${x}" y="${y}" width="140" height="140" rx="18" fill="#f4f1de"/>
  <circle cx="${x + 70}" cy="${y + 70}" r="32" fill="#09111d"/>
</svg>`;
}

function generateParametricObj({ latSteps, lonSteps, radiusAt }) {
  const vertices = [];
  const faces = [];

  for (let lat = 0; lat <= latSteps; lat += 1) {
    const phi = (lat / latSteps) * Math.PI;
    for (let lon = 0; lon < lonSteps; lon += 1) {
      const theta = (lon / lonSteps) * Math.PI * 2;
      const [x, y, z] = radiusAt(phi, theta);
      vertices.push([x, y, z]);
    }
  }

  for (let lat = 0; lat < latSteps; lat += 1) {
    for (let lon = 0; lon < lonSteps; lon += 1) {
      const nextLon = (lon + 1) % lonSteps;
      const current = lat * lonSteps + lon + 1;
      const next = lat * lonSteps + nextLon + 1;
      const below = (lat + 1) * lonSteps + lon + 1;
      const belowNext = (lat + 1) * lonSteps + nextLon + 1;

      faces.push([current, below, belowNext]);
      faces.push([current, belowNext, next]);
    }
  }

  const lines = vertices.map((vertex) => `v ${vertex[0].toFixed(6)} ${vertex[1].toFixed(6)} ${vertex[2].toFixed(6)}`);
  const faceLines = faces.map((face) => `f ${face[0]} ${face[1]} ${face[2]}`);
  return `${lines.join('\n')}\n${faceLines.join('\n')}\n`;
}

async function createFixtures(tempDir) {
  const sourceSvgPath = path.join(tempDir, 'source-fixture.svg');
  const destinationSvgPath = path.join(tempDir, 'destination-fixture.svg');
  const motionSourcePath = path.join(tempDir, 'motion-source.svg');
  const motionDestinationPath = path.join(tempDir, 'motion-destination.svg');
  const objAPath = path.join(tempDir, 'blob-a.obj');
  const objBPath = path.join(tempDir, 'blob-b.obj');

  const sourceSvg = svgFixture({
    eyebrow: '#ffad72',
    faceFill: '#f26d4e',
    faceRx: 196,
    faceRy: 168,
    lines: SOURCE_LINES,
    mouthCurve: 372,
    noseColor: '#ffe8a6',
    points: SOURCE_POINTS
  });
  const destinationSvg = svgFixture({
    eyebrow: '#7ce3ff',
    faceFill: '#40a6c7',
    faceRx: 214,
    faceRy: 156,
    lines: DESTINATION_LINES,
    mouthCurve: 286,
    noseColor: '#ffe2c1',
    points: DESTINATION_POINTS
  });
  const motionSource = squareMotionFixture(120, 150);
  const motionDestination = squareMotionFixture(380, 150);

  const objA = generateParametricObj({
    latSteps: 14,
    lonSteps: 28,
    radiusAt(phi, theta) {
      const radial = 1 + 0.15 * Math.cos(theta * 3) * Math.sin(phi) ** 2;
      return [
        Math.sin(phi) * Math.cos(theta) * radial * 0.92,
        Math.cos(phi) * 1.16,
        Math.sin(phi) * Math.sin(theta) * radial * 0.86
      ];
    }
  });
  const objB = generateParametricObj({
    latSteps: 14,
    lonSteps: 28,
    radiusAt(phi, theta) {
      const radial = 0.82 + 0.26 * Math.sin(phi * 2.5) * Math.sin(theta * 4);
      return [
        Math.sin(phi) * Math.cos(theta) * radial * 0.74,
        Math.cos(phi) * (0.88 + 0.12 * Math.cos(theta * 2)),
        Math.sin(phi) * Math.sin(theta) * radial * 1.28
      ];
    }
  });

  await Promise.all([
    fs.writeFile(sourceSvgPath, sourceSvg, 'utf8'),
    fs.writeFile(destinationSvgPath, destinationSvg, 'utf8'),
    fs.writeFile(motionSourcePath, motionSource, 'utf8'),
    fs.writeFile(motionDestinationPath, motionDestination, 'utf8'),
    fs.writeFile(objAPath, objA, 'utf8'),
    fs.writeFile(objBPath, objB, 'utf8')
  ]);

  return {
    destinationSvgPath,
    motionDestinationPath,
    motionSourcePath,
    objAPath,
    objBPath,
    sourceSvgPath
  };
}

async function readText(page, selector) {
  return page.locator(selector).evaluate((element) => element.textContent?.trim() ?? '');
}

async function setSlider(page, selector, value) {
  await page.locator(selector).evaluate((element, nextValue) => {
    element.value = String(nextValue);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

async function forceCpuRenderer(page) {
  await page.evaluate(async () => {
    if (typeof window.warpingStudio.setAccelerationState === 'function') {
      await window.warpingStudio.setAccelerationState({
        webglReady: false,
        webgpuReady: false
      });
      return;
    }

    window.warpingStudio.state.webglReady = false;
    window.warpingStudio.state.webgpuReady = false;
    document.getElementById('webgpuStatus').textContent = 'CPU Active';
    await window.warpingStudio.renderActiveMode();
  });
}

async function canvasSignature(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('resultCanvas2d');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let nonZero = 0;
    let sum = 0;
    let hash = 2166136261;

    for (let index = 0; index < data.length; index += 4) {
      const mixed =
        data[index] |
        (data[index + 1] << 8) |
        (data[index + 2] << 16) |
        (data[index + 3] << 24);
      const luminance = data[index] + data[index + 1] + data[index + 2];
      sum += luminance;
      if (luminance > 24) {
        nonZero += 1;
      }
      hash ^= mixed;
      hash = Math.imul(hash, 16777619) >>> 0;
    }

    return { hash, nonZero, sum };
  });
}

async function centerBandMetrics(page, threshold = 420) {
  return page.evaluate((minLuminance) => {
    const canvas = document.getElementById('resultCanvas2d');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const bands = { left: 0, center: 0, right: 0, total: 0 };

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const luminance = data[index] + data[index + 1] + data[index + 2];
        if (luminance < minLuminance) {
          continue;
        }
        bands.total += 1;
        if (x < Math.floor(width / 3)) {
          bands.left += 1;
        } else if (x < Math.floor((width * 2) / 3)) {
          bands.center += 1;
        } else {
          bands.right += 1;
        }
      }
    }

    return bands;
  }, threshold);
}

async function clickCanvasPoint(page, selector, point) {
  const box = await page.locator(selector).boundingBox();
  if (!box) {
    throw new Error(`Missing bounding box for ${selector}`);
  }

  await page.locator(selector).click({
    position: {
      x: (point.x / SVG_WIDTH) * box.width,
      y: (point.y / SVG_HEIGHT) * box.height
    }
  });
}

async function clickPoints(page, points, slot) {
  const selector = slot === 'source' ? '#sourceCanvas' : '#destinationCanvas';
  for (const point of points) {
    await clickCanvasPoint(page, selector, point);
  }
}

async function clickLine(page, slot, line) {
  const selector = slot === 'source' ? '#sourceCanvas' : '#destinationCanvas';
  await clickCanvasPoint(page, selector, line.start);
  await clickCanvasPoint(page, selector, line.end);
}

async function validateGeneratedInputs() {
  const port = 4180 + Math.floor(Math.random() * 200);
  const previewUrl = `http://127.0.0.1:${port}/`;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'warping-generated-'));
  const exportsDir = path.join(process.cwd(), 'exports');
  let browser;
  let context;
  let previewServer;

  try {
    await fs.mkdir(exportsDir, { recursive: true });
    logStep('building production bundle');
    await runCommand(commandBinary('npm'), ['run', 'build']);
    logStep(`starting preview server on ${previewUrl}`);
    previewServer = startPreviewServer(port);
    await waitForServer(previewUrl);

    const fixtures = await createFixtures(tempDir);
    logStep(`generated fixtures in ${tempDir}`);
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1600, height: 1100 }
    });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];

    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    logStep('opening app in Playwright');
    await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => Boolean(window.warpingStudio), null, { timeout: 30000 });
    await forceCpuRenderer(page);
    logStep('loading generated SVG fixtures');
    await page.setInputFiles('#sourceFile', fixtures.sourceSvgPath);
    await page.setInputFiles('#destinationFile', fixtures.destinationSvgPath);
    await page.waitForFunction(
      () =>
        window.warpingStudio.morph2d.getMeta().source !== 'Awaiting input' &&
        window.warpingStudio.morph2d.getMeta().destination !== 'Awaiting input',
      null,
      { timeout: 30000 }
    );
    await wait(300);

    const baseline = await canvasSignature(page);
    logStep('verifying point-annotation guidance and undo flow');
    await clickCanvasPoint(page, '#sourceCanvas', SOURCE_POINTS[0]);
    const annotationAfterSource = {
      annotationHelp: await readText(page, '#annotationHelp'),
      annotationStatus: await readText(page, '#annotationStatus'),
      pairStatus: await readText(page, '#pairStatus'),
      undoEnabled: await page.locator('#undoAnnotation').evaluate((button) => !button.disabled)
    };
    await clickCanvasPoint(page, '#destinationCanvas', DESTINATION_POINTS[0]);
    const annotationAfterPair = {
      annotationHelp: await readText(page, '#annotationHelp'),
      annotationStatus: await readText(page, '#annotationStatus'),
      pairStatus: await readText(page, '#pairStatus'),
      undoEnabled: await page.locator('#undoAnnotation').evaluate((button) => !button.disabled)
    };
    await page.click('#undoAnnotation');
    const annotationAfterUndo = {
      annotationHelp: await readText(page, '#annotationHelp'),
      annotationStatus: await readText(page, '#annotationStatus'),
      pairStatus: await readText(page, '#pairStatus'),
      undoEnabled: await page.locator('#undoAnnotation').evaluate((button) => !button.disabled)
    };

    logStep('annotating generated point correspondences');
    await clickPoints(page, SOURCE_POINTS, 'source');
    await clickPoints(page, DESTINATION_POINTS, 'destination');
    await page.waitForFunction(
      () => document.getElementById('pairStatus').textContent?.trim() === '5 points / 0 lines',
      null,
      { timeout: 30000 }
    );
    await wait(300);

    logStep('validating mesh warp and interpolation variants');
    await page.selectOption('#warpMode', 'mesh');
    await page.selectOption('#interpolationMode', 'nearest');
    await setSlider(page, '#morphSlider', 0.25);
    await wait(600);
    const meshNearest = await canvasSignature(page);
    await setSlider(page, '#morphSlider', 0.75);
    await wait(600);
    const meshNearestLate = await canvasSignature(page);

    await page.selectOption('#interpolationMode', 'bilinear');
    await setSlider(page, '#morphSlider', 0.45);
    await wait(600);
    const meshBilinear = await canvasSignature(page);
    const meshStatus = await readText(page, '#appStatus');
    const pipelineStatus = await readText(page, '#pipelineStatus');
    const backendDetail = await readText(page, '#backendDetail');
    const rendererStatus = await readText(page, '#webgpuStatus');

    await page.selectOption('#interpolationMode', 'bicubic');
    await wait(600);
    const meshBicubic = await canvasSignature(page);

    await page.screenshot({ path: path.join(tempDir, 'mesh.png'), fullPage: true });

    logStep('validating report page snapshot');
    const reportPage = await context.newPage();
    await reportPage.goto(new URL('/report.html', previewUrl).href, {
      timeout: 30000,
      waitUntil: 'domcontentloaded'
    });
    await reportPage.waitForSelector('#reportJson', { timeout: 30000 });
    const reportSnapshot = await reportPage.evaluate(() => ({
      activeCards: document.querySelectorAll('.process-card.is-active').length,
      processCards: document.querySelectorAll('.process-card').length,
      reportSummary: document.getElementById('reportSummary').textContent,
      summaryCards: document.querySelectorAll('.report-card').length,
      timestamp: document.getElementById('reportTimestamp').textContent,
      jsonText: document.getElementById('reportJson').textContent
    }));
    await reportPage.close();

    logStep('validating TPS warp');
    await page.selectOption('#warpMode', 'tps');
    await page.selectOption('#interpolationMode', 'bilinear');
    await setSlider(page, '#morphSlider', 0.45);
    await wait(800);
    const tpsSignature = await canvasSignature(page);
    const tpsStatus = await readText(page, '#appStatus');
    await page.screenshot({ path: path.join(tempDir, 'tps.png'), fullPage: true });

    logStep('exporting generated image morph video');
    await page.selectOption('#warpMode', 'mesh');
    await page.selectOption('#interpolationMode', 'bilinear');
    await setSlider(page, '#morphSlider', 0.5);
    await wait(600);
    const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
    await page.click('#exportVideo');
    const download = await downloadPromise;
    const downloadPath = path.join(tempDir, await download.suggestedFilename());
    await download.saveAs(downloadPath);
    const imageExportPath = path.join(exportsDir, 'generated-image-morph.webm');
    await fs.copyFile(downloadPath, imageExportPath);
    const imageExportSize = (await fs.stat(downloadPath)).size;

    logStep('switching to generated line correspondences for field morphing');
    await page.click('#clearAnnotations');
    await page.selectOption('#annotationMode', 'lines');
    await wait(250);
    await clickLine(page, 'source', SOURCE_LINES[0]);
    await clickLine(page, 'source', SOURCE_LINES[1]);
    await clickLine(page, 'destination', DESTINATION_LINES[0]);
    await clickLine(page, 'destination', DESTINATION_LINES[1]);
    await page.waitForFunction(
      () => document.getElementById('pairStatus').textContent?.trim() === '0 points / 2 lines',
      null,
      { timeout: 30000 }
    );
    await page.selectOption('#warpMode', 'field');
    await page.selectOption('#interpolationMode', 'bicubic');
    await setSlider(page, '#morphSlider', 0.45);
    await wait(800);
    const fieldSignature = await canvasSignature(page);
    const fieldStatus = await readText(page, '#appStatus');
    const pairStatus = await readText(page, '#pairStatus');
    await page.screenshot({ path: path.join(tempDir, 'field.png'), fullPage: true });

    logStep('validating explicit 2D motion versus cross-dissolve');
    await page.click('#clearAnnotations');
    await page.selectOption('#annotationMode', 'points');
    await page.setInputFiles('#sourceFile', fixtures.motionSourcePath);
    await page.setInputFiles('#destinationFile', fixtures.motionDestinationPath);
    await page.waitForFunction(
      () =>
        document.getElementById('sourceMeta').textContent?.trim() === '640x480' &&
        document.getElementById('destinationMeta').textContent?.trim() === '640x480',
      null,
      { timeout: 30000 }
    );
    await page.selectOption('#warpMode', 'mesh');
    await page.selectOption('#interpolationMode', 'bilinear');
    await setSlider(page, '#morphSlider', 0.5);
    await wait(400);
    const motionBlendOnly = await centerBandMetrics(page);
    await clickPoints(page, MOTION_SOURCE_POINTS, 'source');
    await clickPoints(page, MOTION_DESTINATION_POINTS, 'destination');
    await page.waitForFunction(
      () => document.getElementById('pairStatus').textContent?.trim() === '5 points / 0 lines',
      null,
      { timeout: 30000 }
    );
    await wait(500);
    const motionWarped = await centerBandMetrics(page);
    const motionStatus = await readText(page, '#appStatus');
    await page.screenshot({ path: path.join(tempDir, 'motion.png'), fullPage: true });

    logStep('validating WebGL2 fallback backend');
    await page.evaluate(() =>
      window.warpingStudio.setAccelerationState({
        webglReady: true,
        webgpuReady: false
      })
    );
    await wait(400);
    const webglStatus = await readText(page, '#webgpuStatus');
    const webglMotion = await centerBandMetrics(page);
    const webglFallbackAvailable = webglStatus === 'WebGL2 Active';
    await page.screenshot({ path: path.join(tempDir, 'webgl2.png'), fullPage: true });

    logStep('validating generated OBJ morph');
    await page.click('[data-mode-tab="obj"]');
    await page.setInputFiles('#sourceFile', fixtures.objAPath);
    await page.setInputFiles('#destinationFile', fixtures.objBPath);
    await page.waitForFunction(
      () =>
        document.getElementById('sourceMeta').textContent?.trim() !== 'Awaiting input' &&
        document.getElementById('destinationMeta').textContent?.trim() !== 'Awaiting input' &&
        document.getElementById('modeStatus').textContent?.trim() === 'OBJ Morph',
      null,
      { timeout: 30000 }
    );
    await wait(400);
    await setSlider(page, '#morphSlider', 0.66);
    await setSlider(page, '#voxelResolution', 30);
    await wait(500);
    const objSignature = await canvasSignature(page);
    const objStatus = await readText(page, '#appStatus');
    const objMeta = await readText(page, '#resultMeta');
    const voxelReadout = await readText(page, '#voxelReadout');
    await page.screenshot({ path: path.join(tempDir, 'obj.png'), fullPage: true });

    logStep('exporting generated OBJ morph video');
    const objDownloadPromise = page.waitForEvent('download', { timeout: 60000 });
    await page.click('#exportVideo');
    const objDownload = await objDownloadPromise;
    const objDownloadPath = path.join(tempDir, await objDownload.suggestedFilename());
    await objDownload.saveAs(objDownloadPath);
    const objExportPath = path.join(exportsDir, 'generated-obj-morph.webm');
    await fs.copyFile(objDownloadPath, objExportPath);
    const objExportSize = (await fs.stat(objDownloadPath)).size;

    assert(meshStatus.includes('MESH warp active'), `Unexpected mesh status: ${meshStatus}`);
    assert(
      pipelineStatus === 'Warp solve: CPU mesh warp. Composite: WebGPU blend compositor.' ||
      pipelineStatus === 'Warp solve: CPU mesh warp. Composite: WebGL2 blend compositor.' ||
      pipelineStatus === 'Warp solve: CPU mesh warp. Composite: CPU canvas blend.',
      `Unexpected runtime pipeline: ${pipelineStatus}`
    );
    assert(
      backendDetail.includes('Delaunay'),
      `Unexpected backend detail for mesh mode: ${backendDetail}`
    );
    assert(
      ['WebGPU Active', 'WebGL2 Active', 'CPU Active'].includes(rendererStatus),
      `Unexpected renderer status: ${rendererStatus}`
    );
    assert(tpsStatus.includes('TPS warp active'), `Unexpected TPS status: ${tpsStatus}`);
    assert(fieldStatus.includes('FIELD warp active'), `Unexpected field status: ${fieldStatus}`);
    assert(pairStatus === '0 points / 2 lines', `Unexpected line pairing status: ${pairStatus}`);
    assert(motionStatus.includes('MESH warp active'), `Unexpected motion-test status: ${motionStatus}`);
    assert(
      objStatus.includes('OBJ morph active with compatible mesh interpolation.'),
      `Unexpected OBJ status: ${objStatus}`
    );
    assert(objMeta === 'obj / mesh blend', `Unexpected OBJ result meta: ${objMeta}`);
    assert(voxelReadout === '30^3 voxels', `Unexpected voxel readout: ${voxelReadout}`);

    assert(meshNearest.hash !== baseline.hash, 'Mesh warp matched the no-annotation baseline.');
    assert(meshNearest.hash !== meshNearestLate.hash, 'Mesh output did not respond to time slider changes.');
    assert(meshNearest.hash !== meshBilinear.hash, 'Nearest and bilinear interpolation produced identical output.');
    assert(meshBilinear.hash !== meshBicubic.hash, 'Bilinear and bicubic interpolation produced identical output.');
    assert(meshBilinear.hash !== tpsSignature.hash, 'Mesh and TPS outputs were identical.');
    assert(tpsSignature.hash !== fieldSignature.hash, 'TPS and field outputs were identical.');
    assert(objSignature.hash !== fieldSignature.hash, 'OBJ preview matched the 2D field morph output.');
    assert(
      motionWarped.center > motionBlendOnly.center + 400,
      `2D motion test did not move content into the center band: ${JSON.stringify({ motionBlendOnly, motionWarped })}`
    );
    assert(
      motionWarped.center > motionWarped.left && motionWarped.center > motionWarped.right,
      `2D motion test did not concentrate warped content near the center: ${JSON.stringify(motionWarped)}`
    );
    if (webglFallbackAvailable) {
      assert(
        webglMotion.center > 1000,
        `WebGL2 fallback did not produce a visible centered warp: ${JSON.stringify(webglMotion)}`
      );
    }
    assert(
      annotationAfterSource.annotationStatus === '1/0 clicks mapped',
      `Unexpected source-annotation status: ${JSON.stringify(annotationAfterSource)}`
    );
    assert(
      annotationAfterSource.annotationHelp === 'Add the matching point on Destination.',
      `Unexpected source-annotation help: ${JSON.stringify(annotationAfterSource)}`
    );
    assert(
      annotationAfterSource.undoEnabled,
      `Undo should be enabled after the first source click: ${JSON.stringify(annotationAfterSource)}`
    );
    assert(
      annotationAfterPair.annotationStatus === '1/1 clicks mapped' &&
      annotationAfterPair.pairStatus === '1 points / 0 lines',
      `Unexpected paired-annotation state: ${JSON.stringify(annotationAfterPair)}`
    );
    assert(
      annotationAfterUndo.annotationStatus === '0/0 clicks mapped' &&
      annotationAfterUndo.pairStatus === '0 points / 0 lines' &&
      !annotationAfterUndo.undoEnabled,
      `Unexpected annotation state after undo: ${JSON.stringify(annotationAfterUndo)}`
    );
    assert(
      reportSnapshot.summaryCards === 8 && reportSnapshot.processCards === 6,
      `Unexpected report card counts: ${JSON.stringify(reportSnapshot)}`
    );
    assert(
      reportSnapshot.activeCards >= 2,
      `Report page did not mark active processes: ${JSON.stringify(reportSnapshot)}`
    );
    assert(
      reportSnapshot.reportSummary.includes(rendererStatus) &&
      reportSnapshot.jsonText.includes('Mesh warp'),
      `Report page snapshot did not include runtime details: ${JSON.stringify(reportSnapshot)}`
    );

    assert(imageExportSize > 50_000, `Image export was unexpectedly small (${imageExportSize} bytes).`);
    assert(objExportSize > 50_000, `OBJ export was unexpectedly small (${objExportSize} bytes).`);
    assert(meshBilinear.nonZero > 100_000, 'Mesh result canvas looked empty.');
    assert(tpsSignature.nonZero > 100_000, 'TPS result canvas looked empty.');
    assert(fieldSignature.nonZero > 100_000, 'Field morph result canvas looked empty.');
    assert(objSignature.nonZero > 50_000, 'OBJ result canvas looked empty.');
    assert(consoleErrors.length === 0, `Console errors detected: ${consoleErrors.join(' | ')}`);
    assert(pageErrors.length === 0, `Page errors detected: ${pageErrors.join(' | ')}`);

    const report = {
      exportPaths: {
        image: imageExportPath,
        obj: objExportPath
      },
      exportSizes: {
        image: imageExportSize,
        obj: objExportSize
      },
      hashes: {
        baseline: baseline.hash,
        field: fieldSignature.hash,
        meshBicubic: meshBicubic.hash,
        meshBilinear: meshBilinear.hash,
        meshNearest: meshNearest.hash,
        meshNearestLate: meshNearestLate.hash,
        obj: objSignature.hash,
        tps: tpsSignature.hash
      },
      motionBands: {
        blendOnly: motionBlendOnly,
        warped: motionWarped
      },
      outputDir: tempDir,
      webglFallbackAvailable,
      rendererStatus: webglStatus,
      statuses: {
        field: fieldStatus,
        mesh: meshStatus,
        motion: motionStatus,
        obj: objStatus,
        tps: tpsStatus
      }
    };

    logStep('all generated-input validations passed');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await stopProcess(previewServer);
  }
}

validateGeneratedInputs().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
