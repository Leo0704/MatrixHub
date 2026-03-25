// Basic blocked patterns - minimal set for demonstration
const BLOCKED_PATTERNS = [
  '赌博', '博彩', '彩票', '裸聊', '援交', '色情', '黄色',
  '毒品', '大麻', '冰毒', '自杀', '自残',
];

const SENSITIVE_TOPICS = [
  '政治', '领导人', '示威', '游行', '抗议',
];

interface ModerationResult {
  passed: boolean;
  reasons: string[];
}

export function moderateContent(content: string): ModerationResult {
  const reasons: string[] = [];
  const lowerContent = content.toLowerCase();

  for (const pattern of BLOCKED_PATTERNS) {
    if (lowerContent.includes(pattern)) {
      reasons.push(`包含敏感词: ${pattern}`);
    }
  }

  for (const topic of SENSITIVE_TOPICS) {
    if (lowerContent.includes(topic)) {
      reasons.push(`可能涉及敏感话题: ${topic}`);
    }
  }

  // Check for excessive repetition
  const words = content.split(/\s+/);
  if (words.length > 20) {
    const uniqueWords = new Set(words.map(w => w.toLowerCase()));
    if (uniqueWords.size / words.length < 0.3) {
      reasons.push('内容重复度过高');
    }
  }

  return {
    passed: reasons.length === 0,
    reasons,
  };
}
