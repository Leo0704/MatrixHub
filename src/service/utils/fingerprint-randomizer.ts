/**
 * 浏览器指纹随机化脚本生成器
 * 每次调用生成不同的噪声，使自动化指纹无法追踪
 *
 * 支持通过 AntiFingerprintConfig 配置：
 * - Canvas/WebGL 噪声幅度
 * - Viewport 尺寸
 * - 设备像素比
 * - 鼠标移动速度
 */
import type { AntiFingerprintConfig } from '../config/runtime-config.js';

// 预定义的 WebGL vendor/renderer 组合
const WEBGL_PROFILES = [
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA GeForce GTX 1060 Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel Iris OpenGL Engine)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD Radeon Pro 5500M Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Apple Inc.', renderer: 'Apple M1' },
  { vendor: 'Intel Inc.', renderer: 'Intel(R) UHD Graphics 620' },
];

// 自动化检测标识符（需删除的全局变量）
const AUTOMATION_GLOBALS = [
  'cdc_adoQpoasnfao76hfioqifgffjadha',
  '__webdriver_evaluate',
  '__selenium_evaluate',
  '__webdriver_script_function',
  '__webdriver_script_func',
  '__webdriver_script_fn',
  '__webdriver_evaluate',
  '__selenium_evaluate',
  '__fxdriver_evaluate',
  '__driver_evaluate',
  '__driver_evaluate',
];

function randomFromArray<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickWebGLProfile(index: number): { vendor: string; renderer: string } {
  if (index <= 0 || index > WEBGL_PROFILES.length) {
    return randomFromArray(WEBGL_PROFILES);
  }
  return WEBGL_PROFILES[index - 1];
}

export interface FingerprintOptions {
  config: AntiFingerprintConfig;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
}

/**
 * 生成鼠标轨迹点（贝塞尔曲线）
 * 从起点到终点生成一系列中间点，模拟人类移动习惯
 */
function generateMouseTrajectory(
  x1: number, y1: number,
  x2: number, y2: number,
  steps: number,
  speedMultiplier: number
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];

  // 控制点偏移（随机垂直于线段方向）
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 5) {
    return [{ x: x2, y: y2 }];
  }

  // 随机偏移控制点（模拟人类不精准的直线移动）
  const perpX = -dy / dist;
  const perpY = dx / dist;
  const curveAmount = dist * 0.1 * (Math.random() - 0.5) * 2;

  const cpX = (x1 + x2) / 2 + perpX * curveAmount;
  const cpY = (y1 + y2) / 2 + perpY * curveAmount;

  // 真实步数 = 距离 * 速度系数（越大越慢）
  const realSteps = Math.max(3, Math.round(steps * (dist / 100) * speedMultiplier));

  for (let i = 0; i <= realSteps; i++) {
    const t = i / realSteps;
    // 二次贝塞尔曲线（使用 easeInOutQuad 模拟加减速）
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const x = Math.round((1 - eased) * (1 - eased) * x1 + 2 * (1 - eased) * eased * cpX + eased * eased * x2);
    const y = Math.round((1 - eased) * (1 - eased) * y1 + 2 * (1 - eased) * eased * cpY + eased * eased * y2);
    points.push({ x, y });
  }

  return points;
}

export interface FingerprintScriptResult {
  script: string;
  mouseTrajectory: string; // 导出 JS 函数
}

/**
 * 生成浏览器指纹随机化脚本
 * 每次调用生成不同的噪声
 */
