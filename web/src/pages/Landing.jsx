import { useNavigate } from 'react-router-dom';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white px-6 py-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clumo</h1>
          <p className="text-sm text-gray-500">AI-powered live call coaching</p>
        </div>
        <button
          onClick={() => navigate('/setup')}
          className="px-5 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          Get Started →
        </button>
      </div>

      {/* What */}
      <p className="text-gray-600 text-sm leading-relaxed mb-8">
        Real-time suggestions, discovery questions, and proof points surfaced while you're on a
        sales call. Runs locally on your desktop. No browser extension, no cloud, no Docker.
        Bring your own OpenAI keys.
      </p>

      {/* How it works */}
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">How it works</h2>
      <table className="w-full text-sm mb-8">
        <tbody className="divide-y divide-gray-100">
          <tr>
            <td className="py-2 pr-4 font-medium text-gray-900 whitespace-nowrap">Listen</td>
            <td className="py-2 text-gray-600">Captures audio from Zoom, Teams, Meet, or any app on your machine</td>
          </tr>
          <tr>
            <td className="py-2 pr-4 font-medium text-gray-900 whitespace-nowrap">Coach</td>
            <td className="py-2 text-gray-600">AI surfaces discovery questions, case studies, and proof points in real time</td>
          </tr>
          <tr>
            <td className="py-2 pr-4 font-medium text-gray-900 whitespace-nowrap">Analyse</td>
            <td className="py-2 text-gray-600">Post-call notes, CRM summaries, and follow-up emails generated automatically</td>
          </tr>
        </tbody>
      </table>

      {/* Who it's for */}
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Who it's for</h2>
      <table className="w-full text-sm mb-8">
        <tbody className="divide-y divide-gray-100">
          <tr>
            <td className="py-2 pr-4 font-medium text-gray-900 whitespace-nowrap">Sales</td>
            <td className="py-2 text-gray-600">Never miss a discovery question. MEDDPICC tracked in real time.</td>
          </tr>
          <tr>
            <td className="py-2 pr-4 font-medium text-gray-900 whitespace-nowrap">Founders</td>
            <td className="py-2 text-gray-600">Structured sales coaching without hiring a sales manager.</td>
          </tr>
          <tr>
            <td className="py-2 pr-4 font-medium text-gray-900 whitespace-nowrap">Technical Sales</td>
            <td className="py-2 text-gray-600">Surface proof points and case studies for technical conversations.</td>
          </tr>
          <tr>
            <td className="py-2 pr-4 font-medium text-gray-900 whitespace-nowrap">GTM</td>
            <td className="py-2 text-gray-600">High quality coaching at scale without adding headcount.</td>
          </tr>
        </tbody>
      </table>

      {/* Details */}
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Details</h2>
      <table className="w-full text-sm mb-8">
        <tbody className="divide-y divide-gray-100">
          <tr>
            <td className="py-2 pr-4 font-medium text-gray-900 whitespace-nowrap">Privacy</td>
            <td className="py-2 text-gray-600">Runs 100% locally. Your data never leaves your machine.</td>
          </tr>
          <tr>
            <td className="py-2 pr-4 font-medium text-gray-900 whitespace-nowrap">BYOK</td>
            <td className="py-2 text-gray-600">Azure OpenAI or OpenAI. Keys encrypted at rest.</td>
          </tr>
          <tr>
            <td className="py-2 pr-4 font-medium text-gray-900 whitespace-nowrap">Knowledge base</td>
            <td className="py-2 text-gray-600">Built from your website and sales docs. Stored locally, never shared.</td>
          </tr>
          <tr>
            <td className="py-2 pr-4 font-medium text-gray-900 whitespace-nowrap">License</td>
            <td className="py-2 text-gray-600">MIT. Free and open source.</td>
          </tr>
        </tbody>
      </table>

      <p className="text-xs text-gray-400">
        Setup takes ~2 minutes. Connect an AI provider, add your sales content, start coaching.
      </p>
    </div>
  );
}
