// 初始档案数据。结构上必须通过 domain/rules.audit 校验：
// 蹄铁占用状态与有效装蹄记录一一对应，同一蹄位至多一条有效记录。

import { ArchiveState, HistoryEvent, HoofPosition, HoofShape, Shoe } from "./types";

function hoof(shape: HoofShape, spec: string, gait?: string) {
  return { shape, spec, gait };
}

const horses: ArchiveState["horses"] = [
  {
    id: "HORSE-18",
    name: "闪电",
    category: "运动马",
    hooves: {
      LF: hoof("正常蹄", "5号"),
      RF: hoof("正常蹄", "5号", "右前外侧磨耗"),
      LH: hoof("平蹄", "5号"),
      RH: hoof("正常蹄", "5号"),
    },
  },
  {
    id: "HORSE-27",
    name: "青石",
    category: "运动马",
    hooves: {
      LF: hoof("广蹄", "6号"),
      RF: hoof("广蹄", "6号"),
      LH: hoof("平蹄", "6号", "后蹄裂纹"),
      RH: hoof("平蹄", "6号"),
    },
  },
  {
    id: "HORSE-31",
    name: "云溪",
    category: "休养马",
    hooves: {
      LF: hoof("广蹄", "4号", "步态轻微不稳"),
      RF: hoof("广蹄", "4号"),
      LH: hoof("立蹄", "5号"),
      RH: hoof("立蹄", "5号"),
    },
  },
];

const shoes: Shoe[] = [
  {
    id: "S-1001",
    material: "铝蹄铁",
    size: "5号",
    position: "RF",
    fitShape: "正常蹄",
    status: "IN_USE",
    wearTotal: 0,
    refurbished: false,
    currentFittingId: "F-1001",
  },
  {
    id: "S-1002",
    material: "钢蹄铁",
    size: "6号",
    position: "LH",
    fitShape: "平蹄",
    status: "PENDING_REMOVAL",
    wearTotal: 1.2,
    refurbished: false,
    currentFittingId: "F-1002",
  },
  {
    id: "S-1003",
    material: "铝蹄铁",
    size: "4号",
    position: "LF",
    fitShape: "广蹄",
    status: "READY",
    wearTotal: 2.6,
    refurbished: true,
  },
  {
    id: "S-1004",
    material: "钢蹄铁",
    size: "5号",
    position: "RH",
    fitShape: "立蹄",
    status: "TO_REFURB",
    wearTotal: 3,
    refurbished: true,
  },
  {
    id: "S-1005",
    material: "铝蹄铁",
    size: "5号",
    position: "LF",
    fitShape: "正常蹄",
    status: "READY",
    wearTotal: 0,
    refurbished: false,
  },
  {
    id: "S-1006",
    material: "钢蹄铁",
    size: "5号",
    position: "LH",
    fitShape: "平蹄",
    status: "SCRAPPED",
    wearTotal: 7.8,
    refurbished: true,
  },
];

const fittings: ArchiveState["fittings"] = [
  {
    id: "F-1001",
    shoeId: "S-1001",
    horseId: "HORSE-18",
    position: "RF",
    source: "新件",
    fittedAt: "2026-09-04",
    nextRecheckAt: "2026-09-18",
    status: "ACTIVE",
    conclusion: "装蹄完成，右前外侧磨耗已调整，计划 2026-09-18 复查。",
  },
  {
    id: "F-1002",
    shoeId: "S-1002",
    horseId: "HORSE-27",
    position: "LH",
    source: "新件",
    fittedAt: "2026-08-25",
    nextRecheckAt: "2026-09-08",
    status: "INVALIDATED",
    conclusion:
      "装蹄完成，后蹄裂纹加护蹄垫。｜【原结论失效】2026-09-10 复查不合格：步检仍呈后蹄点步，钉孔附近磨损不均，蹄铁停在待拆。",
  },
  {
    id: "F-1003",
    shoeId: "S-1003",
    horseId: "HORSE-31",
    position: "LF",
    source: "翻新件",
    fittedAt: "2026-06-12",
    nextRecheckAt: "2026-06-26",
    removedAt: "2026-09-11",
    status: "CLOSED",
    conclusion: "左前广蹄装蹄。｜2026-09-11 正常拆下归档，蹄铁进入待翻新。",
  },
  {
    id: "F-1004",
    shoeId: "S-1004",
    horseId: "HORSE-31",
    position: "RH",
    source: "翻新件",
    fittedAt: "2026-06-01",
    nextRecheckAt: "2026-06-15",
    removedAt: "2026-09-18",
    status: "CLOSED",
    conclusion: "右后立蹄装蹄。｜2026-07-15 复查合格。｜2026-09-18 正常拆下归档，蹄铁进入待翻新。",
  },
  {
    id: "F-1006",
    shoeId: "S-1006",
    horseId: "HORSE-18",
    position: "LH",
    source: "翻新件",
    fittedAt: "2026-04-10",
    nextRecheckAt: "2026-04-24",
    removedAt: "2026-08-20",
    status: "CLOSED",
    conclusion: "左后平蹄装蹄。｜2026-08-20 正常拆下归档，蹄铁进入待翻新。",
  },
];

