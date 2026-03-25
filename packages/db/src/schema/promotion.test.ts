import { describe, expect, it } from 'bun:test';
import { getTableName } from 'drizzle-orm';
import { gateDefinitions, stageTransitions, promotionStageEnum } from './index';

describe('promotion schema structure', () => {
  it('exports gate definitions and stage transitions tables', () => {
    expect(getTableName(gateDefinitions)).toBe('gate_definitions');
    expect(getTableName(stageTransitions)).toBe('stage_transitions');
  });

  it('gate_definitions includes governance gate contract fields', () => {
    const cols = Object.keys(gateDefinitions);
    expect(cols).toContain('fromStage');
    expect(cols).toContain('toStage');
    expect(cols).toContain('requiredEvidence');
    expect(cols).toContain('requiredApprovals');
    expect(cols).toContain('autoPassThreshold');
    expect(cols).toContain('disqualifyingConditions');
    expect(cols).toContain('orgId');
    expect(cols).toContain('projectId');
  });

  it('stage_transitions includes approval and evidence linkage fields', () => {
    const cols = Object.keys(stageTransitions);
    expect(cols).toContain('artifactType');
    expect(cols).toContain('artifactId');
    expect(cols).toContain('fromStage');
    expect(cols).toContain('toStage');
    expect(cols).toContain('triggeredBy');
    expect(cols).toContain('approvals');
    expect(cols).toContain('evaluationId');
    expect(cols).toContain('evidenceIds');
    expect(cols).toContain('transitionedAt');
  });

  it('promotionStageEnum is exported', () => {
    expect(promotionStageEnum).toBeDefined();
  });
});
