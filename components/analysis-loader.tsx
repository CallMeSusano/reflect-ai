export function AnalysisLoader({ label }: { label: string }) {
  return (
    <div className="reflect-loader-bg rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className="animate-pulse h-3.5 w-3.5 rounded"
            style={{ background: "rgba(204, 90, 51, 0.3)" }}
          />
          <div
            className="animate-pulse h-3.5 w-20 rounded"
            style={{ background: "rgba(204, 90, 51, 0.3)" }}
          />
        </div>
        {label && (
          <span
            className="text-[10px] font-sans tracking-wide"
            style={{ color: "rgba(100, 70, 60, 0.5)" }}
          >
            {label}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2.5">
        {([100, 88, 95, 75, 82] as const).map((w, i) => (
          <div
            key={i}
            className="animate-pulse rounded"
            style={{
              height: "13px",
              width: `${w}%`,
              background: "rgba(51, 128, 204, 0.18)",
              animationDelay: `${i * 0.08}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
