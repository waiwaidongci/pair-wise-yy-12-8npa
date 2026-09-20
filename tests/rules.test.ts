// 领域规则闭环测试（纯 Node，无 UI）。
// 运行：npm run test:rules
import assert from "node:assert/strict";
import {
  audit,
  fitShoe,
  liveFittingAt,
  recheck,
  registerRefurb,
  removeShoe,
  shoeHistory,
  todayISO,
} from "../src/domain/rules";
import { seedState } from "../src/domain/seed";
import { ArchiveState, HoofPosition } from "../src/domain/types";

const state0: ArchiveState = structuredClone(seedState);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

// 0. 种子档案自身审计必须干净
check("种子档案审计无异常", () => {
  assert.deepEqual(audit(state0), []);
});

// 1. 装蹄中蹄铁不得装给第二匹马（跨马排他）
check("未拆下蹄铁不得装给第二匹马", () => {
  const r = fitShoe(state0, { shoeId: "S-1001", horseId: "HORSE-27", position: "RF", fittedAt: todayISO() });
  assert.equal(r.ok, false);
  assert.match(r.message, /尚未拆下/);
  assert.equal(r.state, state0); // 被拒绝时状态原样返回
});

// 2. 同一蹄位第二次并发装蹄沿用首次（同马重复）
check("同蹄位第二次装蹄沿用首次记录", () => {
  const before = liveFittingAt(state0, "HORSE-18", "RF")!;
  const r = fitShoe(state0, { shoeId: "S-1005", horseId: "HORSE-18", position: "RF", fittedAt: todayISO() });
  assert.equal(r.ok, true);
  assert.equal(r.reused, true);
  const after = liveFittingAt(r.state, "HORSE-18", "RF")!;
  assert.equal(after.id, before.id, "不得新建第二条有效记录");
  const s1005 = r.state.shoes.find((s) => s.id === "S-1005")!;
  assert.equal(s1005.status, "READY", "第二块蹄铁不能被占用");
});

// 3. 待拆状态蹄位同样沿用首次
check("待拆蹄位不接受新装蹄，沿用首次", () => {
  const r = fitShoe(state0, { shoeId: "S-1005", horseId: "HORSE-27", position: "LH", fittedAt: todayISO() });
  assert.equal(r.ok, true);
  assert.equal(r.reused, true);
  const f = liveFittingAt(r.state, "HORSE-27", "LH")!;
  assert.equal(f.shoeId, "S-1002");
  assert.equal(f.status, "INVALIDATED");
});

// 4. 蹄形 / 规格 / 蹄位不符 -> 退回待匹配
check("翻新件规格不符装蹄时退回待匹配", () => {
  // S-1003 是 4号/LF/广蹄；HORSE-31 RF 也是广蹄4号 -> 匹配；改到 RH(立蹄5号) -> 不符
  const ok = fitShoe(state0, { shoeId: "S-1003", horseId: "HORSE-31", position: "LF", fittedAt: "2026-09-20" });
  assert.equal(ok.ok, true);
  assert.match(ok.message, /装蹄成功/);

  const bad = fitShoe(state0, { shoeId: "S-1003", horseId: "HORSE-31", position: "RH", fittedAt: "2026-09-20" });
  assert.equal(bad.ok, true, "不符是业务结果而非命令失败");
  const shoe = bad.state.shoes.find((s) => s.id === "S-1003")!;
  assert.equal(shoe.status, "READY");
  const last = bad.state.events[bad.state.events.length - 1];
  assert.equal(last.kind, "匹配不符退回");
  assert.equal(liveFittingAt(bad.state, "HORSE-31", "RH"), undefined);
});

// 5. 复查合格不动占用；不合格 -> 待拆 + 原结论失效留档
check("复查不合格蹄铁停在待拆，结论失效留档", () => {
  const active = state0.fittings.find((f) => f.id === "F-1001")!;
  const r = recheck(state0, { fittingId: active.id, at: "2026-09-20", pass: false, note: "点步" });
  assert.equal(r.ok, true);
  const fitting = r.state.fittings.find((f) => f.id === active.id)!;
  assert.equal(fitting.status, "INVALIDATED");
  assert.match(fitting.conclusion, /原结论失效/);
  assert.equal(fitting.removedAt, undefined, "待拆不算拆下，占用保留");
  const shoe = r.state.shoes.find((s) => s.id === "S-1001")!;
  assert.equal(shoe.status, "PENDING_REMOVAL");
  assert.equal(shoe.currentFittingId, active.id);
  assert.deepEqual(audit(r.state), []);

  // 待拆期间仍拒绝装新蹄铁
  const retry = fitShoe(r.state, { shoeId: "S-1005", horseId: "HORSE-18", position: "RF", fittedAt: "2026-09-20" });
  assert.equal(retry.reused, true);
});

