// 存储层：负责档案的本地持久化与刷新恢复。
// 不包含任何业务判断；读取后会用领域层 audit 校验“排他占用与蹄铁履历一致”，
// 数据损坏或不一致时回退到种子档案，避免界面呈现自相矛盾的占用状态。

import { audit } from "../domain/rules";
import { seedState } from "../domain/seed";
import { ArchiveState } from "../domain/types";

const STORAGE_KEY = "hxyfront-62011.archive.v1";

export interface LoadResult {
  state: ArchiveState;
  source: "seed" | "storage";
  issues: string[];
}

function isArchive(value: unknown): value is ArchiveState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.horses) &&
    Array.isArray(v.shoes) &&
    Array.isArray(v.fittings) &&
    Array.isArray(v.refurbishments) &&
    Array.isArray(v.events)
  );
}

export function loadArchive(): LoadResult {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isArchive(parsed)) {
        const issues = audit(parsed);
        if (issues.length === 0) {
          return { state: parsed, source: "storage", issues: [] };
        }
        // 占用与履历不一致：不信任本地数据，回退种子并把问题留给界面展示
        console.warn("[蹄铁档案] 本地数据一致性校验失败：", issues);
        return { state: structuredClone(seedState), source: "seed", issues };
      }
    }
  } catch (error) {
    console.warn("[蹄铁档案] 读取本地档案失败：", error);
  }
  return { state: structuredClone(seedState), source: "seed", issues: [] };
}

export function saveArchive(state: ArchiveState): string[] {
  const issues = audit(state);
  // 不一致的数据不写入，保证刷新后排他占用与蹄铁履历仍一致
  if (issues.length === 0) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("[蹄铁档案] 写入本地档案失败：", error);
    }
  }
  return issues;
}

export function resetArchive(): ArchiveState {
  const fresh = structuredClone(seedState);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}
