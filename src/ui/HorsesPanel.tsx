import { useState } from "react";
import type { ArchiveState, Command, HoofPos, HoofShape, HorseCategory, FittingRecord } from "../domain/types";
import { HOOF_POS, HOOF_SHAPES, HORSE_CATEGORIES, hoofLabel } from "../domain/rules";
import { daysUntil } from "../state/useArchive";
import { Badge, Field, Panel } from "./primitives";

const SPECS = ["3号", "4号", "5号", "6号"];
const FILTERS = ["全部", "运动马", "休养马", "异常步态"] as const;

interface Props {
  state: ArchiveState;
  send: (cmd: Command) => unknown;
  goFit: (horseId: string, hoof: HoofPos) => void;
}

export function HorsesPanel({ state, send, goFit }: Props) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("全部");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<HorseCategory>("运动马");
  const [gait, setGait] = useState("");
  const [shape, setShape] = useState<HoofShape>("正常蹄");
  const [spec, setSpec] = useState("4号");

  const horses = state.horses.filter((h) => {
    if (filter === "运动马") return h.category === "运动马";
    if (filter === "休养马") return h.category === "休养马";
    if (filter === "异常步态") return Boolean(h.gaitIssue);
    return true;
  });

  const addHorse = () => {
    const hooves = Object.fromEntries(
      HOOF_POS.map((p) => [p.value, { shape, spec }]),
    ) as Record<HoofPos, { shape: HoofShape; spec: string }>;
    const r = send({ type: "addHorse", code, name, category, gaitIssue: gait, hooves });
    if ((r as { ok?: boolean }).ok) {
      setCode("");
      setName("");
      setGait("");
    }
  };

  return (
    <div className="stack">
      <Panel
        title="马匹档案"
        subtitle="左右前后蹄对比 · 异常步态标记"
        actions={
          <div className="chips">
            {FILTERS.map((f) => (
              <button key={f} className={filter === f ? "chip active" : "chip"} onClick={() => setFilter(f)}>
                {f}
              </button>
            ))}
          </div>
        }
      >
        <div className="horse-grid">
          {horses.map((horse) => (
            <article key={horse.id} className="horse-card">
              <header>
                <div>
                  <h3>
                    {horse.code} · {horse.name}
                  </h3>
                  <p className="muted">
                    {horse.category}
                    {horse.gaitIssue ? "" : " · 步态正常"}
                  </p>
                </div>
                {horse.gaitIssue ? <Badge tone="warn">异常步态：{horse.gaitIssue}</Badge> : <Badge tone="ok">步态正常</Badge>}
              </header>

              <div className="hoof-grid">
                {HOOF_POS.map(({ value }) => {
                  const assess = horse.hooves[value];
                  const occ = state.fittings.find(
                    (f) => f.horseId === horse.id && f.hoof === value && f.status !== "CLOSED",
                  ) as FittingRecord | undefined;
                  const shoe = occ ? state.shoes.find((s) => s.id === occ.shoeId) : undefined;
                  const due = occ ? daysUntil(occ.nextRecheck) : null;
                  return (
                    <div key={value} className={`hoof-cell ${occ ? (occ.status === "INVALID" ? "invalid" : "occupied") : "empty"}`}>
                      <div className="hoof-top">
                        <b>{hoofLabel(value)}</b>
                        {occ ? (
                          <Badge tone={occ.status === "INVALID" ? "bad" : due !== null && due <= 5 ? "warn" : "ok"}>
                            {occ.status === "INVALID" ? "待拆" : due !== null && due < 0 ? `复查逾期${-due}天` : due === 0 ? "今日复查" : `${due}天后复查`}
                          </Badge>
                        ) : (
                          <Badge tone="idle">空蹄位</Badge>
                        )}
                      </div>
                      <p className="hoof-spec">
                        蹄形 {assess.shape} · {assess.spec}
                      </p>
                      {occ && shoe ? (
                        <p className="hoof-shoe">
                          {shoe.code}（{shoe.kind}）
                          <br />
                          钉位 {occ.nailSites} · 复查 {occ.nextRecheck}
                        </p>
                      ) : (
                        <p className="muted">未装蹄铁</p>
                      )}
                      <button className="link-btn" onClick={() => goFit(horse.id, value)}>
                        {occ ? "查看装蹄记录 →" : "去装蹄 →"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </Panel>

      <Panel title="新增马匹" subtitle="四蹄蹄形与规格可先统一建档，装蹄时逐蹄匹配">
        <div className="field-grid">
          <Field label="马匹编号">
            <input className="ctrl" value={code} onChange={(e) => setCode(e.target.value)} placeholder="如 HORSE-55" />
          </Field>
          <Field label="马匹名称">
            <input className="ctrl" value={name} onChange={(e) => setName(e.target.value)} placeholder="如 追风" />
          </Field>
          <Field label="马匹分类">
            <select className="ctrl" value={category} onChange={(e) => setCategory(e.target.value as HorseCategory)}>
              {HORSE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="步态问题（可空）">
            <input className="ctrl" value={gait} onChange={(e) => setGait(e.target.value)} placeholder="如 右前蹄外侧磨耗" />
          </Field>
          <Field label="四蹄蹄形">
            <select className="ctrl" value={shape} onChange={(e) => setShape(e.target.value as HoofShape)}>
              {HOOF_SHAPES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="四蹄规格">
            <select className="ctrl" value={spec} onChange={(e) => setSpec(e.target.value)}>
              {SPECS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-actions">
          <button className="primary" onClick={addHorse}>
            建立马匹档案
          </button>
        </div>
      </Panel>
    </div>
  );
}

export { SPECS };
