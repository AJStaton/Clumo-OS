import { useState, useEffect } from 'react';

const STORAGE_KEY = 'clumo-automation-rules';

const SYSTEMS = ['Salesforce', 'HubSpot', 'Dynamics 365', 'Monday', 'Zoho', 'Pipedrive'];
const TYPES = ['CRM', 'Customer', 'Stakeholders'];
const FIELDS = ['Deal Stage', 'Last Activity', 'Contact Notes', 'Meeting Summary', 'Next Steps', 'MEDDPICC Score'];
const DATA_SOURCES = ['Full Transcript', 'Session Notes', 'MEDDPICC Scores', 'Key Topics', 'Action Items'];

function loadRules() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export default function AutomationSettings() {
  const [rules, setRules] = useState(loadRules);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ type: '', system: '', field: '', data: '' });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  }, [rules]);

  function handleEdit(index) {
    setEditing(index);
    setForm(rules[index]);
  }

  function handleAdd() {
    setEditing('new');
    setForm({ type: '', system: '', field: '', data: '' });
  }

  function handleSave() {
    if (editing === 'new') {
      setRules([...rules, form]);
    } else {
      const updated = [...rules];
      updated[editing] = form;
      setRules(updated);
    }
    setEditing(null);
    setForm({ type: '', system: '', field: '', data: '' });
  }

  function handleDelete(index) {
    setRules(rules.filter((_, i) => i !== index));
  }

  function handleCancel() {
    setEditing(null);
    setForm({ type: '', system: '', field: '', data: '' });
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">Automation Rules</h2>
        <button
          onClick={handleAdd}
          className="px-3 py-1.5 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800"
        >
          Add Rule
        </button>
      </div>

      {rules.length === 0 && editing === null && (
        <p className="text-sm text-gray-500">No automation rules configured yet.</p>
      )}

      {rules.map((rule, i) => (
        <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 mb-3 flex items-center justify-between">
          <div className="text-sm">
            <span className="font-medium">{rule.type}</span>
            <span className="text-gray-400 mx-2">&rarr;</span>
            <span>{rule.system}</span>
            <span className="text-gray-400 mx-2">&middot;</span>
            <span className="text-gray-500">{rule.field}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => handleEdit(i)} className="text-xs text-blue-600 hover:underline">Edit</button>
            <button onClick={() => handleDelete(i)} className="text-xs text-red-600 hover:underline">Delete</button>
          </div>
        </div>
      ))}

      {editing !== null && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3 mt-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
            <select
              value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">Select type...</option>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">System</label>
            <select
              value={form.system}
              onChange={e => setForm({ ...form, system: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">Select system...</option>
              {SYSTEMS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Fields to update</label>
            <select
              value={form.field}
              onChange={e => setForm({ ...form, field: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">Select field...</option>
              {FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Data to use</label>
            <select
              value={form.data}
              onChange={e => setForm({ ...form, data: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">Select data source...</option>
              {DATA_SOURCES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={!form.type || !form.system || !form.field || !form.data}
              className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
