Task 1 completed: Added ModelConfigSchema and tests. Tests pass and tsc noEmit succeeds in packages/core.

## Task 2 Completed: Per-Agent Model Configuration in Orchestrator

### Changes Made

**Files Modified:**
- `packages/agents/src/orchestrator.ts`: Added PERSONA_TEMPERATURE_DEFAULTS, OrchestratorConfigSchema, resolveModelConfig helper, updated buildAgentConfigs and call sites
- `packages/agents/src/orchestrator.test.ts`: Added 6 tests for model config fallback chain, per-persona overrides, lightModel backward compat, and Zod validation
- `packages/agents/src/index.ts`: Exported OrchestratorConfigSchema

### Implementation Details

#### 1. PERSONA_TEMPERATURE_DEFAULTS Constant (line ~340)
```typescript
const PERSONA_TEMPERATURE_DEFAULTS: Partial<Record<AgentPersona, number>> = {
  [AgentPersona.QA_ENGINEER]: 0.2,
  [AgentPersona.ARCHITECTURE_PLANNER]: 0.4,
  [AgentPersona.TECHNICAL_WRITER]: 0.2,
};
```
Default temperature of 0.7 used for personas not listed.

#### 2. OrchestratorConfig Extended (lines 107-172)
Added:
- `defaultModel?: string | ModelConfig` (was `string`)
- `lightModel?: string | ModelConfig` (was `string`)
- `models?: Partial<Record<AgentPersona, ModelConfig>>`

#### 3. OrchestratorConfigSchema Added (after SprintOrchestrator class)
- Used `z.object({}).catchall(ModelConfigSchema).optional()` for models field (z.record().partial() not available in Zod)
- Non-serializable fields use `z.custom<unknown>().optional()`
- Schema validation throws on empty projectId or invalid temperature
- Placed after class to avoid hoisting issues with reference before initialization

#### 4. resolveModelConfig Helper (lines ~346-358)
Implements fallback chain:
1. Normalize string → { model: string }
2. Merge per-persona config over defaultModel
3. Temperature fallback: merged.temperature → PERSONA_TEMPERATURE_DEFAULTS[persona] → 0.7
4. Return { model, temperature, maxTokens? }

#### 5. buildAgentConfigs Updated (lines ~408-424)
- Signature: `(models?, defaultModel?, lightModel?)`
- lightModel backward compat: if set and no models[QA_ENGINEER], normalize and apply to QA
- Use resolveModelConfig for each persona
- Spread resolved temperature and maxTokens into AgentConfig

#### 6. Call Sites Updated
- Line ~530: `buildAgentConfigs(this.config.models, this.config.defaultModel, this.config.lightModel)`
- Line ~1174: Same pattern

#### 7. Constructor Validation (line ~422)
```typescript
constructor(config: OrchestratorConfig) {
  OrchestratorConfigSchema.parse(config);  // Validates and throws on invalid
  this.config = config;
```
Parse validates but doesn't assign to avoid type incompatibility (z.custom<unknown>() → typed field).

### Test Coverage

Added `describe('SprintOrchestrator — model config')` with 6 tests:
1. **defaultModel string**: All agents use 'gpt-4o'
2. **defaultModel object with temperature**: All agents use temperature 0.3
3. **Per-persona override**: QA uses 'gpt-4o-mini' via models[QA_ENGINEER]
4. **lightModel backward compat**: QA gets lightModel when models[QA] not set
5. **Zod validation: empty projectId**: Throws
6. **Zod validation: invalid temperature**: Throws (temperature: 2 > 1)

All tests pass (6/6). Full suite: 756 tests pass, 0 fail.

### Verification Results

```bash
cd packages/agents && bun test --grep "model config"
# 6 pass, 0 fail, 6 expect() calls [325ms]

cd packages/core && bunx tsc --noEmit    # ✅ No errors
cd packages/agents && bunx tsc --noEmit  # ✅ No errors
cd packages/cli && bunx tsc --noEmit     # ✅ No errors

bun test  # Full suite from repo root
# 756 pass, 0 fail [34.24s]
```

### Issues Encountered & Resolutions

1. **z.record().partial() not available**
   - **Issue**: Plan specified `z.record(z.nativeEnum(AgentPersona), ModelConfigSchema).partial().optional()`
   - **Fix**: Used `z.object({}).catchall(ModelConfigSchema).optional()` instead (functionally equivalent)

2. **Hoisting error: Cannot access OrchestratorConfigSchema before initialization**
   - **Issue**: Schema defined before SprintOrchestrator class but referenced in constructor
   - **Fix**: Moved schema definition after class and exported it there

3. **Type incompatibility: OrchestratorConfigSchema.parse() return type**
   - **Issue**: `z.custom<unknown>()` fields incompatible with typed interface fields (GitFactory, etc.)
   - **Fix**: Validate but don't assign: `OrchestratorConfigSchema.parse(config); this.config = config;`

### Patterns & Conventions

- Temperature defaults per persona: deterministic personas (QA, TECHNICAL_WRITER) use 0.2, planning (ARCHITECTURE_PLANNER) uses 0.4, others 0.7
- Fallback chain: most specific wins (per-persona → defaultModel → DEFAULT_MODEL)
- Backward compatibility: lightModel still works for QA when models[QA] not set
- Zod schema validates serializable fields only; non-serializable (clients, factories) use z.custom<unknown>()
- Schema placed after class to avoid hoisting issues in TypeScript/Bun

### Next Steps

Task 2 complete. Per-agent model configuration fully implemented and verified. Orchestrator now supports:
- Global defaultModel override (string or ModelConfig)
- Per-persona models override via models?: Partial<Record<AgentPersona, ModelConfig>>
- Temperature defaults per persona with full fallback chain
- lightModel backward compatibility
- Zod validation on construction

Ready for integration with CLI (Task 3) and documentation (Task 4).
