import { ReactNode } from "react";
import { Sparkles } from "lucide-react";

export function AnalysisCard({
  children,
  onHide,
  hideLabel,
  onRegenerate,
  regenerateLabel,
  regenerating,
}: {
  children: ReactNode;
  onHide: () => void;
  hideLabel: string;
  onRegenerate?: () => void;
  regenerateLabel?: string;
  regenerating?: boolean;
}) {
  return (
    <div
      className="reflect-card-bg rounded-2xl"
      style={{ animation: "luna-in 0.45s ease-out forwards" }}
    >
      <div className="px-5 py-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles
              className="h-4 w-4 shrink-0"
              style={{ color: "#cc5a33" }}
            />
            <span
              className="text-sm font-medium font-sans"
              style={{
                background: "linear-gradient(to bottom right, #cc5a33, #b84dcb, #3380cc)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Reflection
            </span>
          </div>
          <div className="flex items-center gap-3">
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                disabled={regenerating}
                className="text-xs font-sans transition-colors disabled:opacity-30"
                style={{ color: "rgba(100, 70, 60, 0.55)" }}
              >
                {regenerating ? "…" : (regenerateLabel ?? "Regenerate")}
              </button>
            )}
            <button
              onClick={onHide}
              className="text-xs font-sans transition-colors"
              style={{ color: "rgba(100, 70, 60, 0.55)" }}
            >
              {hideLabel}
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
