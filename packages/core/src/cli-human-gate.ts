import * as readline from 'readline';
import type { PlanRevisionTrigger } from './plan-revision';
import type { HumanGate } from './sprint-state';

export class CliHumanGate implements HumanGate {
  async requestApproval(trigger: PlanRevisionTrigger): Promise<boolean> {
    process.stdout.write('\n[Splinty] Human approval requested\n');
    process.stdout.write(`Reason: ${trigger.reason}\n`);
    process.stdout.write(`Description: ${trigger.description}\n`);
    process.stdout.write(`Evidence: ${trigger.evidence.join(', ') || 'none'}\n`);
    process.stdout.write(`Timestamp: ${trigger.timestamp}\n\n`);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      const answer = await new Promise<string>((resolve) => {
        rl.question('Approve? [y/N] ', (input) => resolve(input));
      });
      return answer.trim().toLowerCase() === 'y';
    } finally {
      rl.close();
    }
  }
}
