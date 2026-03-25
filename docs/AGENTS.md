# AGENTS.md — AI Deep House Coach

This file is read by Splinty's Architecture Planner and all downstream agents before any code is written.
Treat every directive here as a hard constraint, not a suggestion.

---

## Project Overview

**System:** `ai-deep-house-coach`

An AI-powered deep house production coaching platform that:
- Analyzes uploaded tracks using DSP feature extraction
- Compares them against curated reference tracks
- Generates actionable coaching reports
- Tracks producer progress over time
- Incrementally improves recommendation quality using observed improvement data

---

## Service Topology

This project has exactly **4 services**. No additional services may be created.

| Service | Type | Runtime | Communicates With |
|---|---|---|---|
| `frontend` | web-app | node | `api` only |
| `api` | http-service | python | `database`, `object-storage`, `job-queue` |
| `audio-worker` | background-worker | python | `database`, `object-storage`, `job-queue` |
| `learning-worker` | background-worker | python | `database`, `job-queue` |

### Service Responsibilities

**frontend**
- Authentication UI
- Project dashboard
- Upload interface
- Reference track selection
- Coaching report display
- Progress charts
- Goal tracking UI

**api**
- Authentication (JWT)
- Project management
- Upload orchestration
- Reference library queries
- Report retrieval
- Feedback ingestion

**audio-worker**
- Queue consumption
- Audio normalization
- DSP feature extraction
- Similarity comparison
- Scoring
- Coaching generation

**learning-worker**
- Improvement pattern analysis
- Recommendation model training
- Model version publishing

### Infrastructure

| Component | Technology |
|---|---|
| Database | PostgreSQL |
| Object Storage | S3-compatible |
| Job Queue | Redis |

---

## Technology Stack — HARD CONSTRAINTS

These are not suggestions. Every agent must use exactly these technologies.

### Frontend (`frontend/`)
| Concern | Technology |
|---|---|
| Framework | Vue 3 |
| Language | TypeScript |
| Build tool | Vite |
| UI framework | Tailwind CSS |
| Chart library | Chart.js |
| Package manager | pnpm |

### API (`api/`)
| Concern | Technology |
|---|---|
| Framework | FastAPI |
| Language | Python |
| ORM | SQLAlchemy |
| Validation | Pydantic |
| Auth | JWT |
| Package manager | Poetry |

### Audio Worker (`audio-worker/`)
| Concern | Technology |
|---|---|
| Language | Python |
| DSP libraries | `librosa`, `numpy`, `scipy` |
| Package manager | Poetry |

### Learning Worker (`learning-worker/`)
| Concern | Technology |
|---|---|
| Language | Python |
| ML libraries | `scikit-learn`, `pandas` |
| Package manager | Poetry |

### Database
| Concern | Technology |
|---|---|
| Migration tool | Alembic |

### Queue
| Concern | Technology |
|---|---|
| Worker library | `rq` (Redis Queue) |

---

## Cross-Service Import Rules

- **Frontend** may only communicate with `api` via HTTP. No direct database or queue access.
- **API** may not import from `audio-worker` or `learning-worker` code directly. Communication is via the job queue only.
- **Workers** may not expose HTTP endpoints. They only consume from the queue.
- **Shared contracts** (payload schemas, result schemas) must live in a shared package — not duplicated across services.

---

## Internal Contracts — MUST BE IMPLEMENTED EXACTLY

### `AnalysisJobPayload`
All analysis jobs enqueued to Redis must conform to this schema:

| Field | Description |
|---|---|
| `job_id` | Unique job identifier |
| `project_id` | Owning project |
| `upload_id` | The uploaded track |
| `track_version_id` | Version of the track |
| `pipeline_version` | DSP pipeline version |
| `reference_ids` | List of reference track IDs to compare against |
| `correlation_id` | Distributed tracing ID (required) |

### `StageExecutionResult`
Every DSP pipeline stage must persist a result conforming to:

| Field | Description |
|---|---|
| `stage_name` | Name of the completed stage |
| `session_id` | Analysis session |
| `status` | `success` or `failure` |
| `artifact_keys` | S3 keys for produced artifacts |
| `metrics` | Stage-specific performance metrics |
| `correlation_id` | Must match the originating job payload |

---

## Feature Vector Storage Format

Feature vectors are stored in PostgreSQL using `jsonb` columns with gzip compression.

Each record must include:

| Field | Description |
|---|---|
| `track_id` | Track being analyzed |
| `feature_type` | e.g. `mfcc`, `chroma`, `bpm` |
| `feature_version` | Version of the extraction algorithm |
| `vector` | The computed feature array |
| `segment_start` | Start time of the segment (seconds) |
| `segment_end` | End time of the segment (seconds) |

---

## Audio Segmentation

Tracks must be segmented into the following structural sections:

- `intro`
- `build`
- `breakdown`
- `drop`
- `outro`

Segmentation is a named stage in the DSP pipeline DAG (`segmentation`, depends on `waveform`).

---

## DSP Pipeline DAG

