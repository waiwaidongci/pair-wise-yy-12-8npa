import { useMemo, useState } from "react";
import "./styles.css";
import type { HoofPos } from "./domain/types";
import { checkConsistency, SHOE_STATE_LABEL } from "./domain/rules";
import { daysUntil, useArchive } from "./state/useArchive";
import { HorsesPanel } from "./ui/HorsesPanel";
import { FittingPanel, type FitSelection } from "./ui/FittingPanel";
import { ShoesPanel } from "./ui/ShoesPanel";
import { RecordsPanel } from "./ui/RecordsPanel";
import { NoticeBar } from "./ui/primitives";

const TABS = [
  { key: "horses", label: "马匹档案" },
  { key: "fitting", label: "装蹄排他" },
  { key: "shoes", label: "蹄铁库房/翻新" },
  { key: "records", label: "复查与留档" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function App() {
  const { state, notice, send, reseed, clearNotice } = useArchive();
  const [tab, setTab] = useState<TabKey>("horses");
  const [selection, setSelection] = useState<FitSelection | null>(null);

  const metrics = useMemo(() => {
    const open = state.fittings.filter((f) => f.status !== "CLOSED");
    return [
      {
        label: "待复查（5天内含逾期）",
        value: open.filter((f) => f.status === "ACTIVE" && daysUntil(f.nextRecheck) <= 5).length,
      },
      { label: "异常步态马匹", value: state.horses.filter((h) => h.gaitIssue).length },
      { label: "待拆蹄铁（结论失效）", value: state.shoes.filter((s) => s.state === "PENDING_REMOVAL").length },
      { label: "在装蹄铁", value: state.shoes.filter((s) => s.state === "IN_USE").length },
      { label: "翻新待匹配", value: state.shoes.filter((s) => s.state === "PENDING_MATCH").length },
      { label: "报废归档", value: state.shoes.filter((s) => s.state === "SCRAPPED").length },
    ];
  }, [state]);

  const issues = useMemo(() => checkConsistency(state), [state]);

  const goFit = (horseId: string, hoof: HoofPos) => {
    setSelection({ horseId, hoof });
    setTab("fitting");
  };

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62011 · 源提示词 6 · Port 62011 · 领域判断 / 存储 / 界面三层分离</p>
        <h1>蹄铁翻新复用与装蹄排他闭环</h1>
        <span>
          同一片蹄铁未拆下前不得装给第二匹马；翻新登记磨耗量、锻修温度与钉孔状态，超限或扩孔即报废归档；
          翻新件蹄形与规格双匹配方可复用；同一蹄位只留一条有效记录，并发装蹄沿用首次；复查不合格蹄铁停在待拆、原结论失效留档；
          刷新后排他占用与蹄铁履历保持一致。
        </span>
      </section>

      <section className="metrics">
        {metrics.map((m) => (
          <article key={m.label}>
            <small>{m.label}</small>
            <strong>{m.value}</strong>
          </article>
        ))}
      </section>

      <NoticeBar notice={notice} onClose={clearNotice} />

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? "tab active" : "tab"} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
        <button className="tab reset" onClick={() => {
          if (window.confirm("重置为演示档案？当前本地改动会被覆盖。")) reseed();
        }}>
          重置演示数据
        </button>
      </nav>

      {tab === "horses" ? <HorsesPanel state={state} send={send} goFit={goFit} /> : null}
      {tab === "fitting" ? <FittingPanel state={state} send={send} selection={selection} /> : null}
      {tab === "shoes" ? <ShoesPanel state={state} send={send} /> : null}
      {tab === "records" ? <RecordsPanel state={state} send={send} /> : null}

      <footer className="panel consistency">
        <div className="heading">
          <div>
            <p>刷新后一致性</p>
            <h2>排他占用 × 蹄铁履历体检</h2>
          </div>
        </div>
        <ul>
          {issues.map((issue, i) => (
            <li key={i} className={issue.level === "ok" ? "ok" : "error"}>
              {issue.level === "ok" ? "✓ " : "✗ "}
              {issue.message}
            </li>
          ))}
        </ul>
        <p className="muted small">
          状态来源：localStorage 仓储（farrier-archive-v1）；每次操作后以有效装蹄记录重建占用。蹄铁状态：
          {Object.values(SHOE_STATE_LABEL).join(" / ")}。
        </p>
      </footer>
    </main>
  );
}

export default App;
