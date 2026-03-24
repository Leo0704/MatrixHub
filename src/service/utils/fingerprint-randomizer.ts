/**
 * 浏览器指纹随机化脚本生成器
 * 每次调用生成不同的噪声，使自动化指纹无法追踪
 */

// 随机化参数
const vendors = ['Google Inc. (NVIDIA)', 'Google Inc. (Intel)', 'Google Inc. (AMD)', 'Apple Inc.'];
const renderers = ['ANGLE (Intel Iris OpenGL Engine)', 'ANGLE (AMD Radeon Pro 5500M)', 'ANGLE (Apple M1)', 'llvmpipe'];

function randomFromArray<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateCanvasNoise(): { r: number; g: number; b: number } {
  return {
    r: Math.floor(Math.random() * 50),
    g: Math.floor(Math.random() * 50),
    b: Math.floor(Math.random() * 50),
  };
}

function generateWebGLNoise(): { vendor: string; renderer: string } {
  return {
    vendor: randomFromArray(vendors),
    renderer: randomFromArray(renderers),
  };
}

/**
 * 生成浏览器指纹随机化脚本
 * 每次调用生成不同的噪声
 */
export function getFingerprintScript(): string {
  const canvasNoise = generateCanvasNoise();
  const webglNoise = generateWebGLNoise();

  return `
// === FINGERPRINT RANDOMIZATION ===

// 1. Hide webdriver property
Object.defineProperty(navigator, 'webdriver', {
  get: () => undefined,
  configurable: true,
  enumerable: true,
});

// 2. Canvas fingerprint noise injection
const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
HTMLCanvasElement.prototype.toDataURL = function(...args) {
  const ctx = this.getContext('2d');
  if (ctx) {
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgba(${canvasNoise.r}, ${canvasNoise.g}, ${canvasNoise.b}, 0.03)';
    ctx.fillRect(0, 0, this.width, this.height);
  }
  return origToDataURL.apply(this, args);
};

// Override canvas getImageData to add noise
const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
CanvasRenderingContext2D.prototype.getImageData = function(sx, sy, sw, sh) {
  const imageData = origGetImageData.call(this, sx, sy, sw, sh);
  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i] = Math.min(255, imageData.data[i] + (Math.random() - 0.5) * 2);
    imageData.data[i+1] = Math.min(255, imageData.data[i+1] + (Math.random() - 0.5) * 2);
    imageData.data[i+2] = Math.min(255, imageData.data[i+2] + (Math.random() - 0.5) * 2);
  }
  return imageData;
};

// 3. WebGL fingerprint randomization
const origGetParameter = WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter = function(p) {
  if (p === 37445) return '${webglNoise.vendor}';
  if (p === 37446) return '${webglNoise.renderer}';
  return origGetParameter.call(this, p);
};

// 4. Override permissions API
const origQuery = navigator.permissions.query;
navigator.permissions.query = function(query) {
  if (query.name === 'notifications') {
    return Promise.resolve({ state: Notification.permission });
  }
  return origQuery.call(this, query);
};

// 5. Hide automation globals
delete window.cdc_adoQpoasnfao76hfioqifgffjadha;
delete window.__webdriver_evaluate;
delete window.__selenium_evaluate;
delete window.__webdriver_script_function;
delete window.__webdriver_script_func;
delete window.__webdriver_script_fn;

// 6. Fake plugin list
Object.defineProperty(navigator, 'plugins', {
  get: () => [
    { name: 'Chrome PDF Plugin', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
    { name: 'Chrome PDF Viewer', description: '', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
    { name: 'Native Client', description: '', filename: 'internal-nacl-plugin' },
  ],
  configurable: true,
});

// 7. Fake languages
Object.defineProperty(navigator, 'languages', {
  get: () => ['zh-CN', 'zh', 'en-US', 'en'],
  configurable: true,
});

// 8. Override Connection info
Object.defineProperty(navigator, 'connection', {
  get: () => ({
    effectiveType: '4g',
    downlink: 10,
    rtt: 50,
    saveData: false,
  }),
  configurable: true,
});
`;
}
