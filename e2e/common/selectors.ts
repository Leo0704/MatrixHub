/**
 * 全局 CSS 选择器常量
 */

export const GlobalSelectors = {
  sidebar: '.sidebar',
  mainContent: '.main-content',
  card: '.card',
  btnPrimary: '.btn.btn-primary',
  btnSecondary: '.btn.btn-secondary',
  btnGhost: '.btn.btn-ghost',
  input: '.input',
  toast: '.toast',
} as const;

export const AccountSelectors = {
  addAccountBtn: 'button:has-text("添加账号")',
  accountCard: '.card:has(.badge)',
  usernameInput: '[placeholder="输入用户名或手机号"]',
  passwordInput: '[type="password"]',
  displayNameInput: '[placeholder="选填，默认使用用户名"]',
  tagsInput: '[placeholder="逗号分隔，如: 美妆,种草"]',
  platformDouyin: 'button:has-text("🎵 抖音")',
  platformKuaishou: 'button:has-text("📱 快手")',
  platformXiaohongshu: 'button:has-text("📕 小红书")',
  deleteBtn: 'button:has-text("删除")',
  deleteConfirmTitle: '#delete-confirm-title',
  cancelDeleteBtn: 'button:has-text("取消")',
  confirmDeleteBtn: 'button:has-text("删除")',
  groupBtn: (name: string) => `button:has-text("${name}")`,
  allAccountsBtn: 'button:has-text("全部")',
  manageGroupsBtn: 'button:has-text("管理分组")',
  createGroupBtn: 'button:has-text("+ 新建分组")',
  groupNameInput: '[placeholder="分组名称"]',
  saveGroupBtn: 'button:has-text("保存")',
  // 弹窗标题
  modalAddTitle: 'h3:has-text("添加账号")',
  modalGroupTitle: 'h3:has-text("管理分组")',
  modalConfirmTitle: 'h3:has-text("确认删除")',
  // 弹窗内的按钮
  modalCancelBtn: 'button:has-text("取消")',
  modalSaveBtn: 'button:has-text("保存")',
  modalCreateBtn: 'button:has-text("创建")',
  // 颜色选择按钮 - 使用第一个（默认#6366f1）
  colorBtn: '.card button[style*="border-radius"]',
} as const;

export const AICreationSelectors = {
  platformDouyin: 'button:has-text("🎵 抖音")',
  platformKuaishou: 'button:has-text("📱 快手")',
  platformXiaohongshu: 'button:has-text("📕 小红书")',
  contentTypeText: 'button:has-text("📝 文案")',
  contentTypeImage: 'button:has-text("🖼️ 图片")',
  contentTypeVoice: 'button:has-text("🔊 语音")',
  modelSelect: 'select.input',
  promptTemplate: (name: string) => `button:has-text("${name}")`,
  topicInput: 'textarea.input',
  generateBtn: 'button:has-text("✨ 开始生成")',
  generatingBtn: 'button:has-text("🤖 生成中...")',
  resultSection: '.card:has(h3:has-text("生成结果"))',
  copyBtn: 'button:has-text("复制")',
  copiedBtn: 'button:has-text("✓ 已复制")',
  editBtn: 'button:has-text("编辑")',
  doneEditBtn: 'button:has-text("✓ 完成编辑")',
  publishBtn: 'button:has-text("一键发布")',
  quickOptimize: (type: string) => `button:has-text("${type}")`,
  iterationHistory: '.card:has-text("迭代历史")',
} as const;

export const ContentSelectors = {
  platformFilter: 'select.input >> nth=0',
  statusFilter: 'select.input >> nth=1',
  createContentBtn: 'button:has-text("+ 新建内容")',
  taskCard: '.card:has(.badge)',
  statusBadge: '.badge',
  cancelBtn: 'button:has-text("取消")',
  retryBtn: 'button:has-text("重试")',
  detailBtn: 'button:has-text("详情")',
  loadMoreBtn: 'button:has-text("加载更多")',
  emptyState: '.empty-state',
} as const;

export const ScheduleSelectors = {
  createTaskBtn: 'button:has-text("+ 创建定时任务")',
  calendarContainer: '.card:has-text("2026年")',
  prevMonthBtn: 'button:has-text("◀")',
  nextMonthBtn: 'button:has-text("▶")',
  taskList: '.card:has(h3:has-text("定时任务"))',
  cancelBtn: '[style*="color: var(--error)"]',
  retryBtn: '[style*="color: var(--primary)"]',
} as const;

export const PublishModalSelectors = {
  modalTitle: 'h3:has-text("一键发布")',
  platformTip: '[style*="bg: var(--bg-elevated)"]',
  publishBtn: '.card .btn.btn-primary',
  cancelBtn: '.card .btn.btn-secondary',
  accountLabel: '[style*="cursor: pointer"]',
  partialSelection: 'text="(部分)"',
} as const;
