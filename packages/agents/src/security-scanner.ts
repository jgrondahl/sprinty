export type SecurityIssueSeverity = 'low' | 'medium' | 'high' | 'critical';

export type SecurityIssue = {
  rule: string;
  severity: SecurityIssueSeverity;
  filePath: string;
  line: number;
  snippet: string;
};

export type SecurityReport = {
  findings: Array<{
    severity: SecurityIssueSeverity;
    category: string;
    file: string;
    line: number;
    description: string;
    recommendation: string;
  }>;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
};

type SecurityRule = {
  name: string;
  severity: SecurityIssueSeverity;
  pattern: RegExp;
};

const rules: SecurityRule[] = [
  {
    name: 'Hardcoded secret',
    severity: 'critical',
    pattern: /(api[_-]?key|token|password|secret)\s*[:=]\s*['"][^'"]{8,}['"]/i,
  },
  {
    name: 'Dangerous eval usage',
    severity: 'high',
    pattern: /\beval\s*\(/,
  },
  {
    name: 'SQL string interpolation',
    severity: 'high',
    pattern: /SELECT\s+.+\$\{.+\}/i,
  },
  {
    name: 'Path traversal pattern',
    severity: 'high',
    pattern: /\.\.\//,
  },
  {
    name: 'Weak random for security data',
    severity: 'medium',
    pattern: /Math\.random\(\)/,
  },
];

function scanText(filePath: string, source: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const lines = source.split(/\r?\n/);

  lines.forEach((line, index) => {
    rules.forEach((rule) => {
      if (rule.pattern.test(line)) {
        issues.push({
          rule: rule.name,
          severity: rule.severity,
          filePath,
          line: index + 1,
          snippet: line.trim().slice(0, 220),
        });
      }
    });
  });

  return issues;
}

function collectFiles(basePath: string): string[] {
  const stack = [basePath];
  const files: string[] = [];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const stat = Bun.file(current);
    if (current.includes('/node_modules/') || current.includes('/dist/') || current.includes('/.git/')) {
      continue;
    }

    try {
      const entries = Array.from(new Bun.Glob('*').scanSync({ cwd: current, absolute: true }));
      if (entries.length === 0) {
        files.push(current);
      } else {
        for (const entry of entries) {
          stack.push(entry);
        }
      }
    } catch {
      if (stat.size > 0) {
        files.push(current);
      }
    }
  }

  return files.filter((file) => /\.(ts|tsx|js|jsx|json|yaml|yml|md)$/i.test(file));
}

export async function scanCodeForVulnerabilities(basePath: string): Promise<SecurityReport> {
  const files = collectFiles(basePath);
  const issues: SecurityIssue[] = [];

  for (const filePath of files) {
    try {
      const source = await Bun.file(filePath).text();
      issues.push(...scanText(filePath, source));
    } catch {
      continue;
    }
  }

  const findings = issues.map((issue) => ({
    severity: issue.severity,
    category: issue.rule,
    file: issue.filePath,
    line: issue.line,
    description: issue.snippet,
    recommendation:
      issue.rule === 'Hardcoded secret'
        ? 'Move secrets to environment variables and rotate the key.'
        : issue.rule === 'Dangerous eval usage'
          ? 'Remove eval usage and use explicit parsing logic.'
          : issue.rule === 'SQL string interpolation'
            ? 'Use parameterized queries to avoid injection.'
            : issue.rule === 'Path traversal pattern'
              ? 'Validate and sanitize file paths before use.'
              : 'Use crypto-secure randomness for security-sensitive operations.',
  }));

  const summary = {
    critical: findings.filter((item) => item.severity === 'critical').length,
    high: findings.filter((item) => item.severity === 'high').length,
    medium: findings.filter((item) => item.severity === 'medium').length,
    low: findings.filter((item) => item.severity === 'low').length,
  };

  return {
    findings,
    summary,
  };
}
