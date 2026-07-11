// Loopback network guard for Clumo.
//
// Clumo's server is a single-user, loopback-only backend. These helpers reject
// requests whose Host is not a loopback name and WebSocket upgrades whose Origin
// is not the app's own loopback origin. Combined with binding to 127.0.0.1, this
// closes the LAN-exposure and DNS-rebinding attack paths.

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

// Strip a trailing :port and surrounding IPv6 brackets from a Host header.
function hostnameOf(hostHeader) {
  if (!hostHeader) return null;
  let h = String(hostHeader).trim();
  // IPv6 literal: [::1] or [::1]:3000
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    if (end !== -1) return h.slice(1, end);
  }
  // Strip :port for host:port (but not for a bare IPv6 without brackets)
  const colon = h.lastIndexOf(':');
  if (colon !== -1 && h.indexOf(':') === colon) {
    h = h.slice(0, colon);
  }
  return h;
}

// True when the Host header points at a loopback name (any port).
function isAllowedHost(hostHeader) {
  const name = hostnameOf(hostHeader);
  return !!name && LOOPBACK_HOSTNAMES.has(name);
}

// True when the Origin is absent (native/Electron client) or is a loopback origin.
function isAllowedOrigin(originHeader) {
  if (!originHeader) return true; // no Origin => not a browser cross-site request
  try {
    const u = new URL(originHeader);
    return LOOPBACK_HOSTNAMES.has(u.hostname);
  } catch {
    return false;
  }
}

module.exports = { isAllowedHost, isAllowedOrigin, hostnameOf, LOOPBACK_HOSTNAMES };
