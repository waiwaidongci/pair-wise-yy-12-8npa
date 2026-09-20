// 状态编排 hook：界面只负责发命令与渲染；
// 每次领域命令产生新档案后先过一致性校验，再持久化。
// “判断 / 存储 / 界面”三层在此装配但不互相渗透。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fitShoe,
  FitShoeInput,
  recheck,
  RecheckInput,
  registerRefurb,
  RefurbInput,
  removeShoe,
  CommandResult,
  audit,
} from "../domain/rules";
import { loadArchive, resetArchive, saveArchive } from "../storage/archive-store";
import { ArchiveState } from "../domain/types";

export interface Notice {
  tone: "success" | "error" | "info";
  text: string;
}

export function useArchive() {
  const initial = useMemo(loadArchive, []);
  const [state, setState] = useState<ArchiveState>(initial.state);
  const [dataSource, setDataSource] = useState(initial.source);
  const [loadIssues, setLoadIssues] = useState<string[]>(initial.issues);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);

  const flash = useCallback((next: Notice) => {
    setNotice(next);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4200);
  }, []);

  // 所有命令共用：交给纯规则函数得到结果 -> 校验 -> 存储 -> 刷新界面
  const run = useCallback(
    (command: (prev: ArchiveState) => CommandResult, successText?: string) => {
      setState((prev) => {
        const result = command(prev);
        if (!result.ok) {
          flash({ tone: "error", text: result.message });
          return prev;
        }
        const issues = saveArchive(result.state);
        if (issues.length > 0) {
          flash({ tone: "error", text: `一致性校验未通过，操作未落盘：${issues.join("；")}` });
          return prev;
        }
        flash({ tone: result.reused ? "info" : "success", text: successText ?? result.message });
        return result.state;
      });
    },
    [flash],
  );

  const fit = useCallback((input: FitShoeInput) => run((s) => fitShoe(s, input)), [run]);
  const remove = useCallback((fittingId: string, at: string) => run((s) => removeShoe(s, fittingId, at)), [run]);
  const doRecheck = useCallback((input: RecheckInput) => run((s) => recheck(s, input)), [run]);
  const refurb = useCallback((input: RefurbInput) => run((s) => registerRefurb(s, input)), [run]);

  const reset = useCallback(() => {
    const fresh = resetArchive();
    setState(fresh);
    setDataSource("seed");
    setLoadIssues([]);
    flash({ tone: "info", text: "档案已重置为演示种子数据。" });
  }, [flash]);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  return {
    state,
    notice,
    dataSource,
    loadIssues,
    issues: audit(state),
    fit,
    remove,
    recheck: doRecheck,
    refurb,
    reset,
    dismissNotice: () => setNotice(null),
  };
}
