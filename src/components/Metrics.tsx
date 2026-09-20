import { overdueFittings, todayISO } from "../domain/rules";
import { ArchiveState } from "../domain/types";

export function Metrics({ state }: { state: ArchiveState }) {
  const overdue = overdueFittings(state, todayISO()).length;
  const abnormal = state.horses.reduce(
    (n, h) => n + Object.values(h.hooves).filter((hoof) => hoof.gait).length,
    0,
  );
  const occupied = state.shoes.filter(
    (s) => s.status === "IN_USE" || s.status === "PENDING_REMOVAL",
  ).length;
  const pendingRemoval = state.shoes.filter((s) => s.status === "PENDING_REMOVAL").length;
  const toRefurb = state.shoes.filter((s) => s.status === "TO_REFURB").length;
  const reused = state.shoes.filter((s) => s.refurbished && s.status !== "SCRAPPED").length;
  const scrapped = state.shoes.filter((s) => s.status === "SCRAPPED").length;

  const cards: { label: string; value: number; hint: string; accent: string }[] = [
    { label: "待复查逾期", value: overdue, hint: "装蹄中且复查日已过", accent: "var(--accent)" },
    { label: "异常步态标记", value: abnormal, hint: "覆盖蹄位数", accent: "var(--primary)" },
    { label: "排他占用中", value: occupied, hint: `其中 ${pendingRemoval} 块待拆`, accent: "var(--secondary)" },
    { label: "待翻新蹄铁", value: toRefurb, hint: "拆下待登记磨耗温度", accent: "var(--accent)" },
    { label: "翻新复用件", value: reused, hint: "未报废的翻新蹄铁", accent: "var(--secondary)" },
    { label: "报废归档", value: scrapped, hint: "超限 / 扩孔留档", accent: "var(--primary)" },
  ];

  return (
    <section className="metrics">
      {cards.map((c) => (
        <article key={c.label} style={{ borderTopColor: c.accent }}>
          <small>{c.label}</small>
          <strong>{c.value}</strong>
          <em>{c.hint}</em>
        </article>
      ))}
    </section>
  );
}
