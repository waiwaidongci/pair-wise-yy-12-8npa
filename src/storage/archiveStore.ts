import type { ArchiveState } from "../domain/types";
import { buildSeedState } from "../domain/seed";

// 存储层：只负责持久化与读取，不含任何业务判断；刷新后从这里重建全部占用与履历。

const STORAGE_KEY = "farrier-archive-v1";

function isState(value: unknown): value is ArchiveState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.horses) &&
    Array.isArray(v.shoes) &&
    Array.isArray(v.fittings) &&
    Array.isArray(v.events) &&
    typeof v.seq === "number"
  );
}

export function loadState(): ArchiveState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isState(parsed)) return parsed;
    }
  } catch {
    // 存储损坏时回落到种子数据，不阻断界面
  }
  return buildSeedState();
}

export function saveState(state: ArchiveState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState(): ArchiveState {
  const seed = buildSeedState();
  saveState(seed);
  return seed;
}
