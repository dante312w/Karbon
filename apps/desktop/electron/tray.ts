import { app, clipboard, Menu, nativeImage, Tray } from 'electron';
import type { ServerStatus } from '../shared/bridge';

const STATE_LABEL: Record<ServerStatus['state'], string> = {
  starting: 'Servidor: iniciando…',
  running: 'Servidor: en línea',
  error: 'Servidor: con problemas',
};

/**
 * Ícono en la bandeja: el servidor sigue atendiendo celulares y tablets aunque se cierre la
 * ventana de la caja. Solo "Salir" apaga el servidor.
 */
export class KarbonTray {
  private readonly tray: Tray;

  constructor(
    iconPath: string,
    private readonly actions: { open: () => void; quit: () => void },
  ) {
    this.tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
    this.tray.setToolTip('Karbon POS');
    this.tray.on('click', actions.open);
  }

  update(status: ServerStatus): void {
    const address = status.waiterAppUrls[0];
    this.tray.setToolTip(`Karbon POS · ${STATE_LABEL[status.state]}`);
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Abrir Karbon POS', click: this.actions.open },
        { type: 'separator' },
        { label: STATE_LABEL[status.state], enabled: false },
        ...(status.message ? [{ label: status.message, enabled: false }] : []),
        {
          label: address
            ? `Copiar dirección para celulares (${address})`
            : 'Sin red local detectada',
          enabled: Boolean(address),
          click: () => {
            if (address) void clipboard.writeText(address);
          },
        },
        {
          label: 'Iniciar con Windows',
          type: 'checkbox',
          checked: app.getLoginItemSettings().openAtLogin,
          click: (item) => {
            app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] });
          },
        },
        { type: 'separator' },
        { label: 'Salir (apaga el servidor)', click: this.actions.quit },
      ]),
    );
  }

  showBalloon(content: string): void {
    if (process.platform === 'win32')
      this.tray.displayBalloon({ title: 'Karbon POS', content, iconType: 'info' });
  }
}
