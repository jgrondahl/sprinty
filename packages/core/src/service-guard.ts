import type { ArchitecturePlan } from './architecture-plan';
import type { ServiceGuardrails } from './types';

export interface ServiceApprovalRequest {
  proposedServices: string[];
  limit: number;
  projectId: string;
}

export interface ServiceApprovalGate {
  requestServiceApproval(request: ServiceApprovalRequest): Promise<boolean>;
}

export class AutoApproveServiceGate implements ServiceApprovalGate {
  async requestServiceApproval(_request: ServiceApprovalRequest): Promise<boolean> {
    return true;
  }
}

export class AutoRejectServiceGate implements ServiceApprovalGate {
  async requestServiceApproval(_request: ServiceApprovalRequest): Promise<boolean> {
    return false;
  }
}

export function extractServiceNames(plan: ArchitecturePlan): string[] {
  const topLevel = new Set<string>();
  for (const mod of plan.modules) {
    const parts = mod.directory.replace(/\\/g, '/').split('/').filter(Boolean);
    const root = parts[0];
    if (root) topLevel.add(root);
  }
  return [...topLevel];
}

export class ServiceCountGuard {
  private readonly guardrails: ServiceGuardrails;
  private readonly gate: ServiceApprovalGate;

  constructor(guardrails: ServiceGuardrails, gate: ServiceApprovalGate) {
    this.guardrails = guardrails;
    this.gate = gate;
  }

  async enforce(plan: ArchitecturePlan, projectId: string): Promise<boolean> {
    const services = extractServiceNames(plan);
    if (services.length <= this.guardrails.maxServicesPerProject) {
      return true;
    }

    if (!this.guardrails.requireHumanApproval) {
      return false;
    }

    return this.gate.requestServiceApproval({
      proposedServices: services,
      limit: this.guardrails.maxServicesPerProject,
      projectId,
    });
  }
}
