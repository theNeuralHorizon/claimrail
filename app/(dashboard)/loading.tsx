export default function DashboardLoading() {
  return (
    <div className="p-8 space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-ink-200 rounded" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-white border border-ink-200 rounded-xl" />
        ))}
      </div>
      <div className="h-80 bg-white border border-ink-200 rounded-xl" />
    </div>
  );
}
