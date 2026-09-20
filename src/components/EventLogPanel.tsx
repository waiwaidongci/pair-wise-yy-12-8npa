import { POSITION_LABEL } from "../domain/rules";
import { ArchiveState } from "../domain/types";

const KIND_TONE: Record<string, string> = {
  装蹄: "ok",
  沿用首次装蹄: "lock",
  拆下: "neutral",
  翻新合格: "refurb",
  报废归档: "bad",
  匹配不符退回: "bad",
  复查合格: "ok",
  复查不合格: "pending",
};

export function EventLogPanel({
  state,
  issues,
  source,
}: {
  state: ArchiveState;
  issues: string[];
  source: "seed" | "storage";
}) {
  const events = [...state.events].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 14);
  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>蹄铁履历</p>
          <h2>追加留档事件流（不修改、不删除）</h2>
        </div>
        <span className={`audit-pill ${issues.length ? "bad" : "ok"}`}>
          {issues.length ? `审计异常 ×${issues.length}` : "占用与履历一致"}
        </span>
      </div>

      <p className="source-note">
        数据来源：{source === "storage" ? "本地持久化档案（刷新已恢复）" : "种子档案（未找到一致的本地数据）"}
      </p>

      {issues.length > 0 ? (
        <ul className="audit-issues">
          {issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      ) : null}

      <div className="log-list">
        {events.map((e) => (
          <article key={e.id} className="log-row">
            <span className={`log-kind log-${KIND_TONE[e.kind] ?? "neutral"}`}>{e.kind}</span>
            <span className="log-shoe">{e.shoeId}</span>
            {e.horseId ? (
              <span className="log-where">
                {e.horseId}
                {e.position ? ` ${POSITION_LABEL[e.position]}` : ""}
              </span>
            ) : null}
            <span className="log-detail">{e.detail}</span>
            <time>{e.at}</time>
          </article>
        ))}
      </div>
    </section>
  );
}
