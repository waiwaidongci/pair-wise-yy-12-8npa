import type { ReactNode } from "react";
import type { Notice } from "../state/useArchive";
import type { ShoeState } from "../domain/types";
import { SHOE_STATE_LABEL } from "../domain/rules";

const TONE_CLASS: Record<string, string> = {
  ok: "tone-ok",
  warn: "tone-warn",
  bad: "tone-bad",
  idle: "tone-idle",
};

export function Badge({ tone, children }: { tone: keyof typeof TONE_CLASS; children: ReactNode }) {
  return <span className={`badge ${TONE_CLASS[tone]}`}>{children}</span>;
}

export function Panel({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="heading">
        <div>
          {subtitle ? <p>{subtitle}</p> : null}
          <h2>{title}</h2>
        </div>
        {actions ? <div className="actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function NoticeBar({ notice, onClose }: { notice: Notice | null; onClose: () => void }) {
  if (!notice) return null;
  return (
    <div className={`notice ${notice.ok ? "notice-ok" : "notice-bad"}`} role="status">
      <div>
        <strong>{notice.title}</strong>
        <span>{notice.message}</span>
      </div>
      <button onClick={onClose} aria-label="关闭提示">
        ×
      </button>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export const inputCls = "ctrl";

export const STATE_TONE: Record<ShoeState, keyof typeof TONE_CLASS> = {
  STOCK: "idle",
  IN_USE: "ok",
  PENDING_REMOVAL: "bad",
  RECOVERED: "warn",
  PENDING_MATCH: "idle",
  SCRAPPED: "bad",
};

export function ShoeStateBadge({ state }: { state: ShoeState }) {
  return <Badge tone={STATE_TONE[state]}>{SHOE_STATE_LABEL[state]}</Badge>;
}
