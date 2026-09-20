import { useState } from "react";
import { POSITION_LABEL, SHOE_STATUS_LABEL, shoeHistory, todayISO } from "../domain/rules";
import { ShoeStatus } from "../domain/types";
import { ArchiveApi } from "./types";
import { Dialog, EmptyHint, StatusBadge, Tag } from "./ui";

type Filter = "ALL" | ShoeStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "全部" },
  { key: "READY", label: "待匹配" },
  { key: "IN_USE", label: "装蹄中" },
  { key: "PENDING_REMOVAL", label: "待拆" },
  { key: "TO_REFURB", label: "待翻新" },
  { key: "SCRAPPED", label: "报废归档" },
];

const KIND_TONE: Record<string, string> = {
  装蹄: "ok",
  沿用首次装蹄: "lock",
  拆下: "neutral",
  翻新合格: "refurb",
  报废归档: "bad",
  匹配不符退回: "bad",
  复查合格: "ok",
  复查不合格: "pending",
};

function HistoryDialog({ shoeId, api, onClose }: { shoeId: string; api: ArchiveApi; onClose: () => void }) {
  const { events, fittings, refurbishments } = shoeHistory(api.state, shoeId);
  const shoe = api.state.shoes.find((s) => s.id === shoeId);
  return (
    <Dialog title={`蹄铁履历 · ${shoeId}`} onClose={onClose}>
      {shoe ? (
        <p className="dlg-hint">
          {shoe.material} · {POSITION_LABEL[shoe.position]} · {shoe.fitShape} · {shoe.size} ·
          累计磨耗 {shoe.wearTotal}mm
        </p>
      ) : null}
      <ol className="timeline">
        {events.map((e) => (
          <li key={e.id}>
            <div className="timeline-dot" />
            <div>
              <p className="timeline-line">
                <Tag tone={KIND_TONE[e.kind] ?? "neutral"}>{e.kind}</Tag>
                <span className="timeline-at">{e.at}</span>
              </p>
              <p className="timeline-detail">{e.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      {fittings.length > 0 ? (
        <div className="record-block">
          <h4>装蹄记录</h4>
          {fittings.map((f) => (
            <p key={f.id} className="record-line">
              {f.fittedAt} → {f.removedAt ?? "占用中"} · {f.horseId} {POSITION_LABEL[f.position]} ·
              {f.source} · <b>{f.status === "ACTIVE" ? "有效" : f.status === "INVALIDATED" ? "失效留档" : "已归档"}</b>
            </p>
          ))}
        </div>
      ) : null}
      {refurbishments.length > 0 ? (
        <div className="record-block">
          <h4>翻新登记</h4>
          {refurbishments.map((r) => (
            <p key={r.id} className="record-line">
              {r.at} · 磨耗 {r.wear}mm · {r.forgeTemp}℃ · 钉孔{r.holeState} · 成型{r.targetShape} ·{" "}
              <b>{r.result}</b>
              {r.reason ? `（${r.reason}）` : ""}
            </p>
          ))}
        </div>
      ) : null}
      {events.length === 0 ? <EmptyHint>暂无履历。</EmptyHint> : null}
      <p className="dlg-foot-note">当前日期 {todayISO()}。刷新后占用状态由档案重建，与履历保持一致。</p>
    </Dialog>
  );
}

export function ShoesPanel({
  api,
  onRefurb,
}: {
  api: ArchiveApi;
  onRefurb: (shoeId: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [historyId, setHistoryId] = useState<string | null>(null);

  const shoes = api.state.shoes.filter((s) => filter === "ALL" || s.status === filter);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>蹄铁库存</p>
          <h2>翻新复用与排他占用台账</h2>
        </div>
        <div className="chips">
          {FILTERS.map((f) => (
            <button key={f.key} className={filter === f.key ? "active" : ""} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <table className="shoe-table">
          <thead>
            <tr>
              <th>蹄铁</th>
              <th>类型</th>
              <th>蹄位 / 蹄形 / 规格</th>
              <th>累计磨耗</th>
              <th>来源</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {shoes.map((s) => {
              const fitting = s.currentFittingId
                ? api.state.fittings.find((f) => f.id === s.currentFittingId)
                : undefined;
              return (
                <tr key={s.id} className={`row-${s.status.toLowerCase()}`}>
                  <td>
                    <b>{s.id}</b>
                  </td>
                  <td>{s.material}</td>
                  <td>
                    {POSITION_LABEL[s.position]} · {s.fitShape} · {s.size}
                  </td>
                  <td>{s.wearTotal} mm</td>
                  <td>{s.refurbished ? <Tag tone="refurb">翻新件</Tag> : <Tag>新件</Tag>}</td>
                  <td>
                    <StatusBadge status={s.status} />
                    {fitting ? <p className="lock-note">占用 {fitting.horseId}</p> : null}
                  </td>
                  <td className="row-actions">
                    {s.status === "TO_REFURB" ? (
                      <button className="small primary" onClick={() => onRefurb(s.id)}>
                        翻新登记
                      </button>
                    ) : null}
                    {s.status === "PENDING_REMOVAL" && fitting ? (
                      <button className="small bad" onClick={() => api.remove(fitting.id, todayISO())}>
                        拆下待拆件
                      </button>
                    ) : null}
                    <button className="small" onClick={() => setHistoryId(s.id)}>
                      履历
                    </button>
                    <span className="status-text">{SHOE_STATUS_LABEL[s.status]}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {shoes.length === 0 ? <EmptyHint>该状态下暂无蹄铁。</EmptyHint> : null}
      </div>

      {historyId ? <HistoryDialog shoeId={historyId} api={api} onClose={() => setHistoryId(null)} /> : null}
    </section>
  );
}
