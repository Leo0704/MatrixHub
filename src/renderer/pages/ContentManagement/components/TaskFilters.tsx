import type { Platform } from '~shared/types';

interface TaskFiltersProps {
  selectedPlatform: 'all' | Platform;
  filter: 'all' | 'pending' | 'running' | 'completed' | 'failed';
  onPlatformChange: (platform: 'all' | Platform) => void;
  onFilterChange: (filter: 'all' | 'pending' | 'running' | 'completed' | 'failed') => void;
  onCreateClick: () => void;
}

export function TaskFilters({
  selectedPlatform,
  filter,
  onPlatformChange,
  onFilterChange,
  onCreateClick,
}: TaskFiltersProps) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 'var(--space-xl)'
    }}>
      <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
        <select
          className="input"
          style={{ width: 120 }}
          value={selectedPlatform}
          onChange={e => onPlatformChange(e.target.value as 'all' | Platform)}
        >
          <option value="all">全部平台</option>
          <option value="douyin">抖音</option>
          <option value="kuaishou">快手</option>
          <option value="xiaohongshu">小红书</option>
        </select>

        <select
          className="input"
          style={{ width: 120 }}
          value={filter}
          onChange={e => onFilterChange(e.target.value as 'all' | 'pending' | 'running' | 'completed' | 'failed')}
        >
          <option value="all">全部状态</option>
          <option value="pending">等待中</option>
          <option value="running">执行中</option>
          <option value="completed">已完成</option>
          <option value="failed">失败</option>
        </select>
      </div>

      <button
        className="btn btn-primary"
        onClick={onCreateClick}
      >
        + 新建内容
      </button>
    </div>
  );
}
