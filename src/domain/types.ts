// 领域模型：修蹄档案 + 蹄铁翻新复用 + 装蹄排他闭环
// 该文件只描述数据结构，不包含任何判断逻辑、存储或界面代码。

export type HoofPosition = "LF" | "RF" | "LH" | "RH"; // 左前 / 右前 / 左后 / 右后
export type HoofShape = "正常蹄" | "平蹄" | "广蹄" | "立蹄";
export type HoleState = "完好" | "微扩" | "扩孔" | "裂纹";
export type HorseCategory = "运动马" | "休养马";

/**
 * 蹄铁生命周期状态：
 * READY 待匹配（新件 / 翻新合格入库）
 *  -> IN_USE 装蹄中（排他占用，未拆下前不得装给第二匹马）
 *  -> PENDING_REMOVAL 待拆（复查不合格，原结论失效留档）
 *  -> TO_REFURB 待翻新（拆下后登记磨耗 / 锻修温度 / 钉孔）
 *  -> READY（翻新合格）或 SCRAPPED（磨耗超限 / 扩孔，报废归档）
 */
export type ShoeStatus =
  | "READY"
  | "IN_USE"
  | "PENDING_REMOVAL"
  | "TO_REFURB"
  | "SCRAPPED";

/** ACTIVE 有效；INVALIDATED 复查不合格、结论失效留档；CLOSED 正常拆下归档 */
export type FittingStatus = "ACTIVE" | "INVALIDATED" | "CLOSED";

export interface HoofInfo {
  shape: HoofShape;
  /** 蹄形评估要求的蹄铁规格，如 5号 */
  spec: string;
  /** 异常步态标记，可空 */
  gait?: string;
}

export interface Horse {
  id: string;
  name: string;
  category: HorseCategory;
  hooves: Record<HoofPosition, HoofInfo>;
}

export interface Shoe {
  id: string;
  material: string; // 铝蹄铁 / 钢蹄铁
  /** 规格号，如 5号 */
  size: string;
  /** 锻造成型蹄位，装蹄时必须与实际蹄位一致 */
  position: HoofPosition;
  /** 翻新锻修后适配的蹄形 */
  fitShape: HoofShape;
  status: ShoeStatus;
  /** 历次翻新登记累计磨耗量 mm */
  wearTotal: number;
  /** 是否经过翻新合格的复用件 */
  refurbished: boolean;
  /** 当前有效（含待拆）装蹄记录 id，占用期的排他凭证 */
  currentFittingId?: string;
}

export interface FittingRecord {
  id: string;
  shoeId: string;
  horseId: string;
  position: HoofPosition;
  source: "新件" | "翻新件";
  fittedAt: string;
  nextRecheckAt: string;
  removedAt?: string;
  status: FittingStatus;
  conclusion: string;
}

export interface RefurbRecord {
  id: string;
  shoeId: string;
  at: string;
  /** 本次磨耗量 mm */
  wear: number;
  /** 锻修温度 ℃ */
  forgeTemp: number;
  /** 钉孔状态 */
  holeState: HoleState;
  /** 锻修后成型的目标适配蹄形 */
  targetShape: HoofShape;
  result: "合格入库" | "报废";
  reason?: string;
}

export type EventKind =
  | "装蹄"
  | "沿用首次装蹄"
  | "拆下"
  | "翻新合格"
  | "报废归档"
  | "匹配不符退回"
  | "复查合格"
  | "复查不合格";

/** 蹄铁履历事件（追加留档，不修改、不删除） */
export interface HistoryEvent {
  id: string;
  at: string;
  shoeId: string;
  kind: EventKind;
  detail: string;
  horseId?: string;
  position?: HoofPosition;
}

export interface ArchiveState {
  horses: Horse[];
  shoes: Shoe[];
  fittings: FittingRecord[];
  refurbishments: RefurbRecord[];
  events: HistoryEvent[];
}
