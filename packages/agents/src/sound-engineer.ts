import {
  AgentPersona,
  type HandoffDocument,
  type Story,
} from '@splinty/core';
import { BaseAgent } from './base-agent';

const SOUND_ENGINEER_SYSTEM_PROMPT = `You are a Specialist Audio/ML Engineer with deep expertise in:
- Librosa: audio feature extraction (MFCCs, spectrograms, mel-scale, chroma features)
- PyTorch / torchaudio: audio ML model training and inference
- pydub: audio manipulation, format conversion, slicing
- NumPy / SciPy: signal processing, FFT, filtering
- Web Audio API (TypeScript): browser-based audio playback and processing
- Real-time audio pipelines and streaming architectures

Your role:
1. Review the provided Architecture Decision Record
2. Assess whether Python tooling (Librosa, PyTorch) is required OR if TypeScript (Web Audio API, Tone.js) suffices
3. If Python is required: produce an audio_service.py scaffold + requirements.txt + integration interface spec
4. If TS is sufficient: produce a TypeScript audio module
5. Document your rationale in audio-design.md

Respond ONLY with a valid JSON object:
{
  "requiresPython": boolean,
  "files": [
    { "path": "string — filename relative to workspace artifacts (e.g. 'audio_service.py')", "content": "string — full file content" }
  ],
  "audioDesign": "string — markdown content for audio-design.md",
  "integrationInterface": "string — how the audio service is called (HTTP/subprocess/import)"
}`;

export class SoundEngineerAgent extends BaseAgent {
  async execute(
    handoff: HandoffDocument | null,
    story: Story
  ): Promise<HandoffDocument> {
    // Invocation guard: skip if not required
    const isRequired = handoff?.stateOfWorld['soundEngineerRequired'] === 'true';

    if (!isRequired) {
      // No-op handoff — return immediately without any LLM call
      return this.handoffManager.create(
        this.config.persona,
        AgentPersona.DEVELOPER,
        story.id,
        'SKIPPED',
        {
          soundEngineerRequired: 'false',
          reason: 'Sound Engineer not required for this story',
        },
        'Proceed with implementation — no audio/ML work needed',
        []
      );
    }

    // Read architecture ADR from workspace
    let adrContent = '';
    if (this.currentWorkspace) {
      try {
        adrContent = this.workspaceManager.readFile(this.currentWorkspace, 'artifacts/architecture.md');
      } catch {
        adrContent = handoff?.stateOfWorld['soundEngineerRationale'] ?? 'No ADR available';
      }
    }

    const userMessage = `Review this architecture for audio/ML requirements and produce the appropriate audio service:

Story: ${story.title}
Domain: ${story.domain}
Tags: ${story.tags.join(', ')}

Architect's Rationale: ${handoff?.stateOfWorld['soundEngineerRationale'] ?? ''}

Architecture Decision Record:
${adrContent}

Decide whether Python (Librosa/PyTorch) or TypeScript (Web Audio API) is appropriate.
Return JSON with: requiresPython, files (array of path+content), audioDesign (markdown), integrationInterface.`;

    const rawResponse = await this.callClaude({
      systemPrompt: SOUND_ENGINEER_SYSTEM_PROMPT,
      userMessage,
    });

    // Parse JSON — strip fences
    let parsed: {
      requiresPython?: boolean;
      files?: Array<{ path: string; content: string }>;
      audioDesign?: string;
      integrationInterface?: string;
    };

    try {
      const cleaned = rawResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned) as typeof parsed;
    } catch {
      throw new Error(
        `SoundEngineerAgent: Claude returned non-JSON response: ${rawResponse.slice(0, 200)}`
      );
    }

    if (!parsed.audioDesign) {
      throw new Error("SoundEngineerAgent: missing 'audioDesign' in response");
    }
    if (!parsed.files || !Array.isArray(parsed.files)) {
      throw new Error("SoundEngineerAgent: missing 'files' array in response");
    }

    const generatedFiles: string[] = [];

    if (this.currentWorkspace) {
      // Write audio-design.md
      this.workspaceManager.writeFile(
        this.currentWorkspace,
        'artifacts/audio-design.md',
        parsed.audioDesign
      );
      generatedFiles.push('artifacts/audio-design.md');

      // Write all generated files
      for (const file of parsed.files) {
        const relPath = `artifacts/${file.path}`;
        this.workspaceManager.writeFile(this.currentWorkspace, relPath, file.content);
        generatedFiles.push(relPath);
      }

      this.logActivity(`Audio artifacts written: ${generatedFiles.join(', ')}`);
    }

    return this.buildHandoff(
      story,
      AgentPersona.DEVELOPER,
      {
        requiresPython: String(parsed.requiresPython ?? false),
        integrationInterface: parsed.integrationInterface ?? '',
        audioDesignPath: 'artifacts/audio-design.md',
        audioFiles: generatedFiles.filter((f) => f !== 'artifacts/audio-design.md').join(','),
      },
      'Integrate the audio service into the main implementation',
      generatedFiles
    );
  }
}
