// Tests for server/fetch/ssrf-guard.js — scheme allowlist + private-IP blocking.

const { assertHttpUrl, isBlockedIp, blockingLookup } = require('../../fetch/ssrf-guard');

describe('ssrf-guard — assertHttpUrl', () => {
  it('allows http and https', () => {
    expect(assertHttpUrl('http://example.com').protocol).toBe('http:');
    expect(assertHttpUrl('https://example.com/path').protocol).toBe('https:');
  });

  it('rejects non-http schemes', () => {
    expect(() => assertHttpUrl('file:///etc/passwd')).toThrow();
    expect(() => assertHttpUrl('gopher://example.com')).toThrow();
    expect(() => assertHttpUrl('ftp://example.com')).toThrow();
  });

  it('rejects malformed URLs', () => {
    expect(() => assertHttpUrl('not a url')).toThrow();
  });
});

describe('ssrf-guard — isBlockedIp', () => {
  it('blocks loopback', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true);
    expect(isBlockedIp('127.5.6.7')).toBe(true);
    expect(isBlockedIp('::1')).toBe(true);
  });

  it('blocks private ranges', () => {
    expect(isBlockedIp('10.0.0.5')).toBe(true);
    expect(isBlockedIp('172.16.0.1')).toBe(true);
    expect(isBlockedIp('172.31.255.255')).toBe(true);
    expect(isBlockedIp('192.168.1.1')).toBe(true);
  });

  it('blocks link-local and cloud metadata', () => {
    expect(isBlockedIp('169.254.169.254')).toBe(true);
    expect(isBlockedIp('169.254.0.1')).toBe(true);
  });

  it('blocks CGNAT, unspecified, multicast, reserved', () => {
    expect(isBlockedIp('100.64.0.1')).toBe(true);
    expect(isBlockedIp('0.0.0.0')).toBe(true);
    expect(isBlockedIp('224.0.0.1')).toBe(true);
    expect(isBlockedIp('240.0.0.1')).toBe(true);
  });

  it('blocks IPv6 link-local and unique-local', () => {
    expect(isBlockedIp('fe80::1')).toBe(true);
    expect(isBlockedIp('fd00::1')).toBe(true);
    expect(isBlockedIp('fc00::1')).toBe(true);
  });

  it('blocks IPv4-mapped IPv6 loopback', () => {
    expect(isBlockedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedIp('::ffff:10.0.0.1')).toBe(true);
  });

  it('allows public addresses', () => {
    expect(isBlockedIp('8.8.8.8')).toBe(false);
    expect(isBlockedIp('1.1.1.1')).toBe(false);
    expect(isBlockedIp('93.184.216.34')).toBe(false);
  });
});

describe('ssrf-guard — blockingLookup', () => {
  it('errors on a loopback IP literal without hitting the network', () =>
    new Promise((resolve, reject) => {
      blockingLookup('127.0.0.1', {}, (err) => {
        try {
          expect(err).toBeTruthy();
          expect(err.code).toBe('ESSRFBLOCKED');
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    }));

  it('resolves a public IP literal', () =>
    new Promise((resolve, reject) => {
      blockingLookup('8.8.8.8', {}, (err, address) => {
        try {
          expect(err).toBeNull();
          expect(address).toBe('8.8.8.8');
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    }));
});
