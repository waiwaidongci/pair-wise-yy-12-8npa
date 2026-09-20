import type {
  ArchiveState,
  CmdResult,
  Command,
  FitCommand,
  FittingRecord,
  Outcome,
  Shoe,
  ShoeEvent,
  ShoeEventType,
} from "./types";
import {
  FITTABLE_STATES,
  hoofBusy,
  hoofLabel,
  matchShoe,
  mustScrap,
  validForgeTemp,
} from "./rules";

// —— 领域引擎：接收命令、执行判断、产出不可变新状态（判断层核心） ——

function fail(title: string, message: string, extra: Partial<CmdResult> = {}): Outcome {
  return {
    state: undefined as unknown as ArchiveState,
    result: { ok: false, title, message, ...extra },
  };
}

function nextId(state: ArchiveState, prefix: string): string {
  return `${prefix}-${String(state.seq + 1).padStart(3, "0")}`;
}

function addEvent(
  state: ArchiveState,
  shoeId: string,
  at: string,
  type: ShoeEventType,
  detail: string,
  ctx?: { horseId?: string; hoof?: FitCommand["hoof"]; fittingId?: string },
): { state: ArchiveState; event: ShoeEvent } {
  const event: ShoeEvent = {
    id: nextId(state, "E"),
    shoeId,
    at,
    type,
    detail,
    ...ctx,
  };
  return {
    state: { ...state, events: [...state.events, event], seq: state.seq + 1 },
    event,
  };
}

function updateShoe(state: ArchiveState, shoeId: string, patch: Partial<Shoe>): ArchiveState {
  return {
    ...state,
    shoes: state.shoes.map((s) => (s.id === shoeId ? { ...s, ...patch } : s)),
  };
}

