import { useState } from "react";
import "./styles.css";
import { Metrics } from "./components/Metrics";
import { HorsesPanel } from "./components/HorsesPanel";
import { ShoesPanel } from "./components/ShoesPanel";
import { RefurbPanel } from "./components/RefurbPanel";
import { EventLogPanel } from "./components/EventLogPanel";
import { useArchive } from "./state/useArchive";

const PROJECT = {
  sourceNo: 6,
  id: "hxyfront-62011",
  port: 62011,
  title: "马术蹄铁档案 · 翻新复用与装蹄排他闭环",
};

const RULES = [
  "同一蹄铁未拆下前不得装给第二匹马",
  "同一蹄位只留一条有效装蹄，第二次并发装蹄沿用首次",
  "翻新登记磨耗量 / 锻修温度 / 钉孔，超限或扩孔只能报废归档",
  "翻新件须与蹄形、规格、蹄位匹配，不符退回待匹配",
  "复查不合格蹄铁停在待拆，原结论失效留档",
  "判断 / 存储 / 界面分层，刷新后排他占用与蹄铁履历一致",
];

function NoticeBar({
  tone,
  text,
  onClose,
}: {
  tone: "success" | "error" | "info";
  text: string;
  onClose: () => void;
}) {
  return (
    <div className={`notice notice-${tone}`} role="status">
      <span>{text}</span>
      <button className="icon-btn" onClick={onClose} aria-label="关闭提示">
        ×
      </button>
    </div>
  );
}

function App() {
  const archive = useArchive();
  const [refurbShoeId, setRefurbShoeId] = useState<string | null>(null);

  return (
    <main className="app">
      <section className="hero">
        <p>
          {PROJECT.id} · 源提示词{PROJECT.sourceNo} · Port {PROJECT.port}
        </p>
        <h1>{PROJECT.title}</h1>
        <ul className="rule-list">
          {RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        <div className="hero-actions">
          <button onClick={archive.reset}>重置演示档案</button>
        </div>
      </section>

      {archive.notice ? (
        <NoticeBar
          tone={archive.notice.tone}
          text={archive.notice.text}
          onClose={archive.dismissNotice}
        />
      ) : null}
      {archive.loadIssues.length > 0 ? (
        <NoticeBar
          tone="error"
          text={`本地档案与履历不一致，已回退种子数据：${archive.loadIssues.join("；")}`}
          onClose={() => {}}
        />
      ) : null}

      <Metrics state={archive.state} />

      <HorsesPanel api={archive} />
      <ShoesPanel api={archive} onRefurb={setRefurbShoeId} />
      <RefurbPanel api={archive} shoeId={refurbShoeId} onSelect={setRefurbShoeId} />
      <EventLogPanel
        state={archive.state}
        issues={archive.issues}
        source={archive.dataSource}
      />

      <footer className="app-foot">
        判断层 src/domain（纯函数规则） · 存储层 src/storage（localStorage + 审计） · 界面层
        src/components（React）
      </footer>
    </main>
  );
}

export default App;
