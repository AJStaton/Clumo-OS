// SSRF guard for outbound fetches (onboarding site scanner).
//
// Two layers:
//  1. assertHttpUrl(url) — scheme allowlist (http/https only), blocks file:, gopher:, etc.
//  2. guardedHttpAgent / guardedHttpsAgent — agents whose DNS lookup rejects any
//     address in a loopback/private/link-local/CGNAT range. Because the check runs at
//     connect time, it re-validates on every redirect hop and defeats DNS-rebinding
//     (attacker host that resolves to an internal IP) and metadata-endpoint SSRF
//     (169.254.169.254).

const http = require('http');
const https = require('https');
const dns = require('dns');
const net = require('net');

function ipToLong(ip) {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function inCidr(ip, base, bits) {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipToLong(ip) & mask) === (ipToLong(base) & mask);
}

// True for addresses that must never be reached by a user-supplied URL fetch.
function isBlockedIp(address) {
  if (!address) return true;
  let addr = address;
  const family = net.isIP(addr);

  // IPv4-mapped IPv6 (::ffff:127.0.0.1) — evaluate the embedded v4 address.
  if (family === 6) {
    const lower = addr.toLowerCase();
    if (lower === '::1' || lower === '::') return true;          // loopback / unspecified
    if (lower.startsWith('fe80')) return true;                    // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local (fc00::/7)
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) {
      addr = mapped[1];
    } else {
      return false; // some other global v6
    }
  }

  if (net.isIP(addr) !== 4) return false;

  return (
    inCidr(addr, '0.0.0.0', 8) ||        // unspecified / this-network
    inCidr(addr, '10.0.0.0', 8) ||       // private
    inCidr(addr, '100.64.0.0', 10) ||    // CGNAT
    inCidr(addr, '127.0.0.0', 8) ||      // loopback
    inCidr(addr, '169.254.0.0', 16) ||   // link-local (incl. cloud metadata)
    inCidr(addr, '172.16.0.0', 12) ||    // private
    inCidr(addr, '192.0.0.0', 24) ||     // IETF protocol assignments
    inCidr(addr, '192.168.0.0', 16) ||   // private
    inCidr(addr, '224.0.0.0', 4) ||      // multicast
    inCidr(addr, '240.0.0.0', 4)         // reserved
  );
}

function assertHttpUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw Object.assign(new Error(`Invalid URL: ${url}`), { code: 'EBADURL' });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw Object.assign(new Error(`Blocked URL scheme: ${parsed.protocol}`), { code: 'EBADSCHEME' });
  }
  return parsed;
}

// dns.lookup wrapper that fails when the resolved address is blocked.
function blockingLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) return callback(err);
    if (isBlockedIp(address)) {
      return callback(
        Object.assign(new Error(`Blocked private/internal address for ${hostname}: ${address}`), {
          code: 'ESSRFBLOCKED',
        })
      );
    }
    callback(null, address, family);
  });
}

function withGuardedLookup(Base) {
  return class extends Base {
    createConnection(options, cb) {
      return super.createConnection({ ...options, lookup: blockingLookup }, cb);
    }
  };
}

const GuardedHttpAgent = withGuardedLookup(http.Agent);
const GuardedHttpsAgent = withGuardedLookup(https.Agent);

const guardedHttpAgent = new GuardedHttpAgent();
const guardedHttpsAgent = new GuardedHttpsAgent();

module.exports = {
  assertHttpUrl,
  isBlockedIp,
  blockingLookup,
  guardedHttpAgent,
  guardedHttpsAgent,
};
