import { describe, expect, it } from 'bun:test';
import type { DbClient } from '@splinty/db';
import { createProductGoal, listProductGoals, updateProductGoal } from './product-goals';

function makeRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('product-goals routes', () => {
  const adminAuth = { userId: 'user-1', orgId: 'org-1', role: 'admin' };
  const viewerAuth = { userId: 'user-2', orgId: 'org-1', role: 'viewer' };

  it('createProductGoal returns 201 with id and title', async () => {
    const dbMock = {
      insert: () => ({
        values: (input: any) => ({
          returning: async () => [
            {
              id: 'goal-1',
              ...input,
              approvalStatus: 'draft',
              version: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        }),
      }),
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
      query: {},
    } as never as DbClient;

    const response = await createProductGoal(
      makeRequest('http://localhost/api/product-goals', {
        title: 'MVP Auth',
        problemStatement: 'Need secure auth',
        targetUsers: 'All users',
        successMeasures: ['Login works'],
        businessConstraints: ['Use JWT'],
        nonGoals: ['OAuth'],
      }),
      'project-1',
      dbMock,
      adminAuth
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; title: string };
    expect(body.id).toBe('goal-1');
    expect(body.title).toBe('MVP Auth');
  });

  it('listProductGoals returns 200 with goals array', async () => {
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [
            { id: 'goal-1', title: 'MVP Auth', approvalStatus: 'draft' },
            { id: 'goal-2', title: 'Dashboard', approvalStatus: 'approved' },
          ],
        }),
      }),
    } as never as DbClient;

    const response = await listProductGoals(
      makeRequest('http://localhost/api/product-goals', {}),
      'project-1',
      dbMock,
      adminAuth
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { goals: Array<{ id: string; title: string }> };
    expect(body.goals).toHaveLength(2);
    expect(body.goals[0].id).toBe('goal-1');
  });

  it('updateProductGoal returns 200 with updated goal', async () => {
    const dbMock = {
      insert: () => ({
        values: () => ({
          returning: async () => [{ id: 'audit-1' }],
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [
              {
                id: 'goal-1',
                title: 'Updated MVP Auth',
                approvalStatus: 'approved',
                version: 2,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          }),
        }),
      }),
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    } as never as DbClient;

    const response = await updateProductGoal(
      makeRequest('http://localhost/api/product-goals/goal-1', {
        title: 'Updated MVP Auth',
        approvalStatus: 'approved',
      }),
      'goal-1',
      dbMock,
      adminAuth
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string; title: string; approvalStatus: string };
    expect(body.title).toBe('Updated MVP Auth');
    expect(body.approvalStatus).toBe('approved');
  });

  it('createProductGoal as VIEWER throws ForbiddenError', async () => {
    const dbMock = {} as never as DbClient;

    await expect(async () => {
      await createProductGoal(
        makeRequest('http://localhost/api/product-goals', {
          title: 'MVP Auth',
        }),
        'project-1',
        dbMock,
        viewerAuth
      );
    }).toThrow();
  });

  it('updateProductGoal as VIEWER throws ForbiddenError', async () => {
    const dbMock = {} as never as DbClient;

    await expect(async () => {
      await updateProductGoal(
        makeRequest('http://localhost/api/product-goals/goal-1', {
          title: 'Updated',
        }),
        'goal-1',
        dbMock,
        viewerAuth
      );
    }).toThrow();
  });

  it('listProductGoals as VIEWER returns 200', async () => {
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [{ id: 'goal-1', title: 'MVP Auth', approvalStatus: 'draft' }],
        }),
      }),
    } as never as DbClient;

    const response = await listProductGoals(
      makeRequest('http://localhost/api/product-goals', {}),
      'project-1',
      dbMock,
      viewerAuth
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { goals: Array<{ id: string }> };
    expect(body.goals).toHaveLength(1);
  });

  it('createProductGoal with empty title throws validation error', async () => {
    const dbMock = {} as never as DbClient;

    await expect(async () => {
      await createProductGoal(
        makeRequest('http://localhost/api/product-goals', {
          title: '',
        }),
        'project-1',
        dbMock,
        adminAuth
      );
    }).toThrow();
  });

  it('updateProductGoal with non-existent goal throws NotFoundError', async () => {
    const dbMock = {
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [],
          }),
        }),
      }),
      insert: () => ({
        values: () => ({
          returning: async () => [{ id: 'audit-1' }],
        }),
      }),
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    } as never as DbClient;

    await expect(async () => {
      await updateProductGoal(
        makeRequest('http://localhost/api/product-goals/goal-999', {
          title: 'Updated',
        }),
        'goal-999',
        dbMock,
        adminAuth
      );
    }).toThrow('Product goal not found');
  });

  it('createProductGoal sets approvalStatus to draft by default', async () => {
    const dbMock = {
      insert: () => ({
        values: (input: any) => ({
          returning: async () => [
            {
              id: 'goal-1',
              ...input,
              approvalStatus: 'draft',
              version: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        }),
      }),
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
      query: {},
    } as never as DbClient;

    const response = await createProductGoal(
      makeRequest('http://localhost/api/product-goals', {
        title: 'New Goal',
      }),
      'project-1',
      dbMock,
      adminAuth
    );

    const body = (await response.json()) as { approvalStatus: string };
    expect(body.approvalStatus).toBe('draft');
  });
});
