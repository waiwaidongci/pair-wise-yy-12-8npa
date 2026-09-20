import { useCallback, useMemo, useRef, useState } from "react";
import type { ArchiveState, CmdResult, Command } from "../domain/types";
import { dispatch } from "../domain/engine";
import { loadState, resetState, saveState } from "../storage/archiveStore";

export interface Notice extends CmdResult {
  id: number;
}

let noticeSeq = 0;

/** 应用状态钩子：界面层只通过命令改状态，不直接操作状态机 */
export function useArchive() {
  const [state, setState] = useState<ArchiveState>(() => loadState());
  const [notice, setNotice] = useState<Notice | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const send = useCallback((command: Command): CmdResult => {
    const outcome = dispatch(stateRef.current, command);
    if (outcome.result.ok) {
      setState(outcome.state);
      saveState(outcome.state);
    }
    const item: Notice = { ...outcome.result, id: ++noticeSeq };
    setNotice(item);
    return outcome.result;
  }, []);

  const reseed = useCallback(() => {
    const fresh = resetState();
    setState(fresh);
    setNotice({
      id: ++noticeSeq,
      ok: true,
      title: "已重置为演示档案",
      message: "全部占用、履历记录已随种子数据重建。",
    });
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  return useMemo(
    () => ({ state, notice, send, reseed, clearNotice }),
    [state, notice, send, reseed, clearNotice],
  );
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysUntil(iso: string): number {
  const today = new Date(todayISO() + "T00:00:00").getTime();
  const target = new Date(iso + "T00:00:00").getTime();
  return Math.round((target - today) / 86400000);
}
