import type { PlanAlert } from "@opencutplan/core";

/** The plan problems that make the cut steps incomplete, with a link to the Problems list of the Layout tab. */
export function PlanAlertBanner({ alert, onShow }: { alert: PlanAlert; onShow(): void }) {
  return (
    <div role="status" className={`banner plan-alert${alert.severity === "error" ? " error" : ""}`}>
      <p>
        {alert.severity === "error" ? "✖" : "⚠"} {alert.text}{" "}
        <button type="button" className="link" onClick={onShow}>
          Show the problems on the Layout tab
        </button>
      </p>
    </div>
  );
}
