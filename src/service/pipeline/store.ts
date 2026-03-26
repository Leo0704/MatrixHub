import { getDb } from '../db.js';
import type { PipelineTask } from '../../shared/types.js';

export function loadPipelineTask(id: string): PipelineTask | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM pipeline_tasks WHERE id = ?').get(id) as any;
  return row ? rowToPipelineTask(row) : null;
}

export function loadAllPipelineTasks(): PipelineTask[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM pipeline_tasks ORDER BY created_at DESC').all() as any[];
  return rows.map(rowToPipelineTask);
}

export function savePipelineTask(task: PipelineTask): void {
  const db = getDb();
  const steps = JSON.stringify(task.steps);
  db.prepare(`
    INSERT OR REPLACE INTO pipeline_tasks
    (id, input_type, input_data, platform, config, status, steps, current_step, result, error, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    task.id,
    task.input.type,
    JSON.stringify(task.input),
    task.platform,
    JSON.stringify(task.config),
    task.status,
    steps,
    task.currentStep,
    task.result ? JSON.stringify(task.result) : null,
    task.error ?? null,
    task.createdAt,
    task.updatedAt
  );
}

export function updatePipelineStatus(id: string, status: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE pipeline_tasks SET status = ?, updated_at = ? WHERE id = ?
  `).run(status, Date.now(), id);
}

function rowToPipelineTask(row: any): PipelineTask {
  return {
    id: row.id,
    input: JSON.parse(row.input_data),
    config: JSON.parse(row.config),
    platform: row.platform,
    status: row.status,
    steps: JSON.parse(row.steps),
    currentStep: row.current_step,
    result: row.result ? JSON.parse(row.result) : undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