// 6. 拆下 -> 待翻新 -> 翻新合格回待匹配（钉孔微扩允许复用）
check("拆下与翻新合格复用闭环", () => {
  let s = removeShoe(state0, "F-1001", "2026-09-21").state;
  const shoe = s.shoes.find((x) => x.id === "S-1001")!;
  assert.equal(shoe.status, "TO_REFURB");
  assert.equal(shoe.currentFittingId, undefined);
  assert.deepEqual(audit(s), []);

  const r = registerRefurb(s, {
    shoeId: "S-1001",
    at: "2026-09-22",
    wear: 2.5,
    forgeTemp: 960,
    holeState: "微扩",
    targetShape: "正常蹄",
  });
  assert.equal(r.ok, true);
  const after = r.state.shoes.find((x) => x.id === "S-1001")!;
  assert.equal(after.status, "READY");
  assert.equal(after.refurbished, true);
  assert.equal(after.wearTotal, 2.5);
  assert.equal(after.fitShape, "正常蹄");
  assert.equal(r.state.refurbishments.at(-1)!.result, "合格入库");
  assert.deepEqual(audit(r.state), []);
});

// 7. 磨耗超限报废
check("磨耗超限只能报废归档", () => {
  const r = registerRefurb(state0, {
    shoeId: "S-1004",
    at: "2026-09-19",
    wear: 4.2,
    forgeTemp: 1000,
    holeState: "完好",
    targetShape: "立蹄",
  });
  assert.equal(r.ok, true);
  const shoe = r.state.shoes.find((s) => s.id === "S-1004")!;
  assert.equal(shoe.status, "SCRAPPED");
  assert.equal(r.state.refurbishments.at(-1)!.result, "报废");
  // 报废件不能再装蹄
  const fit = fitShoe(r.state, { shoeId: "S-1004", horseId: "HORSE-31", position: "RH", fittedAt: "2026-09-20" });
  assert.equal(fit.ok, false);
});

// 8. 扩孔（钉孔状态）即使磨耗不大也必须报废
check("钉孔扩孔强制报废", () => {
  const r = registerRefurb(state0, {
    shoeId: "S-1004",
    at: "2026-09-19",
    wear: 1,
    forgeTemp: 1000,
    holeState: "扩孔",
    targetShape: "立蹄",
  });
  assert.equal(r.state.shoes.find((s) => s.id === "S-1004")!.status, "SCRAPPED");
  assert.match(r.message, /报废归档/);
});

// 9. 全流程：新件装蹄 -> 拆下 -> 翻新改蹄形 -> 装到匹配的新蹄位
check("翻新改蹄形后匹配装蹄的完整复用链", () => {
  // S-1004: 5号 RH 立蹄 待翻新。翻成 5号 RH 平蹄（HORSE-18 RH 是正常蹄5号 -> 不符；
  // HORSE-27 RH 是平蹄6号 -> 规格不符；没有现成平蹄5号RH。改为正常蹄 -> HORSE-18 RH 匹配）
  let s = registerRefurb(state0, {
    shoeId: "S-1004",
    at: "2026-09-19",
    wear: 1.5,
    forgeTemp: 980,
    holeState: "完好",
    targetShape: "正常蹄",
  }).state;

  const wrong = fitShoe(s, { shoeId: "S-1004", horseId: "HORSE-27", position: "RH", fittedAt: "2026-09-20" });
  assert.equal(wrong.state.events.at(-1)!.kind, "匹配不符退回");

  const right = fitShoe(s, { shoeId: "S-1004", horseId: "HORSE-18", position: "RH", fittedAt: "2026-09-20" });
  assert.match(right.message, /装蹄成功/);
  const shoe = right.state.shoes.find((x) => x.id === "S-1004")!;
  assert.equal(shoe.status, "IN_USE");
  assert.equal(shoe.currentFittingId, liveFittingAt(right.state, "HORSE-18", "RH")!.id);
  assert.deepEqual(audit(right.state), []);
});

// 10. 履历按蹄铁聚合，且装蹄记录来源标记翻新件
check("蹄铁履历完整留痕", () => {
  const h = shoeHistory(state0, "S-1006");
  assert.ok(h.events.some((e) => e.kind === "装蹄"));
  assert.ok(h.events.some((e) => e.kind === "拆下"));
  assert.ok(h.events.some((e) => e.kind === "报废归档"));
  assert.equal(h.refurbishments[0].reason && h.refurbishments[0].reason.includes("扩孔"), true);
  assert.equal(h.fittings[0].source, "翻新件");
});

// 11. 同一蹄位至多一条有效记录（审计能抓出污染数据）
check("审计能发现重复有效装蹄", () => {
  const polluted: ArchiveState = structuredClone(state0);
  polluted.fittings.push({
    ...polluted.fittings[0],
    id: "FAKE",
    shoeId: "S-1005",
    status: "ACTIVE",
    removedAt: undefined,
  });
  const issues = audit(polluted);
  assert.ok(issues.length > 0);
});

console.log(`\n领域规则测试全部通过：${passed} 项`);
