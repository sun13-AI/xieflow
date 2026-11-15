// 协流 XieFlow — repeat-order.ts：ScheduleRepeat 全量清单（mappers 校验用）
// 单独成文件：mappers（CJS 兼容路径）与 shared 的 REPEAT_LABELS 解耦，避免循环导入。
import type { ScheduleRepeat } from "@xieflow/shared";

export const REPEATS_ORDER: readonly ScheduleRepeat[] = ["none", "daily", "weekly", "monthly"];
