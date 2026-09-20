import { ReactNode } from "react";
import { ShoeStatus } from "../domain/types";

export function StatusBadge({ status }: { status: ShoeStatus }) {
  const tone: Record<ShoeStatus, string> = {
    READY: "ready",
    IN_USE: "inuse",
    PENDING_REMOVAL: "pending",
    TO_REFURB: "refurb",
    SCRAPPED: "scrapped",
  };
  const text: Record<ShoeStatus, string> = {
    READY: "待匹配",
    IN_USE: "装蹄中",
    PENDING_REMOVAL: "待拆",
    TO_REFURB: "待翻新",
    SCRAPPED: "报废",
  };
  return <span className={`badge badge-${tone[status]}`}>{text[status]}</span>;
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

export function Dialog({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="dialog-mask" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer ? <div className="dialog-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="empty-hint">{children}</p>;
}
