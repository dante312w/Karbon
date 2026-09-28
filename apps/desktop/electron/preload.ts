import { contextBridge, ipcRenderer } from 'electron';
import {
  type DesktopAppInfo,
  type DesktopBridge,
  IpcChannel,
  type SystemPrinter,
} from '../shared/bridge';

const bridge: DesktopBridge = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannel.APP_INFO) as Promise<DesktopAppInfo>,
  listPrinters: () => ipcRenderer.invoke(IpcChannel.LIST_PRINTERS) as Promise<SystemPrinter[]>,
  printHtml: (request) => ipcRenderer.invoke(IpcChannel.PRINT_HTML, request) as Promise<void>,
  savePdf: (request) => ipcRenderer.invoke(IpcChannel.SAVE_PDF, request) as Promise<string | null>,
  setAutoStart: (enabled) =>
    ipcRenderer.invoke(IpcChannel.SET_AUTO_START, enabled) as Promise<boolean>,
};

contextBridge.exposeInMainWorld('karbon', bridge);
