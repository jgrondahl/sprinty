import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SoundEngineerAgent } from './sound-engineer';
import {
  WorkspaceManager,
  HandoffManager,
  AgentPersona,
  StoryState,
  StorySource,
  type AgentConfig,
  type Story,
  type HandoffDocument,
  type WorkspaceState,
  type LlmClient,
} from '@splinty/core';

const now = new Date().toISOString();

const agentConfig: AgentConfig = {
  persona: AgentPersona.SOUND_ENGINEER,
  model: 'claude-3-5-sonnet-20241022',
  systemPrompt: 'Sound engineer system prompt',
  maxRetries: 3,
  temperature: 0.7,
};

function makeAudioStory(): Story {
  return {
    id: 'story-audio',
    title: 'As a user, I want to analyse audio files for pitch detection',
    description: 'Detect pitch from uploaded audio files using ML',
    acceptanceCriteria: ['Given an audio file, When I upload it, Then the pitch is returned'],
    state: StoryState.IN_PROGRESS,
    source: StorySource.FILE,
    workspacePath: '',
    domain: 'audio',
    tags: ['audio', 'ml'],
    createdAt: now,
    updatedAt: now,
  };
}

function makeNonAudioStory(): Story {
  return {
    id: 'story-web',
    title: 'As a user, I want to log in',
    description: 'Basic login',
    acceptanceCriteria: ['Given credentials, When I submit, Then I am logged in'],
    state: StoryState.IN_PROGRESS,
    source: StorySource.FILE,
    workspacePath: '',
    domain: 'auth',
    tags: ['auth'],
    createdAt: now,
    updatedAt: now,
  };
}

function makeAudioHandoff(required: 'true' | 'false' = 'true'): HandoffDocument {
  return {
    fromAgent: AgentPersona.ARCHITECT,
    toAgent: AgentPersona.SOUND_ENGINEER,
    storyId: 'story-audio',
    status: 'completed',
    stateOfWorld: {
      soundEngineerRequired: required,
      soundEngineerRationale: required === 'true'
        ? 'Audio ML requires Librosa for feature extraction'
        : 'No audio features required',
      techStack: 'Python, Librosa, PyTorch',
    },
    nextGoal: 'Produce audio service',
    artifacts: [],
    timestamp: now,
  };
}

const pythonAudioResponse = {
  requiresPython: true,
  files: [
    {
      path: 'audio_service.py',
      content: `import librosa\nimport numpy as np\n\ndef detect_pitch(file_path: str) -> float:\n    y, sr = librosa.load(file_path)\n    pitches, magnitudes = librosa.piptrack(y=y, sr=sr)\n    return float(pitches[magnitudes > magnitudes.mean()].mean())\n`,
    },
    {
      path: 'requirements.txt',
      content: 'librosa==0.10.1\nnumpy>=1.24.0\ntorch>=2.0.0\n',
    },
  ],
  audioDesign: `# Audio Design\n\n## Approach\nPython + Librosa pipeline for pitch detection.\n\n## Integration\nHTTP microservice called from TypeScript via fetch.`,
  integrationInterface: 'HTTP: POST /analyse with multipart/form-data audio file',
};

const tsAudioResponse = {
  requiresPython: false,
  files: [
    {
      path: 'audio-processor.ts',
      content: `export function analyseAudio(buffer: AudioBuffer): number {\n  // Web Audio API processing\n  return 440.0; // placeholder\n}\n`,
    },
  ],
  audioDesign: `# Audio Design\n\n## Approach\nWeb Audio API (TypeScript) — sufficient for browser-based playback.\n\n## Integration\nDirect TypeScript import.`,
  integrationInterface: 'Direct TypeScript import',
};

function makeMockClient(response: object | Error, callCount?: { n: number }): LlmClient {
  return {
    complete: async () => {
      if (callCount) callCount.n++;
      if (response instanceof Error) throw response;
      return JSON.stringify(response);
    },
  };
}

