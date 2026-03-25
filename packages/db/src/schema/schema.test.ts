import { describe, expect, it } from 'bun:test';
import { getTableName } from 'drizzle-orm';
import {
  organizations,
  users,
  projects,
  epics,
  stories,
  sprints,
  sprintTelemetry,
  storyMetrics,
  velocitySnapshots,
  auditLog,
  webhooks,
} from './index';

describe('db schema table exports', () => {
  it('exports all required table names', () => {
    expect(getTableName(organizations)).toBe('organizations');
    expect(getTableName(users)).toBe('users');
    expect(getTableName(projects)).toBe('projects');
    expect(getTableName(epics)).toBe('epics');
    expect(getTableName(stories)).toBe('stories');
    expect(getTableName(sprints)).toBe('sprints');
    expect(getTableName(sprintTelemetry)).toBe('sprint_telemetry');
    expect(getTableName(storyMetrics)).toBe('story_metrics');
    expect(getTableName(velocitySnapshots)).toBe('velocity_snapshots');
    expect(getTableName(auditLog)).toBe('audit_log');
    expect(getTableName(webhooks)).toBe('webhooks');
  });
});

describe('stories schema superset requirements', () => {
  it('contains StorySchema columns plus platform columns', () => {
    const storyColumns = Object.keys(stories);
    const requiredColumns = [
      'id',
      'title',
      'description',
      'acceptanceCriteria',
      'state',
      'source',
      'sourceId',
      'storyPoints',
      'domain',
      'tags',
      'dependsOn',
      'workspacePath',
      'createdAt',
      'updatedAt',
      'epicId',
      'orgId',
      'projectId',
      'assignedTo',
      'sprintId',
    ];

    for (const key of requiredColumns) {
      expect(storyColumns).toContain(key);
    }
  });
});

describe('audit log append-only design', () => {
  it('has createdAt but no updatedAt', () => {
    const auditColumns = Object.keys(auditLog);
    expect(auditColumns).toContain('createdAt');
    expect(auditColumns).not.toContain('updatedAt');
  });
});
