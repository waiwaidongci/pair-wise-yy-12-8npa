// 端到端规则验证（仅开发期使用，不进构建）
import { buildSeedState } from "../src/domain/seed";
import { dispatch } from "../src/domain/engine";
import { checkConsistency } from "../src/domain/rules";
import type { ArchiveState } from "../src/domain/types";

let pass = 0;
let fail = 0;
function assert(cond: boolean, name: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}`);
  }
}

let s: ArchiveState = buildSeedState();

console.log("种子数据一致性:");
let issues = checkConsistency(s);
assert(issues.length === 1 && issues[0].level === "ok", "种子状态通过一致性体检");

const byCode = Object.fromEntries(s.shoes.map((sh) => [sh.code, sh]));
assert(byCode["SHOE-A01"].state === "SCRAPPED", "A01 磨耗 4.8mm 超限 → 报废归档");
assert(byCode["SHOE-E05"].state === "SCRAPPED", "E05 钉孔扩孔 → 报废归档");
assert(byCode["SHOE-B07"].state === "PENDING_MATCH", "B07 翻新合格 → 待匹配");
assert(byCode["SHOE-D12"].state === "PENDING_REMOVAL", "D12 复查不合格 → 待拆");
assert(byCode["SHOE-C03"].state === "IN_USE", "C03 在装");

const d12 = s.fittings.find((f) => f.shoeId === byCode["SHOE-D12"].id)!;
assert(d12.status === "INVALID" && d12.conclusion.includes("失效"), "D12 原结论失效但记录留档");
assert(d12.rechecks.some((r) => r.result === "FAIL"), "D12 保留不合格复查记录");

console.log("装蹄排他与匹配:");
const horse42 = s.horses.find((h) => h.code === "HORSE-42")!;
const horse18 = s.horses.find((h) => h.code === "HORSE-18")!;
const b07 = byCode["SHOE-B07"].id; // 正常蹄/4号
const f21 = byCode["SHOE-F21"].id; // 狭蹄/3号 待匹配
const h14 = byCode["SHOE-H14"].id; // 广蹄/5号 新件
const i02 = byCode["SHOE-I02"].id; // 平蹄/4号 新件

// B07（正常蹄/4号）尝试装给 HORSE-42 LH（平蹄/4号）→ 匹配不符，退回待匹配
let r = dispatch(s, { type: "fit", shoeId: b07, horseId: horse42.id, hoof: "LH", farrier: "老周", nailSites: "内2外3", nextRecheck: "2026-10-10", at: "2026-09-20" });
assert(!r.result.ok && r.result.title.includes("匹配不符"), "翻新件蹄形不符 → 拒绝并退回待匹配");
s = r.state! ?? s; // 失败时仍写回（退回事件已落账）
assert(s.shoes.find((x) => x.id === b07)!.state === "PENDING_MATCH", "B07 退回后仍在待匹配库");
assert(s.events.some((e) => e.shoeId === b07 && e.type === "MATCH_REJECT"), "B07 写入 MATCH_REJECT 履历");

// B07（正常蹄/4号）装给 HORSE-27 LF（正常蹄/4号，但 LF 空着）→ 复用成功
const horse27 = s.horses.find((h) => h.code === "HORSE-27")!;
r = dispatch(s, { type: "fit", shoeId: b07, horseId: horse27.id, hoof: "LF", farrier: "老周", nailSites: "内2外3", nextRecheck: "2026-10-10", at: "2026-09-20" });
assert(r.result.ok && r.result.title.includes("翻新件复用"), "B07 蹄形规格双匹配 → 复用装蹄成功");
s = r.state;

// 同一片 B07 未拆，装给第二匹马 HORSE-42 → 拒绝
r = dispatch(s, { type: "fit", shoeId: b07, horseId: horse42.id, hoof: "RH", farrier: "老周", nailSites: "内2外3", nextRecheck: "2026-10-10", at: "2026-09-20" });
assert(!r.result.ok && r.result.title === "蹄铁占用中", "未拆下的蹄铁装给第二匹马 → 拒绝");

// 同一蹄位再次装蹄（HORSE-27 LF，用新件 I02）→ 沿用首次
r = dispatch(s, { type: "fit", shoeId: i02, horseId: horse27.id, hoof: "LF", farrier: "老周", nailSites: "内2外3", nextRecheck: "2026-10-10", at: "2026-09-20" });
assert(!r.result.ok && r.result.deduped === true, "同蹄位第二次装蹄 → 沿用首次记录");

// 并发双发：HORSE-42 RH（空）用新件 I02
r = dispatch(s, { type: "fitConcurrent", shoeId: i02, horseId: horse42.id, hoof: "RH", farrier: "老周", nailSites: "内2外3", nextRecheck: "2026-10-10", at: "2026-09-20" });
assert(r.result.ok && r.result.deduped === true, "并发双发首次生效、第二次沿用");
s = r.state;
const activeRH = s.fittings.filter((f) => f.horseId === horse42.id && f.hoof === "RH" && f.status !== "CLOSED");
assert(activeRH.length === 1, "并发后 HORSE-42 RH 仍只有一条有效记录");
const i02Events = s.events.filter((e) => e.shoeId === i02 && e.type === "FIT");
assert(i02Events.length === 1, "并发双发只产生一条 FIT 履历");

console.log("待拆蹄位拒绝新装蹄:");
// HORSE-27 RH 是 INVALID（D12 待拆），用新件 H14 尝试 → 拒绝
r = dispatch(s, { type: "fit", shoeId: h14, horseId: horse27.id, hoof: "RH", farrier: "老周", nailSites: "内2外3", nextRecheck: "2026-10-10", at: "2026-09-20" });
assert(!r.result.ok && r.result.title === "蹄位已有记录", "待拆蹄位拒绝新装蹄");

// 拆除 D12
r = dispatch(s, { type: "remove", shoeId: byCode["SHOE-D12"].id, at: "2026-09-20" });
assert(r.result.ok, "待拆蹄铁可拆除");
s = r.state;
assert(s.shoes.find((x) => x.id === byCode["SHOE-D12"].id)!.state === "RECOVERED", "D12 拆除后 → 已拆待翻新");
const d12closed = s.fittings.find((f) => f.shoeId === byCode["SHOE-D12"].id && f.status === "CLOSED");
assert(Boolean(d12closed) && d12closed!.conclusion.includes("失效"), "D12 失效记录留档关闭，不物理删除");

// D12 已拆待翻新：先验温度越界（500℃ 低于 600℃ 下限）
r = dispatch(s, { type: "refurbish", shoeId: byCode["SHOE-D12"].id, wearMm: 1.0, forgeTempC: 500, nailHoles: "完好", at: "2026-09-21" });
assert(!r.result.ok && r.result.title.includes("温度"), "锻修温度越界拒绝登记");
assert(s.shoes.find((x) => x.id === byCode["SHOE-D12"].id)!.state === "RECOVERED", "温度越界时不改变蹄铁状态");

// 再翻新：磨耗 1.0、钉孔扩孔 → 报废
r = dispatch(s, { type: "refurbish", shoeId: byCode["SHOE-D12"].id, wearMm: 1.0, forgeTempC: 900, nailHoles: "扩孔", at: "2026-09-21" });
assert(r.result.ok && r.result.title.includes("报废"), "磨耗未超限但钉孔扩孔 → 报废归档");
s = r.state;
// 报废件不可再装
r = dispatch(s, { type: "fit", shoeId: byCode["SHOE-D12"].id, horseId: horse18.id, hoof: "RH", farrier: "老周", nailSites: "内2外3", nextRecheck: "2026-10-10", at: "2026-09-22" });
assert(!r.result.ok, "报废件不能装蹄");

console.log("F21 狭蹄/3号 待匹配装给 HORSE-31 LH（狭蹄/3号，但 C03 在装）→ 蹄位占用:");
r = dispatch(s, { type: "fit", shoeId: f21, horseId: s.horses.find((h) => h.code === "HORSE-31")!.id, hoof: "LH", farrier: "老周", nailSites: "内1外3", nextRecheck: "2026-10-10", at: "2026-09-20" });
assert(!r.result.ok && r.result.deduped === true, "已有有效记录的蹄位装蹄 → 沿用首次");

console.log("全流程后一致性:");
issues = checkConsistency(s);
if (!(issues.length === 1 && issues[0].level === "ok")) console.error(issues);
assert(issues.length === 1 && issues[0].level === "ok", "全部操作后占用/状态/履历仍一致");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