function runFit(state: ArchiveState, cmd: FitCommand): Outcome {
  const horse = state.horses.find((h) => h.id === cmd.horseId);
  if (!horse) return fail("马匹不存在", "请先在马匹档案中登记该马匹。");

  const shoe = state.shoes.find((s) => s.id === cmd.shoeId);
  if (!shoe) return fail("蹄铁不存在", "请选择库房中的蹄铁。");

  // 规则 1：同一蹄位只留一条有效记录
  const busy = hoofBusy(state, cmd.horseId, cmd.hoof);
  if (busy) {
    return fail(
      "蹄位已有记录",
      busy.status === "INVALID"
        ? `${horse.code} ${hoofLabel(cmd.hoof)} 复查不合格，蹄铁停在待拆，必须先拆除后才能重新装蹄。`
        : `沿用首次装蹄记录 ${busy.id}，未建立第二条记录。`,
      { deduped: true, fittingId: busy.id, shoeId: busy.shoeId },
    );
  }

  // 规则 2：同一蹄铁未拆下前不得装给第二匹马
  const occupied = state.fittings.find(
    (f) => f.shoeId === shoe.id && f.status !== "CLOSED",
  );
  if (occupied) {
    const occupant = state.horses.find((h) => h.id === occupied.horseId);
    return fail(
      "蹄铁占用中",
      `蹄铁 ${shoe.code} 仍装在 ${occupant?.code ?? "另一匹马"} ${hoofLabel(occupied.hoof)}，未拆下前不得装给第二匹马。`,
    );
  }

  // 规则 3：只有库存新件 / 翻新待匹配件可以装蹄
  if (!FITTABLE_STATES.includes(shoe.state)) {
    return fail(
      "蹄铁不可装用",
      `蹄铁 ${shoe.code} 当前不可装蹄（需先拆除并完成翻新登记）。`,
    );
  }

  if (!cmd.farrier.trim()) return fail("缺少蹄铁师", "装蹄必须登记操作蹄铁师。");
  if (!cmd.nailSites.trim()) return fail("缺少钉位", "请记录本次装蹄的钉位。");
  if (!cmd.nextRecheck) return fail("缺少复查日期", "请指定下次复查日期。");

  // 规则 4：翻新件与蹄形和规格匹配才能装蹄，不符退回待匹配
  const assess = horse.hooves[cmd.hoof];
  if (!matchShoe(shoe, assess.shape, assess.spec)) {
    if (shoe.state === "PENDING_MATCH") {
      let s = updateShoe(state, shoe.id, { state: "PENDING_MATCH" });
      const ev = addEvent(
        s,
        shoe.id,
        cmd.at,
        "MATCH_REJECT",
        `匹配不符：需要 ${assess.shape}/${assess.spec}，蹄铁为 ${shoe.shape}/${shoe.spec}，退回待匹配库`,
        { horseId: horse.id, hoof: cmd.hoof },
      );
      return {
        state: ev.state,
        result: {
          ok: false,
          title: "匹配不符，退回待匹配",
          message: `蹄铁 ${shoe.code}（${shoe.shape}/${shoe.spec}）与 ${horse.code} ${hoofLabel(cmd.hoof)}（${assess.shape}/${assess.spec}）不符，已退回待匹配库。`,
          shoeId: shoe.id,
        },
      };
    }
    return fail(
      "规格不符",
      `新蹄铁 ${shoe.code} 规格 ${shoe.spec} 与该蹄位 ${assess.spec} 不符，请更换蹄铁。`,
    );
  }

  let s: ArchiveState = state;
  const fittingId = nextId(s, "F");
  const fitting: FittingRecord = {
    id: fittingId,
    shoeId: shoe.id,
    horseId: horse.id,
    hoof: cmd.hoof,
    fittedAt: cmd.at,
    farrier: cmd.farrier.trim(),
    nailSites: cmd.nailSites.trim(),
    nextRecheck: cmd.nextRecheck,
    status: "ACTIVE",
    conclusion: "装蹄完成，等待复查",
    rechecks: [],
  };
  s = { ...s, seq: s.seq + 1, fittings: [...s.fittings, fitting] };

  const matchedAsRefurb = shoe.state === "PENDING_MATCH";
  s = updateShoe(s, shoe.id, {
    state: "IN_USE",
    fittedTo: { horseId: horse.id, hoof: cmd.hoof, since: cmd.at },
  });
  if (matchedAsRefurb) {
    const ev = addEvent(
      s,
      shoe.id,
      cmd.at,
      "MATCH_OK",
      `翻新匹配通过：${shoe.shape}/${shoe.spec} 符合该蹄位`,
      { horseId: horse.id, hoof: cmd.hoof, fittingId },
    );
    s = ev.state;
  }
  const fitEv = addEvent(
    s,
    shoe.id,
    cmd.at,
    "FIT",
    `装蹄：${horse.code} ${hoofLabel(cmd.hoof)}，蹄铁师 ${fitting.farrier}，钉位 ${fitting.nailSites}，下次复查 ${fitting.nextRecheck}`,
    { horseId: horse.id, hoof: cmd.hoof, fittingId },
  );
  s = fitEv.state;

  return {
    state: s,
    result: {
      ok: true,
      title: matchedAsRefurb ? "翻新件复用装蹄成功" : "装蹄成功",
      message: `蹄铁 ${shoe.code} 已排他装到 ${horse.code} ${hoofLabel(cmd.hoof)}，记录 ${fittingId} 为该蹄位唯一有效记录。`,
      fittingId,
      shoeId: shoe.id,
    },
  };
}

