import { useState, useEffect, useMemo } from 'react';
import type { Task, Platform } from '~shared/types';
import { useToast } from '../../components/Toast';
import TaskDetailModal from '../../components/TaskDetailModal';
import { RateLimitStatus } from '../../components/RateLimitStatus';
import { useAppStore } from '../../stores/appStore';
import { ConfirmModal } from '../../components/ConfirmModal';

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
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState<{ count: number } | null>(null);
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
      title: (task.payload?.title as string) || '',
      content: (task.payload?.content as string) || '',
      platform: task.platform,
      accountIds: [],
      contentMode: 'text',
    });
    setShowCreateModal(true);
  };

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const selectAllVisible = () => {
    if (selectedTaskIds.size === filteredTasks.length) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(filteredTasks.map(t => t.id)));
    }
  };

  const batchCancel = async () => {
    if (selectedTaskIds.size === 0) return;
    let successCount = 0;
    for (const taskId of selectedTaskIds) {
      try {
        await window.electronAPI?.cancelTask(taskId);
        successCount++;
      } catch {}
    }
    showToast(`已取消 ${successCount} 个任务`, 'success');
    setSelectedTaskIds(new Set());
  };

  const batchRetry = async () => {
    if (selectedTaskIds.size === 0) return;
    let successCount = 0;
    for (const taskId of selectedTaskIds) {
      try {
        await window.electronAPI?.retryTask(taskId);
        successCount++;
      } catch {}
    }
    showToast(`已重试 ${successCount} 个任务`, 'success');
    setSelectedTaskIds(new Set());
  };

  const batchDelete = async () => {
    if (selectedTaskIds.size === 0) return;
    setBatchDeleteConfirm(null);
    let successCount = 0;
    for (const taskId of selectedTaskIds) {
      try {
        await window.electronAPI?.cancelTask(taskId);
        successCount++;
      } catch {}
    }
    showToast(`已取消 ${successCount} 个任务`, 'success');
    setSelectedTaskIds(new Set());
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (filter !== 'all' && task.status !== filter) return false;
      if (selectedPlatform !== 'all' && task.platform !== selectedPlatform) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const title = (task.payload?.title as string)?.toLowerCase() || '';
        const content = (task.payload?.content as string)?.toLowerCase() || '';
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
        <div className="search-bar" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', width: '100%', maxWidth: 400 }}>
          <input
            type="text"
            placeholder="搜索任务..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="搜索任务"
            style={{
              width: '100%',
              padding: 'var(--space-sm) var(--space-md)',
              paddingRight: searchQuery ? 36 : 'var(--space-md)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontSize: 14,
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label="清除搜索"
              style={{
                position: 'absolute',
                right: 8,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 批量操作栏 */}
      {filteredTasks.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-md)',
          padding: 'var(--space-sm) var(--space-md)',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--space-md)',
        }}>
          <input
            type="checkbox"
            checked={selectedTaskIds.size === filteredTasks.length && filteredTasks.length > 0}
            onChange={selectAllVisible}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            全选 ({filteredTasks.length})
          </span>
          {selectedTaskIds.size > 0 && (
            <>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                已选择 {selectedTaskIds.size} 项
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-sm)' }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 12 }}
                  onClick={batchCancel}
                >
                  批量取消
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 12 }}
                  onClick={batchRetry}
                >
                  批量重试
                </button>
                <button
                  className="btn btn-danger"
                  style={{ fontSize: 12 }}
                  onClick={() => setBatchDeleteConfirm({ count: selectedTaskIds.size })}
                >
                  批量删除
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 内容列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        {filteredTasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                <polyline points="14,2 14,8 20,8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <line x1="10" y1="9" x2="8" y2="9"/>
              </svg>
            </div>
            <h3>暂无内容</h3>
            {searchQuery ? (
              <>
                <p style={{ color: 'var(--text-muted)' }}>
                  没有找到匹配" {searchQuery} "的任务
                </p>
                <button
                  className="btn btn-secondary"
                  style={{ marginTop: 'var(--space-lg)' }}
                  onClick={() => setSearchQuery('')}
                >
                  清除搜索
                </button>
              </>
            ) : (
              <>
                <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-lg)' }}>
                  创建你的第一个内容任务吧
                </p>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)', textAlign: 'left', maxWidth: 300 }}>
                  <p style={{ marginBottom: 'var(--space-sm)' }}>如何开始：</p>
                  <ol style={{ paddingLeft: 'var(--space-lg)', lineHeight: 1.8 }}>
                    <li>点击"创建内容"按钮</li>
                    <li>选择目标平台</li>
                    <li>选择要发布的账号</li>
                    <li>填写标题和内容</li>
                    <li>点击创建</li>
                  </ol>
                </div>
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 'var(--space-lg)' }}
                  onClick={() => setShowCreateModal(true)}
                  aria-label="创建第一个内容任务"
                >
                  创建内容
                </button>
              </>
            )}
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
              selected={selectedTaskIds.has(task.id)}
              onToggleSelect={() => toggleTaskSelection(task.id)}
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

      {/* 批量删除确认弹窗 */}
      {batchDeleteConfirm && (
        <ConfirmModal
          title="确认批量取消任务"
          message={`确定要取消选中的 ${batchDeleteConfirm.count} 个任务吗？任务取消后可以重新执行重试。`}
          confirmLabel="确认取消"
          cancelLabel="取消"
          variant="danger"
          onConfirm={() => {
            setBatchDeleteConfirm(null);
            batchDelete();
          }}
          onCancel={() => setBatchDeleteConfirm(null)}
        />
      )}
    </div>
  );
}
