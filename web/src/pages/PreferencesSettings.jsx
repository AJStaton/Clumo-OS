import { useApp } from '../context/AppContext';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: '☀️', desc: 'Always use light mode' },
  { value: 'dark', label: 'Dark', icon: '🌙', desc: 'Always use dark mode' },
  { value: 'system', label: 'System', icon: '💻', desc: 'Match your OS setting' },
];

export default function PreferencesSettings() {
  const { preferences, updatePreferences } = useApp();

  return (
    <div className="max-w-xl">
      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Preferences</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Configure how Clumo looks and analyses your calls.</p>

      {/* Appearance */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-5 mb-5">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Appearance</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Choose your preferred colour scheme.
        </p>

        <div className="flex gap-3">
          {THEME_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => updatePreferences({ theme: opt.value })}
              className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors cursor-pointer ${
                preferences.theme === opt.value
                  ? 'border-gray-900 dark:border-gray-100 bg-gray-100 dark:bg-gray-800'
                  : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50'
              }`}
            >
              <span className="text-lg">{opt.icon}</span>
              <span className={`text-xs font-medium ${
                preferences.theme === opt.value
                  ? 'text-gray-900 dark:text-gray-100'
                  : 'text-gray-600 dark:text-gray-400'
              }`}>{opt.label}</span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Qualification Methodology */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Qualification Methodology</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Choose the framework used for live call tracking and post-call analysis.
        </p>

        <div className="space-y-3">
          <label className="flex items-start gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-md cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <input
              type="radio"
              name="methodology"
              value="meddpicc"
              checked={preferences.methodology === 'meddpicc'}
              onChange={() => updatePreferences({ methodology: 'meddpicc' })}
              className="mt-0.5"
            />
            <div>
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">MEDDPICC</span>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Metrics, Economic Buyer, Decision Criteria, Decision Process, Paper Process, Identify Pain, Champion, Competition
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-md cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <input
              type="radio"
              name="methodology"
              value="bant"
              checked={preferences.methodology === 'bant'}
              onChange={() => updatePreferences({ methodology: 'bant' })}
              className="mt-0.5"
            />
            <div>
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">BANT</span>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Budget, Authority, Need, Timeline
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Realtime Coaching */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-5 mt-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Realtime Coaching</h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md">
              A live coach alongside Knowledge: killer questions, reframes and pivots from a
              Solution Engineer, Account Executive and Closer, timed to the moment. On by
              default; turn it off to keep the call experience limited to Knowledge.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!!preferences.coachingEnabled}
            onClick={() => updatePreferences({ coachingEnabled: !preferences.coachingEnabled })}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
              preferences.coachingEnabled ? 'bg-gray-900 dark:bg-gray-100' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-gray-900 transition-transform ${
                preferences.coachingEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
