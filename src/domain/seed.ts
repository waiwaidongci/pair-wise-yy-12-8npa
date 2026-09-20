import type { ArchiveState, HoofPos, HoofAssessment } from "./types";
import { dispatch } from "./engine";

// 以命令序列播种：履历、占用、装蹄记录随同一套判断规则生成，保证自洽。

const empty: ArchiveState = { horses: [], shoes: [], fittings: [], events: [], seq: 0 };

function hoof(shape: HoofAssessment["shape"], spec: string, note?: string): HoofAssessment {
  return { shape, spec, note };
}

const four = (shape: HoofAssessment["shape"], spec: string): Record<HoofPos, HoofAssessment> => ({
  LF: hoof(shape, spec),
  RF: hoof(shape, spec),
  LH: hoof(shape, spec, shape === "广蹄" ? "后跟略宽" : undefined),
  RH: hoof(shape, spec),
});

export function buildSeedState(): ArchiveState {
  let s = empty;
  const run = (cmd: Parameters<typeof dispatch>[1]) => {
    const out = dispatch(s, cmd);
    if (!out.result.ok) {
      throw new Error(`播种失败: ${out.result.title} / ${out.result.message}`);
    }
    s = out.state;
    return out;
  };

  // —— 马匹（沿用原档案的编号与异常步态） ——
  run({
    type: "addHorse",
    code: "HORSE-18",
    name: "疾风",
    category: "运动马",
    gaitIssue: "右前蹄外侧磨耗",
    hooves: four("广蹄", "5号"),
  });
  run({
    type: "addHorse",
    code: "HORSE-27",
    name: "铁柱",
    category: "休养马",
    gaitIssue: "后蹄裂纹",
    hooves: four("正常蹄", "4号"),
  });
  run({
    type: "addHorse",
    code: "HORSE-31",
    name: "云杉",
    category: "运动马",
    gaitIssue: "步态轻微不稳",
    hooves: four("狭蹄", "3号"),
  });
  run({
    type: "addHorse",
    code: "HORSE-42",
    name: "麦浪",
    category: "运动马",
    gaitIssue: "",
    hooves: four("平蹄", "4号"),
  });

  const horse18 = s.horses[0].id;
  const horse27 = s.horses[1].id;
  const horse31 = s.horses[2].id;
  const horse42 = s.horses[3].id;

  // —— 蹄铁入库 ——
  const shoeIn = (code: string, kind: "铝蹄铁" | "钢蹄铁" | "加护蹄垫", shape: HoofAssessment["shape"], spec: string, at = "2026-08-01") =>
    run({ type: "addShoe", code, kind, shape, spec, at }).result.shoeId!;

  const sA = shoeIn("SHOE-A01", "铝蹄铁", "广蹄", "5号");
  const sB = shoeIn("SHOE-B07", "钢蹄铁", "正常蹄", "4号");
  const sC = shoeIn("SHOE-C03", "铝蹄铁", "狭蹄", "3号");
  const sD = shoeIn("SHOE-D12", "加护蹄垫", "正常蹄", "4号");
  const sE = shoeIn("SHOE-E05", "铝蹄铁", "广蹄", "5号");
  const sF = shoeIn("SHOE-F21", "钢蹄铁", "狭蹄", "3号");
  const sG = shoeIn("SHOE-G09", "铝蹄铁", "平蹄", "4号");
  const sH = shoeIn("SHOE-H14", "铝蹄铁", "广蹄", "5号");
  const sI = shoeIn("SHOE-I02", "钢蹄铁", "平蹄", "4号");

  const fit = (shoeId: string, horseId: string, hoof: HoofPos, at: string, next: string, farrier = "老周", nails = "内2外3") =>
    run({ type: "fit", shoeId, horseId, hoof, at, nextRecheck: next, farrier, nailSites: nails });

  // A01：完整一轮 → 磨耗超限 → 报废归档
  fit(sA, horse18, "RF", "2026-08-05", "2026-08-19", "老周", "内2外3");
  run({ type: "recheck", fittingId: s.fittings[s.fittings.length - 1].id, result: "PASS", note: "外侧磨耗在控", at: "2026-08-19", nextRecheck: "2026-09-06" });
  run({ type: "remove", shoeId: sA, at: "2026-09-06" });
  run({ type: "refurbish", shoeId: sA, wearMm: 4.8, forgeTempC: 1180, nailHoles: "完好", at: "2026-09-07" });

  // B07：正常蹄/4号，曾装 HORSE-27 LF，正常拆，翻新一次，待匹配中
  fit(sB, horse27, "LF", "2026-08-08", "2026-08-22");
  run({ type: "recheck", fittingId: s.fittings[s.fittings.length - 1].id, result: "PASS", note: "裂纹加垫稳定", at: "2026-08-22", nextRecheck: "2026-09-08" });
  run({ type: "remove", shoeId: sB, at: "2026-09-08" });
  run({ type: "refurbish", shoeId: sB, wearMm: 2.5, forgeTempC: 1050, nailHoles: "轻微毛刺", at: "2026-09-09" });

  // C03：狭蹄/3号 装 HORSE-31 LH，目前在装，复查将到期
  fit(sC, horse31, "LH", "2026-09-02", "2026-09-23", "老周", "内1外3");

  // D12：加护蹄垫 装 HORSE-27 RH，复查不合格 → 待拆、原结论失效留档
  fit(sD, horse27, "RH", "2026-08-28", "2026-09-11", "老周", "内2外2");
  run({ type: "recheck", fittingId: s.fittings[s.fittings.length - 1].id, result: "FAIL", note: "垫面移位，压痕异常", at: "2026-09-11" });

  // E05：广蹄/5号 装 HORSE-18 LF，正常拆，翻新陈皮、钉孔扩孔 → 报废归档
  fit(sE, horse18, "LF", "2026-08-03", "2026-08-17");
  run({ type: "recheck", fittingId: s.fittings[s.fittings.length - 1].id, result: "PASS", note: "步态正常", at: "2026-08-17", nextRecheck: "2026-09-02" });
  run({ type: "remove", shoeId: sE, at: "2026-09-02" });
  run({ type: "refurbish", shoeId: sE, wearMm: 2.2, forgeTempC: 1120, nailHoles: "扩孔", at: "2026-09-03" });

  // F21：狭蹄/3号 装 HORSE-31 RF，正常拆翻新，待匹配中
  fit(sF, horse31, "RF", "2026-08-12", "2026-08-26");
  run({ type: "recheck", fittingId: s.fittings[s.fittings.length - 1].id, result: "PASS", note: "稳定性改善", at: "2026-08-26", nextRecheck: "2026-09-10" });
  run({ type: "remove", shoeId: sF, at: "2026-09-10" });
  run({ type: "refurbish", shoeId: sF, wearMm: 1.6, forgeTempC: 980, nailHoles: "完好", at: "2026-09-11" });

  // G09：平蹄/4号 装 HORSE-42 LF，在装
  fit(sG, horse42, "LF", "2026-09-10", "2026-10-01", "老周", "内2外3");

  // H14、I02：保持库存新件
  void sH;
  void sI;

  return s;
}
