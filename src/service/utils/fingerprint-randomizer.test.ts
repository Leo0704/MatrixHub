import { describe, it, expect } from 'vitest';
import { getFingerprintScript } from './fingerprint-randomizer';

describe('fingerprintRandomizerScript', () => {
  it('should hide webdriver property', () => {
    const script = getFingerprintScript();
    expect(script).toContain('webdriver');
    expect(script).toContain('undefined');
  });

  it('should include canvas noise injection', () => {
    const script = getFingerprintScript();
    expect(script).toContain('HTMLCanvasElement');
    expect(script).toContain('toDataURL');
  });

  it('should include WebGL fingerprint randomization', () => {
    const script = getFingerprintScript();
    expect(script).toContain('WebGLRenderingContext');
    expect(script).toContain('getParameter');
  });

  it('should override permissions API', () => {
    const script = getFingerprintScript();
    expect(script).toContain('permissions.query');
  });

  it('should include plugin list', () => {
    const script = getFingerprintScript();
    expect(script).toContain('plugins');
    expect(script).toContain('Chrome PDF');
  });

  it('should include languages override', () => {
    const script = getFingerprintScript();
    expect(script).toContain('languages');
    expect(script).toContain('zh-CN');
  });

  it('should include connection info override', () => {
    const script = getFingerprintScript();
    expect(script).toContain('connection');
    expect(script).toContain('effectiveType');
  });

  it('should generate different noise each call', () => {
    const script1 = getFingerprintScript();
    const script2 = getFingerprintScript();
    // WebGL noise values should be different
    expect(script1).not.toBe(script2);
  });
});
