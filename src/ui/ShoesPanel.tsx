import { useState } from "react";
import type { ArchiveState, Command, HoofShape, NailHoleStatus, Shoe, ShoeKind, ShoeState } from "../domain/types";
import {
  HOOF_SHAPES,
  hoofLabel,
  MAX_FORGE_TEMP_C,
  MAX_WEAR_MM,
  MIN_FORGE_TEMP_C,
  NAIL_HOLE_STATES,
  shoeEvents,
  shoeOccupant,
  SHOE_KINDS,
  SHOE_STATE_LABEL,
} from "../domain/rules";
import { todayISO } from "../state/useArchive";
import { Badge, Field, Panel, ShoeStateBadge } from "./primitives";
import { SPECS } from "./HorsesPanel";

const FILTERS: { key: string; label: string; match: (s: ShoeState) => boolean }[] = [
  { key: "all", label: "全部", match: () => true },
  { key: "inuse", label: "在装 / 待拆", match: (s) => s === "IN_USE" || s === "PENDING_REMOVAL" },
  { key: "recovered", label: "已拆待翻新", match: (s) => s === "RECOVERED" },
  { key: "match", label: "翻新待匹配", match: (s) => s === "PENDING_MATCH" },
  { key: "stock", label: "新件库存", match: (s) => s === "STOCK" },
  { key: "scrap", label: "报废归档", match: (s) => s === "SCRAPPED" },
];

const EVENT_LABEL: Record<string, string> = {
  RECEIVE: "新件入库",
  FIT: "装蹄",
  RECHECK_PASS: "复查合格",
  RECHECK_FAIL: "复查不合格",
  REMOVE: "拆除",
  REFURBISH: "翻新登记",
  MATCH_OK: "翻新匹配通过",
  MATCH_REJECT: "匹配不符退回",
  SCRAP: "报废归档",
};

interface Props {
  state: ArchiveState;
  send: (cmd: Command) => unknown;
}

