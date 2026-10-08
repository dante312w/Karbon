import { toDataURL } from 'qrcode';
import { useEffect, useState } from 'react';

/** Código QR generado localmente (sin servicios externos) para abrir una URL desde el celular. */
export function QrCode({
  value,
  size = 180,
  label,
}: {
  value: string;
  size?: number;
  label: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    toDataURL(value, { margin: 1, width: size, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl(null);
      });
    return () => {
      active = false;
    };
  }, [value, size]);
  return dataUrl ? (
    <img src={dataUrl} alt={label} width={size} height={size} className="rounded-lg bg-white p-1" />
  ) : (
    <div style={{ width: size, height: size }} className="animate-pulse rounded-lg bg-muted" />
  );
}
