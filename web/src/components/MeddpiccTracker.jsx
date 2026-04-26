const STATUS_COLORS = {
  none: 'bg-gray-200',
  partial: 'bg-yellow-400',
  confirmed: 'bg-green-500'
};

const STATUS_LABELS = {
  none: 'Not found',
  partial: 'Partial',
  confirmed: 'Found'
};

export default function MeddpiccTracker({ meddpicc }) {
  if (!meddpicc) return null;

  const criteria = Object.entries(meddpicc);

  return (
    <div className="p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">MEDDPICC</h3>
      {criteria.map(([key, data]) => (
        <div key={key} className="flex items-center gap-3">
          <span className="text-xs font-mono font-bold text-gray-500 w-6">{key}</span>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-600">{data.label}</span>
              <span className={`text-xs ${data.status === 'confirmed' ? 'text-green-600' : data.status === 'partial' ? 'text-yellow-600' : 'text-gray-400'}`}>
                {STATUS_LABELS[data.status]}
              </span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${STATUS_COLORS[data.status]}`}
                style={{
                  width: data.status === 'confirmed' ? '100%' : data.status === 'partial' ? '50%' : '0%'
                }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
