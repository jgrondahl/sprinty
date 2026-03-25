import { describe, expect, it } from 'bun:test';
import { ForbiddenError } from '../middleware/error-handler';
import { Permission, Role, permissionMatrix, requirePermission, requireRole } from './rbac';

describe('rbac', () => {
  it('admin has all permissions', () => {
    const admin = { userId: 'u1', orgId: 'o1', role: Role.ADMIN };
    expect(permissionMatrix[Role.ADMIN].length).toBe(Object.values(Permission).length);
    expect(() => requirePermission(admin, Permission.USER_MANAGE, Permission.ORG_MANAGE)).not.toThrow();
  });

  it('viewer is read-only', () => {
    const viewer = { userId: 'u1', orgId: 'o1', role: Role.VIEWER };
    expect(() => requirePermission(viewer, Permission.PROJECT_READ)).not.toThrow();
    expect(() => requirePermission(viewer, Permission.PROJECT_WRITE)).toThrow(ForbiddenError);
  });

  it('service account cannot manage users', () => {
    const svc = { userId: 'u1', orgId: 'o1', role: Role.SERVICE_ACCOUNT };
    expect(() => requirePermission(svc, Permission.USER_MANAGE)).toThrow(ForbiddenError);
  });

  it('requireRole enforces specific roles', () => {
    const member = { userId: 'u1', orgId: 'o1', role: Role.MEMBER };
    expect(() => requireRole(member, Role.ADMIN)).toThrow(ForbiddenError);
    expect(() => requireRole(member, Role.ADMIN, Role.MEMBER)).not.toThrow();
  });
});
