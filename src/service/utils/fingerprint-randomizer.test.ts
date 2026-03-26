import { describe, it, expect } from 'vitest';
import { buildFingerprintScript } from './fingerprint-randomizer';

const DEFAULT_FP_CONFIG = {
  canvasNoiseAmplitude: 0.03,
  webglVendorIndex: 0,
  webglRendererIndex: 0,
  viewportWidthRange: [1280, 1920] as [number, number],
  viewportHeightRange: [720, 1080] as [number, number],
  devicePixelRatio: 0,
  mouseSpeedMultiplier: 1.5,
};

describe('fingerprintRandomizerScript', () => {
  it('should hide webdriver property', () => {
    const script = buildFingerprintScript(1280, 800, DEFAULT_FP_CONFIG);
    expect(script).toContain('webdriver');
    expect(script).toContain('undefined');
  });

  it('should include canvas noise injection', () => {
    const script = buildFingerprintScript(1280, 800, DEFAULT_FP_CONFIG);
    expect(script).toContain('HTMLCanvasElement');
    expect(script).toContain('toDataURL');
  });

  it('should include WebGL fingerprint randomization', () => {
    const script = buildFingerprintScript(1280, 800, DEFAULT_FP_CONFIG);
    expect(script).toContain('WebGLRenderingContext');
    expect(script).toContain('getParameter');
  });

  it('should override permissions API', () => {
    const script = buildFingerprintScript(1280, 800, DEFAULT_FP_CONFIG);
    expect(script).toContain('permissions.query');
  });

  it('should include plugin list', () => {
    const script = buildFingerprintScript(1280, 800, DEFAULT_FP_CONFIG);
    expect(script).toContain('plugins');
    expect(script).toContain('Chrome PDF');
  });

  it('should include languages override', () => {
    const script = buildFingerprintScript(1280, 800, DEFAULT_FP_CONFIG);
    expect(script).toContain('languages');
    expect(script).toContain('zh-CN');
  });

  it('should include connection info override', () => {
    const script = buildFingerprintScript(1280, 800, DEFAULT_FP_CONFIG);
    expect(script).toContain('connection');
    expect(script).toContain('effectiveType');
  });

  it('should include device pixel ratio override when configured', () => {
    const configWithDpr = { ...DEFAULT_FP_CONFIG, devicePixelRatio: 2 };
    const script = buildFingerprintScript(1280, 800, configWithDpr);
    expect(script).toContain('devicePixelRatio');
  });

  it('should include screen dimension overrides', () => {
    const script = buildFingerprintScript(1920, 1080, DEFAULT_FP_CONFIG);
    expect(script).toContain("'width'");
    expect(script).toContain("'height'");
    expect(script).toContain('1920');
    expect(script).toContain('1080');
  });

  it('should generate different noise each call', () => {
    const script1 = buildFingerprintScript(1280, 800, DEFAULT_FP_CONFIG);
    const script2 = buildFingerprintScript(1280, 800, DEFAULT_FP_CONFIG);
    // WebGL noise values should be different between calls (random)
    expect(script1).not.toBe(script2);
  });
});