export function getFingerprintScript(options: FingerprintOptions): string {
  const { config, viewportWidth, viewportHeight, devicePixelRatio } = options;

  // Canvas 噪声参数
  const canvasNoiseR = Math.floor(Math.random() * config.canvasNoiseAmplitude * 255);
  const canvasNoiseG = Math.floor(Math.random() * config.canvasNoiseAmplitude * 255);
  const canvasNoiseB = Math.floor(Math.random() * config.canvasNoiseAmplitude * 255);

  // WebGL 参数
  const webglProfile = pickWebGLProfile(config.webglVendorIndex);
  const { vendor: webglVendor, renderer: webglRenderer } = webglProfile;

  return `
(function() {
  'use strict';

  // ===== 1. Hide webdriver property =====
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
    configurable: true,
    enumerable: true,
  });

  // ===== 2. Canvas fingerprint noise injection =====
  const _canvasNoiseR = ${canvasNoiseR};
  const _canvasNoiseG = ${canvasNoiseG};
  const _canvasNoiseB = ${canvasNoiseB};

  const _origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(...args) {
    const ctx = this.getContext('2d');
    if (ctx) {
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(' + _canvasNoiseR + ', ' + _canvasNoiseG + ', ' + _canvasNoiseB + ', 0.03)';
      ctx.fillRect(0, 0, this.width, this.height);
    }
    return _origToDataURL.apply(this, args);
  };

  const _origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function(sx, sy, sw, sh) {
    const imageData = _origGetImageData.call(this, sx, sy, sw, sh);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 2 * _canvasNoiseR;
      imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
      imageData.data[i+1] = Math.max(0, Math.min(255, imageData.data[i+1] + noise));
      imageData.data[i+2] = Math.max(0, Math.min(255, imageData.data[i+2] + noise));
    }
    return imageData;
  };

  // ===== 3. WebGL fingerprint randomization =====
  const _origGetParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(p) {
    if (p === 37445) return '${webglVendor}';
    if (p === 37446) return '${webglRenderer}';
    return _origGetParameter.call(this, p);
  };

  // ===== 4. Override permissions API =====
  const _origQuery = navigator.permissions.query;
  navigator.permissions.query = function(query) {
    if (query.name === 'notifications') {
      return Promise.resolve({ state: Notification.permission });
    }
    return _origQuery.call(this, query);
  };

  // ===== 5. Hide automation globals =====
  const _automationGlobals = ${JSON.stringify(AUTOMATION_GLOBALS)};
  for (const key of _automationGlobals) {
    try { delete window[key]; } catch(e) {}
  }

  // ===== 6. Fake plugin list =====
  Object.defineProperty(navigator, 'plugins', {
    get: () => [
      { name: 'Chrome PDF Plugin', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
      { name: 'Chrome PDF Viewer', description: '', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
      { name: 'Native Client', description: '', filename: 'internal-nacl-plugin' },
    ],
    configurable: true,
  });

  // ===== 7. Fake languages =====
  Object.defineProperty(navigator, 'languages', {
    get: () => ['zh-CN', 'zh', 'en-US', 'en'],
    configurable: true,
  });

  // ===== 8. Override Connection info =====
  Object.defineProperty(navigator, 'connection', {
    get: () => ({
      effectiveType: '4g',
      downlink: 10,
      rtt: 50,
      saveData: false,
    }),
    configurable: true,
  });

  // ===== 9. Device pixel ratio override =====
  if (${devicePixelRatio} > 0) {
    Object.defineProperty(window, 'devicePixelRatio', {
      get: () => ${devicePixelRatio},
      configurable: true,
    });
  }

  // ===== 10. Screen dimensions override =====
  Object.defineProperty(screen, 'width', { get: () => ${viewportWidth}, configurable: true });
  Object.defineProperty(screen, 'height', { get: () => ${viewportHeight}, configurable: true });
  Object.defineProperty(screen, 'availWidth', { get: () => ${viewportWidth}, configurable: true });
  Object.defineProperty(screen, 'availHeight', { get: () => ${viewportHeight - 40}, configurable: true });

  // ===== 11. Override innerWidth/innerHeight via touch support check =====
  // (handled by Playwright viewport, but this guards JS-side detection)

})();
`;
}

/**
 * 生成人类行为鼠标移动 JS 代码
 * 注入到页面后，可以通过 __humanMouseMove(x1,y1,x2,y2) 调用
 */
export function getHumanMouseScript(): string {
  return `
(function() {
  'use strict';

  // Bezier ease-in-out for human-like acceleration
  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function generateCurvePoints(x1, y1, x2, y2) {
    var points = [];
    var dx = x2 - x1;
    var dy = y2 - y1;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 5) return [{x: x2, y: y2}];

    // Perpendicular offset for natural curve
    var perpX = -dy / dist;
    var perpY = dx / dist;
    var curve = dist * 0.1 * (Math.random() - 0.5) * 2;
    var cpX = (x1 + x2) / 2 + perpX * curve;
    var cpY = (y1 + y2) / 2 + perpY * curve;

    var steps = Math.max(3, Math.round(dist * 0.3));
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var eased = easeInOutQuad(t);
      var x = Math.round((1-eased)*(1-eased)*x1 + 2*(1-eased)*eased*cpX + eased*eased*x2);
      var y = Math.round((1-eased)*(1-eased)*y1 + 2*(1-eased)*eased*cpY + eased*eased*y2);
      points.push({x: x, y: y});
    }
    return points;
  }

  // Expose globally for automation scripts
  window.__generateMouseTrajectory = generateCurvePoints;
})();
`;
}

/**
 * 生成组合后的完整反指纹脚本（供 platform-launcher 使用）
 */
export function buildFingerprintScript(
  viewportWidth: number,
  viewportHeight: number,
  config: AntiFingerprintConfig
): string {
  const dpr = config.devicePixelRatio <= 0
    ? 1 + Math.random()
    : config.devicePixelRatio;

  return getFingerprintScript({
    config,
    viewportWidth,
    viewportHeight,
    devicePixelRatio: dpr,
  });
}
