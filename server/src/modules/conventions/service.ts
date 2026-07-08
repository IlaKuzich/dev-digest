import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Container } from '../../platform/container.js';
import type {
  ConventionCandidate,
  ConventionScan,
  CreateConventionSkillInput,
  ExtractResult,
  Provider,
  Skill,
  UpdateConventionInput,
} from '@devdigest/shared';
import { ConventionDraft } from '@devdigest/shared';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { SkillsService } from '../skills/service.js';
import { ConventionsRepository, type InsertConvention } from './repository.js';
import { locateEvidence, normalizeWs, toConventionDto, mergeConventionsToSkillBody } from './helpers.js';
import {
  CONFIG_FILES,
  EXTRACT_MAX_RETRIES,
  MAX_CANDIDATES,
  SAMPLE_FILE_COUNT,
} from './constants.js';
import type { ConventionScanRow } from '../../db/rows.js';

const ExtractSchema = z.object({ candidates: z.array(ConventionDraft).max(MAX_CANDIDATES) });

interface SampleFile {
  path: string;
  content: string;
}

export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
  }

  async extract(workspaceId: string, repoId: string): Promise<ExtractResult> {
    const ref = await this.repo.getRepoRef(repoId);
    if (!ref || !ref.clonePath) {
      const scan = await this.repo.insertScan({ workspaceId, repoId, sampleCount: 0, model: 'none' });
      return { scan: scanDto(scan), candidates: [], dropped: 0 };
    }
    const clonePath = ref.clonePath;

    // 1. Model.
    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'conventions');

    // 2. Samples (top-ranked source files) + config files (enhancement #1).
    const samplePaths = await this.container.repoIntel.getConventionSamples(repoId, SAMPLE_FILE_COUNT);
    const sampleFiles = await this.readFiles(clonePath, samplePaths);
    const configFiles = await this.readFiles(clonePath, [...CONFIG_FILES]);
    const sampleCount = sampleFiles.length;

    const scan = await this.repo.insertScan({ workspaceId, repoId, sampleCount, model });

    // 3. Model call.
    const llm = await this.container.llm(provider as Provider);
    const res = await llm.completeStructured({
      model,
      schema: ExtractSchema,
      schemaName: 'ConventionCandidates',
      messages: buildMessages(ref.fullName ?? ref.name, sampleFiles, configFiles),
      maxRetries: EXTRACT_MAX_RETRIES,
    });

    // 4. Grounding (moderate) + de-dup against already-accepted.
    const acceptedKeys = await this.repo.acceptedRuleKeys(workspaceId, repoId);
    const fileCache = new Map(sampleFiles.map((f) => [f.path, f.content]));
    const survivors: InsertConvention[] = [];
    let dropped = 0;

    for (const draft of res.data.candidates) {
      let content = fileCache.get(draft.evidence.file);
      if (content == null) content = (await readClone(clonePath, draft.evidence.file)) ?? undefined;
      if (content == null) {
        dropped += 1; // file missing → drop
        continue;
      }
      const loc = locateEvidence(content, draft.evidence.snippet);
      if (loc == null) {
        dropped += 1; // snippet absent → drop
        continue;
      }
      const key = `${draft.category}|${normalizeWs(draft.rule)}`;
      if (acceptedKeys.has(key)) {
        dropped += 1; // already accepted → skip
        continue;
      }
      survivors.push({
        workspaceId,
        repoId,
        scanId: scan.id,
        category: draft.category,
        rule: draft.rule,
        evidencePath: draft.evidence.file,
        evidenceLineStart: loc.startLine,
        evidenceLineEnd: loc.endLine,
        evidenceSnippet: draft.evidence.snippet,
        confidence: draft.confidence,
      });
    }

    // 5. Re-scan hygiene + persist.
    await this.repo.clearCandidatesAndRejected(repoId);
    const inserted = await this.repo.insertCandidates(survivors);

    return { scan: scanDto(scan), candidates: inserted.map(toConventionDto), dropped };
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.repo.listForRepo(workspaceId, repoId);
    return rows.map(toConventionDto);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConventionInput,
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toConventionDto(row) : undefined;
  }

  async createSkill(
    workspaceId: string,
    repoId: string,
    input: CreateConventionSkillInput,
  ): Promise<Skill> {
    const skills = new SkillsService(this.container);
    const skill = await skills.create(workspaceId, {
      name: input.name,
      description: input.description,
      type: 'convention',
      body: input.body,
    });
    const accepted = await this.repo.acceptedForRepo(workspaceId, repoId);
    await this.repo.stampSkillId(
      accepted.map((r) => r.id),
      skill.id,
    );
    return skill;
  }

  private async readFiles(clonePath: string, paths: string[]): Promise<SampleFile[]> {
    const out: SampleFile[] = [];
    for (const p of paths) {
      const content = await readClone(clonePath, p);
      if (content != null) out.push({ path: p, content });
    }
    return out;
  }
}

function scanDto(row: ConventionScanRow): ConventionScan {
  return {
    id: row.id,
    repo_id: row.repoId,
    sample_count: row.sampleCount,
    model: row.model,
    created_at: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)).toISOString(),
  };
}

async function readClone(clonePath: string, file: string): Promise<string | null> {
  return readFile(join(clonePath, file), 'utf8').catch(() => null);
}

function buildMessages(repoName: string, samples: SampleFile[], configs: SampleFile[]) {
  const sampleBlock = samples.map((f) => `FILE: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');
  const configBlock = configs.map((f) => `CONFIG: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');
  return [
    {
      role: 'system' as const,
      content:
        'You extract house coding conventions from a repository. For each convention, return a category (one of naming, error-handling, structure, imports, api-shape, testing), a one-sentence directive rule, and EVIDENCE: an exact file path plus a verbatim code snippet copied from that file (with its line). Only propose conventions you can cite with a real snippet. Prefer 3-8 high-signal, project-specific rules over generic advice.',
    },
    {
      role: 'user' as const,
      content: `Repository: ${repoName}\n\nConfig files:\n${configBlock}\n\nTop source files:\n${sampleBlock}`,
    },
  ];
}
