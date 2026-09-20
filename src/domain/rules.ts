// 判断层：蹄铁翻新复用与装蹄排他闭环的全部业务规则。
// 纯函数，不依赖 React、localStorage 或任何界面概念。
// 所有变更均基于当前 state 派生一个全新 state，履历事件只追加。

import {
  ArchiveState,
  EventKind,
  FittingRecord,
  HistoryEvent,
  HoleState,
  HoofPosition,
  HoofShape,
  RefurbRecord,
  Shoe,
  ShoeStatus,
} from "./types";

/** 单次翻新磨耗上限（mm）：超限或扩孔只能报废归档 */
export const MAX_WEAR_PER_REFURB = 4;
/** 装蹄后默认复查周期（天） */
export const DEFAULT_RECHECK_DAYS = 14;

export const POSITION_LABEL: Record<HoofPosition, string> = {
  LF: "左前蹄",
  RF: "右前蹄",
  LH: "左后蹄",
  RH: "右后蹄",
};

export const POSITION_FRONT: HoofPosition[] = ["LF", "RF"];
export const POSITION_HIND: HoofPosition[] = ["LH", "RH"];

export const SHOE_STATUS_LABEL: Record<ShoeStatus, string> = {
  READY: "待匹配",
  IN_USE: "装蹄中",
  PENDING_REMOVAL: "待拆",
  TO_REFURB: "待翻新",
  SCRAPPED: "报废归档",
};

export interface CommandResult {
  ok: boolean;
  message: string;
  state: ArchiveState;
  /** true 表示第二次并发装蹄沿用了首次记录，并未生成新装蹄 */
  reused?: boolean;
}

