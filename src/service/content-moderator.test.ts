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

  // 新增测试
  describe('AI score detection', () => {
    it('detects high AI pattern content', () => {
      const aiContent = '首先，我们需要从多个角度来看待这个问题。其次，毫无疑问的是，事实上这个问题确实存在。最后，总的来说，我们可以得出结论。';
      const result = moderateContent(aiContent);
      expect(result.aiScore).toBeGreaterThan(0.3);
    });

    it('detects template openings', () => {
      const templateContent = '大家好，我是今天的分享者。今天给大家分享一个重要的话题。首先，其次，最后。';
      const result = moderateContent(templateContent);
      expect(result.aiScore).toBeGreaterThan(0);
    });

    it('passes natural content with lower AI score', () => {
      const naturalContent = '昨天去了一家小店，意外发现超级好吃！老板人很nice，还送了小菜。下次一定再来！';
      const result = moderateContent(naturalContent);
      expect(result.aiScore).toBeLessThan(0.3);
    });
  });

  describe('quality score', () => {
    it('calculates quality score', () => {
      const goodContent = '今天尝试了一个新菜谱，味道还不错！分享一下我的心得：1）火候要控制好；2）调料要适量；3）最重要的是心情~ #美食 #家常菜';
      const result = moderateContent(goodContent);
      expect(result.qualityScore).toBeGreaterThan(50);
    });

    it('penalizes repetitive content', () => {
      const repetitive = Array(30).fill('很好').join(' ');
      const result = moderateContent(repetitive);
      expect(result.qualityScore).toBeLessThan(50);
    });
  });
});
