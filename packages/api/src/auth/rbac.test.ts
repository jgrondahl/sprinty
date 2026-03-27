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

  it('ADMIN has all 19 permissions', () => {
    const adminPerms = permissionMatrix[Role.ADMIN];
    expect(adminPerms).toHaveLength(19);
  });

  it('MEMBER has exactly 15 permissions', () => {
    const memberPerms = permissionMatrix[Role.MEMBER];
    expect(memberPerms).toHaveLength(15);
  });

  it('VIEWER has exactly 8 permissions', () => {
    const viewerPerms = permissionMatrix[Role.VIEWER];
    expect(viewerPerms).toHaveLength(8);
  });

  it('SERVICE_ACCOUNT has exactly 15 permissions', () => {
    const serviceAccountPerms = permissionMatrix[Role.SERVICE_ACCOUNT];
    expect(serviceAccountPerms).toHaveLength(15);
  });

  it('MEMBER has new product goal permissions', () => {
    const memberPerms = new Set(permissionMatrix[Role.MEMBER]);
    expect(memberPerms.has(Permission.PRODUCT_GOAL_READ)).toBe(true);
    expect(memberPerms.has(Permission.PRODUCT_GOAL_WRITE)).toBe(true);
  });

  it('MEMBER has new delivery record permissions', () => {
    const memberPerms = new Set(permissionMatrix[Role.MEMBER]);
    expect(memberPerms.has(Permission.DELIVERY_RECORD_READ)).toBe(true);
    expect(memberPerms.has(Permission.DELIVERY_RECORD_WRITE)).toBe(true);
  });

  it('MEMBER has new artifact version permissions', () => {
    const memberPerms = new Set(permissionMatrix[Role.MEMBER]);
    expect(memberPerms.has(Permission.ARTIFACT_VERSION_READ)).toBe(true);
    expect(memberPerms.has(Permission.ARTIFACT_VERSION_WRITE)).toBe(true);
  });

  it('VIEWER has new read-only permissions', () => {
    const viewerPerms = new Set(permissionMatrix[Role.VIEWER]);
    expect(viewerPerms.has(Permission.PRODUCT_GOAL_READ)).toBe(true);
    expect(viewerPerms.has(Permission.DELIVERY_RECORD_READ)).toBe(true);
    expect(viewerPerms.has(Permission.ARTIFACT_VERSION_READ)).toBe(true);
  });

  it('VIEWER does NOT have write permissions', () => {
    const viewerPerms = new Set(permissionMatrix[Role.VIEWER]);
    expect(viewerPerms.has(Permission.PRODUCT_GOAL_WRITE)).toBe(false);
    expect(viewerPerms.has(Permission.DELIVERY_RECORD_WRITE)).toBe(false);
    expect(viewerPerms.has(Permission.ARTIFACT_VERSION_WRITE)).toBe(false);
  });

  it('SERVICE_ACCOUNT has all new permissions', () => {
    const serviceAccountPerms = new Set(permissionMatrix[Role.SERVICE_ACCOUNT]);
    expect(serviceAccountPerms.has(Permission.PRODUCT_GOAL_READ)).toBe(true);
    expect(serviceAccountPerms.has(Permission.PRODUCT_GOAL_WRITE)).toBe(true);
    expect(serviceAccountPerms.has(Permission.DELIVERY_RECORD_READ)).toBe(true);
    expect(serviceAccountPerms.has(Permission.DELIVERY_RECORD_WRITE)).toBe(true);
    expect(serviceAccountPerms.has(Permission.ARTIFACT_VERSION_READ)).toBe(true);
    expect(serviceAccountPerms.has(Permission.ARTIFACT_VERSION_WRITE)).toBe(true);
  });

  it('requirePermission throws for viewer without PRODUCT_GOAL_WRITE', () => {
    const context = { userId: 'test', orgId: 'test', role: 'viewer' };
    expect(() => requirePermission(context, Permission.PRODUCT_GOAL_WRITE)).toThrow(ForbiddenError);
  });

  it('requirePermission does NOT throw for member with PRODUCT_GOAL_WRITE', () => {
    const context = { userId: 'test', orgId: 'test', role: 'member' };
    expect(() => requirePermission(context, Permission.PRODUCT_GOAL_WRITE)).not.toThrow();
  });
});