let tmpDir: string;
let wsMgr: WorkspaceManager;
let handoffMgr: HandoffManager;
let ws: WorkspaceState;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-se-'));
  wsMgr = new WorkspaceManager(tmpDir);
  handoffMgr = new HandoffManager();
  ws = wsMgr.createWorkspace('proj', 'story-audio');
  wsMgr.writeFile(ws, 'artifacts/architecture.md', '# ADR: Audio ML Pipeline\n\n## Decision\nUse Python + Librosa.');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('SoundEngineerAgent — skip (non-audio)', () => {
  it('returns SKIPPED handoff when soundEngineerRequired === false', async () => {
    const callCount = { n: 0 };
    const agent = new SoundEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(pythonAudioResponse, callCount));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeAudioHandoff('false'), makeNonAudioStory());

    expect(handoff.status).toBe('SKIPPED');
    expect(callCount.n).toBe(0); // No LLM call made
  });

  it('returns SKIPPED when handoff is null', async () => {
    const callCount = { n: 0 };
    const agent = new SoundEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(pythonAudioResponse, callCount));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(null, makeNonAudioStory());

    expect(handoff.status).toBe('SKIPPED');
    expect(callCount.n).toBe(0);
  });

  it('SKIPPED handoff targets DEVELOPER', async () => {
    const agent = new SoundEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(pythonAudioResponse));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeAudioHandoff('false'), makeNonAudioStory());
    expect(handoff.toAgent).toBe(AgentPersona.DEVELOPER);
  });
});

describe('SoundEngineerAgent — Python audio path', () => {
  it('writes audio_service.py to workspace artifacts', async () => {
    const agent = new SoundEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(pythonAudioResponse));
    agent.setWorkspace(ws);

    await agent.execute(makeAudioHandoff('true'), makeAudioStory());

    const py = wsMgr.readFile(ws, 'artifacts/audio_service.py');
    expect(py).toContain('librosa');
  });

  it('writes requirements.txt with librosa', async () => {
    const agent = new SoundEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(pythonAudioResponse));
    agent.setWorkspace(ws);

    await agent.execute(makeAudioHandoff('true'), makeAudioStory());

    const reqs = wsMgr.readFile(ws, 'artifacts/requirements.txt');
    expect(reqs).toContain('librosa');
  });

  it('writes audio-design.md', async () => {
    const agent = new SoundEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(pythonAudioResponse));
    agent.setWorkspace(ws);

    await agent.execute(makeAudioHandoff('true'), makeAudioStory());

    const design = wsMgr.readFile(ws, 'artifacts/audio-design.md');
    expect(design).toContain('Audio Design');
  });

  it('handoff stateOfWorld.requiresPython === true', async () => {
    const agent = new SoundEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(pythonAudioResponse));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeAudioHandoff('true'), makeAudioStory());
    expect(handoff.stateOfWorld['requiresPython']).toBe('true');
  });

  it('handoff targets DEVELOPER', async () => {
    const agent = new SoundEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(pythonAudioResponse));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeAudioHandoff('true'), makeAudioStory());
    expect(handoff.toAgent).toBe(AgentPersona.DEVELOPER);
  });
});

describe('SoundEngineerAgent — TypeScript audio path', () => {
  it('writes TS audio module when Python not required', async () => {
    const agent = new SoundEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(tsAudioResponse));
    agent.setWorkspace(ws);

    await agent.execute(makeAudioHandoff('true'), makeAudioStory());

    const ts = wsMgr.readFile(ws, 'artifacts/audio-processor.ts');
    expect(ts).toContain('analyseAudio');
  });

  it('handoff stateOfWorld.requiresPython === false for TS path', async () => {
    const agent = new SoundEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(tsAudioResponse));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeAudioHandoff('true'), makeAudioStory());
    expect(handoff.stateOfWorld['requiresPython']).toBe('false');
  });
});

describe('SoundEngineerAgent — error handling', () => {
  it('throws on non-JSON response', async () => {
    const bad: LlmClient = {
      complete: async () => 'not json',
    };

    const agent = new SoundEngineerAgent(agentConfig, wsMgr, handoffMgr, bad);
    agent.setWorkspace(ws);
    // @ts-ignore
    agent['sleep'] = () => Promise.resolve();

    await expect(agent.execute(makeAudioHandoff('true'), makeAudioStory())).rejects.toThrow();
  });

  it('throws when audioDesign is missing', async () => {
    const noDesign = { ...pythonAudioResponse, audioDesign: undefined };
    const agent = new SoundEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(noDesign));
    agent.setWorkspace(ws);
    // @ts-ignore
    agent['sleep'] = () => Promise.resolve();

    await expect(agent.execute(makeAudioHandoff('true'), makeAudioStory())).rejects.toThrow("missing 'audioDesign'");
  });
});
