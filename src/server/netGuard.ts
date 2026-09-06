import { lookup } from 'node:dns/promises';

/**
 * A generic webhook destination has no host allowlist, so the name it resolves
 * to is checked before anything is sent. Without this, a perfectly ordinary
 * looking domain could point at loopback, a private subnet, or the cloud
 * metadata service.
 */

const IPV4_BLOCKS: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // RFC1918
  ['100.64.0.0', 10], // carrier NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, including cloud metadata
  ['172.16.0.0', 12], // RFC1918
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16], // RFC1918
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved
];

const toInt = (ip: string): number =>
  ip.split('.').reduce((total, octet) => (total << 8) + Number(octet), 0) >>> 0;

function isPrivateIPv4(ip: string): boolean {
  const value = toInt(ip);
  return IPV4_BLOCKS.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (toInt(base) & mask);
  });
}

function isPrivateIPv6(ip: string): boolean {
  const address = ip.toLowerCase().split('%')[0];

  if (address === '::1' || address === '::') return true;

  // IPv4-mapped (::ffff:10.0.0.1) and NAT64 (64:ff9b::10.0.0.1) carry a v4
  // address inside them, so unwrap and judge that instead.
  const embedded = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
  if (embedded) return isPrivateIPv4(embedded[1]);

  const head = Number.parseInt(address.split(':')[0] || '0', 16);
  if ((head & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((head & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((head & 0xff00) === 0xff00) return true; // ff00::/8 multicast

  return false;
}

export function isPrivateAddress(ip: string, family: number): boolean {
  return family === 4 ? isPrivateIPv4(ip) : isPrivateIPv6(ip);
}

/**
 * Resolves a hostname and rejects it unless every answer is publicly routable.
 */
export async function assertPublicHost(hostname: string): Promise<void> {
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new Error('Could not resolve that host.');
  }

  if (addresses.length === 0) throw new Error('Could not resolve that host.');

  for (const { address, family } of addresses) {
    if (isPrivateAddress(address, family)) {
      throw new Error('That host resolves to a private address.');
    }
  }
}