let seq = 0;
export function uid(prefix: string): string {
  seq += 1;
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}${seq.toString(36)}${random}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysISO(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fail(state: ArchiveState, message: string): CommandResult {
  return { ok: false, message, state };
}

function succeed(state: ArchiveState, message: string, reused?: boolean): CommandResult {
  return { ok: true, message, state, reused };
}

function event(
  state: ArchiveState,
  entry: Omit<HistoryEvent, "id" | "at"> & { at?: string },
): HistoryEvent[] {
  const e: HistoryEvent = {
    id: uid("EV"),
    at: entry.at ?? todayISO(),
    shoeId: entry.shoeId,
    kind: entry.kind,
    detail: entry.detail,
    horseId: entry.horseId,
    position: entry.position,
  };
  return [...state.events, e];
}

function replaceShoe(state: ArchiveState, next: Shoe): ArchiveState {
  return { ...state, shoes: state.shoes.map((s) => (s.id === next.id ? next : s)) };
}

/** 同一蹄位只允许一条有效（未拆下）装蹄记录，找到即占用 */
export function liveFittingAt(
  state: ArchiveState,
  horseId: string,
  position: HoofPosition,
): FittingRecord | undefined {
  return state.fittings.find(
    (f) =>
      f.horseId === horseId &&
      f.position === position &&
      f.removedAt === undefined &&
      (f.status === "ACTIVE" || f.status === "INVALIDATED"),
  );
}

export function findHorse(state: ArchiveState, horseId: string) {
  return state.horses.find((h) => h.id === horseId);
}

export function findShoe(state: ArchiveState, shoeId: string) {
  return state.shoes.find((s) => s.id === shoeId);
}

// ---------------------------------------------------------------------------
// 装蹄：排他闭环入口
// ---------------------------------------------------------------------------

export interface FitShoeInput {
  shoeId: string;
  horseId: string;
  position: HoofPosition;
  fittedAt: string;
  recheckDays?: number;
  note?: string;
}

export function fitShoe(prev: ArchiveState, input: FitShoeInput): CommandResult {
  const horse = findHorse(prev, input.horseId);
  if (!horse) return fail(prev, "马匹不存在，装蹄被拒绝。");

  // 闭环规则：同一蹄位只留一条有效记录。
  // 第二次（并发）装蹄沿用首次记录，不新开占用。
  const occupied = liveFittingAt(prev, input.horseId, input.position);
  if (occupied) {
    const owner = findShoe(prev, occupied.shoeId);
    let state = prev;
    if (occupied.status === "INVALIDATED") {
      state = {
        ...state,
        events: event(state, {
          shoeId: occupied.shoeId,
          kind: "沿用首次装蹄",
          horseId: input.horseId,
          position: input.position,
          detail: `蹄位已有待拆蹄铁 ${owner?.material ?? occupied.shoeId}（复查不合格、原结论失效），第二次装蹄沿用首次记录，未占用新蹄铁。`,
        }),
      };
    }
    return succeed(
      state,
      `装蹄沿用首次：${POSITION_LABEL[input.position]} 已由蹄铁 ${
        occupied.shoeId
      } 占用（${occupied.status === "INVALIDATED" ? "待拆中" : "装蹄中"}），未拆下前不得装第二块蹄铁。`,
      true,
    );
  }

  const shoe = findShoe(prev, input.shoeId);
  if (!shoe) return fail(prev, "蹄铁不存在，装蹄被拒绝。");

  // 排他：蹄铁被占用（装蹄中 / 待拆）不得装给第二匹马
  if (shoe.status === "IN_USE" || shoe.status === "PENDING_REMOVAL") {
    return fail(prev, `蹄铁 ${shoe.id} 尚未拆下（${SHOE_STATUS_LABEL[shoe.status]}），不得装给第二匹马。`);
  }
  if (shoe.status === "TO_REFURB") {
    return fail(prev, `蹄铁 ${shoe.id} 已拆下待翻新，需先完成翻新登记才能再次装蹄。`);
  }
  if (shoe.status === "SCRAPPED") {
    return fail(prev, `蹄铁 ${shoe.id} 已报废归档，不能装蹄。`);
  }

  const hoof = horse.hooves[input.position];

  // 翻新件（含新件按蹄形/规格要求）与蹄形和规格匹配才能装蹄，不符退回待匹配
  const mismatch: string[] = [];
  if (shoe.position !== input.position) {
    mismatch.push(`蹄位（蹄铁成型 ${POSITION_LABEL[shoe.position]} ≠ ${POSITION_LABEL[input.position]}）`);
  }
  if (shoe.fitShape !== hoof.shape) {
    mismatch.push(`蹄形（蹄铁适配 ${shoe.fitShape} ≠ ${hoof.shape}）`);
  }
  if (shoe.size !== hoof.spec) {
    mismatch.push(`规格（${shoe.size} ≠ ${hoof.spec}）`);
  }
  if (mismatch.length > 0) {
    // 退回待匹配：蹄铁保持/回到 READY，留履历
    const state: ArchiveState = {
      ...replaceShoe(prev, { ...shoe, status: "READY", currentFittingId: undefined }),
      events: event(prev, {
        shoeId: shoe.id,
        kind: "匹配不符退回",
        horseId: input.horseId,
        position: input.position,
        detail: `${shoe.refurbished ? "翻新件" : "新件"}与蹄形/规格不匹配（${mismatch.join("，")}），退回待匹配池。`,
      }),
    };
    return succeed(state, `蹄铁与 ${POSITION_LABEL[input.position]} 匹配不符：${mismatch.join("，")}。已退回待匹配。`);
  }

  // 匹配通过：建立唯一有效装蹄记录并排他占用
  const nextRecheckAt = addDaysISO(input.fittedAt, input.recheckDays ?? DEFAULT_RECHECK_DAYS);
  const recordId = uid("FIT");
  const record: FittingRecord = {
    id: recordId,
    shoeId: shoe.id,
    horseId: input.horseId,
    position: input.position,
    source: shoe.refurbished ? "翻新件" : "新件",
    fittedAt: input.fittedAt,
    nextRecheckAt,
    status: "ACTIVE",
    conclusion: input.note?.trim() || `装蹄完成，计划 ${nextRecheckAt} 复查。`,
  };

  let state = replaceShoe(prev, { ...shoe, status: "IN_USE", currentFittingId: recordId });
  state = {
    ...state,
    fittings: [...state.fittings, record],
    events: event(state, {
      shoeId: shoe.id,
      kind: "装蹄",
      horseId: input.horseId,
      position: input.position,
      detail: `${record.source}装蹄于 ${horse.name} ${POSITION_LABEL[input.position]}，蹄形 ${hoof.shape} / 规格 ${hoof.spec}，${nextRecheckAt} 复查。`,
    }),
  };
  return succeed(state, `装蹄成功：${shoe.id} 已占用 ${horse.name} ${POSITION_LABEL[input.position]}，排他生效。`);
}

// ---------------------------------------------------------------------------
// 拆下：解除排他，蹄铁进入待翻新
// ---------------------------------------------------------------------------

export function removeShoe(prev: ArchiveState, fittingId: string, at: string): CommandResult {
  const fitting = prev.fittings.find((f) => f.id === fittingId);
  if (!fitting) return fail(prev, "装蹄记录不存在。");
  if (fitting.removedAt) return fail(prev, "该蹄铁已拆下，无需重复操作。");

  const shoe = findShoe(prev, fitting.shoeId);
  const horse = findHorse(prev, fitting.horseId);

  let fittings = prev.fittings.map((f) =>
    f.id === fittingId
      ? {
          ...f,
          removedAt: at,
          status: "CLOSED" as const,
          conclusion: `${f.conclusion}｜${at} 正常拆下归档，蹄铁进入待翻新。`,
        }
      : f,
  );

  let state: ArchiveState = { ...prev, fittings };
  if (shoe) {
    state = replaceShoe(state, { ...shoe, status: "TO_REFURB", currentFittingId: undefined });
  }
  state = {
    ...state,
    events: event(state, {
      shoeId: fitting.shoeId,
      kind: "拆下",
      horseId: fitting.horseId,
      position: fitting.position,
      detail: `${horse?.name ?? fitting.horseId} ${POSITION_LABEL[fitting.position]} 蹄铁拆下，排他解除，蹄铁待翻新登记。`,
    }),
  };
  return succeed(state, "蹄铁已拆下并解除排他占用，进入待翻新。");
}

// ---------------------------------------------------------------------------
// 复查：不合格时蹄铁停在待拆，原结论失效留档
// ---------------------------------------------------------------------------

export interface RecheckInput {
  fittingId: string;
  at: string;
  pass: boolean;
  note?: string;
}

export function recheck(prev: ArchiveState, input: RecheckInput): CommandResult {
  const fitting = prev.fittings.find((f) => f.id === input.fittingId);
  if (!fitting) return fail(prev, "装蹄记录不存在。");
  if (fitting.removedAt) return fail(prev, "该蹄铁已拆下，不能再复查。");
  if (fitting.status === "INVALIDATED") {
    return fail(prev, "该蹄铁已处于待拆状态，请先拆下后再安排。");
  }

  const horse = findHorse(prev, fitting.horseId);
  const note = input.note?.trim();

  if (input.pass) {
    const fittings = prev.fittings.map((f) =>
      f.id === fitting.id
        ? { ...f, conclusion: `${f.conclusion}｜${input.at} 复查合格${note ? `：${note}` : ""}。` }
        : f,
    );
    const state: ArchiveState = {
      ...prev,
      fittings,
      events: event(prev, {
        shoeId: fitting.shoeId,
        kind: "复查合格",
        horseId: fitting.horseId,
        position: fitting.position,
        detail: `${horse?.name} ${POSITION_LABEL[fitting.position]} 复查合格，蹄铁继续装蹄中。${note ? `备注：${note}` : ""}`,
      }),
    };
    return succeed(state, "复查合格，蹄铁保持装蹄中。");
  }

  // 不合格：记录 INVALIDATED（原结论失效留档，不删除），蹄铁停在待拆，不解除占用
  const fittings = prev.fittings.map((f) =>
    f.id === fitting.id
      ? {
          ...f,
          status: "INVALIDATED" as const,
          conclusion:
            `${f.conclusion}｜【原结论失效】${input.at} 复查不合格${note ? `：${note}` : ""}，蹄铁停在待拆。`,
        }
      : f,
  );
  let state: ArchiveState = { ...prev, fittings };
  const shoe = findShoe(prev, fitting.shoeId);
  if (shoe) {
    state = replaceShoe(state, { ...shoe, status: "PENDING_REMOVAL", currentFittingId: fitting.id });
  }
  state = {
    ...state,
    events: event(state, {
      shoeId: fitting.shoeId,
      kind: "复查不合格",
      horseId: fitting.horseId,
      position: fitting.position,
      detail: `${horse?.name} ${POSITION_LABEL[fitting.position]} 复查不合格，原结论失效留档，蹄铁停在待拆，仍占用蹄位。${
        note ? `备注：${note}` : ""
      }`,
    }),
  };
  return succeed(state, "复查不合格：原结论已失效留档，蹄铁停在待拆，需先拆下。");
}

// ---------------------------------------------------------------------------
// 翻新登记：磨耗量 / 锻修温度 / 钉孔状态；超限或扩孔只能报废归档
// ---------------------------------------------------------------------------

export interface RefurbInput {
  shoeId: string;
  at: string;
  wear: number;
  forgeTemp: number;
  holeState: HoleState;
  targetShape: HoofShape;
}

export function refurbVerdict(input: { wear: number; holeState: HoleState }) {
  const reasons: string[] = [];
  if (!(input.wear > 0) || Number.isNaN(input.wear)) {
    reasons.push("磨耗量需为大于 0 的数值");
  }
  if (input.wear > MAX_WEAR_PER_REFURB) {
    reasons.push(`磨耗 ${input.wear}mm 超过单次上限 ${MAX_WEAR_PER_REFURB}mm`);
  }
  if (input.holeState === "扩孔" || input.holeState === "裂纹") {
    reasons.push(`钉孔${input.holeState}不得继续复用`);
  }
  return { scrapped: reasons.length > 0, reasons };
}

export function registerRefurb(prev: ArchiveState, input: RefurbInput): CommandResult {
  const shoe = findShoe(prev, input.shoeId);
  if (!shoe) return fail(prev, "蹄铁不存在。");
  if (shoe.status !== "TO_REFURB") {
    return fail(prev, `只有待翻新蹄铁可以登记，当前状态：${SHOE_STATUS_LABEL[shoe.status]}。`);
  }

  const verdict = refurbVerdict({ wear: input.wear, holeState: input.holeState });
  const recordId = uid("RF");

  if (verdict.scrapped) {
    const record: RefurbRecord = {
      id: recordId,
      shoeId: shoe.id,
      at: input.at,
      wear: input.wear,
      forgeTemp: input.forgeTemp,
      holeState: input.holeState,
      targetShape: input.targetShape,
      result: "报废",
      reason: verdict.reasons.join("；"),
    };
    let state = replaceShoe(prev, { ...shoe, status: "SCRAPPED" });
    state = {
      ...state,
      refurbishments: [...state.refurbishments, record],
      events: event(state, {
        shoeId: shoe.id,
        kind: "报废归档",
        detail: `${shoe.id} 翻新判定报废：${verdict.reasons.join("；")}。锻修温度 ${input.forgeTemp}℃，累计磨耗 ${
          shoe.wearTotal + input.wear
        }mm。`,
      }),
    };
    return succeed(state, `报废归档：${verdict.reasons.join("；")}。`);
  }

  const record: RefurbRecord = {
    id: recordId,
    shoeId: shoe.id,
    at: input.at,
    wear: input.wear,
    forgeTemp: input.forgeTemp,
    holeState: input.holeState,
    targetShape: input.targetShape,
    result: "合格入库",
  };
  const next: Shoe = {
    ...shoe,
    status: "READY",
    wearTotal: Number((shoe.wearTotal + input.wear).toFixed(2)),
    refurbished: true,
    fitShape: input.targetShape,
    currentFittingId: undefined,
  };
  let state = replaceShoe(prev, next);
  state = {
    ...state,
    refurbishments: [...state.refurbishments, record],
    events: event(state, {
      shoeId: shoe.id,
      kind: "翻新合格",
      detail: `${shoe.id} 翻新合格入库：磨耗 ${input.wear}mm，锻修温度 ${input.forgeTemp}℃，钉孔${input.holeState}，成型 ${input.targetShape}，待匹配复用。`,
    }),
  };
  return succeed(state, "翻新合格，蹄铁已回到待匹配池等待复用。");
}

// ---------------------------------------------------------------------------
// 一致性审计：刷新后排他占用与蹄铁履历必须一致
// ---------------------------------------------------------------------------

export function audit(state: ArchiveState): string[] {
  const issues: string[] = [];

  // 1) 同一蹄位至多一条有效装蹄
  const live = state.fittings.filter((f) => !f.removedAt && f.status !== "CLOSED");
  const seen = new Set<string>();
  for (const f of live) {
    const key = `${f.horseId}:${f.position}`;
    if (seen.has(key)) issues.push(`蹄位 ${key} 存在 ${f.status} 之外的重复有效装蹄记录`);
    seen.add(key);
  }

  // 2) 蹄铁占用状态与有效装蹄一一对应
  for (const s of state.shoes) {
    const occupied = state.fittings.find(
      (f) => f.shoeId === s.id && !f.removedAt && f.status !== "CLOSED",
    );
    const isOccupiedStatus = s.status === "IN_USE" || s.status === "PENDING_REMOVAL";
    if (occupied && !isOccupiedStatus) {
      issues.push(`蹄铁 ${s.id} 有未拆下装蹄但状态为 ${SHOE_STATUS_LABEL[s.status]}`);
    }
    if (!occupied && isOccupiedStatus) {
      issues.push(`蹄铁 ${s.id} 标记为 ${SHOE_STATUS_LABEL[s.status]} 却没有对应有效装蹄记录`);
    }
    if (occupied && s.currentFittingId !== occupied.id) {
      issues.push(`蹄铁 ${s.id} 的占用凭证与有效装蹄记录不一致`);
    }
    if (s.status === "TO_REFURB" && s.currentFittingId) {
      issues.push(`蹄铁 ${s.id} 已拆下待翻新但仍持有占用凭证`);
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// 查询
// ---------------------------------------------------------------------------

/** 一块蹄铁的完整履历：事件 + 装蹄记录 + 翻新登记，按时间倒序 */
export function shoeHistory(state: ArchiveState, shoeId: string) {
  const events = state.events
    .filter((e) => e.shoeId === shoeId)
    .sort((a, b) => b.at.localeCompare(a.at));
  const fittings = state.fittings
    .filter((f) => f.shoeId === shoeId)
    .sort((a, b) => b.fittedAt.localeCompare(a.fittedAt));
  const refurbishments = state.refurbishments
    .filter((r) => r.shoeId === shoeId)
    .sort((a, b) => b.at.localeCompare(a.at));
  return { events, fittings, refurbishments };
}

export function shoeEventsKinds(): EventKind[] {
  return [
    "装蹄",
    "沿用首次装蹄",
    "拆下",
    "复查合格",
    "复查不合格",
    "翻新合格",
    "报废归档",
    "匹配不符退回",
  ];
}

export function overdueFittings(state: ArchiveState, now: string): FittingRecord[] {
  return state.fittings.filter(
    (f) => !f.removedAt && f.status === "ACTIVE" && f.nextRecheckAt < now,
  );
}
