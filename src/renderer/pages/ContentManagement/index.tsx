import { useState, useEffect, useMemo } from 'react';
import type { Task, Platform } from '~shared/types';
import { useToast } from '../../components/Toast';
import TaskDetailModal from '../../components/TaskDetailModal';
import { RateLimitStatus } from '../../components/RateLimitStatus';
import { useAppStore } from '../../stores/appStore';

import { ContentCard } from './components/ContentCard';
import { CreateTaskModal } from './components/CreateTaskModal';
import { TaskFilters } from './components/TaskFilters';

const PAGE_SIZE = 50;

export default function ContentManagement() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'running' | 'completed' | 'failed'>('all');
  const [selectedPlatform, setSelectedPlatform] = useState<'all' | Platform>('all');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { showToast } = useToast();
  const { setTaskDraft } = useAppStore();

  useEffect(() => {
    loadTasks(0);

    window.electronAPI?.onTaskCreated((task) => {
      setTasks(prev => [task, ...prev].slice(0, 1000)); // 最多保留1000条
    });

    window.electronAPI?.onTaskUpdated((task) => {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t));
    });

    return () => {
      window.electronAPI?.removeAllListeners('task:created');
      window.electronAPI?.removeAllListeners('task:updated');
    };
  }, []);

  const loadTasks = async (offset: number) => {
    try {
      const result = await window.electronAPI?.listTasks({
        type: 'publish',
        limit: PAGE_SIZE,
        offset,
      });
      const data = result ?? [];
      if (offset === 0) {
        setTasks(data);
      } else {
        setTasks(prev => [...prev, ...data]);
      }
      // 根据返回数据量判断是否还有更多
      setHasMore(data.length === PAGE_SIZE);
    } catch (error) {
      showToast('加载任务失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = () => {
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    loadTasks(nextPage * PAGE_SIZE);
  };

  const handleCancel = async (taskId: string) => {
    await window.electronAPI?.cancelTask(taskId);
  };

  const handleRetry = async (taskId: string) => {
    await window.electronAPI?.retryTask(taskId);
  };

  const handleDuplicate = (task: Task) => {
    setTaskDraft({
      title: task.payload?.title || '',
      content: task.payload?.content || '',
      platform: task.platform,
      accountIds: [],
    });
    setShowCreateModal(true);
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (filter !== 'all' && task.status !== filter) return false;
      if (selectedPlatform !== 'all' && task.platform !== selectedPlatform) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const title = task.payload?.title?.toLowerCase() || '';
        const content = task.payload?.content?.toLowerCase() || '';
        if (!title.includes(query) && !content.includes(query)) return false;
      }
      return true;
    });
  }, [tasks, filter, selectedPlatform, searchQuery]);

  if (loading) {
    return <div className="empty-state"><div className="empty-state-icon">⏳</div><p>加载中...</p></div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>内容管理</h1>
        <RateLimitStatus />
      </div>
      <TaskFilters
        selectedPlatform={selectedPlatform}
        filter={filter}
        onPlatformChange={setSelectedPlatform}
        onFilterChange={setFilter}
        onCreateClick={() => setShowCreateModal(true)}
      />

      <div className="content-header">
        <div className="search-bar">
          <input
            type="text"
            placeholder="🔍 搜索任务..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* 内容列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        {filteredTasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📝</div>
            <h3>暂无内容</h3>
            <p style={{ color: 'var(--text-muted)' }}>
              创建你的第一个内容任务吧
            </p>
            <button
              className="btn btn-primary"
              style={{ marginTop: 'var(--space-lg)' }}
              onClick={() => setShowCreateModal(true)}
            >
              创建内容
            </button>
          </div>
        ) : (
          filteredTasks.map(task => (
            <ContentCard
              key={task.id}
              task={task}
              onCancel={() => handleCancel(task.id)}
              onRetry={() => handleRetry(task.id)}
              onViewDetail={() => setViewingTask(task)}
              onDuplicate={() => handleDuplicate(task)}
            />
          ))
        )}

        {hasMore && (
          <div style={{ textAlign: 'center', marginTop: 'var(--space-lg)' }}>
            <button
              className="btn btn-secondary"
              onClick={handleLoadMore}
            >
              加载更多
            </button>
          </div>
        )}
      </div>

      {/* 创建弹窗 */}
      {showCreateModal && (
        <CreateTaskModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(task) => {
            setTasks(prev => [task, ...prev]);
            setShowCreateModal(false);
          }}
        />
      )}

      {/* 任务详情弹窗 */}
      {viewingTask && (
        <TaskDetailModal
          task={viewingTask}
          onClose={() => setViewingTask(null)}
        />
      )}
    </div>
  );
}
