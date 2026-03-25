// 基础违规词（保留原有）
const BLOCKED_PATTERNS = [
  '赌博', '博彩', '彩票', '裸聊', '援交', '色情', '黄色',
  '毒品', '大麻', '冰毒', '自杀', '自残',
];

const SENSITIVE_TOPICS = [
  '政治', '领导人', '示威', '游行', '抗议',
];

// 新增：AI 味检测模式
const AI_PATTERNS = [
  '首先', '其次', '最后', '总的来说', '综上所述',
  '值得注意的是', '毫无疑问', '不言而喻',
  '从多个角度来看', '事实上', '实际上',
  '换句话说', '也就是说', '可以说',
  '一方面...另一方面', '首先...然后...最后',
];

// 新增：模板化开头检测
const TEMPLATE_OPENINGS = [
  '大家好，我是', '今天给大家分享',
  '你有没有遇到过', '今天来聊聊',
  '相信很多人都', '大家都知道',
];

interface ModerationResult {
  passed: boolean;
  reasons: string[];
  // 新增质量评分（0-100）
  qualityScore?: number;
  // 新增 AI 味指数（0-1，越高越像 AI）
  aiScore?: number;
}

/**
 * 检测 AI 味
 */
function detectAIScore(content: string): number {
  const lowerContent = content.toLowerCase();
  let matches = 0;

  // 检测 AI 常用连接词
  for (const pattern of AI_PATTERNS) {
    if (lowerContent.includes(pattern)) {
      matches++;
    }
  }

  // 检测模板化开头
  for (const opening of TEMPLATE_OPENINGS) {
    if (lowerContent.includes(opening)) {
      matches++;
    }
  }

  // 检测句子长度均匀度（AI 倾向于句子长度相似）
  const sentences = content.split(/[.!?。！？]/).filter(s => s.trim().length > 0);
  if (sentences.length >= 3) {
    const lengths = sentences.map(s => s.length);
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / lengths.length;
    // 方差小说明句子长度太均匀，可能是 AI
    if (variance < 100) {
      matches++;
    }
  }

  // 检测感叹号密度（AI 喜欢用 !!!）
  const exclamationCount = (content.match(/!{2,}/g) || []).length;
  if (exclamationCount > 2) {
    matches++;
  }

  // 检测括号使用（AI 喜欢用括号补充说明）
  const bracketCount = (content.match(/[（(][^）)]*[）)]/g) || []).length;
  if (bracketCount > 5) {
    matches++;
  }

  // 计算最终分数
  const score = Math.min(matches / 8, 1); // 归一化到 0-1
  return score;
}

/**
 * 计算内容质量评分
 */
function calculateQualityScore(content: string): number {
  let score = 50; // 基础分

  // 加分项
  if (content.length >= 100) score += 10;
  if (content.length >= 300) score += 10;
  if (content.includes('#')) score += 5; // 有话题标签
  if (content.includes('？') || content.includes('?')) score += 5; // 有问句
  if (content.includes('...') || content.includes('…')) score += 5; // 有省略号

  // 扣分项
  const aiScore = detectAIScore(content);
  if (aiScore > 0.3) score -= 15;
  if (aiScore > 0.5) score -= 20;

  // 检测重复
  const words = content.split(/\s+/);
  if (words.length > 20) {
    const uniqueWords = new Set(words.map(w => w.toLowerCase()));
    if (uniqueWords.size / words.length < 0.3) {
      score -= 20;
    }
  }

  return Math.max(0, Math.min(100, score));
}

export function moderateContent(content: string): ModerationResult {
  const reasons: string[] = [];
  const lowerContent = content.toLowerCase();

  // 原有违规检测
  for (const pattern of BLOCKED_PATTERNS) {
    if (lowerContent.includes(pattern)) {
      reasons.push(`敏感词: ${pattern}`);
    }
  }

  for (const topic of SENSITIVE_TOPICS) {
    if (lowerContent.includes(topic)) {
      reasons.push(`可能涉及敏感话题: ${topic}`);
    }
  }

  // 重复度检测
  const words = content.split(/\s+/);
  if (words.length > 20) {
    const uniqueWords = new Set(words.map(w => w.toLowerCase()));
    if (uniqueWords.size / words.length < 0.3) {
      reasons.push('内容重复度过高');
    }
  }

  // 新增：AI 味检测（阈值 0.75 减少误报）
  const aiScore = detectAIScore(content);
  if (aiScore > 0.75) {
    reasons.push(`内容可能过于模板化（AI味指数: ${(aiScore * 100).toFixed(0)}%）`);
  }

  // 新增：质量评分
  const qualityScore = calculateQualityScore(content);

  return {
    passed: reasons.length === 0,
    reasons,
    qualityScore,
    aiScore,
  };
}
