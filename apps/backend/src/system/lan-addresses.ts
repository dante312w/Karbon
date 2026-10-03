import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';

/** Adaptadores de VPN, hipervisores y contenedores: nunca son la red del restaurante. */
const VIRTUAL_INTERFACE =
  /vethernet|virtualbox|vmware|hyper-v|wsl|docker|vbox|radmin|hamachi|zerotier|tailscale|wireguard|^br-|^veth|^tun|^tap|^utun/i;

const PRIVATE_IPV4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/** Subred host-only por defecto de VirtualBox: su adaptador suele llamarse "Ethernet 2". */
const HYPERVISOR_DEFAULT_SUBNET = '192.168.56.';

/**
 * IPv4 privadas por las que las terminales pueden alcanzar este servidor, de la más a la
 * menos probable. La primera es la que el escritorio muestra en el QR de conexión.
 */
export function lanIPv4Addresses(
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): string[] {
  const addresses = Object.entries(interfaces)
    .filter(([name]) => !VIRTUAL_INTERFACE.test(name))
    .flatMap(([, entries]) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address)
    .filter((address) => PRIVATE_IPV4.test(address));

  const rank = (address: string): number => (address.startsWith(HYPERVISOR_DEFAULT_SUBNET) ? 1 : 0);
  return [...new Set(addresses)].sort((a, b) => rank(a) - rank(b));
}

export function lanUrls(
  port: number,
  protocol: 'http' | 'https' = 'http',
  interfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>,
): string[] {
  const isDefaultPort =
    (protocol === 'http' && port === 80) || (protocol === 'https' && port === 443);
  const suffix = isDefaultPort ? '' : `:${port}`;
  return lanIPv4Addresses(interfaces).map((address) => `${protocol}://${address}${suffix}`);
}
