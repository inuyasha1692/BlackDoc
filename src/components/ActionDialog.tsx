import type { ReactNode } from "react";

interface DialogAction {
  label: string;
  onClick: () => void | Promise<void>;
  tone?: "primary" | "danger" | "quiet";
}

interface ActionDialogProps {
  title: string;
  children: ReactNode;
  actions: DialogAction[];
}

export function ActionDialog({
  title,
  children,
  actions,
}: ActionDialogProps) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="action-dialog-title"
        aria-modal="true"
        className="dialog"
        role="dialog"
      >
        <h2 id="action-dialog-title">{title}</h2>
        <div className="dialog-content">{children}</div>
        <div className="dialog-actions">
          {actions.map((action) => (
            <button
              className={`dialog-button ${action.tone ?? "quiet"}`}
              key={action.label}
              onClick={() => void action.onClick()}
              type="button"
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

