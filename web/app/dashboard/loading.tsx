export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <div className="h-8 w-64 max-w-full animate-pulse rounded-lg bg-edge" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-edge/70" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-edge/60" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-edge/50" />
    </div>
  );
}
