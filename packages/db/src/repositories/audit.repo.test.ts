import { describe, expect, it } from 'bun:test';
import { AuditRepository } from './audit.repo';

describe('AuditRepository API surface', () => {
  it('exposes append/list methods only for mutation safety', () => {
    const repo = new AuditRepository({} as never);
    expect(typeof repo.append).toBe('function');
    expect(typeof repo.listByEntity).toBe('function');
    expect(typeof repo.listByOrg).toBe('function');
    expect('update' in repo).toBe(false);
    expect('delete' in repo).toBe(false);
  });
});
