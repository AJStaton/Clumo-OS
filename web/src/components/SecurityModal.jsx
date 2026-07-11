export default function SecurityModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">How Clumo handles security</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="space-y-5 text-sm text-gray-700">
          <div>
            <h3 className="font-semibold text-gray-900 mb-1.5">Your keys are only stored locally on your device</h3>
            <p>
              Clumo is bring-your-own-key, and your API keys <strong>never leave your machine</strong>. When
              you save a key it's written only to a local database file on this computer&nbsp;
              (<span className="font-mono text-xs">clumo.db</span>) &mdash; there is no Clumo account, no cloud
              backend, and no server that your keys are sent to or synced with. The <em>only</em> place your key
              is ever transmitted is directly to the AI provider you chose (OpenAI or Azure OpenAI), in the
              standard authorization header, exactly as their own SDKs do it. If you delete Clumo's local data
              folder, the keys are gone &mdash; they exist nowhere else.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1.5">Your API key is encrypted</h3>
            <p>
              The moment you save your API key, it's encrypted using <strong>AES-256-CBC</strong>, the
              same encryption standard used by banks and government systems. Each encryption uses a unique
              random value, so even the same key encrypted twice looks completely different. Your key is
              stored in an encrypted local database, never in plain text, and is never displayed back in
              the UI once saved.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1.5">Everything runs on your machine</h3>
            <p>
              Clumo has no cloud backend, no account system, and no intermediary servers. The app runs
              entirely on your computer. Your knowledge base, transcripts, session history, and settings
              all stay in local files on your machine. Nothing is uploaded anywhere.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1.5">What data is sent to your AI provider</h3>
            <p className="mb-2">
              The only external connection Clumo makes is directly to the AI provider you choose (OpenAI
              or Azure OpenAI). Here's exactly what gets sent:
            </p>
            <ul className="space-y-1.5 ml-1">
              <li className="flex gap-2">
                <span className="text-gray-400 shrink-0">&#8226;</span>
                <span><strong>Audio stream</strong> sent in real time for live transcription</span>
              </li>
              <li className="flex gap-2">
                <span className="text-gray-400 shrink-0">&#8226;</span>
                <span><strong>Short transcript excerpts</strong> (~500 words) sent to score whether a suggestion is relevant right now</span>
              </li>
              <li className="flex gap-2">
                <span className="text-gray-400 shrink-0">&#8226;</span>
                <span><strong>Embeddings</strong>: text is converted to numeric vectors for semantic matching. See "How search works" below for details.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-gray-400 shrink-0">&#8226;</span>
                <span><strong>Full transcript</strong> (after the call) sent once to generate your call summary and follow up email</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1.5">How search works</h3>
            <p className="mb-2">
              Embeddings let Clumo match by meaning, not keywords. When a prospect says "we are struggling
              with employee churn," Clumo recognizes it relates to a case study about reducing attrition
              by 40%, even though no words match exactly. This makes suggestions accurate and timely.
            </p>
            <p className="mb-2">
              An embedding is a list of numbers (a vector) that captures meaning. The conversion is one way.
              There is no known method to reconstruct the original text from its vector. Your knowledge base
              text never leaves your machine after the initial one time conversion. During calls, transcript
              chunks are converted to vectors and compared locally against stored KB vectors.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1.5">Secure connections</h3>
            <p>
              All communication with OpenAI and Azure uses <strong>TLS encrypted</strong> channels (HTTPS
              and WSS). Your API key is transmitted only in standard authorization headers, the same way
              any official OpenAI or Azure integration works. Data travels directly from your machine to
              your provider with no middleman.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1.5">No telemetry or tracking</h3>
            <p>
              Clumo collects zero analytics, zero telemetry, and zero usage data. There are no tracking
              pixels, no crash reporters, and no phone home connections. The app is open source so you can
              verify this yourself.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
