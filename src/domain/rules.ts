import type {
  ArchiveState,
  FittingRecord,
  HoofPos,
  Shoe,
  ShoeEvent,
  ShoeState,
} from "./types";

// —— 领域常量与判定阈值（判断层） ——

export const MAX_WEAR_MM = 4;
export const MIN_FORGE_TEMP_C = 600;
export const MAX_FORGE_TEMP_C = 1300;

export const HOOF_POS: { value: HoofPos; label: string }[] = [
  { value: "LF", label: "左前蹄" },
  { value: "RF", label: "右前蹄" },
  { value: "LH", label: "左后蹄" },
  { value: "RH", label: "右后蹄" },
];

export const HOOF_SHAPES = ["正常蹄", "广蹄", "狭蹄", "平蹄"] as const;
export const HORSE_CATEGORIES = ["运动马", "休养马"] as const;
export const SHOE_KINDS = ["铝蹄铁", "钢蹄铁", "加护蹄垫"] as const;
export const NAIL_HOLE_STATES = ["完好", "扩孔", "轻微毛刺"] as const;

/** 翻新后可进入待匹配库的蹄铁状态：新件库存 / 翻新待匹配 */
export const FITTABLE_STATES: ShoeState[] = ["STOCK", "PENDING_MATCH"];
/** 占用中：未拆下前不得装给第二匹马 */
export const OCCUPIED_STATES: ShoeState[] = ["IN_USE", "PENDING_REMOVAL"];

export const SHOE_STATE_LABEL: Record<ShoeState, string> = {
  STOCK: "新件库存",
  IN_USE: "在装",
  PENDING_REMOVAL: "待拆",
  RECOVERED: "已拆待翻新",
  PENDING_MATCH: "翻新待匹配",
  SCRAPPED: "报废归档",
};

export function hoofLabel(pos: HoofPos): string {
  return HOOF_POS.find((h) => h.value === pos)?.label ?? pos;
}

// —— 纯判断函数 ——

/** 磨耗超限或钉孔扩孔 → 只能报废归档 */
export function mustScrap(wearMm: number, nailHoles: string): boolean {
  return wearMm > MAX_WEAR_MM || nailHoles === "扩孔";
}

export function validForgeTemp(temp: number): boolean {
  return temp >= MIN_FORGE_TEMP_C && temp <= MAX_FORGE_TEMP_C;
}

/** 翻新件与蹄形、规格同时匹配才能装蹄；新件按规格直装 */
export function matchShoe(shoe: Shoe, shape: string, spec: string): boolean {
  if (shoe.state === "PENDING_MATCH") {
    return shoe.shape === shape && shoe.spec === spec;
  }
  return shoe.spec === spec;
}

export function findHorse(state: ArchiveState, id: string) {
  return state.horses.find((h) => h.id === id);
}

export function findShoe(state: ArchiveState, id: string) {
  return state.shoes.find((s) => s.id === id);
}

export function activeFitting(
  state: ArchiveState,
  horseId: string,
  hoof: HoofPos,
): FittingRecord | undefined {
  return state.fittings.find(
    (f) => f.horseId === horseId && f.hoof === hoof && f.status !== "CLOSED",
  );
}

/** 蹄位是否被有效或待拆记录占用（只有 CLOSED 才释放） */
export function hoofBusy(
  state: ArchiveState,
  horseId: string,
  hoof: HoofPos,
): FittingRecord | undefined {
  return activeFitting(state, horseId, hoof);
}

export function shoeEvents(state: ArchiveState, shoeId: string): ShoeEvent[] {
  return state.events
    .filter((e) => e.shoeId === shoeId)
    .sort((a, b) => Number(a.id.slice(2)) - Number(b.id.slice(2)));
}

/** 刷新后排他占用：以有效装蹄记录为唯一事实来源重建 */
export function shoeOccupant(shoeId: string, state: ArchiveState) {
  const fitting = state.fittings.find(
    (f) => f.shoeId === shoeId && f.status !== "CLOSED",
  );
  if (!fitting) return undefined;
  const horse = findHorse(state, fitting.horseId);
  return {
    fitting,
    horse,
    hoof: fitting.hoof,
    awaitingRemoval: fitting.status === "INVALID",
  };
}

/** 一致性体检：占用、状态、履历三者必须对齐 */
export interface ConsistencyIssue {
  level: "error" | "ok";
  message: string;
}

export function checkConsistency(state: ArchiveState): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  for (const shoe of state.shoes) {
    const occupant = shoeOccupant(shoe.id, state);
    if (OCCUPIED_STATES.includes(shoe.state)) {
      if (!occupant) {
        issues.push({
          level: "error",
          message: `蹄铁 ${shoe.code} 标记为${SHOE_STATE_LABEL[shoe.state]}，却找不到有效装蹄记录`,
        });
      } else if (!shoe.fittedTo) {
        issues.push({
          level: "error",
          message: `蹄铁 ${shoe.code} 占用信息缺失`,
        });
      } else if (
        shoe.fittedTo.horseId !== occupant.fitting.horseId ||
        shoe.fittedTo.hoof !== occupant.fitting.hoof
      ) {
        issues.push({
          level: "error",
          message: `蹄铁 ${shoe.code} 占用去向与有效装蹄记录不一致`,
        });
      }
    } else if (occupant) {
      issues.push({
        level: "error",
        message: `蹄铁 ${shoe.code} 已非在装态，但仍挂着有效装蹄记录`,
      });
    }

    if (shoe.state === "SCRAPPED" && !shoe.refurb?.scrapped) {
      issues.push({
        level: "error",
        message: `蹄铁 ${shoe.code} 已报废但缺少报废登记依据`,
      });
    }
  }

  for (const f of state.fittings) {
    if (f.status === "CLOSED") continue;
    const shoe = findShoe(state, f.shoeId);
    if (!shoe) {
      issues.push({ level: "error", message: `装蹄记录 ${f.id} 找不到蹄铁` });
      continue;
    }
    const expectedState: ShoeState = f.status === "INVALID" ? "PENDING_REMOVAL" : "IN_USE";
    if (shoe.state !== expectedState) {
      issues.push({
        level: "error",
        message: `记录 ${f.id}（${f.status === "INVALID" ? "结论失效" : "有效"}）与蹄铁 ${shoe.code} 状态不一致`,
      });
    }
  }

  const keys = new Set<string>();
  for (const f of state.fittings) {
    if (f.status === "CLOSED") continue;
    const key = `${f.horseId}:${f.hoof}`;
    if (keys.has(key)) {
      issues.push({
        level: "error",
        message: `同一蹄位 ${key} 存在多条未关闭记录，违反“一蹄位一有效记录”`,
      });
    }
    keys.add(key);
  }

  if (issues.length === 0) {
    issues.push({
      level: "ok",
      message: `一致性校验通过：${state.shoes.length} 片蹄铁、${state.fittings.length} 条装蹄记录、${state.events.length} 条履历相互对齐`,
    });
  }
  return issues;
}