export function dispatch(state: ArchiveState, command: Command): Outcome {
  switch (command.type) {
    case "addHorse": {
      if (!command.code.trim() || !command.name.trim()) {
        return fail("信息不完整", "马匹编号和名称均为必填。");
      }
      if (state.horses.some((h) => h.code === command.code.trim())) {
        return fail("编号重复", `马匹 ${command.code} 已存在。`);
      }
      const id = `H-${String(state.seq + 1).padStart(3, "0")}`;
      return {
        state: {
          ...state,
          seq: state.seq + 1,
          horses: [
            ...state.horses,
            {
              id,
              code: command.code.trim(),
              name: command.name.trim(),
              category: command.category,
              gaitIssue: command.gaitIssue.trim() || undefined,
              hooves: command.hooves,
            },
          ],
        },
        result: { ok: true, title: "马匹已建档", message: `${command.code} 已加入马匹档案。` },
      };
    }

    case "addShoe": {
      if (!command.code.trim()) return fail("信息不完整", "蹄铁编号为必填。");
      if (state.shoes.some((s) => s.code === command.code.trim())) {
        return fail("编号重复", `蹄铁 ${command.code} 已存在。`);
      }
      const id = `S-${String(state.seq + 1).padStart(3, "0")}`;
      const shoe: Shoe = {
        id,
        code: command.code.trim(),
        kind: command.kind,
        shape: command.shape,
        spec: command.spec,
        state: "STOCK",
      };
      let s: ArchiveState = {
        ...state,
        seq: state.seq + 1,
        shoes: [...state.shoes, shoe],
      };
      s = addEvent(
        s,
        id,
        command.at,
        "RECEIVE",
        `新件入库：${command.kind}，标称 ${command.shape}/${command.spec}`,
      ).state;
      return {
        state: s,
        result: { ok: true, title: "新蹄铁入库", message: `${command.code} 已登记为新件库存。`, shoeId: id },
      };
    }

    case "fit":
      return runFit(state, command);

    case "fitConcurrent": {
      // 原子地提交两次相同装蹄：第一次成功建记录，第二次并发必须沿用首次
      const { type: _type, ...rest } = command;
      const fitCmd: FitCommand = { type: "fit", ...rest };
      const first = runFit(state, fitCmd);
      if (!first.result.ok) return first;
      const second = runFit(first.state, fitCmd);
      void second; // 第二次结果必然是“蹄位已有记录”，状态不发生变化
      return {
        state: first.state,
        result: {
          ok: true,
          deduped: true,
          title: "并发装蹄：首次生效，第二次沿用",
          message: `${first.result.message} 第二次并发请求未重复占用，沿用首次记录 ${first.result.fittingId}。`,
          fittingId: first.result.fittingId,
          shoeId: first.result.shoeId,
        },
      };
    }

    case "recheck": {
      const fitting = state.fittings.find((f) => f.id === command.fittingId);
      if (!fitting) return fail("记录不存在", "找不到该装蹄记录。");
      if (fitting.status === "CLOSED") {
        return fail("记录已关闭", "蹄铁已拆除，不能再复查；请重新装蹄。");
      }
      const shoe = state.shoes.find((s) => s.id === fitting.shoeId);
      if (!shoe) return fail("蹄铁不存在", "装蹄记录对应的蹄铁已丢失。");
      const horse = state.horses.find((h) => h.id === fitting.horseId);

      if (command.result === "PASS") {
        let s: ArchiveState = {
          ...state,
          fittings: state.fittings.map((f) =>
            f.id === fitting.id
              ? {
                  ...f,
                  status: "ACTIVE",
                  conclusion: command.nextRecheck
                    ? `复查合格，下次复查 ${command.nextRecheck}`
                    : "复查合格，装蹄状态正常",
                  nextRecheck: command.nextRecheck ?? f.nextRecheck,
                  rechecks: [
                    ...f.rechecks,
                    { at: command.at, result: "PASS", note: command.note.trim() || "合格" },
                  ],
                }
              : f,
          ),
        };
        s = addEvent(
          s,
          shoe.id,
          command.at,
          "RECHECK_PASS",
          `复查合格：${command.note.trim() || "装蹄状态正常"}${
            command.nextRecheck ? `，下次复查 ${command.nextRecheck}` : ""
          }`,
          { horseId: horse?.id, hoof: fitting.hoof, fittingId: fitting.id },
        ).state;
        return {
          state: s,
          result: { ok: true, title: "复查合格", message: `记录 ${fitting.id} 结论维持有效。`, fittingId: fitting.id, shoeId: shoe.id },
        };
      }

      // 复查不合格：蹄铁停在待拆，原结论失效留档
      let s: ArchiveState = {
        ...state,
        fittings: state.fittings.map((f) =>
          f.id === fitting.id
            ? {
                ...f,
                status: "INVALID",
                conclusion: "原结论已失效：复查不合格，蹄铁待拆",
                rechecks: [
                  ...f.rechecks,
                  { at: command.at, result: "FAIL", note: command.note.trim() || "不合格" },
                ],
              }
            : f,
        ),
      };
      s = {
        ...s,
        shoes: s.shoes.map((sh) =>
          sh.id === shoe.id ? { ...sh, state: "PENDING_REMOVAL" as const } : sh,
        ),
      };
      s = addEvent(
        s,
        shoe.id,
        command.at,
        "RECHECK_FAIL",
        `复查不合格：${command.note.trim() || "需停蹄待拆"}；蹄铁停在待拆，原装蹄结论失效留档`,
        { horseId: horse?.id, hoof: fitting.hoof, fittingId: fitting.id },
      ).state;
      return {
        state: s,
        result: {
          ok: true,
          title: "复查不合格：蹄铁待拆，原结论失效",
          message: `记录 ${fitting.id} 已标记失效但保留在档；${shoe.code} 停在“待拆”，拆除前该蹄位与蹄铁均不可再装蹄。`,
          fittingId: fitting.id,
          shoeId: shoe.id,
        },
      };
    }

    case "remove": {
      const shoe = state.shoes.find((s) => s.id === command.shoeId);
      if (!shoe) return fail("蹄铁不存在", "找不到要拆除的蹄铁。");
      if (shoe.state !== "IN_USE" && shoe.state !== "PENDING_REMOVAL") {
        return fail("蹄铁未在装", `蹄铁 ${shoe.code} 当前无需拆除。`);
      }
      const fitting = state.fittings.find(
        (f) => f.shoeId === shoe.id && f.status !== "CLOSED",
      );
      if (!fitting) return fail("缺少装蹄记录", "无法定位该蹄铁的有效记录。");
      const horse = state.horses.find((h) => h.id === fitting.horseId);

      let s: ArchiveState = {
        ...state,
        fittings: state.fittings.map((f) =>
          f.id === fitting.id
            ? {
                ...f,
                status: "CLOSED",
                closedAt: command.at,
                conclusion:
                  f.status === "INVALID"
                    ? "失效记录留档：复查不合格后拆除"
                    : "正常拆除归档",
              }
            : f,
        ),
      };
      s = {
        ...s,
        shoes: s.shoes.map((sh) =>
          sh.id === shoe.id
            ? { ...sh, state: "RECOVERED" as const, fittedTo: undefined }
            : sh,
        ),
      };
      s = addEvent(
        s,
        shoe.id,
        command.at,
        "REMOVE",
        `从 ${horse?.code ?? "马匹"} ${hoofLabel(fitting.hoof)} 拆除${
          fitting.status === "INVALID" ? "（失效蹄铁，待翻新判定）" : "，待翻新登记"
        }，蹄位释放`,
        { horseId: horse?.id, hoof: fitting.hoof, fittingId: fitting.id },
      ).state;
      return {
        state: s,
        result: {
          ok: true,
          title: "蹄铁已拆除",
          message: `${shoe.code} 进入“已拆待翻新”，${horse?.code ?? ""} ${hoofLabel(fitting.hoof)} 蹄位已释放，可登记翻新或另装新蹄铁。`,
          shoeId: shoe.id,
        },
      };
    }

    case "refurbish": {
      const shoe = state.shoes.find((s) => s.id === command.shoeId);
      if (!shoe) return fail("蹄铁不存在", "找不到要翻新的蹄铁。");
      if (shoe.state !== "RECOVERED") {
        return fail("不可翻新", `蹄铁 ${shoe.code} 只有拆除后（已拆待翻新）才能登记翻新。`);
      }
      if (!(command.wearMm >= 0) || command.wearMm > 20) {
        return fail("磨耗量异常", "磨耗量需在 0–20 mm 之间。");
      }
      if (!validForgeTemp(command.forgeTempC)) {
        return fail("锻修温度越界", "锻修温度需在 600–1300 ℃ 之间。");
      }
      const rounds = (shoe.refurb?.rounds ?? 0) + 1;
      const scrapped = mustScrap(command.wearMm, command.nailHoles);
      const reason =
        command.wearMm > 4
          ? `磨耗 ${command.wearMm} mm 超过限值 4 mm`
          : "钉孔扩孔";

      let s = updateShoe(state, shoe.id, {
        state: scrapped ? ("SCRAPPED" as const) : ("PENDING_MATCH" as const),
        fittedTo: undefined,
        refurb: {
          at: command.at,
          wearMm: command.wearMm,
          forgeTempC: command.forgeTempC,
          nailHoles: command.nailHoles,
          rounds,
          scrapped,
        },
      });
      s = addEvent(
        s,
        shoe.id,
        command.at,
        "REFURBISH",
        `第 ${rounds} 次翻新登记：磨耗 ${command.wearMm} mm，锻修 ${command.forgeTempC} ℃，钉孔${command.nailHoles}`,
      ).state;
      if (scrapped) {
        s = addEvent(
          s,
          shoe.id,
          command.at,
          "SCRAP",
          `${reason}，不再复用，报废归档`,
        ).state;
      }
      return {
        state: s,
        result: scrapped
          ? {
              ok: true,
              title: "磨耗超限 / 扩孔，已报废归档",
              message: `蹄铁 ${shoe.code} 因${reason}，仅作报废归档，不得再装蹄。`,
              shoeId: shoe.id,
            }
          : {
              ok: true,
              title: "翻新完成，进入待匹配库",
              message: `蹄铁 ${shoe.code} 第 ${rounds} 次翻新合格，蹄形 ${shoe.shape}、规格 ${shoe.spec} 与马匹蹄位匹配后方可复用。`,
              shoeId: shoe.id,
            },
      };
    }

    default:
      return fail("未知命令", String(command));
  }
}
