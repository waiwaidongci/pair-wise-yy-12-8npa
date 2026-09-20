import { useMemo, useState } from "react";
import {
  POSITION_FRONT,
  POSITION_HIND,
  POSITION_LABEL,
  findShoe,
  liveFittingAt,
  todayISO,
} from "../domain/rules";
import { HoofPosition, Horse, Shoe } from "../domain/types";
import { ArchiveApi } from "./types";
import { Dialog, EmptyHint, StatusBadge, Tag } from "./ui";

type Filter = "all" | "运动马" | "休养马" | "前蹄" | "后蹄";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "全部马匹" },
  { key: "运动马", label: "运动马" },
  { key: "休养马", label: "休养马" },
  { key: "前蹄", label: "前蹄" },
  { key: "后蹄", label: "后蹄" },
];

interface FitTarget {
  horse: Horse;
  position: HoofPosition;
}

function HoofCell({
  horse,
  position,
  api,
  onFit,
}: {
  horse: Horse;
  position: HoofPosition;
  api: ArchiveApi;
  onFit: (target: FitTarget) => void;
}) {
  const { state } = api;
  const hoof = horse.hooves[position];
  const fitting = liveFittingAt(state, horse.id, position);
  const shoe = fitting ? findShoe(state, fitting.shoeId) : undefined;
  const overdue = fitting?.status === "ACTIVE" && fitting.nextRecheckAt < todayISO();
  const locked = !!fitting;

  return (
    <div className={`hoof ${locked ? "hoof-locked" : "hoof-free"}`}>
      <div className="hoof-top">
        <b>{POSITION_LABEL[position]}</b>
        {locked ? <Tag tone="lock">排他占用</Tag> : <Tag tone="free">空闲</Tag>}
      </div>
      <p className="hoof-spec">
        {hoof.shape} · {hoof.spec}
      </p>
      {hoof.gait ? (
        <p className="hoof-gait">
          <Tag tone="gait">步态异常</Tag>
          {hoof.gait}
        </p>
      ) : null}

      {fitting && shoe ? (
        <div className="hoof-fitting">
          <div className="hoof-shoe">
            <span>{shoe.id}</span>
            <StatusBadge status={shoe.status} />
          </div>
          <p>
            {shoe.material} · {fitting.source} · {shoe.fitShape}
          </p>
          <p>装蹄 {fitting.fittedAt}</p>
          <p className={overdue ? "recheck overdue" : "recheck"}>
            复查 {fitting.nextRecheckAt}
            {fitting.status === "INVALIDATED" ? " · 结论失效" : overdue ? " · 已逾期" : ""}
          </p>
          <div className="hoof-actions">
            {fitting.status === "ACTIVE" ? (
              <>
                <button
                  className="small good"
                  onClick={() =>
                    api.recheck({ fittingId: fitting.id, at: todayISO(), pass: true })
                  }
                >
                  复查合格
                </button>
                <button
                  className="small bad"
                  onClick={() =>
                    api.recheck({ fittingId: fitting.id, at: todayISO(), pass: false })
                  }
                >
                  复查不合格
                </button>
              </>
            ) : (
              <Tag tone="pending">停在待拆 · 原结论失效留档</Tag>
            )}
            <button className="small" onClick={() => api.remove(fitting.id, todayISO())}>
              拆下蹄铁
            </button>
          </div>
        </div>
      ) : (
        <button className="primary small full" onClick={() => onFit({ horse, position })}>
          选择蹄铁装蹄
        </button>
      )}
    </div>
  );
}

