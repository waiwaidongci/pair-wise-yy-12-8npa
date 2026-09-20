import { useEffect, useState } from "react";
import type { ArchiveState, Command, HoofPos } from "../domain/types";
import {
  FITTABLE_STATES,
  HOOF_POS,
  hoofLabel,
  hoofBusy,
  matchShoe,
  SHOE_STATE_LABEL,
} from "../domain/rules";
import { todayISO } from "../state/useArchive";
import { Badge, Field, Panel, ShoeStateBadge } from "./primitives";

export interface FitSelection {
  horseId: string;
  hoof: HoofPos;
}

interface Props {
  state: ArchiveState;
  send: (cmd: Command) => unknown;
  selection: FitSelection | null;
}

export function FittingPanel({ state, send, selection }: Props) {
  const [horseId, setHorseId] = useState(selection?.horseId ?? state.horses[0]?.id ?? "");
  const [hoof, setHoof] = useState<HoofPos>(selection?.hoof ?? "LF");
  const [shoeId, setShoeId] = useState("");
  const [farrier, setFarrier] = useState("老周");
  const [nailSites, setNailSites] = useState("内2外3");
  const [nextRecheck, setNextRecheck] = useState("");
  const [at, setAt] = useState(todayISO());

  useEffect(() => {
    if (selection) {
      setHorseId(selection.horseId);
      setHoof(selection.hoof);
    }
  }, [selection]);

  const horse = state.horses.find((h) => h.id === horseId);
  const assess = horse?.hooves[hoof];
  const busy = horse ? hoofBusy(state, horse.id, hoof) : undefined;
  const busyShoe = busy ? state.shoes.find((s) => s.id === busy.shoeId) : undefined;
  const candidates = state.shoes.filter((s) => FITTABLE_STATES.includes(s.state));
  const pickedShoe = state.shoes.find((s) => s.id === shoeId);
  const pickedMatch = pickedShoe && assess ? matchShoe(pickedShoe, assess.shape, assess.spec) : false;

  const base = {
    shoeId,
    horseId,
    hoof,
    farrier,
    nailSites,
    nextRecheck,
    at,
  };

  const doFit = (concurrent: boolean) => {
    const r = send(concurrent ? { type: "fitConcurrent", ...base } : { type: "fit", ...base });
    if ((r as { ok?: boolean }).ok) setShoeId("");
  };

  return (
    <div className="stack">
      <Panel
        title="装蹄排他工作台"
        subtitle="同一蹄铁未拆下前不得装给第二匹马 · 翻新件必须蹄形规格双匹配"
      >
        {horse && assess ? (
          <div className="hoof-target">
            <div>
              <small>目标蹄位</small>
              <strong>
                {horse.code} · {horse.name} / {hoofLabel(hoof)}
              </strong>
              <p>
                需要蹄形 <b>{assess.shape}</b> · 规格 <b>{assess.spec}</b>
                {horse.gaitIssue ? (
                  <>
                    {" "}
                    · <Badge tone="warn">步态：{horse.gaitIssue}</Badge>
                  </>
                ) : null}
              </p>
            </div>
            {busy ? (
              <div className={`lock-box ${busy.status === "INVALID" ? "bad" : "ok"}`}>
                <Badge tone={busy.status === "INVALID" ? "bad" : "ok"}>
                  {busy.status === "INVALID" ? "原结论失效 · 蹄铁待拆" : "已有有效装蹄记录"}
                </Badge>
                <p>
                  记录 {busy.id} · {busyShoe?.code} · 装于 {busy.fittedAt}
                </p>
                <p className="muted">{busy.conclusion}</p>
                {busy.status === "INVALID" ? (
                  <p className="muted">拆除前该蹄位拒绝一切新装蹄；并发请求也不会产生第二条记录。</p>
                ) : (
                  <p className="muted">第二次并发装蹄将沿用此首次记录，不会重复占用。</p>
                )}
              </div>
            ) : (
              <div className="lock-box idle">
                <Badge tone="idle">蹄位空闲</Badge>
                <p className="muted">装蹄成功后此处成为该蹄位唯一有效记录。</p>
              </div>
            )}
          </div>
        ) : null}

        <div className="field-grid">
          <Field label="选择马匹">
            <select className="ctrl" value={horseId} onChange={(e) => setHorseId(e.target.value)}>
              {state.horses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.code} · {h.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="蹄位（左前 / 右前 / 左后 / 右后）">
            <select className="ctrl" value={hoof} onChange={(e) => setHoof(e.target.value as HoofPos)}>
              {HOOF_POS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="蹄铁（仅列出库存新件与翻新待匹配件）">
            <select className="ctrl" value={shoeId} onChange={(e) => setShoeId(e.target.value)}>
              <option value="">请选择蹄铁</option>
              {candidates.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.kind} · {s.shape}/{s.spec} · {SHOE_STATE_LABEL[s.state]}
                  {s.refurb ? ` · 翻新${s.refurb.rounds}次` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="蹄铁师">
            <input className="ctrl" value={farrier} onChange={(e) => setFarrier(e.target.value)} />
          </Field>
          <Field label="钉位">
            <input className="ctrl" value={nailSites} onChange={(e) => setNailSites(e.target.value)} placeholder="如 内2外3" />
          </Field>
          <Field label="装蹄日期">
            <input className="ctrl" type="date" value={at} onChange={(e) => setAt(e.target.value)} />
          </Field>
          <Field label="下次复查日期">
            <input className="ctrl" type="date" value={nextRecheck} onChange={(e) => setNextRecheck(e.target.value)} />
          </Field>
        </div>

        {pickedShoe && assess ? (
          <div className={`match-box ${pickedMatch ? "ok" : "bad"}`}>
            {pickedMatch ? (
              <>
                <Badge tone="ok">匹配通过</Badge>
                <span>
                  {pickedShoe.state === "PENDING_MATCH" ? "翻新件" : "新件"} {pickedShoe.code}（{pickedShoe.shape}/{pickedShoe.spec}）符合该蹄位，可装蹄。
                </span>
              </>
            ) : (
              <>
                <Badge tone="bad">匹配不符</Badge>
                <span>
                  蹄铁 {pickedShoe.code}（{pickedShoe.shape}/{pickedShoe.spec}）与目标（{assess.shape}/{assess.spec}）不符
                  {pickedShoe.state === "PENDING_MATCH" ? "，提交后将退回待匹配库。" : "，请另选蹄铁。"}
                </span>
              </>
            )}
          </div>
        ) : null}

        <div className="form-actions">
          <button className="primary" disabled={!shoeId || Boolean(busy)} onClick={() => doFit(false)}>
            确认装蹄（排他占用）
          </button>
          <button disabled={!shoeId || Boolean(busy)} onClick={() => doFit(true)} title="原子地连续提交两次相同装蹄请求">
            模拟并发双发装蹄（沿用首次）
          </button>
        </div>
        {busy ? <p className="muted">该蹄位已有未关闭记录：如需重新装蹄，请先到“复查与拆除”页处理待拆蹄铁或拆除在装蹄铁。</p> : null}
      </Panel>
    </div>
  );
}
