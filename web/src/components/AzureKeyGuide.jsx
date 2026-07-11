import { useState } from 'react';

export default function AzureKeyGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-md">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        <span>How to set up your own keys (Azure AI Foundry)</span>
        <span className="text-gray-400">{open ? '\u2212' : '+'}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 text-xs text-gray-600 dark:text-gray-300 space-y-3 border-t border-gray-100 dark:border-gray-700">
          <p>
            Follow these steps in <strong>Azure AI Foundry</strong> (portal:{' '}
            <span className="font-mono">ai.azure.com</span>) to create the models Clumo needs. You paste
            the endpoint, key, and deployment names into the fields above.
          </p>

          <div>
            <p className="font-semibold text-gray-800 dark:text-gray-100">1. Create a project + resource</p>
            <p>
              Sign in to Azure AI Foundry, create (or open) a project, and make sure it's backed by an
              <strong> Azure OpenAI</strong> resource. Note the region — keep it in a location that meets
              your data-residency / compliance needs.
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-800 dark:text-gray-100">2. Deploy the three models</p>
            <p className="mb-1">Under <em>Deployments &rarr; Deploy model</em>, deploy each of these and note the deployment name you give it:</p>
            <ul className="ml-1 space-y-1">
              <li className="flex gap-2">
                <span className="text-gray-400 shrink-0">&#8226;</span>
                <span><strong>Chat completions:</strong> <span className="font-mono">gpt-4o-mini</span> — scores suggestions, powers coaching and post-call analysis.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-gray-400 shrink-0">&#8226;</span>
                <span><strong>Real-time transcription:</strong> <span className="font-mono">gpt-4o-mini-transcribe</span> — carries the live audio session and streams the transcript.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-gray-400 shrink-0">&#8226;</span>
                <span><strong>Embeddings:</strong> <span className="font-mono">text-embedding-3-small</span> — matches the conversation to your knowledge base.</span>
              </li>
            </ul>
          </div>

          <div>
            <p className="font-semibold text-gray-800 dark:text-gray-100">3. Copy your endpoint + key</p>
            <p>
              In the resource's <em>Keys and Endpoint</em> page, copy the endpoint
              (<span className="font-mono">https://your-resource.openai.azure.com</span>) and one of the API keys.
            </p>
          </div>

          <div>
            <p className="font-semibold text-gray-800 dark:text-gray-100">4. Paste into Clumo &amp; test</p>
            <p>
              Enter the endpoint, API key, and the three deployment names above, then click
              <strong> Test Connection</strong>. That's it — your keys never leave this machine.
            </p>
          </div>

          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-2.5 text-amber-900 dark:text-amber-200 space-y-1.5">
            <p className="font-semibold">Keep transcripts &amp; prompts private</p>
            <ul className="ml-1 space-y-1">
              <li className="flex gap-2">
                <span className="shrink-0">&#8226;</span>
                <span>Use a <strong>dedicated Azure resource and key</strong> for Clumo — don't reuse a shared team key.</span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0">&#8226;</span>
                <span>Where your subscription is eligible, apply to <strong>disable Azure OpenAI content logging / abuse-monitoring human review</strong> (the "no data retention" path) so your prompts and transcripts aren't stored or reviewed by the provider.</span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0">&#8226;</span>
                <span>Pick a <strong>region</strong> that satisfies your data-residency and compliance rules.</span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0">&#8226;</span>
                <span><strong>Never share or commit your key.</strong> Clumo encrypts it at rest (AES-256) and never shows it again once saved. Rotate the key immediately if you suspect it's exposed.</span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0">&#8226;</span>
                <span>Everything stays local; only audio, short transcript excerpts, embeddings, and the post-call transcript go to <em>your</em> Azure resource over an encrypted (TLS) connection. Keep the machine itself secured.</span>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
