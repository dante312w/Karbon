/**
 * Extensión X.509 Name Constraints (RFC 5280 §4.2.1.10) codificada en DER a mano: la CA del
 * restaurante solo puede emitir certificados para IPs privadas y nombres locales. Así,
 * instalarla en un celular no permite suplantar sitios de internet aunque se filtre su clave.
 */
export const NAME_CONSTRAINTS_OID = '2.5.29.30';

/** Redes privadas (RFC 1918), loopback y enlace local, como dirección + máscara. */
export const PERMITTED_IPV4_NETWORKS: readonly (readonly [string, string])[] = [
  ['10.0.0.0', '255.0.0.0'],
  ['172.16.0.0', '255.240.0.0'],
  ['192.168.0.0', '255.255.0.0'],
  ['127.0.0.0', '255.0.0.0'],
  ['169.254.0.0', '255.255.0.0'],
];

/** Nombres DNS permitidos (incluyen sus subdominios). */
export const PERMITTED_DNS_NAMES: readonly string[] = ['localhost', 'local', 'lan', 'home.arpa'];

function encodeLength(length: number): number[] {
  if (length < 0x80) return [length];
  const bytes: number[] = [];
  for (let remaining = length; remaining > 0; remaining >>= 8) bytes.unshift(remaining & 0xff);
  return [0x80 | bytes.length, ...bytes];
}

function tlv(tag: number, content: readonly number[]): number[] {
  return [tag, ...encodeLength(content.length), ...content];
}

function ipv4Bytes(address: string): number[] {
  const parts = address.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    throw new RangeError(`Dirección IPv4 inválida: ${address}`);
  }
  return parts;
}

const SEQUENCE = 0x30;
/** [0] IMPLICIT permittedSubtrees (construido). */
const PERMITTED_SUBTREES = 0xa0;
/** GeneralName dNSName [2] IMPLICIT IA5String. */
const DNS_NAME = 0x82;
/** GeneralName iPAddress [7] IMPLICIT OCTET STRING. */
const IP_ADDRESS = 0x87;

export function encodeNameConstraints(
  networks: readonly (readonly [string, string])[] = PERMITTED_IPV4_NETWORKS,
  dnsNames: readonly string[] = PERMITTED_DNS_NAMES,
): Uint8Array {
  const subtrees = [
    ...dnsNames.map((name) => tlv(SEQUENCE, tlv(DNS_NAME, [...Buffer.from(name, 'ascii')]))),
    ...networks.map(([address, mask]) =>
      tlv(SEQUENCE, tlv(IP_ADDRESS, [...ipv4Bytes(address), ...ipv4Bytes(mask)])),
    ),
  ].flat();
  return Uint8Array.from(tlv(SEQUENCE, tlv(PERMITTED_SUBTREES, subtrees)));
}