The audio analysis pipeline executes as a directed acyclic graph. Stages must run in this order, respecting dependencies:

```
uploaded_audio
    └── normalization
            ├── metadata
            │       ├── waveform
            │       │       └── segmentation
            │       │               └── arrangement_similarity
            │       │                       └── arrangement_score
            │       ├── bpm
            │       │   └── rhythm_similarity
            │       │           └── arrangement_score
            │       └── key
            │           └── chroma
            ├── mfcc ──────────────────┐
            │                          ├── timbral_similarity
            ├── spectral_contrast ─────┘       └── mix_quality_score
            ├── harmonic_percussive_split
            │       └── drum_similarity
            │               └── sound_design_score
            └── loudness
                    └── low_end_similarity
                            └── mix_quality_score

mix_quality_score + arrangement_score + sound_design_score
    └── label_readiness_score
            └── coaching_generation
```

---

## DSP Plugin Architecture

The `audio-worker` must implement a plugin system so new DSP stages can be added without modifying the core worker.

### Plugin Interface (every DSP plugin must implement)

```python
class DSPPlugin:
    @property
    def stage_name(self) -> str: ...

    @property
    def dependencies(self) -> list[str]: ...

    def execute(
        self,
        normalized_audio_path: str,
        session_id: str,
        feature_cache: dict,
    ) -> dict:
        # Returns: { "feature_vectors": [...], "artifacts": [...], "metrics": {...} }
        ...
```

### Plugin Discovery
- Plugins are located in `audio-worker/plugins/`
- Discovery method: directory scan — Python modules loaded dynamically at worker startup
- Each plugin registers its stage handler with the pipeline orchestrator

### Plugin Registry Table: `dsp_plugins`

| Column | Description |
|---|---|
| `plugin_name` | Unique name |
| `stage_name` | DAG stage this plugin handles |
| `version` | Plugin version |
| `dependencies` | JSON array of upstream stage names |

### Plugin Rules
- Plugin stages **must be deterministic** — same input always produces same output
- Plugin stages **must declare their dependencies** explicitly
- Plugin stages **must be idempotent** — safe to re-run on failure

---

## Pipeline Orchestrator

Located in `audio-worker`. Implements a stage-runner pattern:

1. Read `AnalysisJobPayload` from the queue
2. Determine next stage from the DAG
3. Execute the stage handler (via plugin registry)
4. Persist `StageExecutionResult` to the database
5. Enqueue downstream stage jobs to Redis

---

## Reference Dataset Governance

- Reference track features are **frozen per pipeline version**
- If `feature_version` changes, all reference tracks must be reprocessed
- Do not mix features from different pipeline versions in comparisons

---

## Pipeline Execution Rules

| Rule | Value |
|---|---|
| Idempotent stages | Required — all stages must be safe to retry |
| Retry safe | Required |
| Stage isolation | Required — stages must not share in-memory state |
| Deterministic ordering | Required — DAG order must be respected |

---

## Security Rules

| Rule | Description |
|---|---|
| Project ownership enforcement | Users may only access their own projects |
| Signed upload URLs | All audio uploads use pre-signed S3 URLs |
| Report access restriction | Coaching reports are only accessible to the project owner |

---

## Rate Limits

| Endpoint | Limit |
|---|---|
| Uploads | 20 per user per hour |
| Analysis jobs | 50 per user per hour |

---

## Failure Handling

| Setting | Value |
|---|---|
| Retry attempts | 3 |
| Stage timeout | 600 seconds |
| Dead-letter queue | Enabled |

---

## Coaching Learning System

The `learning-worker` must implement a feedback loop that improves recommendation quality over time.

**Data sources consumed:**
- `coaching_reports`
- `progress_history`
- `goals`
- `feedback_events`

**Feedback loop stages:**
1. **Collect** — `recommendation_usefulness`, `score_delta`, `goal_completion`
2. **Analyze** — identify effective coaching advice, detect recurring producer weaknesses
3. **Update** — recommendation weighting, advice prioritization
4. **Publish** — new recommendation model version to `recommendation_models` table

### Model Registry Table: `recommendation_models`

| Column | Description |
|---|---|
| `model_version` | Semver version string |
| `training_timestamp` | UTC timestamp |
| `training_dataset_version` | Version of data used |
| `algorithm` | Algorithm name (e.g. `gradient_boost`) |
| `evaluation_metrics` | JSON object with accuracy/precision/recall |

---

## Observability Requirements

Every service must implement these observability standards:

### Logging
- Structured logging only (JSON format)
- Every log line must include `correlation_id`

### Metrics
The following metrics must be instrumented:

| Metric | Description |
|---|---|
| `analysis_stage_duration` | Time per DSP stage |
| `queue_latency` | Time from job enqueue to start |
| `feature_cache_hit_rate` | Cache efficiency for feature vectors |
| `recommendation_accuracy` | Model quality metric |

### Tracing
- `correlation_id` must be propagated across all service boundaries
- API → audio-worker: pass `correlation_id` in the job payload
- audio-worker stages: pass `correlation_id` in `StageExecutionResult`
