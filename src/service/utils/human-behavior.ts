/**
 * 人类行为模拟模块
 * - 鼠标轨迹（贝塞尔曲线）
 * - 滚动模式（惯性+暂停）
 * - 点击时序
 */

export interface Point {
  x: number;
  y: number;
}

export interface TrajectoryPoint extends Point {
  timestamp: number;
}

export interface ScrollChunk {
  deltaY: number;
  pauseMs: number;
}

/**
 * 生成模拟人类鼠标移动的轨迹点
 * 使用三次贝塞尔曲线，加入随机控制点偏移模拟人手的不精确性
 */
export function generateMouseTrajectory(
  from: Point,
  to: Point,
  durationMs: number = 300
): TrajectoryPoint[] {
  const points: TrajectoryPoint[] = [];
  const startTime = Date.now();

  // 控制点：曲线的"拐弯"位置，模拟人手移动的惯性
  // 随机偏移模拟人手的不精确性
  const cp1 = {
    x: from.x + (to.x - from.x) * 0.3 + (Math.random() - 0.5) * 100,
    y: from.y + (to.y - from.y) * 0.1 + (Math.random() - 0.5) * 50,
  };
  const cp2 = {
    x: from.x + (to.x - from.x) * 0.7 + (Math.random() - 0.5) * 100,
    y: from.y + (to.y - from.y) * 0.9 + (Math.random() - 0.5) * 50,
  };

  // 采样点数量（移动越远，需要越多点）
  const distance = Math.sqrt(Math.pow(to.x - from.x, 2) + Math.pow(to.y - from.y, 2));
  const numSamples = Math.max(10, Math.min(50, Math.floor(distance / 10)));

  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;

    // 三次贝塞尔曲线
    const x = mt3 * from.x + 3 * mt2 * t * cp1.x + 3 * mt * t2 * cp2.x + t3 * to.x;
    const y = mt3 * from.y + 3 * mt2 * t * cp1.y + 3 * mt * t2 * cp2.y + t3 * to.y;

    // 添加微小抖动
    const jitterX = (Math.random() - 0.5) * 2;
    const jitterY = (Math.random() - 0.5) * 2;

    points.push({
      x: Math.round(x + jitterX),
      y: Math.round(y + jitterY),
      timestamp: startTime + Math.round(t * durationMs),
    });
  }

  return points;
}

/**
 * 生成模拟人类滚动的模式
 * 人类滚动：快速滑动 → 减速 → 停顿 → 再滑
 */
export function generateScrollPattern(totalScrollPx: number): ScrollChunk[] {
  const chunks: ScrollChunk[] = [];
  let remaining = totalScrollPx;

  while (remaining > 0) {
    // 每次滚动的距离（随机，模拟手指用力不均）
    const chunkSize = Math.min(remaining, 100 + Math.random() * 200);
    // 滚动前的停顿（模拟阅读或减速）
    const pauseMs = 50 + Math.random() * 300;

    chunks.push({
      deltaY: Math.round(chunkSize),
      pauseMs: Math.round(pauseMs),
    });

    remaining -= chunkSize;
  }

  return chunks;
}

/**
 * Box-Muller 变换生成正态分布随机数
 */
function gaussianRandom(mean: number, sigma: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * sigma;
}

/**
 * 生成人类点击前的犹豫时间
 * 正态分布，中心 150ms，标准差 80ms
 */
export function generateClickDelay(): number {
  const delay = gaussianRandom(150, 80);
  return Math.max(50, Math.min(500, delay));
}

/**
 * 生成操作间隔延迟（模拟人类思考/操作间隔）
 */
export function generateActionDelay(type: 'short' | 'medium' | 'long' = 'medium'): number {
  const ranges = {
    short: [500, 1500],
    medium: [1500, 4000],
    long: [4000, 8000],
  };
  const [min, max] = ranges[type];
  const mean = (min + max) / 2;
  const sigma = (max - min) / 6;
  const delay = gaussianRandom(mean, sigma);
  return Math.round(Math.max(min, Math.min(max, delay)));
}
