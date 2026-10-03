import { queryKeys, useApi, useApiMutation, useHasPermission, useSession } from '@karbon/client';
import {
  type Permission,
  Permission as P,
  PIN_MAX_LENGTH,
  PIN_PATTERN,
  ROLE_CODE_PATTERN,
  type RoleDto,
  type UserDto,
} from '@karbon/types';
import {
  Badge,
  Button,
  type Column,
  DataTable,
  Dialog,
  DialogContent,
  Field,
  Input,
  notifyError,
  PERMISSION_GROUPS,
  Select,
  Switch,
  Textarea,
  toast,
} from '@karbon/ui';
import { useQuery } from '@tanstack/react-query';
import { KeyRoundIcon, PencilIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { formatDateTime } from '../../lib/format';
import { Section } from './section';

export function UsersSection() {
  const api = useApi();
  const canWrite = useHasPermission(P.USERS_WRITE);
  const canRoles = useHasPermission(P.ROLES_READ);
  const users = useQuery({ queryKey: queryKeys.users, queryFn: api.users.list });
  const roles = useQuery({
    queryKey: queryKeys.roles,
    queryFn: api.users.roles,
    enabled: canRoles || canWrite,
  });
  const [editingUser, setEditingUser] = useState<{ user: UserDto | null } | null>(null);
  const [editingRole, setEditingRole] = useState<{ role: RoleDto | null } | null>(null);

  const userColumns: Column<UserDto>[] = [
    {
      key: 'name',
      header: 'Usuario',
      cell: (user) => (
        <span className="flex flex-col">
          <span className="font-medium">{user.name}</span>
          <span className="text-xs text-muted-foreground">@{user.username}</span>
        </span>
      ),
    },
    { key: 'role', header: 'Rol', cell: (user) => user.role.name },
    {
      key: 'pin',
      header: 'PIN',
      cell: (user) =>
        user.hasPin ? <KeyRoundIcon className="size-4" aria-label="Tiene PIN" /> : '—',
    },
    {
      key: 'last',
      header: 'Último ingreso',
      cell: (user) => (user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Nunca'),
    },
    {
      key: 'status',
      header: '',
      cell: (user) => (user.isActive ? null : <Badge variant="outline">Inactivo</Badge>),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (user) =>
        canWrite ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Editar"
            onClick={() => {
              setEditingUser({ user });
            }}
          >
            <PencilIcon />
          </Button>
        ) : null,
    },
  ];
  const roleColumns: Column<RoleDto>[] = [
    {
      key: 'name',
      header: 'Rol',
      cell: (role) => <span className="font-medium">{role.name}</span>,
    },
    { key: 'description', header: 'Descripción', cell: (role) => role.description ?? '' },
    {
      key: 'permissions',
      header: 'Permisos',
      align: 'right',
      cell: (role) => role.permissions.length,
    },
    {
      key: 'system',
      header: '',
      cell: (role) => (role.isSystem ? <Badge variant="secondary">Sistema</Badge> : null),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (role) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label="Ver o editar"
          onClick={() => {
            setEditingRole({ role });
          }}
        >
          <PencilIcon />
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Section
        title="Usuarios"
        description="Cada persona entra con su usuario o con PIN; todo queda auditado a su nombre."
        actions={
          canWrite ? (
            <Button
              variant="outline"
              onClick={() => {
                setEditingUser({ user: null });
              }}
            >
              <PlusIcon /> Nuevo usuario
            </Button>
          ) : null
        }
      >
        <DataTable
          columns={userColumns}
          rows={users.data ?? []}
          rowKey={(user) => user.id}
          rowClassName={(user) => (user.isActive ? undefined : 'opacity-60')}
        />
      </Section>
      {canRoles ? (
        <Section
          title="Roles y permisos"
          description="Los roles de sistema (Administrador, Caja, Mesero, Cocina/Barra) tienen permisos fijos; crea roles propios para ajustar permisos."
          actions={
            <Button
              variant="outline"
              onClick={() => {
                setEditingRole({ role: null });
              }}
            >
              <PlusIcon /> Nuevo rol
            </Button>
          }
        >
          <DataTable columns={roleColumns} rows={roles.data ?? []} rowKey={(role) => role.id} />
        </Section>
      ) : null}
      {editingUser ? (
        <UserDialog
          user={editingUser.user}
          roles={roles.data ?? []}
          onClose={() => {
            setEditingUser(null);
          }}
        />
      ) : null}
      {editingRole ? (
        <RoleDialog
          role={editingRole.role}
          onClose={() => {
            setEditingRole(null);
          }}
        />
      ) : null}
    </div>
  );
}

function UserDialog({
  user,
  roles,
  onClose,
}: {
  user: UserDto | null;
  roles: RoleDto[];
  onClose: () => void;
}) {
  const api = useApi();
  const session = useSession();
  const [name, setName] = useState(user?.name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [roleId, setRoleId] = useState(
    user?.role.id ?? roles.find((role) => role.code === 'WAITER')?.id ?? '',
  );
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [removePin, setRemovePin] = useState(false);
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const isSelf = user?.id === session?.user.id;

  const passwordInvalid = user ? password.length > 0 && password.length < 8 : password.length < 8;
  const pinInvalid = pin.length > 0 && !PIN_PATTERN.test(pin);
  const save = useApiMutation(
    () => {
      if (user) {
        return api.users.update(user.id, {
          name: name.trim(),
          email: email.trim() || null,
          roleId,
          isActive,
          ...(password ? { password } : {}),
          ...(removePin ? { pin: null } : pin ? { pin } : {}),
        });
      }
      return api.users.create({
        name: name.trim(),
        username: username.trim(),
        email: email.trim() || null,
        password,
        roleId,
        pin: pin || null,
      });
    },
    [queryKeys.users, queryKeys.pinUsers],
    {
      onSuccess: () => {
        toast.success('Usuario guardado');
        onClose();
      },
      onError: notifyError,
    },
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title={user ? `Editar ${user.name}` : 'Nuevo usuario'}
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={
                name.trim().length < 2 ||
                (!user && username.trim().length < 3) ||
                !roleId ||
                passwordInvalid ||
                pinInvalid ||
                save.isPending
              }
              onClick={() => {
                save.mutate(undefined);
              }}
            >
              Guardar
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre" className="col-span-2">
            {(id) => (
              <Input
                id={id}
                autoFocus
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            )}
          </Field>
          <Field
            label="Usuario"
            hint={user ? 'No se puede cambiar' : 'Para ingresar con contraseña'}
          >
            {(id) => (
              <Input
                id={id}
                value={username}
                disabled={user !== null}
                autoComplete="off"
                onChange={(event) => {
                  setUsername(event.target.value.toLowerCase());
                }}
              />
            )}
          </Field>
          <Field label="Rol">
            {(id) => (
              <Select
                id={id}
                value={roleId}
                disabled={isSelf}
                onChange={(event) => {
                  setRoleId(event.target.value);
                }}
              >
                <option value="">Selecciona…</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Correo (opcional)" className="col-span-2">
            {(id) => (
              <Input
                id={id}
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
              />
            )}
          </Field>
          <Field
            label={user ? 'Nueva contraseña' : 'Contraseña'}
            hint="Mínimo 8 caracteres"
            {...(passwordInvalid && password ? { error: 'Muy corta' } : {})}
          >
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
              />
            )}
          </Field>
          <Field
            label={user?.hasPin ? 'Nuevo PIN' : 'PIN (opcional)'}
            hint="4 a 6 dígitos para ingreso rápido"
            {...(pinInvalid ? { error: 'Solo 4 a 6 dígitos' } : {})}
          >
            {(id) => (
              <Input
                id={id}
                inputMode="numeric"
                autoComplete="off"
                maxLength={PIN_MAX_LENGTH}
                value={pin}
                disabled={removePin}
                onChange={(event) => {
                  setPin(event.target.value.replace(/\D/g, ''));
                }}
              />
            )}
          </Field>
        </div>
        {user?.hasPin ? (
          <Switch checked={removePin} onCheckedChange={setRemovePin} label="Quitar el PIN" />
        ) : null}
        {user && !isSelf ? (
          <Switch
            checked={isActive}
            onCheckedChange={setIsActive}
            label="Activo (puede ingresar)"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RoleDialog({ role, onClose }: { role: RoleDto | null; onClose: () => void }) {
  const api = useApi();
  const canWrite = useHasPermission(P.ROLES_WRITE);
  const [code, setCode] = useState(role?.code ?? '');
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [permissions, setPermissions] = useState<Permission[]>(role?.permissions ?? []);
  // Los roles de sistema los define el código (el seed los resincroniza): solo se consultan.
  const locked = !canWrite || role?.isSystem === true;
  const save = useApiMutation(
    () =>
      role
        ? api.users.updateRole(role.id, {
            name: name.trim(),
            description: description.trim() || null,
            permissions,
          })
        : api.users.createRole({
            code: code.trim().toUpperCase(),
            name: name.trim(),
            description: description.trim() || null,
            permissions,
          }),
    [queryKeys.roles, queryKeys.users],
    {
      onSuccess: () => {
        toast.success('Rol guardado. Los cambios aplican en el próximo ingreso de cada usuario.');
        onClose();
      },
      onError: notifyError,
    },
  );
  const toggle = (permission: Permission): void => {
    setPermissions(
      permissions.includes(permission)
        ? permissions.filter((candidate) => candidate !== permission)
        : [...permissions, permission],
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="w-[min(96vw,52rem)]"
        title={role ? role.name : 'Nuevo rol'}
        {...(role?.isSystem
          ? {
              description:
                'Rol de sistema: sus permisos son fijos. Crea un rol propio para ajustarlos.',
            }
          : {})}
        footer={
          locked ? null : (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                disabled={
                  name.trim().length < 2 ||
                  (!role && !ROLE_CODE_PATTERN.test(code.trim().toUpperCase())) ||
                  save.isPending
                }
                onClick={() => {
                  save.mutate(undefined);
                }}
              >
                Guardar
              </Button>
            </>
          )
        }
      >
        <fieldset disabled={locked} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            {role ? null : (
              <Field label="Código" hint="Mayúsculas, números y guion bajo, p. ej. SUPERVISOR">
                {(id) => (
                  <Input
                    id={id}
                    value={code}
                    onChange={(event) => {
                      setCode(event.target.value);
                    }}
                  />
                )}
              </Field>
            )}
            <Field label="Nombre">
              {(id) => (
                <Input
                  id={id}
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                  }}
                />
              )}
            </Field>
            <Field label="Descripción" className="col-span-2">
              {(id) => (
                <Textarea
                  id={id}
                  className="min-h-12"
                  value={description}
                  onChange={(event) => {
                    setDescription(event.target.value);
                  }}
                />
              )}
            </Field>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.title} className="flex flex-col gap-1.5 rounded-lg border p-3">
                <span className="text-sm font-semibold">{group.title}</span>
                {group.permissions.map((entry) => (
                  <label key={entry.permission} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={permissions.includes(entry.permission)}
                      onChange={() => {
                        toggle(entry.permission);
                      }}
                    />
                    {entry.label}
                  </label>
                ))}
              </div>
            ))}
          </div>
        </fieldset>
      </DialogContent>
    </Dialog>
  );
}
