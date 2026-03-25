import { moderateContent } from './content-moderator';

describe('ContentModerator', () => {
  it('passes normal content', () => {
    const result = moderateContent('今天天气真好，适合出门散步');
    expect(result.passed).toBe(true);
  });

  it('blocks content with blocked patterns', () => {
    const result = moderateContent('这是一个正常内容包含赌博的信息');
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toContain('敏感词');
  });

  it('detects excessive repetition', () => {
    const repeated = Array(25).fill('测试').join(' ');
    const result = moderateContent(repeated);
    expect(result.passed).toBe(false);
  });
});
