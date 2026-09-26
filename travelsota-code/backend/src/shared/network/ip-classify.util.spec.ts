import {
  classifyIp,
  isPrivateIp,
  trustPrivatePeers,
} from './ip-classify.util';

describe('ip-classify.util', () => {
  describe('classifyIp — IPv4', () => {
    it.each([
      ['127.0.0.1', 'private'],
      ['10.0.0.5', 'private'],
      ['172.16.0.1', 'private'],
      ['172.31.255.255', 'private'],
      ['172.32.0.1', 'public'], // just outside RFC1918
      ['192.168.1.5', 'private'],
      ['169.254.10.20', 'private'], // link-local
      ['100.64.0.1', 'private'], // CGNAT start
      ['100.127.255.254', 'private'], // CGNAT end
      ['100.128.0.1', 'public'], // just outside CGNAT
      ['0.0.0.0', 'private'],
      ['224.0.0.5', 'private'], // multicast
      ['240.0.0.1', 'private'], // reserved
      ['198.51.100.7', 'private'], // TEST-NET-2 (docs)
      ['8.8.8.8', 'public'],
      ['1.2.3.4', 'public'],
      ['203.0.10.9', 'public'], // 203.0.113/24 is docs; 203.0.10 is not
    ])('classifies %s as %s', (ip, expected) => {
      expect(classifyIp(ip)).toBe(expected);
    });
  });

  describe('classifyIp — IPv6 and malformed input', () => {
    it.each([
      ['::1', 'private'],
      ['::', 'private'],
      ['::ffff:127.0.0.1', 'private'],
      ['::ffff:8.8.8.8', 'public'],
      ['fd00::1234', 'private'], // unique-local
      ['fe80::1', 'private'], // link-local
      ['ff02::1', 'private'], // multicast
      ['2606:4700::1111', 'public'],
      ['not-an-ip', 'unknown'],
      ['', 'unknown'],
      [null, 'unknown'],
      [undefined, 'unknown'],
      ['[2606:4700::1111]', 'public'], // bracketed form
      ['fe80::1%eth0', 'private'], // zone index stripped
    ])('classifies %s as %s', (ip, expected) => {
      expect(classifyIp(ip as string | null | undefined)).toBe(expected);
    });
  });

  describe('isPrivateIp', () => {
    it('is true exactly when classifyIp is private', () => {
      expect(isPrivateIp('192.168.0.1')).toBe(true);
      expect(isPrivateIp('8.8.8.8')).toBe(false);
      expect(isPrivateIp('garbage')).toBe(false);
    });
  });

  describe('trustPrivatePeers (Express trust-proxy callback)', () => {
    it('trusts the local reverse proxy', () => {
      expect(trustPrivatePeers('127.0.0.1')).toBe(true);
      expect(trustPrivatePeers('::1')).toBe(true);
      expect(trustPrivatePeers('192.168.1.10')).toBe(true);
      expect(trustPrivatePeers('10.0.0.2')).toBe(true);
    });

    it('never trusts public peers (spoof resistance)', () => {
      expect(trustPrivatePeers('8.8.8.8')).toBe(false);
      expect(trustPrivatePeers('172.32.0.1')).toBe(false);
      expect(trustPrivatePeers('100.128.0.1')).toBe(false);
      expect(trustPrivatePeers('2606:4700::1111')).toBe(false);
    });

    it('treats unknown peers as trusted (local docker sidecars)', () => {
      // An unparseable peer address cannot be a remote client forgery vector:
      // Express only passes the socket address here.
      expect(trustPrivatePeers('weird')).toBe(true);
    });
  });
});
