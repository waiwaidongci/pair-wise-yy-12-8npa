import { useState } from "react";
import type { ArchiveState, Command, FittingRecord } from "../domain/types";
import { hoofLabel } from "../domain/rules";
import { daysUntil, todayISO } from "../state/useArchive";
import { Badge, Field, Panel } from "./primitives";

interface Props {
  state: ArchiveState;
  send: (cmd: Command) => unknown;
}

function RecordCard({ record, state, send }: { record: FittingRecord; state: ArchiveState; send: Props["send"] }) {
  const horse = state.horses.find((h) => h.id === record.horseId);
  const shoe = state.shoes.find((s) => s.id === record.shoeId);
  const [note, setNote] = useState("");
  const [nextRecheck, setNextRecheck] = useState("");
  const [at, setAt] = useState(todayISO());
  const due = daysUntil(record.nextRecheck);

  return (
    <article className={`record-card rec-${record.status.toLowerCase()}`}>
      <header>
        <div>
          <h3>
            {horse?.code ?? "未知马匹"} {hoofLabel(record.hoof)} · {shoe?.code ?? "未知蹄铁"}
          </h3>
          <p className="muted">
            记录 {record.id} · 装于 {record.fittedAt} · 蹄铁师 {record.farrier} · 钉位 {record.nailSites}
          </p>
        </div>
        {record.status === "ACTIVE" ? (
          <Badge tone={due < 0 ? "bad" : due <= 5 ? "warn" : "ok"}>
            有效 · {due < 0 ? `复查逾期${-due}天` : due === 0 ? "今日复查" : `${due}天后复查`}
          </Badge>
        ) : record.status === "INVALID" ? (
          <Badge tone="bad">原结论失效 · 蹄铁待拆</Badge>
        ) : (
          <Badge tone="idle">已关闭归档</Badge>
        )}
      </header>

      <p className="conclusion">结论：{record.conclusion}</p>

      {record.rechecks.length > 0 ? (
        <ul className="recheck-list">
          {record.rechecks.map((r, i) => (
            <li key={i} className={r.result === "FAIL" ? "bad" : "ok"}>
              <time>{r.at}</time>
              <Badge tone={r.result === "FAIL" ? "bad" : "ok"}>{r.result === "FAIL" ? "不合格" : "合格"}</Badge>
              <span>{r.note}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {record.status !== "CLOSED" ? (
        <div className="recheck-form">
          <div className="field-grid">
            <Field label="复查日期">
              <input className="ctrl" type="date" value={at} onChange={(e) => setAt(e.target.value)} />
            </Field>
            <Field label="复查备注">
              <input className="ctrl" value={note} onChange={(e) => setNote(e.target.value)} placeholder="步态 / 蹄温 / 压痕等" />
            </Field>
            <Field label="合格时的下次复查日期">
              <input className="ctrl" type="date" value={nextRecheck} onChange={(e) => setNextRecheck(e.target.value)} />
            </Field>
          </div>
          <div className="form-actions">
            <button
              className="primary"
              onClick={() =>
                send({ type: "recheck", fittingId: record.id, result: "PASS", note, at, nextRecheck: nextRecheck || undefined })
              }
            >
              复查合格（维持有效）
            </button>
            <button onClick={() => send({ type: "recheck", fittingId: record.id, result: "FAIL", note, at })}>
              复查不合格（蹄铁待拆 · 原结论失效留档）
            </button>
            <button onClick={() => send({ type: "remove", shoeId: record.shoeId, at })}>
              拆除蹄铁并归档记录
            </button>
          </div>
        </div>
      ) : (
        <p className="muted">
          {record.closedAt ? `${record.closedAt} 拆除` : ""}，记录已关闭留档，蹄位可重新装蹄。
        </p>
      )}
    </article>
  );
}

export function RecordsPanel({ state, send }: Props) {
  const active = state.fittings
    .filter((f) => f.status !== "CLOSED")
    .sort((a, b) => a.nextRecheck.localeCompare(b.nextRecheck));
  const closed = state.fittings.filter((f) => f.status === "CLOSED").reverse();
  const invalidCount = state.fittings.filter((f) => f.status === "INVALID").length;

  return (
    <div className="stack">
      <Panel
        title="复查与有效记录"
        subtitle="同一蹄位只有一条有效记录 · 复查不合格不删档，原结论失效留档"
      >
        {invalidCount > 0 ? (
          <div className="banner-bad">
            当前有 <b>{invalidCount}</b> 片蹄铁停在“待拆”：蹄位被占用、拒绝新装蹄，请到对应记录执行拆除。
          </div>
        ) : null}
        <div className="record-list">
          {active.map((r) => (
            <RecordCard key={r.id} record={r} state={state} send={send} />
          ))}
          {active.length === 0 ? <p className="muted">没有进行中的装蹄记录。</p> : null}
        </div>
      </Panel>

      <Panel title="装蹄历史归档" subtitle={`失效留档 + 拆除关闭记录共 ${closed.length} 条，永不物理删除`}>
        <div className="record-list">
          {closed.map((r) => (
            <RecordCard key={r.id} record={r} state={state} send={send} />
          ))}
          {closed.length === 0 ? <p className="muted">暂无历史归档。</p> : null}
        </div>
      </Panel>
    </div>
  );
}
