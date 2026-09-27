import { queryKeys, useApi } from '@karbon/client';
import { Badge, Button, Spinner } from '@karbon/ui';
import { useQuery } from '@tanstack/react-query';
import {
  DownloadIcon,
  type LucideIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  TabletIcon,
} from 'lucide-react';
import { QrCode } from '../../components/qr-code';
import { useRuntime } from '../../lib/runtime-context';
import { Section } from './section';

/** Ruta pública del certificado de la CA local (para instalarlo en los celulares). */
export const CA_CERTIFICATE_PATH = '/api/v1/system/ca.crt';

/**
 * Cómo conectar celulares y tablets: los meseros escanean el QR y abren la app (PWA); el KDS
 * de cocina/barra se abre en una tablet con el mismo servidor.
 */
export function ConnectionSection() {
  const api = useApi();
  const { apiBaseUrl } = useRuntime();
  const info = useQuery({ queryKey: [...queryKeys.system, 'info'], queryFn: api.system.info });
  const certificate = useQuery({
    queryKey: [...queryKeys.system, 'certificate'],
    queryFn: api.system.certificate,
    retry: false,
  });
  const lanUrls = info.data?.lanUrls ?? [];

  return (
    <div className="flex flex-col gap-5">
      <Section
        title="Conectar celulares de meseros"
        description="El celular debe estar en la misma red WiFi que este equipo. Escanea el código con la cámara y agrega la app a la pantalla de inicio."
      >
        {info.isPending ? <Spinner /> : null}
        {info.data && lanUrls.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No se detectó una red local. Conecta este equipo al WiFi o a la red del local.
          </p>
        ) : null}
        {info.data && lanUrls.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2">
            <AppAddress
              icon={SmartphoneIcon}
              title="App de meseros"
              urls={info.data.waiterAppUrls}
            />
            <AppAddress
              icon={TabletIcon}
              title="Tablero de cocina / barra (tablet)"
              urls={info.data.kdsUrls}
            />
          </div>
        ) : null}
      </Section>

      <Section
        title="Conexión segura (HTTPS)"
        description="Con HTTPS los celulares pueden instalar la app, recibir avisos y guardar pedidos sin conexión. Requiere instalar una vez el certificado del local."
      >
        {certificate.data?.httpsEnabled ? (
          <div className="flex flex-col gap-3">
            <Badge className="w-fit">
              <ShieldCheckIcon className="size-3" /> HTTPS activo
            </Badge>
            {certificate.data.caFingerprint ? (
              <p className="text-xs break-all text-muted-foreground">
                Huella SHA-256 de la CA: {certificate.data.caFingerprint}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-4">
              <QrCode
                value={`${info.data?.lanUrls[0] ?? ''}${CA_CERTIFICATE_PATH}`}
                size={140}
                label="Código QR del certificado"
              />
              <div className="flex flex-col gap-2 text-sm">
                <p>1. Escanea este código desde el celular y descarga el certificado.</p>
                <p>
                  2. Android: Ajustes → Seguridad → Instalar certificado CA. iPhone: Ajustes →
                  Perfil descargado → Instalar, y actívalo en Información → Confianza de
                  certificados.
                </p>
                <Button asChild variant="outline" size="sm" className="w-fit">
                  <a href={`${apiBaseUrl}${CA_CERTIFICATE_PATH}`} download="karbon-ca.crt">
                    <DownloadIcon /> Descargar certificado
                  </a>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            El servidor atiende por HTTP. La app de meseros funciona igual (con cola sin conexión);
            para instalarla como app se recomienda HTTPS.
          </p>
        )}
      </Section>
    </div>
  );
}

/** QR y dirección de una app para abrir desde otro equipo de la red. */
function AppAddress({
  icon: Icon,
  title,
  urls,
}: {
  icon: LucideIcon;
  title: string;
  urls: string[];
}) {
  const [primary, ...others] = urls;
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border p-4 text-center">
      <Icon className="size-5 text-muted-foreground" />
      <span className="font-semibold">{title}</span>
      {primary ? (
        <>
          <QrCode value={primary} label={`Código QR: ${title}`} />
          <code className="text-sm break-all">{primary}</code>
          {others.length > 0 ? (
            <p className="text-xs text-muted-foreground">También: {others.join(' · ')}</p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Este servidor no publica esta app en la red. En el programa instalado aparece aquí; en
          desarrollo, define DEV_MOBILE_PORT y DEV_DESKTOP_PORT en apps/backend/.env.
        </p>
      )}
    </div>
  );
}
