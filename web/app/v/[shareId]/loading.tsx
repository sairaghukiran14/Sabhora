export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-12" aria-busy="true">
      <div className="h-6 w-32 animate-pulse rounded-full bg-edge" />
      <div className="h-9 w-3/4 animate-pulse rounded-lg bg-edge" />
      <div className="h-72 animate-pulse rounded-2xl bg-edge/60" />
    </div>
  );
}
