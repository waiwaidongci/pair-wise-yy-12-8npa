// 领域模型：修蹄档案 + 蹄铁翻新复用 / 装蹄排他闭环
// 本文件只描述数据结构，不含任何判断规则、存储与界面代码。

export type HoofPos = "LF" | "RF" | "LH" | "RH";
export type HoofShape = "正常蹄" | "广蹄" | "狭蹄" | "平蹄";
export type HorseCategory = "运动马" | "休养马";
export type ShoeKind = "铝蹄铁" | "钢蹄铁" | "加护蹄垫";
export type NailHoleStatus = "完好" | "扩孔" | "轻微毛刺";
export type RecheckResult = "PASS" | "FAIL";

/**
 * 蹄铁状态机：
 * STOCK 新件库存
 *  → IN_USE 在装（排他占用）
 *  → PENDING_REMOVAL 待拆（复查不合格，原结论失效）
 *  → RECOVERED 已拆待翻新
 *  → PENDING_MATCH 翻新待匹配（匹配不符会退回此态）
 *  → IN_USE 再次装蹄
 * 任意在装态经拆除后翻新；磨耗超限 / 扩孔 → SCRAPPED 报废归档（终态）
 */
export type ShoeState =
  | "STOCK"
  | "IN_USE"
  | "PENDING_REMOVAL"
  | "RECOVERED"
  | "PENDING_MATCH"
  | "SCRAPPED";

/** ACTIVE 有效；INVALID 复查不合格、原结论失效但留档；CLOSED 已拆除的历史记录 */
export type FittingStatus = "ACTIVE" | "INVALID" | "CLOSED";

export interface HoofAssessment {
  shape: HoofShape;
  spec: string;
  note?: string;
}

export interface Horse {
  id: string;
  code: string;
  name: string;
  category: HorseCategory;
  /** 异常步态标记 */
  gaitIssue?: string;
  hooves: Record<HoofPos, HoofAssessment>;
}

export interface Occupancy {
  horseId: string;
  hoof: HoofPos;
  since: string;
}

export interface RefurbInfo {
  at: string;
  /** 磨耗量 mm */
  wearMm: number;
  /** 锻修温度 ℃ */
  forgeTempC: number;
  /** 钉孔状态 */
  nailHoles: NailHoleStatus;
  /** 翻新次数 */
  rounds: number;
  /** 本次翻新是否报废 */
  scrapped: boolean;
}

export interface Shoe {
  id: string;
  code: string;
  kind: ShoeKind;
  /** 适配蹄形 */
  shape: HoofShape;
  /** 规格（尺寸号） */
  spec: string;
  state: ShoeState;
  /** 排他占用去向，仅 IN_USE / PENDING_REMOVAL 时有值 */
  fittedTo?: Occupancy;
  /** 最近一次翻新登记 */
  refurb?: RefurbInfo;
}

export interface RecheckEntry {
  at: string;
  result: RecheckResult;
  note: string;
}

export interface FittingRecord {
  id: string;
  shoeId: string;
  horseId: string;
  hoof: HoofPos;
  fittedAt: string;
  farrier: string;
  /** 钉位 */
  nailSites: string;
  nextRecheck: string;
  status: FittingStatus;
  /** 当前结论；复查不合格时改写为“原结论失效”，记录本身保留 */
  conclusion: string;
  rechecks: RecheckEntry[];
  closedAt?: string;
}

export type ShoeEventType =
  | "RECEIVE"
  | "FIT"
  | "RECHECK_PASS"
  | "RECHECK_FAIL"
  | "REMOVE"
  | "REFURBISH"
  | "MATCH_OK"
  | "MATCH_REJECT"
  | "SCRAP";

export interface ShoeEvent {
  id: string;
  shoeId: string;
  at: string;
  type: ShoeEventType;
  detail: string;
  horseId?: string;
  hoof?: HoofPos;
  fittingId?: string;
}

export interface ArchiveState {
  horses: Horse[];
  shoes: Shoe[];
  fittings: FittingRecord[];
  /** 蹄铁履历，只追加、用于刷新后重建占用一致性 */
  events: ShoeEvent[];
  seq: number;
}

export interface FitCommand {
  type: "fit";
  shoeId: string;
  horseId: string;
  hoof: HoofPos;
  farrier: string;
  nailSites: string;
  nextRecheck: string;
  at: string;
}

export type Command =
  | { type: "addHorse"; code: string; name: string; category: HorseCategory; gaitIssue: string; hooves: Record<HoofPos, HoofAssessment> }
  | { type: "addShoe"; code: string; kind: ShoeKind; shape: HoofShape; spec: string; at: string }
  | FitCommand
  /** 同一装蹄请求原子地提交两次：首次建记录，第二次必须沿用首次 */
  | ({ type: "fitConcurrent" } & Omit<FitCommand, "type">)
  | { type: "recheck"; fittingId: string; result: RecheckResult; note: string; at: string; nextRecheck?: string }
  | { type: "remove"; shoeId: string; at: string }
  | { type: "refurbish"; shoeId: string; wearMm: number; forgeTempC: number; nailHoles: NailHoleStatus; at: string };

export interface CmdResult {
  ok: boolean;
  title: string;
  message: string;
  /** 第二次并发装蹄是否沿用了首次记录 */
  deduped?: boolean;
  shoeId?: string;
  fittingId?: string;
}

export interface Outcome {
  state: ArchiveState;
  result: CmdResult;
}
