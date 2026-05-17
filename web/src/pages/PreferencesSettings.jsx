import { useApp } from '../context/AppContext';

export default function PreferencesSettings() {
  const { preferences, updatePreferences } = useApp();

  return (
    <div className="max-w-xl">
      <h2 className="text-lg font-bold text-gray-900 mb-1">Preferences</h2>
      <p className="text-sm text-gray-500 mb-6">Configure how Clumo analyses your calls.</p>

      {/* Qualification Methodology */}
      <div className="border border-gray-200 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Qualification Methodology</h3>
        <p className="text-xs text-gray-500 mb-4">
          Choose the framework used for live call tracking and post-call analysis.
        </p>

        <div className="space-y-3">
          <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
            <input
              type="radio"
              name="methodology"
              value="meddpicc"
              checked={preferences.methodology === 'meddpicc'}
              onChange={() => updatePreferences({ methodology: 'meddpicc' })}
              className="mt-0.5"
            />
            <div>
              <span className="text-sm font-medium text-gray-800">MEDDPICC</span>
              <p className="text-xs text-gray-500 mt-0.5">
                Metrics, Economic Buyer, Decision Criteria, Decision Process, Paper Process, Identify Pain, Champion, Competition
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
            <input
              type="radio"
              name="methodology"
              value="bant"
              checked={preferences.methodology === 'bant'}
              onChange={() => updatePreferences({ methodology: 'bant' })}
              className="mt-0.5"
            />
            <div>
              <span className="text-sm font-medium text-gray-800">BANT</span>
              <p className="text-xs text-gray-500 mt-0.5">
                Budget, Authority, Need, Timeline
              </p>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
