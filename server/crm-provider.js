// CRM Provider abstraction for Clumo
//
// Mirrors ai-provider.js: a stable, CRM-agnostic interface so the sync process
// AND the UI adapt per CRM. Each provider returns a capability descriptor that
// drives the frontend (terminology, cascade steps, ID search). Generic verbs
// (listParents / listRecords / findByExternalId / appendNote) keep callers free
// of any CRM-specific concepts. In Phase 0 only DynamicsProvider is real;
// Salesforce/HubSpot are catalogued as "coming soon".

const axios = require('axios');
const { getConfig, setConfig, deleteConfig } = require('./db');
const dynamicsAuth = require('./crm/dynamics-auth');
const noteFormat = require('./crm/note-format');

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';

class DynamicsProvider {
  constructor(config = {}) {
    this.id = 'dynamics';
    this.orgUrl = config.orgUrl || dynamicsAuth.DEFAULT_ORG_URL;
    this.userId = config.userId || null; // cached from connect to avoid repeat WhoAmI
  }

  get apiBase() {
    return `${this.orgUrl}/api/data/${dynamicsAuth.API_VERSION}`;
  }

  // Descriptor that drives both the sync process and the UI.
  getCapabilities() {
    return {
      id: 'dynamics',
      label: 'Dynamics 365',
      ui: 'generic',
      steps: [
        { key: 'parent', label: 'Account', searchable: false },
        { key: 'record', label: 'Opportunity', searchable: true, searchLabel: 'Opportunity ID' }
      ],
      noteTargetLabel: 'Comments',
      supportsIdSearch: true
    };
  }

  async _request(method, path, { params, data } = {}) {
    const token = await dynamicsAuth.getToken(this.orgUrl);
    const res = await axios({
      method,
      url: `${this.apiBase}${path}`,
      params,
      data,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Prefer: 'odata.include-annotations="*"'
      }
    });
    return res.data;
  }

  async _me() {
    if (this.userId) return this.userId;
    const who = await dynamicsAuth.whoAmI(this.orgUrl);
    this.userId = who.UserId;
    return this.userId;
  }

  async testConnection() {
    const userId = await this._me();
    const me = await this._request('GET', `/systemusers(${userId})`, {
      params: { $select: 'fullname,internalemailaddress' }
    });
    return {
      connected: true,
      userId,
      userName: me.fullname || me.internalemailaddress || 'Unknown user'
    };
  }

  // Accounts the current user is assigned to (MSX account team).
  // NOTE: msp_accountteam is an MSX virtual entity backed by an external OData
  // service — it requires a filter, rejects $select, and caps $top at 500 (the
  // Dataverse default page size of 5000 is rejected with 0x80040224, which is
  // why $top is set explicitly). This MSX specificity is intentionally
  // contained in this provider.
  async listParents() {
    const userId = await this._me();
    const data = await this._request('GET', '/msp_accountteams', {
      params: { $filter: `_msp_systemuserid_value eq ${userId}`, $top: 500 }
    });
    const seen = new Map();
    for (const row of data.value || []) {
      const id = row._msp_accountid_value;
      if (!id || seen.has(id)) continue;
      seen.set(id, {
        id,
        name: row[`_msp_accountid_value${FORMATTED}`] || row.msp_accountidname || id,
        role: row.msp_rolename || null
      });
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  // Open opportunities under a given account.
  async listRecords(parentId) {
    const data = await this._request('GET', '/opportunities', {
      params: {
        $filter: `_parentaccountid_value eq ${parentId} and statecode eq 0`,
        $select: 'name,opportunityid,msp_opportunitynumber',
        $orderby: 'name asc'
      }
    });
    return (data.value || []).map(o => ({
      id: o.opportunityid,
      number: o.msp_opportunitynumber || null,
      name: o.name
    }));
  }

  // Resolve an opportunity by its business "Opportunity Id" (msp_opportunitynumber).
  async findByExternalId(number) {
    const clean = String(number || '').trim().replace(/'/g, "''");
    if (!clean) return null;
    const data = await this._request('GET', '/opportunities', {
      params: {
        $filter: `msp_opportunitynumber eq '${clean}'`,
        $select: 'name,opportunityid,msp_opportunitynumber,_parentaccountid_value',
        $top: 1
      }
    });
    const o = (data.value || [])[0];
    if (!o) return null;
    return {
      id: o.opportunityid,
      number: o.msp_opportunitynumber || null,
      name: o.name,
      parentName: o[`_parentaccountid_value${FORMATTED}`] || null
    };
  }

  // Append a note into the opportunity comments (JSON cards + legacy text).
  async appendNote(recordId, text) {
    const userId = await this._me();
    const current = await this._request('GET', `/opportunities(${recordId})`, {
      params: { $select: 'msp_forecastcommentsjsonfield,msp_forecastcomments' }
    });
    const { jsonValue, textValue } = noteFormat.appendComment({
      existingJson: current.msp_forecastcommentsjsonfield,
      existingText: current.msp_forecastcomments,
      userId,
      comment: text
    });
    await this._request('PATCH', `/opportunities(${recordId})`, {
      data: {
        msp_forecastcommentsjsonfield: jsonValue,
        msp_forecastcomments: textValue
      }
    });
    return { ok: true, newLength: jsonValue.length };
  }
}

// --- Provider registry ---

const PROVIDERS = { dynamics: DynamicsProvider };

// Static catalog for the Integrations page (includes not-yet-built CRMs).
function listProviderCatalog() {
  return [
    { id: 'dynamics', label: 'Dynamics 365', status: 'available' },
    { id: 'salesforce', label: 'Salesforce', status: 'coming_soon' },
    { id: 'hubspot', label: 'HubSpot', status: 'coming_soon' }
  ];
}

function getProviderClass(id) {
  return PROVIDERS[id] || null;
}

// Instantiate the active (or named) provider from saved config.
function loadCrmProvider(providerId) {
  const id = providerId || getConfig('crm_provider');
  if (!id) return null;
  const Cls = PROVIDERS[id];
  if (!Cls) return null;
  return new Cls({
    orgUrl: getConfig('crm_org_url') || undefined,
    userId: getConfig('crm_user_id') || undefined
  });
}

// --- Connection config (no secrets in Phase 0: tokens come from az on demand) ---

function getCrmConfig() {
  const provider = getConfig('crm_provider');
  return {
    provider: provider || null,
    connected: getConfig('crm_connected') === 'true',
    userName: getConfig('crm_user') || null,
    userId: getConfig('crm_user_id') || null,
    orgUrl: getConfig('crm_org_url') || dynamicsAuth.DEFAULT_ORG_URL
  };
}

function saveCrmConnection(provider, { userName, userId, orgUrl } = {}) {
  setConfig('crm_provider', provider);
  setConfig('crm_connected', 'true');
  if (userName) setConfig('crm_user', userName);
  if (userId) setConfig('crm_user_id', userId);
  if (orgUrl) setConfig('crm_org_url', orgUrl);
}

function clearCrmConnection() {
  deleteConfig('crm_provider');
  deleteConfig('crm_connected');
  deleteConfig('crm_user');
  deleteConfig('crm_user_id');
}

module.exports = {
  DynamicsProvider,
  listProviderCatalog,
  getProviderClass,
  loadCrmProvider,
  getCrmConfig,
  saveCrmConnection,
  clearCrmConnection
};
