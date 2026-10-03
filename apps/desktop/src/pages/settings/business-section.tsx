import { queryKeys, useApi, useApiMutation, useHasPermission, useSettings } from '@karbon/client';
import {
  BusinessMode,
  type DayOfWeek,
  type OpeningHoursSlot,
  Permission,
  type RestaurantSettingsDto,
} from '@karbon/types';
import {
  Button,
  cn,
  Field,
  Input,
  notifyError,
  Select,
  Spinner,
  Switch,
  Textarea,
  toast,
} from '@karbon/ui';
import { getTerminology, SUPPORTED_CURRENCIES } from '@karbon/utils';
import { ChefHatIcon, ImageIcon, MartiniIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { imageFileToDataUrl } from '../../lib/images';
import { useAssetUrl } from '../../lib/runtime-context';
import { Section } from './section';

const TIMEZONES = [
  'America/Bogota',
  'America/Mexico_City',
  'America/Lima',
  'America/Guayaquil',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/Caracas',
  'America/Panama',
  'America/New_York',
  'Europe/Madrid',
] as const;
const LOCALES = ['es-CO', 'es-MX', 'es-PE', 'es-EC', 'es-CL', 'es-AR', 'es-ES', 'en-US'] as const;
const DAYS: { day: DayOfWeek; label: string }[] = [
  { day: 1, label: 'Lunes' },
  { day: 2, label: 'Martes' },
  { day: 3, label: 'Miércoles' },
  { day: 4, label: 'Jueves' },
  { day: 5, label: 'Viernes' },
  { day: 6, label: 'Sábado' },
  { day: 0, label: 'Domingo' },
];

function useSaveSettings(message = 'Configuración guardada') {
  const api = useApi();
  return useApiMutation(api.settings.update, [queryKeys.settings], {
    onSuccess: () => toast.success(message),
    onError: notifyError,
  });
}

export function BusinessSection() {
  const settings = useSettings().data;
  if (!settings) return <Spinner />;
  return (
    <div className="flex flex-col gap-5">
      <ModeSection settings={settings} />
      <IdentitySection settings={settings} />
      <HoursSection settings={settings} />
    </div>
  );
}

function ModeSection({ settings }: { settings: RestaurantSettingsDto }) {
  const canWrite = useHasPermission(Permission.SETTINGS_WRITE);
  const save = useSaveSettings('Modo actualizado en todas las terminales');
  const [pending, setPending] = useState<BusinessMode | null>(null);
  const options = [
    {
      mode: BusinessMode.RESTAURANT,
      icon: ChefHatIcon,
      description: 'Comandas a cocina y barra; mesas, meseros e inventario.',
    },
    {
      mode: BusinessMode.BAR,
      icon: MartiniIcon,
      description: 'Todo se prepara en la barra: la cocina se reemplaza por "Barra".',
    },
  ] as const;
  return (
    <Section
      title="Tipo de negocio"
      description="Meseros, mesas, caja, inventario y reportes funcionan igual en ambos modos."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const active = settings.businessMode === option.mode;
          return (
            <button
              key={option.mode}
              type="button"
              disabled={!canWrite || active}
              onClick={() => {
                setPending(option.mode);
              }}
              className={cn(
                'flex items-start gap-3 rounded-xl border-2 p-4 text-left transition',
                active ? 'border-primary bg-primary/10' : 'hover:bg-accent disabled:opacity-60',
              )}
            >
              <option.icon className="mt-0.5 size-6" />
              <span>
                <span className="block font-semibold">{getTerminology(option.mode).venue}</span>
                <span className="text-sm text-muted-foreground">{option.description}</span>
              </span>
            </button>
          );
        })}
      </div>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={`Cambiar a modo ${pending ? getTerminology(pending).venue.toLowerCase() : ''}`}
        description={
          pending === BusinessMode.BAR
            ? 'Las nuevas comandas irán a la barra y el rol "Cocina" pasará a llamarse "Barra". Las comandas en curso no se modifican.'
            : 'Las comandas volverán a separarse entre cocina y barra según cada producto.'
        }
        confirmLabel="Cambiar modo"
        onConfirm={() => save.mutateAsync({ businessMode: pending ?? settings.businessMode })}
      />
    </Section>
  );
}

