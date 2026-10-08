import { createContext, useContext } from 'react';
import type { PwaMode } from '../pwa';

export const PwaModeContext = createContext<PwaMode>('insecure');

export function usePwaMode(): PwaMode {
  return useContext(PwaModeContext);
}
