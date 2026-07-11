// Dynamics 365 / MSX delegated auth for Clumo (Phase 0)
//
// Uses the locally-installed Azure CLI as a pre-consented, first-party public
// client to obtain a *delegated* Dataverse token for the signed-in user. No app
// registration, no stored secret: `az` caches the refresh token and silently
// renews while the user's `az login` session is valid. Phase 1 swaps this module
// for in-app MSAL without changing the crm-provider interface.

const { execFile } = require('child_process');
const axios = require('axios');

const DEFAULT_ORG_URL = 'https://microsoftsales.crm.dynamics.com';
const API_VERSION = 'v9.2';

function runAz(args) {
  return new Promise((resolve, reject) => {
    // No shell: args is a fixed array, so shell metacharacters are inert even if a
    // future caller passes a user-controlled value. On Windows `az` is `az.cmd`, so
    // name the extension explicitly for PATH resolution without a shell.
    const azBin = process.platform === 'win32' ? 'az.cmd' : 'az';
    execFile(azBin, args, { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = (stderr || '').trim();
        return reject(err);
      }
      resolve((stdout || '').trim());
    });
  });
}

function classifyAzError(err) {
  const msg = `${err.message || ''} ${err.stderr || ''}`.toLowerCase();
  if (
    msg.includes("'az' is not recognized") ||
    msg.includes('command not found') ||
    msg.includes('not found') ||
    err.code === 'ENOENT'
  ) {
    const e = new Error('Azure CLI (az) was not found. Install the Azure CLI and run `az login` with your Microsoft account, then try again.');
    e.code = 'AZ_NOT_FOUND';
    return e;
  }
  if (
    msg.includes('az login') ||
    msg.includes('please run') ||
    msg.includes('no subscription') ||
    msg.includes('not logged in') ||
    msg.includes('refresh token') ||
    msg.includes('expired')
  ) {
    const e = new Error('Not signed in to Azure CLI. Run `az login` with your Microsoft (Entra ID) account, then reconnect.');
    e.code = 'AZ_NOT_LOGGED_IN';
    return e;
  }
  const e = new Error(err.stderr || err.message || 'Azure CLI token request failed.');
  e.code = 'AZ_ERROR';
  return e;
}

// Get a delegated Dataverse access token for the current user.
async function getToken(orgUrl = DEFAULT_ORG_URL) {
  try {
    const token = await runAz([
      'account', 'get-access-token',
      '--resource', orgUrl,
      '--query', 'accessToken',
      '-o', 'tsv'
    ]);
    if (!token) {
      const e = new Error('Azure CLI returned an empty token.');
      e.code = 'AZ_ERROR';
      throw e;
    }
    return token;
  } catch (err) {
    if (err.code && String(err.code).startsWith('AZ_')) throw err;
    throw classifyAzError(err);
  }
}

// Resolve the current user's Dataverse systemuserid via WhoAmI.
async function whoAmI(orgUrl = DEFAULT_ORG_URL, token = null) {
  const accessToken = token || (await getToken(orgUrl));
  const res = await axios.get(`${orgUrl}/api/data/${API_VERSION}/WhoAmI`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
  });
  return res.data; // { UserId, BusinessUnitId, OrganizationId }
}

module.exports = { getToken, whoAmI, DEFAULT_ORG_URL, API_VERSION };
