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

  // 使用 AI 修改文案（这里用简单的替换策略，真实实现应该调用 AI 重写）
  let revised = text;

  for (const v of result.violations) {
    if (v.type === 'extreme_words') {
      // 替换极限用语为合规表达
      revised = replaceExtremeWords(revised, v.matched);
    }
  }

  // 再次审核修改后的内容
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

  for (const v of current.violations) {
    revised = replaceViolation(revised, v);
  }

  const recheck = moderateText(revised);
  if (recheck.passed) {
    return { passed: true, violations: current.violations, revisedContent: revised };
  }

  return moderateAndFixInternal(revised, depth - 1);
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
  return text;
}