function RefurbishForm({ shoe, send }: { shoe: Shoe; send: Props["send"] }) {
  const [wear, setWear] = useState("2.0");
  const [temp, setTemp] = useState("1050");
  const [holes, setHoles] = useState<NailHoleStatus>("完好");
  const [at, setAt] = useState(todayISO());

  const wearNum = Number(wear);
  const tempNum = Number(temp);
  const tempOk = tempNum >= MIN_FORGE_TEMP_C && tempNum <= MAX_FORGE_TEMP_C;
  const willScrap = wearNum > MAX_WEAR_MM || holes === "扩孔";

  return (
    <div className="refurb-form">
      <div className="field-grid">
        <Field label={`磨耗量 mm（> ${MAX_WEAR_MM} 报废）`}>
          <input className="ctrl" type="number" step="0.1" min="0" max="20" value={wear} onChange={(e) => setWear(e.target.value)} />
        </Field>
        <Field label={`锻修温度 ℃（${MIN_FORGE_TEMP_C}–${MAX_FORGE_TEMP_C}）`}>
          <input className="ctrl" type="number" step="10" value={temp} onChange={(e) => setTemp(e.target.value)} />
        </Field>
        <Field label="钉孔状态">
          <select className="ctrl" value={holes} onChange={(e) => setHoles(e.target.value as NailHoleStatus)}>
            {NAIL_HOLE_STATES.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Field>
        <Field label="翻新日期">
          <input className="ctrl" type="date" value={at} onChange={(e) => setAt(e.target.value)} />
        </Field>
      </div>
      <div className={`verdict ${willScrap ? "bad" : "ok"}`}>
        {willScrap ? (
          <>
            <Badge tone="bad">判定：报废归档</Badge>
            <span>{wearNum > MAX_WEAR_MM ? `磨耗 ${wear} mm 超限` : "钉孔扩孔"}，登记后蹄铁终态归档、不可再装蹄。</span>
          </>
        ) : (
          <>
            <Badge tone="ok">判定：翻新可复用</Badge>
            <span>登记后进入“翻新待匹配”，蹄形 {shoe.shape} / 规格 {shoe.spec} 双匹配才能再装。</span>
          </>
        )}
      </div>
      <button
        className="primary"
        disabled={!tempOk || Number.isNaN(wearNum)}
        onClick={() =>
          send({ type: "refurbish", shoeId: shoe.id, wearMm: wearNum, forgeTempC: tempNum, nailHoles: holes, at })
        }
      >
        提交翻新登记
      </button>
      {!tempOk ? <p className="muted">锻修温度需在 {MIN_FORGE_TEMP_C}–{MAX_FORGE_TEMP_C} ℃ 之间。</p> : null}
    </div>
  );
}

function ShoeCard({ shoe, state, send }: { shoe: Shoe; state: ArchiveState; send: Props["send"] }) {
  const [open, setOpen] = useState(false);
  const events = shoeEvents(state, shoe.id);
  const occupant = shoeOccupant(shoe.id, state);
  const horse = occupant?.horse;

  return (
    <article className={`shoe-card state-${shoe.state.toLowerCase()}`}>
      <header>
        <div>
          <h3>{shoe.code}</h3>
          <p className="muted">
            {shoe.kind} · {shoe.shape}/{shoe.spec}
            {shoe.refurb ? ` · 已翻新 ${shoe.refurb.rounds} 次` : " · 未翻新"}
          </p>
        </div>
        <ShoeStateBadge state={shoe.state} />
      </header>

      {occupant && horse ? (
        <p className="occupancy">
          排他占用：{horse.code} {hoofLabel(occupant.hoof)} · 记录 {occupant.fitting.id}
          {occupant.awaitingRemoval ? " · 待拆" : ""}
        </p>
      ) : shoe.state === "PENDING_MATCH" ? (
        <p className="muted">在待匹配库：寻找 {shoe.shape} / {shoe.spec} 的蹄位。</p>
      ) : shoe.state === "SCRAPPED" ? (
        <p className="muted">
          报废于 {shoe.refurb?.at}：磨耗 {shoe.refurb?.wearMm} mm / 钉孔{shoe.refurb?.nailHoles}，只留档不复用。
        </p>
      ) : null}

      {shoe.state === "RECOVERED" ? <RefurbishForm shoe={shoe} send={send} /> : null}

      {shoe.state === "IN_USE" || shoe.state === "PENDING_REMOVAL" ? (
        <button onClick={() => send({ type: "remove", shoeId: shoe.id, at: todayISO() })}>
          拆除蹄铁（{shoe.state === "PENDING_REMOVAL" ? "失效件" : "正常件"} → 已拆待翻新）
        </button>
      ) : null}

      <button className="link-btn" onClick={() => setOpen((v) => !v)}>
        {open ? "收起蹄铁履历" : `查看蹄铁履历（${events.length} 条）`}
      </button>
      {open ? (
        <ol className="timeline">
          {events.map((e) => (
            <li key={e.id} className={`ev ev-${e.type.toLowerCase()}`}>
              <time>{e.at}</time>
              <Badge tone={e.type === "RECHECK_FAIL" || e.type === "SCRAP" || e.type === "MATCH_REJECT" ? "bad" : e.type === "RECHECK_PASS" || e.type === "MATCH_OK" ? "ok" : "idle"}>
                {EVENT_LABEL[e.type]}
              </Badge>
              <span>{e.detail}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </article>
  );
}

export function ShoesPanel({ state, send }: Props) {
  const [filter, setFilter] = useState("all");
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<ShoeKind>("铝蹄铁");
  const [shape, setShape] = useState<HoofShape>("正常蹄");
  const [spec, setSpec] = useState("4号");

  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const shoes = state.shoes.filter((s) => active.match(s.state));

  return (
    <div className="stack">
      <Panel
        title="蹄铁库房与翻新"
        subtitle="磨耗超限或扩孔只能报废归档 · 翻新件按蹄形规格匹配复用"
        actions={
          <div className="chips">
            {FILTERS.map((f) => (
              <button key={f.key} className={filter === f.key ? "chip active" : "chip"} onClick={() => setFilter(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="shoe-grid">
          {shoes.map((shoe) => (
            <ShoeCard key={shoe.id} shoe={shoe} state={state} send={send} />
          ))}
          {shoes.length === 0 ? <p className="muted">当前筛选下没有蹄铁。</p> : null}
        </div>
      </Panel>

      <Panel title="新蹄铁入库" subtitle={`新件以库存态登记；状态：${SHOE_STATE_LABEL.STOCK}`}>
        <div className="field-grid">
          <Field label="蹄铁编号">
            <input className="ctrl" value={code} onChange={(e) => setCode(e.target.value)} placeholder="如 SHOE-J30" />
          </Field>
          <Field label="蹄铁类型">
            <select className="ctrl" value={kind} onChange={(e) => setKind(e.target.value as ShoeKind)}>
              {SHOE_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Field>
          <Field label="适配蹄形">
            <select className="ctrl" value={shape} onChange={(e) => setShape(e.target.value as HoofShape)}>
              {HOOF_SHAPES.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </Field>
          <Field label="规格">
            <select className="ctrl" value={spec} onChange={(e) => setSpec(e.target.value)}>
              {SPECS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-actions">
          <button
            className="primary"
            onClick={() => {
              const r = send({ type: "addShoe", code, kind, shape, spec, at: todayISO() });
              if ((r as { ok?: boolean }).ok) setCode("");
            }}
          >
            登记入库
          </button>
        </div>
      </Panel>
    </div>
  );
}
