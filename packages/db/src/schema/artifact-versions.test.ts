import { describe, expect, it } from 'bun:test';
import { getTableName } from 'drizzle-orm';
import {
  artifactTypeEnum,
  artifactVersions,
  artifactEvaluations,
  relationshipTypeEnum,
  artifactLineage,
  promotionStageEnum,
  gateDefinitions,
  stageTransitions,
} from './index';

describe('artifact model schema', () => {
  it('exports artifact model table names', () => {
    expect(getTableName(artifactVersions)).toBe('artifact_versions');
    expect(getTableName(artifactEvaluations)).toBe('artifact_evaluations');
    expect(getTableName(artifactLineage)).toBe('artifact_lineage');
  });

  it('artifact_versions has required columns', () => {
    const cols = Object.keys(artifactVersions);
    expect(cols).toContain('id');
    expect(cols).toContain('artifactType');
    expect(cols).toContain('artifactId');
    expect(cols).toContain('version');
    expect(cols).toContain('snapshotData');
    expect(cols).toContain('createdBy');
    expect(cols).toContain('createdAt');
    expect(cols).toContain('metadata');
  });

  it('artifact_evaluations has required columns', () => {
    const cols = Object.keys(artifactEvaluations);
    expect(cols).toContain('id');
    expect(cols).toContain('artifactType');
    expect(cols).toContain('artifactId');
    expect(cols).toContain('artifactVersion');
    expect(cols).toContain('evaluationModel');
    expect(cols).toContain('overallScore');
    expect(cols).toContain('dimensionScores');
    expect(cols).toContain('rawLlmResponse');
    expect(cols).toContain('evaluatedBy');
    expect(cols).toContain('evaluatedAt');
    expect(cols).toContain('orgId');
    expect(cols).toContain('projectId');
  });

  it('artifact_lineage has required columns', () => {
    const cols = Object.keys(artifactLineage);
    expect(cols).toContain('id');
    expect(cols).toContain('parentType');
    expect(cols).toContain('parentId');
    expect(cols).toContain('childType');
    expect(cols).toContain('childId');
    expect(cols).toContain('relationshipType');
    expect(cols).toContain('createdAt');
    expect(cols).toContain('metadata');
  });
});

describe('promotion schema', () => {
  it('exports promotion table names', () => {
    expect(getTableName(gateDefinitions)).toBe('gate_definitions');
    expect(getTableName(stageTransitions)).toBe('stage_transitions');
  });

  it('gate_definitions has required columns', () => {
    const cols = Object.keys(gateDefinitions);
    expect(cols).toContain('id');
    expect(cols).toContain('fromStage');
    expect(cols).toContain('toStage');
    expect(cols).toContain('requiredEvidence');
    expect(cols).toContain('requiredApprovals');
    expect(cols).toContain('autoPassThreshold');
    expect(cols).toContain('disqualifyingConditions');
    expect(cols).toContain('orgId');
    expect(cols).toContain('projectId');
    expect(cols).toContain('createdAt');
    expect(cols).toContain('updatedAt');
  });

  it('stage_transitions has required columns', () => {
    const cols = Object.keys(stageTransitions);
    expect(cols).toContain('id');
    expect(cols).toContain('artifactType');
    expect(cols).toContain('artifactId');
    expect(cols).toContain('fromStage');
    expect(cols).toContain('toStage');
    expect(cols).toContain('triggeredBy');
    expect(cols).toContain('approvals');
    expect(cols).toContain('evaluationId');
    expect(cols).toContain('evidenceIds');
    expect(cols).toContain('transitionedAt');
    expect(cols).toContain('metadata');
  });
});

describe('canonical governance enums', () => {
  it('exports artifact, relationship, and promotion enums', () => {
    expect(artifactTypeEnum).toBeDefined();
    expect(relationshipTypeEnum).toBeDefined();
    expect(promotionStageEnum).toBeDefined();
  });
});
