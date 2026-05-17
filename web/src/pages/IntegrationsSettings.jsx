export default function IntegrationsSettings() {
  const integrations = [
    { name: 'Salesforce', hasMcp: true },
    { name: 'HubSpot', hasMcp: true },
    { name: 'Dynamics 365', hasMcp: true },
    { name: 'Monday', hasMcp: true },
    { name: 'Zoho', hasMcp: true },
    { name: 'Pipedrive', hasMcp: false },
  ];

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-bold mb-4">Integrations</h2>
      <div className="grid grid-cols-2 gap-4">
        {integrations.map(item => (
          <div key={item.name} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between">
            <span className="text-sm font-medium">{item.name}</span>
            {item.hasMcp ? (
              <button className="px-3 py-1 bg-gray-900 text-white rounded-md text-xs font-medium hover:bg-gray-800">
                MCP
              </button>
            ) : (
              <button
                disabled
                className="px-3 py-1 bg-gray-200 text-gray-400 rounded-md text-xs font-medium cursor-not-allowed"
                title="MCP for this CRM is not yet published by the provider"
              >
                MCP
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
