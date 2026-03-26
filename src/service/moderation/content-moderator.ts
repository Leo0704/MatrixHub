export interface Violation {
  type: 'extreme_words' | 'false_claims' | 'sensitive_industry' | 'banned_goods' | 'copyright';
  matched: string;
  severity: 'high' | 'medium' | 'low';
}

export interface ModerationResult {
  passed: boolean;
  violations: Violation[];
  revisedContent?: string;
}

// 极限用语词库
const EXTREME_WORDS = [
  '第一', '最好', '最佳', '最优', '顶级', '顶尖', '绝对', '极致',
  '完美', '独家', '首创', '世界级', '国家级', '最便宜', '最低价',
  '全网第一', '全网最好', '全网最低', '销量第一', '排名第一',
];

// 虚假宣传词库
const FALSE_CLAIMS = [
  '永久', '永远', '100%', '七天美白', '一个月瘦', '一天见效',
  '永不', '绝对不会', '保证', '无效退款', '立即见效',
];

// 敏感行业词
const SENSITIVE_INDUSTRY = [
  '药品', '医药', '处方', '治疗', '疗效', '疗效显著',
  '保健品', '医疗器械', '彩票', '赌博', '烟草',
  '金融投资', '稳赚', '高回报', '保本',
];

// 违禁品类（设计文档第16节）
const BANNED_GOODS = [
  '枪支', '弹药', '刀具', '弩', '电击器', '催泪器',
  '毒品', '大麻', '冰毒', '海洛因', '吗啡',
  '假币', '伪造证件', '色情', '低俗', '暴力',
  '野生动物', '濒危物种', '走私',
];

// 版权侵权关键词（设计文档第16节）
const COPYRIGHT_INFRINGEMENT = [
  '正品保证', '官方授权', '正品代购',
  '原单', '尾单', 'A货', '高仿',
];

export function moderateText(text: string): ModerationResult {
  const violations: Violation[] = [];

  // 检测极限用语
  for (const word of EXTREME_WORDS) {
    if (text.includes(word)) {
      violations.push({ type: 'extreme_words', matched: word, severity: 'high' });
    }
  }

  // 检测虚假宣传
  for (const word of FALSE_CLAIMS) {
    if (text.includes(word)) {
      violations.push({ type: 'false_claims', matched: word, severity: 'high' });
    }
  }

  // 检测敏感行业
  for (const word of SENSITIVE_INDUSTRY) {
    if (text.includes(word)) {
      violations.push({ type: 'sensitive_industry', matched: word, severity: 'medium' });
    }
  }

  // 检测违禁品（设计文档第16节）
  for (const word of BANNED_GOODS) {
    if (text.includes(word)) {
      violations.push({ type: 'banned_goods', matched: word, severity: 'high' });
    }
  }

  // 检测版权侵权（设计文档第16节）
  for (const word of COPYRIGHT_INFRINGEMENT) {
    if (text.includes(word)) {
      violations.push({ type: 'copyright', matched: word, severity: 'high' });
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

export async function moderateAndFix(text: string): Promise<ModerationResult> {
  const result = moderateText(text);

  if (result.passed) {
    return result;
  }

  // 优先使用 AI 重写文案
  try {
    const aiResult = await rewriteWithAI(text, result.violations);
    if (aiResult) {
      // AI 重写后再次审核
      const recheck = moderateText(aiResult);
      if (recheck.passed) {
        return {
          passed: true,
          violations: result.violations,
          revisedContent: aiResult,
        };
      }
      // AI 修订后仍有问题，回退到规则替换
    }
  } catch {
    // AI 不可用时降级到规则替换
  }

  // 降级：使用规则替换
  let revised = text;
  for (const v of result.violations) {
    if (v.type === 'extreme_words') {
      revised = replaceExtremeWords(revised, v.matched);
    }
  }

  const recheck = moderateText(revised);
  if (recheck.passed) {
    return {
      passed: true,
      violations: result.violations,
      revisedContent: revised,
    };
  }

  // 还有问题，递归处理（最多3次）
  return moderateAndFixInternal(revised, 2);
}

async function moderateAndFixInternal(text: string, depth: number): Promise<ModerationResult> {
  if (depth <= 0) {
    return { passed: false, violations: [], revisedContent: text };
  }

  let revised = text;
  const current = moderateText(text);

  // 尝试 AI 重写
  try {
    const aiResult = await rewriteWithAI(text, current.violations);
    if (aiResult) {
      const recheck = moderateText(aiResult);
      if (recheck.passed) {
        return { passed: true, violations: current.violations, revisedContent: aiResult };
      }
      revised = aiResult;
    }
  } catch {
    // AI 不可用
  }

  // 规则替换
  for (const v of current.violations) {
    revised = replaceViolation(revised, v);
  }

  const recheck = moderateText(revised);
  if (recheck.passed) {
    return { passed: true, violations: current.violations, revisedContent: revised };
  }

  return moderateAndFixInternal(revised, depth - 1);
}

/**
 * 使用 AI 重写违规文案
 */
async function rewriteWithAI(text: string, violations: Violation[]): Promise<string | null> {
  const { aiGateway } = await import('../ai-gateway.js');

  const violationTypes = violations.map(v => v.type).join(', ');
  const prompt = `请修改以下抖音文案，使其符合平台规范要求。

需要处理的违规类型：${violationTypes}

原文：
${text}

要求：
1. 去除所有违规词汇和表达
2. 保持原文的核心信息和营销意图
3. 使用合规的替代表达
4. 保持抖音风格，可以有适当夸张但不能违规

直接输出修改后的文案，不要加任何说明前缀。`;

  try {
    const result = await aiGateway.generate({
      taskType: 'text',
      prompt,
    });
    return result.content || null;
  } catch {
    return null;
  }
}

function replaceExtremeWords(text: string, word: string): string {
  const replacements: Record<string, string> = {
    '第一': '领先',
    '最好': '出色',
    '最佳': '优秀',
    '最便宜': '实惠',
    '最低价': '优惠',
    '顶级': '高端',
    '顶尖': '优秀',
    '绝对': '非常',
    '极致': '优秀',
    '完美': '很好',
    '独家': '专享',
    '首创': '率先推出',
  };
  return text.split(word).join(replacements[word] || '**');
}

function replaceViolation(text: string, v: Violation): string {
  if (v.type === 'extreme_words') {
    return replaceExtremeWords(text, v.matched);
  }
  if (v.type === 'false_claims') {
    return text.split(v.matched).join('**');
  }
  if (v.type === 'sensitive_industry') {
    return text.split(v.matched).join('**');
  }
  // 违禁品和版权侵权：标记为违规，不自动替换
  if (v.type === 'banned_goods' || v.type === 'copyright') {
    return text.split(v.matched).join('❌');
  }
  return text;
}