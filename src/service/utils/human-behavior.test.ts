import { describe, it, expect } from 'vitest';
import {
  generateMouseTrajectory,
  generateScrollPattern,
  generateClickDelay,
  generateActionDelay,
} from './human-behavior';

describe('humanBehavior', () => {
  describe('generateMouseTrajectory', () => {
    it('should generate points between start and end', () => {
      const from = { x: 100, y: 100 };
      const to = { x: 300, y: 300 };
      const points = generateMouseTrajectory(from, to, 200);
      expect(points.length).toBeGreaterThan(5);
      // First point should be near start (with jitter tolerance)
      expect(points[0].x).toBeGreaterThanOrEqual(95);
      expect(points[0].x).toBeLessThanOrEqual(105);
      // Last point should be near end
      expect(points[points.length - 1].x).toBeGreaterThanOrEqual(295);
      expect(points[points.length - 1].x).toBeLessThanOrEqual(305);
    });

    it('should generate trajectory with multiple points', () => {
      const from = { x: 0, y: 0 };
      const to = { x: 500, y: 500 };
      const points = generateMouseTrajectory(from, to, 300);
      // Should generate multiple distinct points
      expect(points.length).toBeGreaterThan(10);
      // Points should progress from start to end
      expect(points[0].x).toBeLessThan(points[points.length - 1].x);
      expect(points[0].y).toBeLessThan(points[points.length - 1].y);
    });

    it('should return points with timestamp', () => {
      const from = { x: 0, y: 0 };
      const to = { x: 100, y: 100 };
      const points = generateMouseTrajectory(from, to, 100);
      for (const point of points) {
        expect(point).toHaveProperty('x');
        expect(point).toHaveProperty('y');
        expect(point).toHaveProperty('timestamp');
      }
    });
  });

  describe('generateScrollPattern', () => {
    it('should return chunked scroll commands', () => {
      const pattern = generateScrollPattern(500);
      expect(pattern.length).toBeGreaterThan(1);
      for (const chunk of pattern) {
        expect(chunk).toHaveProperty('deltaY');
        expect(chunk).toHaveProperty('pauseMs');
        expect(chunk.deltaY).toBeGreaterThan(0);
        expect(chunk.deltaY).toBeLessThanOrEqual(300);
      }
    });

    it('should total approximately the requested scroll amount', () => {
      const total = 500;
      const pattern = generateScrollPattern(total);
      const sum = pattern.reduce((acc, chunk) => acc + chunk.deltaY, 0);
      expect(sum).toBeGreaterThanOrEqual(total - 100); // Allow some tolerance
    });
  });

  describe('generateClickDelay', () => {
    it('should return delay in reasonable range', () => {
      const delay = generateClickDelay();
      expect(delay).toBeGreaterThanOrEqual(50);
      expect(delay).toBeLessThanOrEqual(500);
    });

    it('should vary between calls', () => {
      const delays = new Set();
      for (let i = 0; i < 10; i++) {
        delays.add(generateClickDelay());
      }
      expect(delays.size).toBeGreaterThan(1); // Should have variation
    });
  });

  describe('generateActionDelay', () => {
    it('should return short delay in correct range', () => {
      const delay = generateActionDelay('short');
      expect(delay).toBeGreaterThanOrEqual(500);
      expect(delay).toBeLessThanOrEqual(1500);
    });

    it('should return medium delay in correct range', () => {
      const delay = generateActionDelay('medium');
      expect(delay).toBeGreaterThanOrEqual(1500);
      expect(delay).toBeLessThanOrEqual(4000);
    });

    it('should return long delay in correct range', () => {
      const delay = generateActionDelay('long');
      expect(delay).toBeGreaterThanOrEqual(4000);
      expect(delay).toBeLessThanOrEqual(8000);
    });
  });
});