function FitDialog({
  target,
  api,
  onClose,
}: {
  target: FitTarget;
  api: ArchiveApi;
  onClose: () => void;
}) {
  const { horse, position } = target;
  const hoof = horse.hooves[position];
  const [shoeId, setShoeId] = useState("");

  const candidates: Shoe[] = useMemo(
    () =>
      api.state.shoes
        .filter((s) => s.status === "READY")
        .sort((a, b) => Number(b.refurbished) - Number(a.refurbished)),
    [api.state.shoes],
  );

  const selected = candidates.find((s) => s.id === shoeId);
  const mismatches: string[] = [];
  if (selected) {
    if (selected.position !== position)
      mismatches.push(`蹄位（${POSITION_LABEL[selected.position]} ≠ ${POSITION_LABEL[position]}）`);
    if (selected.fitShape !== hoof.shape)
      mismatches.push(`蹄形（${selected.fitShape} ≠ ${hoof.shape}）`);
    if (selected.size !== hoof.spec) mismatches.push(`规格（${selected.size} ≠ ${hoof.spec}）`);
  }

  return (
    <Dialog
      title={`装蹄 · ${horse.name} ${POSITION_LABEL[position]}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>取消</button>
          <button
            className="primary"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              api.fit({
                shoeId: selected.id,
                horseId: horse.id,
                position,
                fittedAt: todayISO(),
              });
              onClose();
            }}
          >
            {mismatches.length ? "装蹄（不符将退回待匹配）" : "确认装蹄并排他占用"}
          </button>
        </>
      }
    >
      <p className="dlg-hint">
        要求蹄形 <b>{hoof.shape}</b> · 规格 <b>{hoof.spec}</b> · 蹄位{" "}
        <b>{POSITION_LABEL[position]}</b>
      </p>
      {candidates.length === 0 ? (
        <EmptyHint>待匹配池暂无蹄铁，需先完成翻新登记或新增蹄铁。</EmptyHint>
      ) : (
        <div className="candidate-list">
          {candidates.map((s) => {
            const miss: string[] = [];
            if (s.position !== position) miss.push("蹄位不符");
            if (s.fitShape !== hoof.shape) miss.push("蹄形不符");
            if (s.size !== hoof.spec) miss.push("规格不符");
            const ok = miss.length === 0;
            return (
              <label
                key={s.id}
                className={`candidate ${shoeId === s.id ? "selected" : ""} ${
                  ok ? "" : "mismatch"
                }`}
              >
                <input
                  type="radio"
                  name="candidate"
                  checked={shoeId === s.id}
                  onChange={() => setShoeId(s.id)}
                />
                <div>
                  <b>
                    {s.id}
                    {s.refurbished ? <Tag tone="refurb">翻新件</Tag> : <Tag>新件</Tag>}
                  </b>
                  <p>
                    {s.material} · {POSITION_LABEL[s.position]} · {s.fitShape} · {s.size} · 累计磨耗
                    {s.wearTotal}mm
                  </p>
                  {ok ? (
                    <Tag tone="ok">蹄形 / 规格 / 蹄位均匹配</Tag>
                  ) : (
                    <Tag tone="bad">{miss.join("、")}，装蹄将退回待匹配</Tag>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}

export function HorsesPanel({ api }: { api: ArchiveApi }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [fitTarget, setFitTarget] = useState<FitTarget | null>(null);

  const showPositions = (p: HoofPosition) =>
    filter === "前蹄"
      ? POSITION_FRONT.includes(p)
      : filter === "后蹄"
        ? POSITION_HIND.includes(p)
        : true;

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>马匹档案</p>
          <h2>马匹蹄位与排他占用</h2>
        </div>
        <div className="chips">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={filter === f.key ? "active" : ""}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="horse-grid">
        {api.state.horses
          .filter((h) => filter === "all" || filter === "前蹄" || filter === "后蹄" || h.category === filter)
          .map((horse) => (
            <article key={horse.id} className="horse-card">
              <header className="horse-head">
                <div>
                  <h3>
                    {horse.id} · {horse.name}
                  </h3>
                  <p>{horse.category}</p>
                </div>
              </header>
              <div className="hoof-grid">
                {([...POSITION_FRONT, ...POSITION_HIND] as HoofPosition[])
                  .filter(showPositions)
                  .map((position) => (
                    <HoofCell
                      key={position}
                      horse={horse}
                      position={position}
                      api={api}
                      onFit={setFitTarget}
                    />
                  ))}
              </div>
            </article>
          ))}
      </div>

      {fitTarget ? <FitDialog target={fitTarget} api={api} onClose={() => setFitTarget(null)} /> : null}
    </section>
  );
}
