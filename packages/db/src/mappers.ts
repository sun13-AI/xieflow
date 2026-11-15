// 协流 XieFlow — mappers.ts：行 → 领域对象（snake_case ↔ camelCase 唯一入口）
import type { AppSetting, Todo, Quadrant, TodoStatus, Schedule, ScheduleRepeat } from "@xieflow/shared";
import { REPEATS_ORDER } from "./repeat-order.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export function mapSettingsRow(row: Row): AppSetting {
  return {
    key: String(row.key),
    value: String(row.value),
    updatedAt: String(row.updated_at),
  };
}

const QUADRANTS: readonly Quadrant[] = ["q1", "q2", "q3", "q4"];
const STATUSES: readonly TodoStatus[] = ["open", "done", "archived"];

export function mapRowToTodo(row: Row): Todo {
  const quadrant = String(row.quadrant) as Quadrant;
  const status = String(row.status) as TodoStatus;
  if (!QUADRANTS.includes(quadrant)) {
    throw new Error(`非法象限值：${row.quadrant}`);
  }
  if (!STATUSES.includes(status)) {
    throw new Error(`非法状态值：${row.status}`);
  }
  return {
    id: Number(row.id),
    title: String(row.title),
    quadrant,
    status,
    dueDate: row.due_date === null ? null : String(row.due_date),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapRowToSchedule(row: Row): Schedule {
  const repeat = String(row.repeat) as ScheduleRepeat;
  if (!REPEATS_ORDER.includes(repeat)) {
    throw new Error(`非法重复规则值：${row.repeat}`);
  }
  return {
    id: Number(row.id),
    title: String(row.title),
    date: String(row.date),
    start: String(row.start_time),
    end: String(row.end_time),
    todoId: row.todo_id === null ? null : Number(row.todo_id),
    repeat,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
