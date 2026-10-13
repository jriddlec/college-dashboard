export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-3 w-32 rounded bg-surface-2 mb-3" />
      <div className="h-7 w-56 rounded bg-surface-2 mb-8" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card h-[70px]" />
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 card h-72" />
        <div className="card h-48" />
      </div>
    </div>
  );
}
