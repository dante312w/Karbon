import { ALL_PERMISSIONS } from '@karbon/types';
import { describe, expect, it } from 'vitest';
import { PERMISSION_GROUPS } from './permission-labels';

describe('PERMISSION_GROUPS', () => {
  it('describe cada permiso exactamente una vez', () => {
    const listed = PERMISSION_GROUPS.flatMap((group) =>
      group.permissions.map((entry) => entry.permission),
    );
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });
});
