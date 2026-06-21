// Tests for server/crm-provider.js — DynamicsProvider verbs and the provider
// registry/config surface. The HTTP layer (_request) is stubbed; no live MSX.

const crm = require('../../crm-provider');

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';

function providerWithRequest(impl) {
  const p = new crm.DynamicsProvider({ userId: 'me-guid' });
  p._request = vi.fn(impl);
  return p;
}

describe('DynamicsProvider — getCapabilities', () => {
  it('returns an Account -> Opportunity cascade descriptor', () => {
    const cap = new crm.DynamicsProvider().getCapabilities();
    expect(cap.id).toBe('dynamics');
    expect(cap.steps.map(s => s.label)).toEqual(['Account', 'Opportunity']);
    expect(cap.steps[1].searchable).toBe(true);
    expect(cap.supportsIdSearch).toBe(true);
  });
});

describe('DynamicsProvider — listParents', () => {
  it('dedupes accounts and maps formatted names + role', async () => {
    const p = providerWithRequest(async () => ({
      value: [
        { _msp_accountid_value: 'a1', [`_msp_accountid_value${FORMATTED}`]: 'Quantexa LTD', msp_rolename: 'Seller' },
        { _msp_accountid_value: 'a1', [`_msp_accountid_value${FORMATTED}`]: 'Quantexa LTD', msp_rolename: 'Seller' },
        { _msp_accountid_value: 'a2', [`_msp_accountid_value${FORMATTED}`]: 'Acme Corp', msp_rolename: 'Manager' }
      ]
    }));
    const parents = await p.listParents();
    expect(parents).toEqual([
      { id: 'a2', name: 'Acme Corp', role: 'Manager' },
      { id: 'a1', name: 'Quantexa LTD', role: 'Seller' }
    ]);
    expect(p._request.mock.calls[0][2].params.$filter).toContain('me-guid');
  });
});

describe('DynamicsProvider — listRecords', () => {
  it('maps open opportunities for a parent account', async () => {
    const p = providerWithRequest(async () => ({
      value: [
        { opportunityid: 'o1', msp_opportunitynumber: '7-ABC', name: 'Deal One' },
        { opportunityid: 'o2', msp_opportunitynumber: null, name: 'Deal Two' }
      ]
    }));
    const records = await p.listRecords('a1');
    expect(records).toEqual([
      { id: 'o1', number: '7-ABC', name: 'Deal One' },
      { id: 'o2', number: null, name: 'Deal Two' }
    ]);
    const filter = p._request.mock.calls[0][2].params.$filter;
    expect(filter).toContain('_parentaccountid_value eq a1');
    expect(filter).toContain('statecode eq 0');
  });
});

describe('DynamicsProvider — findByExternalId', () => {
  it('returns null when nothing matches', async () => {
    const p = providerWithRequest(async () => ({ value: [] }));
    expect(await p.findByExternalId('nope')).toBeNull();
  });

  it('maps a matched opportunity with its parent account name', async () => {
    const p = providerWithRequest(async () => ({
      value: [{
        opportunityid: 'o1',
        msp_opportunitynumber: '7-3DO5RHNR23',
        name: 'Quantexa Renewal',
        [`_parentaccountid_value${FORMATTED}`]: 'Quantexa LTD'
      }]
    }));
    expect(await p.findByExternalId('7-3DO5RHNR23')).toEqual({
      id: 'o1',
      number: '7-3DO5RHNR23',
      name: 'Quantexa Renewal',
      parentName: 'Quantexa LTD'
    });
  });

  it('escapes single quotes in the id filter', async () => {
    const p = providerWithRequest(async () => ({ value: [] }));
    await p.findByExternalId("o'brien");
    expect(p._request.mock.calls[0][2].params.$filter).toContain("o''brien");
  });
});

describe('DynamicsProvider — appendNote', () => {
  it('reads existing comments then PATCHes only the JSON cards field', async () => {
    const p = providerWithRequest(async (method) => {
      if (method === 'GET') {
        return {
          msp_forecastcommentsjsonfield: JSON.stringify([{ comment: 'Old' }])
        };
      }
      return {};
    });
    const result = await p.appendNote('o1', 'Fresh note');
    expect(result.ok).toBe(true);

    const patchCall = p._request.mock.calls[1];
    expect(patchCall[0]).toBe('PATCH');
    const sent = JSON.parse(patchCall[2].data.msp_forecastcommentsjsonfield);
    expect(sent.map(e => e.comment)).toEqual(['Old', 'Fresh note']);
    expect(sent[1].userId).toBe('{ME-GUID}');
    // Legacy plain-text field must NOT be written — MSX derives it from the
    // cards. Writing it ourselves causes duplicated/double-prefixed entries.
    expect(patchCall[2].data).not.toHaveProperty('msp_forecastcomments');
  });
});

describe('crm-provider — registry', () => {
  it('catalogs dynamics as available and SF/HubSpot as coming soon', () => {
    const byId = Object.fromEntries(crm.listProviderCatalog().map(p => [p.id, p.status]));
    expect(byId.dynamics).toBe('available');
    expect(byId.salesforce).toBe('coming_soon');
    expect(byId.hubspot).toBe('coming_soon');
  });

  it('only resolves a class for implemented providers', () => {
    expect(crm.getProviderClass('dynamics')).toBe(crm.DynamicsProvider);
    expect(crm.getProviderClass('salesforce')).toBeNull();
  });
});
