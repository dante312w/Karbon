import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import { lanIPv4Addresses, lanUrls } from './lan-addresses.js';

function ipv4(address: string, internal = false): NetworkInterfaceInfo {
  return {
    address,
    netmask: '255.255.255.0',
    family: 'IPv4',
    mac: '00:00:00:00:00:00',
    internal,
    cidr: `${address}/24`,
  };
}

// Caso real de un PC de desarrollo con VPN, VirtualBox y WSL.
const WINDOWS_WITH_VIRTUAL_ADAPTERS: NodeJS.Dict<NetworkInterfaceInfo[]> = {
  'Radmin VPN': [ipv4('26.77.189.17')],
  'Ethernet 2': [ipv4('192.168.56.1')],
  Ethernet: [ipv4('192.168.1.2')],
  'vEthernet (WSL (Hyper-V firewall))': [ipv4('172.29.80.1')],
  'Loopback Pseudo-Interface 1': [ipv4('127.0.0.1', true)],
};

describe('direcciones de la red local', () => {
  it('prioriza la LAN real y descarta VPN, WSL y loopback', () => {
    expect(lanIPv4Addresses(WINDOWS_WITH_VIRTUAL_ADAPTERS)).toEqual([
      '192.168.1.2',
      '192.168.56.1',
    ]);
  });

  it('acepta los tres rangos privados RFC 1918', () => {
    expect(
      lanIPv4Addresses({
        wlan0: [ipv4('10.0.0.5')],
        eth0: [ipv4('172.20.1.9')],
        eth1: [ipv4('192.168.0.10')],
        eth2: [ipv4('8.8.8.8')],
      }),
    ).toEqual(['10.0.0.5', '172.20.1.9', '192.168.0.10']);
  });

  it('construye URLs omitiendo el puerto por defecto del protocolo', () => {
    const interfaces = { Ethernet: [ipv4('192.168.1.10')] };
    expect(lanUrls(3000, 'http', interfaces)).toEqual(['http://192.168.1.10:3000']);
    expect(lanUrls(80, 'http', interfaces)).toEqual(['http://192.168.1.10']);
    expect(lanUrls(443, 'https', interfaces)).toEqual(['https://192.168.1.10']);
  });
});