const refurbishments: ArchiveState["refurbishments"] = [
  {
    id: "RF-1001",
    shoeId: "S-1003",
    at: "2026-09-12",
    wear: 2.6,
    forgeTemp: 980,
    holeState: "微扩",
    targetShape: "广蹄",
    result: "合格入库",
  },
  {
    id: "RF-1002",
    shoeId: "S-1006",
    at: "2026-08-22",
    wear: 4.4,
    forgeTemp: 1120,
    holeState: "扩孔",
    targetShape: "平蹄",
    result: "报废",
    reason: "磨耗 4.4mm 超过单次上限 4mm；钉孔扩孔不得继续复用",
  },
];

function ev(e: Omit<HistoryEvent, "id">, index: number): HistoryEvent {
  return { ...e, id: `E-SEED-${index + 1}` };
}

const events: HistoryEvent[] = [
  ev(
    { at: "2026-04-10", shoeId: "S-1006", kind: "装蹄", horseId: "HORSE-18", position: "LH", detail: "翻新件装蹄于 闪电 左后蹄，蹄形 平蹄 / 规格 5号，2026-04-24 复查。" },
    0,
  ),
  ev({ at: "2026-06-01", shoeId: "S-1004", kind: "装蹄", horseId: "HORSE-31", position: "RH", detail: "翻新件装蹄于 云溪 右后蹄，蹄形 立蹄 / 规格 5号，2026-06-15 复查。" }, 1),
  ev({ at: "2026-06-12", shoeId: "S-1003", kind: "装蹄", horseId: "HORSE-31", position: "LF", detail: "翻新件装蹄于 云溪 左前蹄，蹄形 广蹄 / 规格 4号，2026-06-26 复查。" }, 2),
  ev({ at: "2026-07-15", shoeId: "S-1004", kind: "复查合格", horseId: "HORSE-31", position: "RH", detail: "云溪 右后蹄 复查合格，蹄铁继续装蹄中。" }, 3),
  ev({ at: "2026-08-20", shoeId: "S-1006", kind: "拆下", horseId: "HORSE-18", position: "LH", detail: "闪电 左后蹄 蹄铁拆下，排他解除，蹄铁待翻新登记。" }, 4),
  ev(
    {
      at: "2026-08-22",
      shoeId: "S-1006",
      kind: "报废归档",
      detail: "S-1006 翻新判定报废：磨耗 4.4mm 超过单次上限 4mm；钉孔扩孔不得继续复用。锻修温度 1120℃，累计磨耗 7.8mm。",
    },
    5,
  ),
  ev({ at: "2026-08-25", shoeId: "S-1002", kind: "装蹄", horseId: "HORSE-27", position: "LH", detail: "新件装蹄于 青石 左后蹄，蹄形 平蹄 / 规格 6号，2026-09-08 复查。" }, 6),
  ev({ at: "2026-09-04", shoeId: "S-1001", kind: "装蹄", horseId: "HORSE-18", position: "RF", detail: "新件装蹄于 闪电 右前蹄，蹄形 正常蹄 / 规格 5号，2026-09-18 复查。" }, 7),
  ev(
    {
      at: "2026-09-10",
      shoeId: "S-1002",
      kind: "复查不合格",
      horseId: "HORSE-27",
      position: "LH",
      detail: "青石 左后蹄 复查不合格，原结论失效留档，蹄铁停在待拆，仍占用蹄位。备注：步检仍呈后蹄点步，钉孔附近磨损不均。",
    },
    8,
  ),
  ev({ at: "2026-09-11", shoeId: "S-1003", kind: "拆下", horseId: "HORSE-31", position: "LF", detail: "云溪 左前蹄 蹄铁拆下，排他解除，蹄铁待翻新登记。" }, 9),
  ev(
    {
      at: "2026-09-12",
      shoeId: "S-1003",
      kind: "翻新合格",
      detail: "S-1003 翻新合格入库：磨耗 2.6mm，锻修温度 980℃，钉孔微扩，成型 广蹄，待匹配复用。",
    },
    10,
  ),
  ev({ at: "2026-09-18", shoeId: "S-1004", kind: "拆下", horseId: "HORSE-31", position: "RH", detail: "云溪 右后蹄 蹄铁拆下，排他解除，蹄铁待翻新登记。" }, 11),
];

export const seedState: ArchiveState = { horses, shoes, fittings, refurbishments, events };