function IdentitySection({ settings }: { settings: RestaurantSettingsDto }) {
  const api = useApi();
  const canWrite = useHasPermission(Permission.SETTINGS_WRITE);
  const assetUrl = useAssetUrl();
  const save = useSaveSettings();
  const [form, setForm] = useState({
    name: settings.name,
    legalName: settings.legalName ?? '',
    taxId: settings.taxId ?? '',
    address: settings.address ?? '',
    city: settings.city ?? '',
    phone: settings.phone ?? '',
    email: settings.email ?? '',
    currency: settings.currency,
    locale: settings.locale,
    timezone: settings.timezone,
    receiptHeader: settings.receiptHeader ?? '',
    receiptFooter: settings.receiptFooter ?? '',
  });
  const [pricesIncludeTax, setPricesIncludeTax] = useState(settings.pricesIncludeTax);
  const [tipEnabled, setTipEnabled] = useState(settings.tipEnabled);
  const [tipPercent, setTipPercent] = useState(String(settings.tipPercent));
  const [maxDiscount, setMaxDiscount] = useState(String(settings.maxDiscountPercent));
  const [warning, setWarning] = useState(String(settings.kdsWarningMinutes));
  const [critical, setCritical] = useState(String(settings.kdsCriticalMinutes));
  const [escalate, setEscalate] = useState(String(settings.staffCallEscalateSeconds));
  const set = (key: keyof typeof form, value: string): void => {
    setForm({ ...form, [key]: value });
  };
  const optional = (value: string): string | null => value.trim() || null;
  const logo = useApiMutation(
    (dataUrl: string) => api.settings.uploadLogo(dataUrl),
    [queryKeys.settings],
    {
      onSuccess: () => toast.success('Logo actualizado'),
      onError: notifyError,
    },
  );
  const text = (key: keyof typeof form, label: string, className?: string) => (
    <Field label={label} {...(className ? { className } : {})}>
      {(id) => (
        <Input
          id={id}
          value={form[key]}
          onChange={(event) => {
            set(key, event.target.value);
          }}
        />
      )}
    </Field>
  );
  const logoUrl = assetUrl(settings.logoUrl);

  return (
    <Section
      title="Datos del negocio"
      description="Aparecen en comprobantes, facturas y reportes."
      actions={
        canWrite ? (
          <Button
            disabled={save.isPending || form.name.trim().length < 2}
            onClick={() => {
              save.mutate({
                name: form.name.trim(),
                legalName: optional(form.legalName),
                taxId: optional(form.taxId),
                address: optional(form.address),
                city: optional(form.city),
                phone: optional(form.phone),
                email: optional(form.email),
                currency: form.currency,
                locale: form.locale,
                timezone: form.timezone,
                receiptHeader: optional(form.receiptHeader),
                receiptFooter: optional(form.receiptFooter),
                pricesIncludeTax,
                tipEnabled,
                tipPercent: Number(tipPercent) || 0,
                maxDiscountPercent: Math.min(100, Math.max(0, Number(maxDiscount) || 0)),
                kdsWarningMinutes: Number(warning) || 10,
                kdsCriticalMinutes: Number(critical) || 20,
                staffCallEscalateSeconds: Math.min(
                  600,
                  Math.max(0, Math.round(Number(escalate) || 0)),
                ),
              });
            }}
          >
            Guardar
          </Button>
        ) : null
      }
    >
      <fieldset disabled={!canWrite} className="grid gap-4 lg:grid-cols-[10rem_1fr]">
        <div className="flex flex-col items-center gap-2">
          <div className="grid size-36 place-items-center overflow-hidden rounded-2xl border bg-muted">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="size-full object-contain" />
            ) : (
              <ImageIcon className="size-8 text-muted-foreground" />
            )}
          </div>
          <Button asChild variant="outline" size="sm">
            <label className="cursor-pointer">
              Cambiar logo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file)
                    void imageFileToDataUrl(file).then((dataUrl) => {
                      logo.mutate(dataUrl);
                    }, notifyError);
                }}
              />
            </label>
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {text('name', 'Nombre comercial')}
          {text('legalName', 'Razón social')}
          {text('taxId', 'NIT')}
          {text('address', 'Dirección')}
          {text('city', 'Ciudad')}
          {text('phone', 'Teléfono')}
          {text('email', 'Correo')}
          <Field label="Moneda">
            {(id) => (
              <Select
                id={id}
                value={form.currency}
                onChange={(event) => {
                  set('currency', event.target.value);
                }}
              >
                {SUPPORTED_CURRENCIES.map((currency) => (
                  <option key={currency}>{currency}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Idioma / formato">
            {(id) => (
              <Select
                id={id}
                value={form.locale}
                onChange={(event) => {
                  set('locale', event.target.value);
                }}
              >
                {LOCALES.map((locale) => (
                  <option key={locale}>{locale}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Zona horaria">
            {(id) => (
              <Select
                id={id}
                value={form.timezone}
                onChange={(event) => {
                  set('timezone', event.target.value);
                }}
              >
                {[...new Set([form.timezone, ...TIMEZONES])].map((zone) => (
                  <option key={zone}>{zone}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Encabezado del comprobante" className="col-span-2 lg:col-span-3">
            {(id) => (
              <Textarea
                id={id}
                value={form.receiptHeader}
                onChange={(event) => {
                  set('receiptHeader', event.target.value);
                }}
              />
            )}
          </Field>
          <Field
            label="Pie del comprobante"
            className="col-span-2 lg:col-span-3"
            hint="Ej. resolución de facturación, redes sociales, mensaje de agradecimiento"
          >
            {(id) => (
              <Textarea
                id={id}
                value={form.receiptFooter}
                onChange={(event) => {
                  set('receiptFooter', event.target.value);
                }}
              />
            )}
          </Field>
        </div>
      </fieldset>
      <fieldset
        disabled={!canWrite}
        className="grid items-start gap-4 border-t pt-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <Switch
          checked={pricesIncludeTax}
          onCheckedChange={setPricesIncludeTax}
          label="Los precios incluyen impuestos"
        />
        <div className="flex items-end gap-3">
          <Switch checked={tipEnabled} onCheckedChange={setTipEnabled} label="Propina sugerida" />
          <Field label="%" className="w-20">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={0}
                max={100}
                value={tipPercent}
                disabled={!tipEnabled}
                onChange={(event) => {
                  setTipPercent(event.target.value);
                }}
              />
            )}
          </Field>
        </div>
        <Field
          label="Descuento máximo (%)"
          hint="Tope para caja (por producto y al pedido). 100 = sin límite."
        >
          {(id) => (
            <Input
              id={id}
              type="number"
              min={0}
              max={100}
              className="w-24"
              value={maxDiscount}
              onChange={(event) => {
                setMaxDiscount(event.target.value);
              }}
            />
          )}
        </Field>
        <div className="flex gap-3">
          <Field label="KDS amarillo (min)">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={1}
                value={warning}
                onChange={(event) => {
                  setWarning(event.target.value);
                }}
              />
            )}
          </Field>
          <Field label="KDS rojo (min)">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={2}
                value={critical}
                onChange={(event) => {
                  setCritical(event.target.value);
                }}
              />
            )}
          </Field>
        </div>
        <Field
          label="Llamado sin respuesta (s)"
          hint="Si el mesero elegido no responde, pasa a todos. 0 = nunca."
        >
          {(id) => (
            <Input
              id={id}
              type="number"
              min={0}
              max={600}
              step={15}
              className="w-24"
              value={escalate}
              onChange={(event) => {
                setEscalate(event.target.value);
              }}
            />
          )}
        </Field>
      </fieldset>
    </Section>
  );
}

function HoursSection({ settings }: { settings: RestaurantSettingsDto }) {
  const canWrite = useHasPermission(Permission.SETTINGS_WRITE);
  const save = useSaveSettings('Horario guardado');
  const [slots, setSlots] = useState<OpeningHoursSlot[]>(settings.openingHours);
  const update = (index: number, patch: Partial<OpeningHoursSlot>): void => {
    setSlots(slots.map((slot, position) => (position === index ? { ...slot, ...patch } : slot)));
  };
  return (
    <Section
      title="Horario de atención"
      description="Una franja puede cruzar la medianoche (p. ej. 18:00 a 02:00)."
      actions={
        canWrite ? (
          <Button
            disabled={save.isPending}
            onClick={() => {
              save.mutate({ openingHours: slots });
            }}
          >
            Guardar horario
          </Button>
        ) : null
      }
    >
      <fieldset disabled={!canWrite} className="flex flex-col gap-2">
        {DAYS.map(({ day, label }) => {
          const daySlots = slots
            .map((slot, index) => ({ slot, index }))
            .filter((entry) => entry.slot.day === day);
          return (
            <div
              key={day}
              className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 border-b pb-2 last:border-0"
            >
              <span className="text-sm font-medium">{label}</span>
              <div className="flex flex-wrap gap-3">
                {daySlots.length === 0 ? (
                  <span className="text-sm text-muted-foreground">Cerrado</span>
                ) : null}
                {daySlots.map(({ slot, index }) => (
                  <span key={index} className="flex items-center gap-1">
                    <Input
                      type="time"
                      aria-label="Abre"
                      className="w-32"
                      value={slot.opensAt}
                      onChange={(event) => {
                        update(index, { opensAt: event.target.value });
                      }}
                    />
                    –
                    <Input
                      type="time"
                      aria-label="Cierra"
                      className="w-32"
                      value={slot.closesAt}
                      onChange={(event) => {
                        update(index, { closesAt: event.target.value });
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Quitar franja"
                      onClick={() => {
                        setSlots(slots.filter((_, position) => position !== index));
                      }}
                    >
                      <Trash2Icon />
                    </Button>
                  </span>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSlots([...slots, { day, opensAt: '12:00', closesAt: '22:00' }]);
                }}
              >
                <PlusIcon /> Franja
              </Button>
            </div>
          );
        })}
      </fieldset>
    </Section>
  );
}
