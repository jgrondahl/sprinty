import { ForbiddenError } from '../middleware/error-handler';
import type { AuthContext } from './middleware';

export enum Role {
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
  SERVICE_ACCOUNT = 'service-account',
}

export enum Permission {
  PROJECT_READ = 'PROJECT_READ',
  PROJECT_WRITE = 'PROJECT_WRITE',
  EPIC_READ = 'EPIC_READ',
  EPIC_WRITE = 'EPIC_WRITE',
  STORY_READ = 'STORY_READ',
  STORY_WRITE = 'STORY_WRITE',
  SPRINT_READ = 'SPRINT_READ',
  SPRINT_WRITE = 'SPRINT_WRITE',
  SPRINT_EXECUTE = 'SPRINT_EXECUTE',
  USER_MANAGE = 'USER_MANAGE',
  ORG_MANAGE = 'ORG_MANAGE',
  AUDIT_READ = 'AUDIT_READ',
  WEBHOOK_MANAGE = 'WEBHOOK_MANAGE',
}

const allPermissions = Object.values(Permission);

export const permissionMatrix: Record<Role, Permission[]> = {
  [Role.ADMIN]: allPermissions,
  [Role.MEMBER]: [
    Permission.PROJECT_READ,
    Permission.PROJECT_WRITE,
    Permission.EPIC_READ,
    Permission.EPIC_WRITE,
    Permission.STORY_READ,
    Permission.STORY_WRITE,
    Permission.SPRINT_READ,
    Permission.SPRINT_WRITE,
    Permission.SPRINT_EXECUTE,
  ],
  [Role.VIEWER]: [
    Permission.PROJECT_READ,
    Permission.EPIC_READ,
    Permission.STORY_READ,
    Permission.SPRINT_READ,
    Permission.AUDIT_READ,
  ],
  [Role.SERVICE_ACCOUNT]: [
    Permission.PROJECT_READ,
    Permission.EPIC_READ,
    Permission.EPIC_WRITE,
    Permission.STORY_READ,
    Permission.STORY_WRITE,
    Permission.SPRINT_READ,
    Permission.SPRINT_WRITE,
    Permission.SPRINT_EXECUTE,
    Permission.WEBHOOK_MANAGE,
  ],
};

function normalizeRole(role: string): Role {
  const value = role.toLowerCase();
  if (value === Role.ADMIN) return Role.ADMIN;
  if (value === Role.MEMBER) return Role.MEMBER;
  if (value === Role.VIEWER) return Role.VIEWER;
  if (value === Role.SERVICE_ACCOUNT) return Role.SERVICE_ACCOUNT;
  throw new ForbiddenError('Unknown role', 'UNKNOWN_ROLE');
}

export function requirePermission(context: AuthContext, ...permissions: Permission[]): void {
  const role = normalizeRole(context.role);
  const granted = new Set(permissionMatrix[role]);

  for (const permission of permissions) {
    if (!granted.has(permission)) {
      throw new ForbiddenError('Insufficient permissions');
    }
  }
}

export function requireRole(context: AuthContext, ...roles: Role[]): void {
  const role = normalizeRole(context.role);
  if (!roles.includes(role)) {
    throw new ForbiddenError('Insufficient role');
  }
}
