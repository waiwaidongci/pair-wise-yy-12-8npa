import { useState } from "react";
import { MAX_WEAR_PER_REFURB, POSITION_LABEL, refurbVerdict, todayISO } from "../domain/rules";
import { HoleState, HoofShape } from "../domain/types";
import { ArchiveApi } from "./types";
import { Tag } from "./ui";

const HOLE_STATES: HoleState[] = ["完好", "微扩", "扩孔", "裂纹"];
const HOOF_SHAPES: HoofShape[] = ["正常蹄", "平蹄", "广蹄", "立蹄"];

export function RefurbPanel({
  api,
  shoeId,
  onSelect,
}: {
  api: ArchiveApi;
  shoeId: string | null;
  onSelect: (shoeId: string | null) => void;
}) {
  const toRefurb = api.state.shoes.filter((s) => s.status === "TO_REFURB");
  const active = shoeId ? api.state.shoes.find((s) => s.id === shoeId) ?? null : null;

  const [at, setAt] = useState(todayISO());
  const [wear, setWear] = useState("2");
  const [forgeTemp, setTemp] = useState("980");
  const [holeState, setHoleState] = useState<HoleState>("完好");
  const [targetShape, setTargetShape] = useState<HoofShape>("正常蹄");

  const wearNum = Number(wear);
  const verdict = refurbVerdict({ wear: wearNum, holeState });

  return (
    <section className="panel refurb-panel">
      <div className="heading">
        <div>
          <p>翻新登记</p>
          <h2>磨耗量 · 锻修温度 · 钉孔状态</h2>
        </div>
        <select value={shoeId ?? ""} onChange={(e) => onSelect(e.target.value || null)}>
          <option value="">选择待翻新蹄铁…</option>
          {toRefurb.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id} · {POSITION_LABEL[s.position]} · {s.fitShape} · {s.size}
            </option>
          ))}
        </select>
      </div>

      {!active ? (
        <p className="empty-hint">
          拆下蹄铁后进入待翻新队列（当前 {toRefurb.length} 块）。磨耗超过单次上限{" "}
          {MAX_WEAR_PER_REFURB}mm 或钉孔扩孔/裂纹，只能报废归档；合格后回待匹配池按蹄形与规格匹配复用。
        </p>
      ) : (
        <form
          key={active.id}
          className="refurb-form"
          onSubmit={(e) => {
            e.preventDefault();
            api.refurb({
              shoeId: active.id,
              at,
              wear: wearNum,
              forgeTemp: Number(forgeTemp),
              holeState,
              targetShape,
            });
            onSelect(null);
          }}
        >
          <div className="refurb-target">
            <b>{active.id}</b>
            <span>
              {active.material} · {POSITION_LABEL[active.position]} · 成型 {active.fitShape} ·{" "}
              {active.size} · 累计磨耗 {active.wearTotal}mm
            </span>
          </div>

          <div className="field-grid">
            <label>
              <span>翻新日期</span>
              <input type="date" value={at} onChange={(e) => setAt(e.target.value)} required />
            </label>
            <label>
              <span>本次磨耗量（mm，上限 {MAX_WEAR_PER_REFURB}）</span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={wear}
                onChange={(e) => setWear(e.target.value)}
                required
              />
            </label>
            <label>
              <span>锻修温度（℃）</span>
              <input
                type="number"
                min="0"
                step="10"
                value={forgeTemp}
                onChange={(e) => setTemp(e.target.value)}
                required
              />
            </label>
            <label>
              <span>钉孔状态</span>
              <select value={holeState} onChange={(e) => setHoleState(e.target.value as HoleState)}>
                {HOLE_STATES.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>锻修后目标蹄形</span>
              <select value={targetShape} onChange={(e) => setTargetShape(e.target.value as HoofShape)}>
                {HOOF_SHAPES.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={`verdict ${verdict.scrapped ? "verdict-scrap" : "verdict-pass"}`}>
            {verdict.scrapped ? (
              <>
                <Tag tone="bad">判定：报废归档</Tag>
                <span>{verdict.reasons.join("；")}，蹄铁将直接报废并留档。</span>
              </>
            ) : (
              <>
                <Tag tone="ok">判定：翻新合格</Tag>
                <span>
                  登记后累计磨耗 {(active.wearTotal + wearNum).toFixed(2)}mm，蹄铁回待匹配池，成型为
                  {targetShape}，需与蹄形/规格匹配才能装蹄。
                </span>
              </>
            )}
          </div>

          <div className="form-actions">
            <button type="button" onClick={() => onSelect(null)}>
              取消
            </button>
            <button className="primary" type="submit">
              {verdict.scrapped ? "登记并报废归档" : "登记翻新合格入库"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
