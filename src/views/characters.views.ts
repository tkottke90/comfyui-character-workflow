import path from 'node:path';
import { Router, Request, Response, NextFunction } from 'express';
import { Application } from '../types/application';
import { CharactersService } from '../services/characters.service';
import { TemplatesService } from '../services/templates.service';
import { StylesService } from '../services/styles.service';
import { CharacterImagesService } from '../services/character-images.service';
import { ExecutionService } from '../services/execution.service';
import { JobRecord, JobStore } from '../services/job-store.service';
import { CharacterRecord } from '../schemas/character.schema';
import { CharacterAttributesConfigSchema } from '../schemas/config.schema';
import { NotFoundError, BadRequestError } from '../errors/http.errors';
import { sanitizeSegment } from '../lib/path-sanitize';
import { allPhaseBindings } from '../comfy/workflow-registry';
import { CHECKLIST_DEFINITIONS } from '../checklist/definitions';
import { DEFAULT_ATTRIBUTE_SUGGESTIONS } from '../lib/character-attribute-defaults';
import {
  applyStyleToCharacter,
  compileIdentityBlock,
  defaultAuditRows,
  deriveChecklist,
  findImagePath,
  forceCompleteThroughCasting,
  getNextAction,
  mergeAttributeSuggestions,
  overviewChecklistRows,
  parsePhaseChecklist,
  resolveAttributeKeyByLabel,
  upsertPhaseImage,
  DEFAULT_NEGATIVE_PROMPT,
} from '../lib/character-logic';
import { applyPromptAdapter } from '../lib/prompt-adapter';
import { PromptAdapterSchema } from '../schemas/prompt-adapter.schema';

const VIEW_DEFINITIONS: Array<{
  key: string;
  label: string;
  changeClause: string;
  reorient: boolean;
}> = [
  {
    key: 'three_quarter',
    label: 'Three-quarter',
    reorient: true,
    changeClause:
      'Turn to a three-quarter view, her body angled to one side, standing relaxed with arms at her sides, full body visible from head to bare feet.',
  },
  {
    key: 'profile',
    label: 'Profile',
    reorient: true,
    changeClause:
      'Turn to show a full side profile, standing straight, arms relaxed at the sides, full body visible.',
  },
  {
    key: 'back',
    label: 'Back',
    reorient: true,
    changeClause:
      'Turn to face directly away from the camera, arms relaxed, full body visible, showing the back of the hair.',
  },
  {
    key: 'front_portrait',
    label: 'Front portrait',
    reorient: false,
    changeClause:
      'A close-up head and shoulders portrait, facing the camera directly, neutral expression. Sharp facial detail.',
  },
  {
    key: 'three_quarter_portrait',
    label: 'Three-quarter portrait',
    reorient: false,
    changeClause:
      'A close-up head and shoulders portrait in three-quarter view, head turned slightly, eyes toward camera, neutral expression. Sharp facial detail.',
  },
];

// Refinement is the one multi-step phase page that maps a single UI step selector onto
// three distinct phase bindings (three separate workflow slots, each independently
// mappable/runnable) — this is the lookup from step number to the phase-binding key the
// run/images/events routes are keyed by.
const REFINEMENT_PHASE_BINDING_BY_STEP: Record<number, string> = {
  1: 'refinement_face_detail',
  2: 'refinement_cleanup',
  3: 'refinement_upscale',
};

function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

function getCharacterOr404(service: CharactersService, slug: string): CharacterRecord {
  const character = service.get(slug);
  if (!character) throw new NotFoundError(`Character "${slug}" not found`);
  return character;
}

function baseContext(character: CharacterRecord) {
  return {
    character,
    checklist: deriveChecklist(character),
  };
}

function isJobActive(record: JobRecord | undefined): boolean {
  if (!record) return false;
  if (record.kind === 'single') return record.status === 'queued' || record.status === 'running';
  return record.subJobs.some((s) => s.status === 'queued' || s.status === 'running');
}

/**
 * Parses the Images gallery's "Send to X" link format (`?fromImage=<phaseBindingKey>:<filename>`).
 * Working-file phase-binding keys and filenames are never `:`-containing (sanitizeSegment's
 * charset, and the timestamp/kind/extension naming scheme), so a plain split is unambiguous.
 */
function parseFromImageQuery(
  req: Request,
): { phaseBindingKey: string; filename: string } | undefined {
  const raw = typeof req.query.fromImage === 'string' ? req.query.fromImage : undefined;
  if (!raw) return undefined;

  const separatorIndex = raw.indexOf(':');
  if (separatorIndex === -1) return undefined;

  return { phaseBindingKey: raw.slice(0, separatorIndex), filename: raw.slice(separatorIndex + 1) };
}

export function createCharactersRouter(
  app: Application,
  characters: CharactersService,
  templates: TemplatesService,
  styles: StylesService,
  characterImages: CharacterImagesService,
  executionService: ExecutionService,
  jobStore: JobStore,
): Router {
  const router = Router();

  /**
   * Candidate images for a phase's "choose from library" picker (everything except that
   * phase's own working files — its current image is already shown above the form), plus
   * which one (if any) a `?fromImage=` gallery link is pointing at. A stale reference (the
   * image was deleted since the link was generated) resolves to `undefined` — the panel
   * just stays collapsed, not an error.
   */
  function buildLibraryPickerContext(req: Request, slug: string, phaseBindingKey: string) {
    const fromImage = parseFromImageQuery(req);
    const libraryCandidates = characterImages
      .listGalleryTiles(slug)
      .filter(
        (tile) => tile.source.kind !== 'working' || tile.source.phaseBindingKey !== phaseBindingKey,
      );

    const highlightRelativePath = fromImage
      ? libraryCandidates.find(
          (tile) =>
            tile.source.kind === 'working' &&
            tile.source.phaseBindingKey === fromImage.phaseBindingKey &&
            tile.filename === fromImage.filename,
        )?.relativePath
      : undefined;

    return { libraryCandidates, highlightRelativePath };
  }

  router.get('/', (_req: Request, res: Response) => {
    res.render('characters/list.njk', {
      characters: characters.list().map((character) => ({
        ...character,
        displayImagePath: character.phaseImages.find((p) => p.display_image)?.path ?? null,
      })),
    });
  });

  router.get('/new', (_req: Request, res: Response) => {
    res.render('characters/new.njk', {});
  });

  router.post('/', (req: Request, res: Response) => {
    const name = String(req.body.name ?? '').trim();
    if (!name) throw new BadRequestError('A character name is required');

    const record = characters.create({ name });
    res.redirect(`/characters/${record.slug}`);
  });

  router.get('/:slug', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const checklist = deriveChecklist(character);
    res.render('characters/overview.njk', {
      character,
      checklist,
      rows: overviewChecklistRows(checklist),
      nextAction: getNextAction(character.slug, checklist),
    });
  });

  router.post('/:slug/delete', (req: Request, res: Response) => {
    characters.remove(param(req, 'slug'));
    res.redirect('/characters');
  });

  // ---- Character image storage ----
  //
  // These serve files out of a character's own directory tree (working images/masks per
  // phase binding, plus finalizedImages/), which also holds that character's <slug>.md and
  // eventually a <slug>.safetensors — unlike templates.service.ts's isolated uploads/
  // subdirectory, there's no single folder here that's safe to blanket-mount with
  // express.static. Every route below is scoped to a specific subdirectory shape
  // (/images/file/<phaseBindingKey>/<filename> or /images/finalized/<filename>), which
  // structurally can never address the character's root-level .md/.safetensors files —
  // those aren't reachable by any path this router accepts.
  const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|webp)$/i;

  router.get('/:slug/images', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const phaseImagePaths = new Set(character.phaseImages.map((p) => p.path));
    const tiles = characterImages.listGalleryTiles(character.slug).map((tile) => {
      const inScope =
        (tile.source.kind === 'working' && tile.source.phaseBindingKey === 'casting_preflight') ||
        tile.source.kind === 'casting';
      return inScope ? { ...tile, isCurrent: phaseImagePaths.has(tile.relativePath) } : tile;
    });
    const phaseBindingLabels = Object.fromEntries(allPhaseBindings().map((b) => [b.key, b.label]));

    const badgeFor = (tile: (typeof tiles)[number]): { value: string; label: string } =>
      tile.source.kind === 'working'
        ? {
            value: `working:${tile.source.phaseBindingKey}`,
            label: phaseBindingLabels[tile.source.phaseBindingKey] ?? tile.source.phaseBindingKey,
          }
        : {
            value: tile.source.kind,
            label: tile.source.kind === 'finalized' ? 'Finalized' : 'Casting',
          };

    const filterOptions = Array.from(
      new Map(tiles.map((tile) => [badgeFor(tile).value, badgeFor(tile)])).values(),
    );

    res.render('characters/images.njk', {
      ...baseContext(character),
      tiles,
      badges: Object.fromEntries(tiles.map((tile) => [tile.relativePath, badgeFor(tile)])),
      filterOptions,
    });
  });

  router.post('/:slug/images/:phaseBindingKey/:filename/delete', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    characterImages.deleteWorkingFile(
      character.slug,
      param(req, 'phaseBindingKey'),
      param(req, 'filename'),
    );
    res.redirect(req.get('Referer') || `/characters/${character.slug}/images`);
  });

  router.post(
    '/:slug/images/:phaseBindingKey/promote',
    (req: Request, res: Response, next: NextFunction) => {
      const character = getCharacterOr404(characters, param(req, 'slug'));
      const sourceRelativePath = String(req.body.sourceRelativePath ?? '');
      if (!sourceRelativePath) throw new BadRequestError('A source image is required');

      try {
        characterImages.promoteToPhaseBinding(
          character.slug,
          sourceRelativePath,
          param(req, 'phaseBindingKey'),
        );
      } catch (err) {
        next(err);
        return;
      }
      res.redirect(req.get('Referer') || `/characters/${character.slug}`);
    },
  );

  router.get(
    '/:slug/images/finalized/:filename',
    (req: Request, res: Response, next: NextFunction) => {
      const character = getCharacterOr404(characters, param(req, 'slug'));
      const filename = sanitizeSegment(param(req, 'filename'));
      if (!IMAGE_EXTENSION_PATTERN.test(filename)) throw new NotFoundError('Not an image file');

      const filePath = characterImages.resolvePath(
        character.slug,
        path.join('finalizedImages', filename),
      );
      res.sendFile(filePath, (err) => {
        if (err) next(new NotFoundError('Image not found'));
      });
    },
  );

  router.get(
    '/:slug/images/file/:phaseBindingKey/:filename',
    (req: Request, res: Response, next: NextFunction) => {
      const character = getCharacterOr404(characters, param(req, 'slug'));
      const phaseBindingKey = sanitizeSegment(param(req, 'phaseBindingKey'));
      const filename = sanitizeSegment(param(req, 'filename'));
      if (!IMAGE_EXTENSION_PATTERN.test(filename)) throw new NotFoundError('Not an image file');

      const filePath = characterImages.resolvePath(
        character.slug,
        path.join(phaseBindingKey, filename),
      );
      res.sendFile(filePath, (err) => {
        if (err) next(new NotFoundError('Image not found'));
      });
    },
  );

  router.post('/:slug/images/:phaseBindingKey', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const phaseBindingKey = param(req, 'phaseBindingKey');
    const kind = req.body.kind === 'mask' ? 'mask' : 'image';
    const dataUrl = String(req.body.dataUrl ?? '');
    if (!dataUrl) throw new BadRequestError('An image is required');

    characterImages.storeWorkingFile(character.slug, phaseBindingKey, kind, dataUrl);
    res.redirect(req.get('Referer') || `/characters/${character.slug}`);
  });

  // ---- Execution: trigger a phase's active workflow, stream its progress ----
  //
  // casting_batch is deliberately excluded from the generic single-result run route —
  // it needs submitCastingBatch's N-separate-prompts handling and its own tile-grid UI,
  // which isn't wired up yet (tracked as follow-up work, not silently done here).

  router.post(
    '/:slug/run/:phaseBindingKey',
    async (req: Request, res: Response, next: NextFunction) => {
      const character = getCharacterOr404(characters, param(req, 'slug'));
      const phaseBindingKey = param(req, 'phaseBindingKey');

      if (phaseBindingKey === 'casting_batch') {
        throw new BadRequestError('Casting batch is submitted separately, not through this route');
      }

      // Best-effort duplicate-submit guard — not perfectly race-free against a second
      // request landing between this check and submitSingle(), but sufficient for a
      // single-user local app; a real lock isn't worth the complexity here.
      if (isJobActive(jobStore.get(character.slug, phaseBindingKey))) {
        res.redirect(req.get('Referer') || `/characters/${character.slug}`);
        return;
      }

      // Only a few phase bindings (e.g. casting_preflight) submit a fixed seed — most
      // pages never send this field, in which case it stays undefined and buildGraph's
      // stage_input.casting_seed mapping (if the run doesn't use it) is never consulted.
      let castingSeed: number | undefined;
      if (req.body.castingSeed !== undefined && req.body.castingSeed !== '') {
        castingSeed = Number(req.body.castingSeed);
        if (!Number.isFinite(castingSeed)) throw new BadRequestError('Seed must be numeric');
      }

      try {
        await executionService.submitSingle(character.slug, phaseBindingKey, {
          customPositivePrompt: String(req.body.customPositivePrompt ?? ''),
          customNegativePrompt: String(req.body.customNegativePrompt ?? ''),
          castingSeed,
        });
      } catch (err) {
        next(err);
        return;
      }

      res.redirect(req.get('Referer') || `/characters/${character.slug}`);
    },
  );

  router.get('/:slug/events/:phaseBindingKey', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const phaseBindingKey = param(req, 'phaseBindingKey');

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.flushHeaders();

    const send = (record: JobRecord | undefined) => {
      res.write(`data: ${JSON.stringify(record ?? null)}\n\n`);
    };

    // Emit the current known state immediately on connect — a page reload opens a
    // brand-new connection and must see where things actually stand right now, not
    // only future transitions, or a reload racing a just-finished job would leave
    // the page stuck showing "loading" forever.
    send(jobStore.get(character.slug, phaseBindingKey));

    const unsubscribe = jobStore.onChange(character.slug, phaseBindingKey, send);
    req.on('close', () => unsubscribe());
  });

  // ---- Spec builder ----

  router.get('/:slug/spec', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const configuredSuggestions = app.config.loadConfig(
      'character-attributes',
      CharacterAttributesConfigSchema,
    );
    const previewIdentityBlock = compileIdentityBlock(
      character.name,
      character.useNameAsToken,
      character.attributes,
    );
    res.render('characters/spec.njk', {
      ...baseContext(character),
      templates: templates.list(),
      styles: styles.list(),
      checklistItems: CHECKLIST_DEFINITIONS.specification,
      previewIdentityBlock,
      previewPositivePrompt: applyPromptAdapter(previewIdentityBlock, character.promptAdapter, 'positive'),
      previewNegativePrompt: applyPromptAdapter(character.negativePrompt, character.promptAdapter, 'negative'),
      attributeSuggestions: mergeAttributeSuggestions(
        DEFAULT_ATTRIBUTE_SUGGESTIONS,
        configuredSuggestions,
      ),
    });
  });

  router.post('/:slug/spec', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const attributes = { ...character.attributes, ...(req.body.attributes ?? {}) };
    const useNameAsToken = Boolean(req.body.useNameAsToken);
    const identityBlock = character.identityBlockFrozen
      ? character.identityBlock
      : compileIdentityBlock(character.name, useNameAsToken, attributes);

    const styleSlug = String(req.body.styleSlug ?? '').trim();
    const selectedStyle = styleSlug ? styles.get(styleSlug) : undefined;
    const promptAdapterInput = req.body.promptAdapter ?? {};

    characters.update(character.slug, {
      attributes,
      useNameAsToken,
      body_template: String(req.body.body_template ?? character.body_template),
      identityBlock,
      negativePrompt: String(req.body.negativePrompt ?? '') || DEFAULT_NEGATIVE_PROMPT,
      promptAdapter: PromptAdapterSchema.parse({
        presetId: String(promptAdapterInput.presetId ?? ''),
        leadTags: String(promptAdapterInput.leadTags ?? ''),
        qualityTagsPositive: String(promptAdapterInput.qualityTagsPositive ?? ''),
        negativeMode: promptAdapterInput.negativeMode === 'suppressed' ? 'suppressed' : 'template',
        qualityTagsNegative: String(promptAdapterInput.qualityTagsNegative ?? ''),
      }),
      ...(selectedStyle ? applyStyleToCharacter(selectedStyle) : {}),
    });

    res.redirect(`/characters/${character.slug}/spec`);
  });

  router.post('/:slug/spec/features', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const text = String(req.body.text ?? '').trim();
    if (!text) throw new BadRequestError('Feature text is required');

    const size = ['easy', 'medium', 'hard'].includes(req.body.size) ? req.body.size : 'medium';
    characters.update(character.slug, {
      distinguishingFeatures: [...character.distinguishingFeatures, { text, size }],
    });
    res.redirect(`/characters/${character.slug}/spec`);
  });

  router.post('/:slug/spec/features/:index/delete', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const index = Number(param(req, 'index'));
    characters.update(character.slug, {
      distinguishingFeatures: character.distinguishingFeatures.filter((_, i) => i !== index),
    });
    res.redirect(`/characters/${character.slug}/spec`);
  });

  router.post('/:slug/spec/checklist', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const manualItems = ['features_listed', 'features_verifiable'];
    const checked = req.body.checklist ?? {};
    const checklist = { ...character.checklist };
    for (const id of manualItems) {
      checklist[`specification.${id}`] = Boolean(checked[id]);
    }
    characters.update(character.slug, { checklist });
    res.redirect(`/characters/${character.slug}/spec`);
  });

  // ---- Casting: pre-flight ----

  router.get('/:slug/casting/preflight', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const phaseBindingKey = 'casting_preflight';
    const job = jobStore.get(character.slug, phaseBindingKey);
    res.render('characters/casting_preflight.njk', {
      ...baseContext(character),
      items: CHECKLIST_DEFINITIONS.preflight,
      heroPath: findImagePath(character.images, 'Hero full-body'),
      phaseBindingKey,
      job: job ?? null,
      jobActive: isJobActive(job),
    });
  });

  router.post('/:slug/casting/preflight', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const checklist = {
      ...character.checklist,
      ...parsePhaseChecklist('preflight', req.body.checklist),
    };
    const currentPreflightFile = characterImages.getCurrentWorkingFile(
      character.slug,
      'casting_preflight',
      'image',
    );
    const hasWinner = character.phaseImages.some((p) => p.phase === 'casting');
    const phaseImages = currentPreflightFile
      ? upsertPhaseImage(
          character.phaseImages,
          'preflight',
          currentPreflightFile.relativePath,
          !hasWinner,
        )
      : character.phaseImages;
    characters.update(character.slug, {
      checklist,
      images: upsertImage(character.images, 'Hero full-body', String(req.body.heroPath ?? '')),
      phaseImages,
    });
    res.redirect(`/characters/${character.slug}/casting/preflight`);
  });

  // ---- Casting: batch ----

  router.get('/:slug/casting/batch', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    res.render('characters/casting_batch.njk', {
      ...baseContext(character),
      jobActive: isJobActive(jobStore.get(character.slug, 'casting_batch')),
    });
  });

  router.post(
    '/:slug/casting/batch/candidates',
    async (req: Request, res: Response, next: NextFunction) => {
      const character = getCharacterOr404(characters, param(req, 'slug'));
      const startSeed = Number(req.body.startSeed);
      const count = Math.min(Math.max(Number(req.body.count) || 1, 1), 16);
      if (!Number.isFinite(startSeed))
        throw new BadRequestError('A numeric starting seed is required');

      // Same best-effort duplicate-submit guard as the single-run route — a batch already
      // in flight shouldn't be resubmitted from a second click landing before the redirect.
      if (isJobActive(jobStore.get(character.slug, 'casting_batch'))) {
        res.redirect(`/characters/${character.slug}/casting/batch`);
        return;
      }

      const createdAt = new Date().toISOString();
      const newCandidates = Array.from({ length: count }, (_, i) => ({
        seed: startSeed + i,
        note: '',
        createdAt,
        imagePath: '',
      }));

      characters.update(character.slug, {
        castingCandidates: [...character.castingCandidates, ...newCandidates],
        checklist: {
          ...character.checklist,
          'casting.variance_strategy': true,
        },
      });

      try {
        await executionService.submitCastingBatch(character.slug, startSeed, count);
      } catch (err) {
        next(err);
        return;
      }

      res.redirect(`/characters/${character.slug}/casting/batch`);
    },
  );

  router.post('/:slug/casting/candidates/:seed/select', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const seed = Number(param(req, 'seed'));
    const candidate = character.castingCandidates.find((c) => c.seed === seed);
    const phaseImages = candidate
      ? upsertPhaseImage(character.phaseImages, 'casting', candidate.imagePath, true)
      : character.phaseImages;
    characters.update(character.slug, { winnerCandidateSeed: seed, phaseImages });
    res.redirect(`/characters/${character.slug}/casting/winner-audit`);
  });

  router.post('/:slug/casting/candidates/:seed/delete', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const seed = Number(param(req, 'seed'));
    const candidate = character.castingCandidates.find((c) => c.seed === seed);

    if (candidate && candidate.imagePath && seed !== character.winnerCandidateSeed) {
      characterImages.deleteCastingCandidate(character.slug, seed);
      characters.update(character.slug, {
        castingCandidates: character.castingCandidates.filter((c) => c.seed !== seed),
      });
    }

    res.redirect(`/characters/${character.slug}/casting/batch`);
  });

  // ---- Casting: winner audit + lock ----

  router.get('/:slug/casting/winner-audit', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const rows =
      character.auditRows.length > 0 ? character.auditRows : defaultAuditRows(character.attributes);
    const winner = character.castingCandidates.find(
      (c) => c.seed === character.winnerCandidateSeed,
    );
    res.render('characters/winner_audit.njk', { ...baseContext(character), rows, winner });
  });

  router.post('/:slug/casting/audit-rows/:index/toggle', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const index = Number(param(req, 'index'));
    const rows =
      character.auditRows.length > 0 ? character.auditRows : defaultAuditRows(character.attributes);

    if (Number.isInteger(index) && index >= 0 && index < rows.length) {
      characters.update(character.slug, {
        auditRows: rows.map((row, i) => (i === index ? { ...row, ok: !row.ok } : row)),
        checklist: { ...character.checklist, 'casting.candidates_scored': true },
      });
    }
    res.redirect(`/characters/${character.slug}/casting/winner-audit`);
  });

  router.post('/:slug/casting/audit-rows/:index/amend', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const index = Number(param(req, 'index'));
    const rows =
      character.auditRows.length > 0 ? character.auditRows : defaultAuditRows(character.attributes);
    const row = rows[index];

    if (Number.isInteger(index) && index >= 0 && row) {
      const value = String(req.body.specValue ?? '');
      const attributeKey = resolveAttributeKeyByLabel(row.attribute);
      characters.update(character.slug, {
        auditRows: rows.map((r, i) => (i === index ? { ...r, specValue: value, ok: true } : r)),
        attributes: attributeKey
          ? { ...character.attributes, [attributeKey]: value }
          : character.attributes,
        checklist: { ...character.checklist, 'casting.candidates_scored': true },
      });
    }
    res.redirect(`/characters/${character.slug}/casting/winner-audit`);
  });

  router.post('/:slug/casting/candidates/:seed/reject', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const seed = Number(param(req, 'seed'));

    if (seed === character.winnerCandidateSeed) {
      characterImages.deleteCastingCandidate(character.slug, seed);
      characters.update(character.slug, {
        castingCandidates: character.castingCandidates.filter((c) => c.seed !== seed),
        winnerCandidateSeed: null,
        auditRows: [],
      });
    }
    res.redirect(`/characters/${character.slug}/casting/batch`);
  });

  router.post('/:slug/casting/lock', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    if (character.winnerCandidateSeed === null) {
      throw new BadRequestError('Select a winning candidate before locking');
    }
    if (character.auditRows.some((row) => !row.ok)) {
      throw new BadRequestError('Resolve every flagged attribute before locking');
    }

    // deriveChecklist() recomputes these two from live character state on every render, so
    // force-writing them true here would just get silently reverted the next time the page
    // loads if the underlying data isn't actually complete — refuse to lock instead, which
    // keeps "every item through Casting & lock fully checked off" always literally true
    // right after a successful lock.
    const liveChecklist = deriveChecklist(character);
    if (
      !liveChecklist['specification.attrs_filled'] ||
      !liveChecklist['specification.identity_compiled']
    ) {
      throw new BadRequestError(
        'Every universal attribute must be filled and the identity block compiled before locking',
      );
    }

    const winningCandidate = character.castingCandidates.find(
      (c) => c.seed === character.winnerCandidateSeed,
    );
    if (winningCandidate?.imagePath) {
      // One less manual step: the winner's own image becomes 002-Face's Current Image —
      // a filesystem copy via character-images.service, no execution engine involved.
      characterImages.promoteToPhaseBinding(
        character.slug,
        winningCandidate.imagePath,
        'refinement_face_detail',
      );
    }

    characters.update(character.slug, {
      locked_seed: character.winnerCandidateSeed,
      identityBlockFrozen: true,
      checklist: forceCompleteThroughCasting(character.checklist),
    });
    res.redirect(`/characters/${character.slug}`);
  });

  // ---- Refinement ----

  router.get('/:slug/refinement', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const phaseBindingKey = REFINEMENT_PHASE_BINDING_BY_STEP[character.refinement.currentStep];
    const currentImage = characterImages.getCurrentWorkingFile(
      character.slug,
      phaseBindingKey,
      'image',
    );
    const currentMask = characterImages.getCurrentWorkingFile(
      character.slug,
      phaseBindingKey,
      'mask',
    );
    const job = jobStore.get(character.slug, phaseBindingKey);
    const { libraryCandidates, highlightRelativePath } = buildLibraryPickerContext(
      req,
      character.slug,
      phaseBindingKey,
    );

    res.render('characters/refinement.njk', {
      ...baseContext(character),
      items: CHECKLIST_DEFINITIONS.refinement,
      phaseBindingKey,
      currentImage,
      currentMask,
      job: job ?? null,
      jobActive: isJobActive(job),
      libraryCandidates,
      highlightRelativePath,
    });
  });

  // ---- Targeted Fix (007-Inpaint / targeted_fix) ----

  router.get('/:slug/targeted-fix', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const phaseBindingKey = 'targeted_fix';
    const currentImage = characterImages.getCurrentWorkingFile(
      character.slug,
      phaseBindingKey,
      'image',
    );
    const currentMask = characterImages.getCurrentWorkingFile(
      character.slug,
      phaseBindingKey,
      'mask',
    );
    const job = jobStore.get(character.slug, phaseBindingKey);
    const { libraryCandidates, highlightRelativePath } = buildLibraryPickerContext(
      req,
      character.slug,
      phaseBindingKey,
    );

    res.render('characters/targeted_fix.njk', {
      ...baseContext(character),
      phaseBindingKey,
      currentImage,
      currentMask,
      job: job ?? null,
      jobActive: isJobActive(job),
      libraryCandidates,
      highlightRelativePath,
    });
  });

  router.post('/:slug/refinement', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const step = Math.min(
      Math.max(Number(req.body.currentStep) || character.refinement.currentStep, 1),
      3,
    );

    characters.update(character.slug, {
      refinement: {
        currentStep: step,
        faceDetailDenoise:
          Number(req.body.faceDetailDenoise) || character.refinement.faceDetailDenoise,
        cleanupDenoise: Number(req.body.cleanupDenoise) || character.refinement.cleanupDenoise,
        upscaleTarget: Number(req.body.upscaleTarget) || character.refinement.upscaleTarget,
      },
      checklist: {
        ...character.checklist,
        ...parsePhaseChecklist('refinement', req.body.checklist),
      },
    });
    res.redirect(`/characters/${character.slug}/refinement`);
  });

  // ---- Anchor kit hub ----

  router.get('/:slug/kit', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    res.render('characters/kit.njk', {
      ...baseContext(character),
      items: CHECKLIST_DEFINITIONS.anchorKit,
    });
  });

  router.post('/:slug/kit/images', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const label = String(req.body.label ?? '').trim();
    if (!label) throw new BadRequestError('An image label is required');

    characters.update(character.slug, {
      images: upsertImage(
        character.images,
        label,
        String(req.body.path ?? ''),
        String(req.body.notes ?? ''),
      ),
    });
    res.redirect(`/characters/${character.slug}/kit`);
  });

  router.post('/:slug/kit/checklist', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const manualItems = ['polish_before_fix', 'detail_closeups', 'loose_hair_alt'];
    const checked = req.body.checklist ?? {};
    const checklist = { ...character.checklist };
    for (const id of manualItems) {
      checklist[`anchorKit.${id}`] = Boolean(checked[id]);
    }
    characters.update(character.slug, { checklist });
    res.redirect(`/characters/${character.slug}/kit`);
  });

  // ---- Face crop ----

  router.get('/:slug/kit/face-crop', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    res.render('characters/face_crop.njk', baseContext(character));
  });

  router.post('/:slug/kit/face-crop', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    characters.update(character.slug, {
      faceCrop: {
        path: String(req.body.path ?? ''),
        confirmed: Boolean(req.body.confirmed),
      },
      images: upsertImage(
        character.images,
        'Face crop (square, front)',
        String(req.body.path ?? ''),
      ),
    });
    res.redirect(`/characters/${character.slug}/kit/face-crop`);
  });

  // ---- View generation ----

  router.get('/:slug/kit/views', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const fromImage = parseFromImageQuery(req);
    const highlightTile = fromImage
      ? characterImages
          .listGalleryTiles(character.slug)
          .find(
            (tile) =>
              tile.source.kind === 'working' &&
              tile.source.phaseBindingKey === fromImage.phaseBindingKey &&
              tile.filename === fromImage.filename,
          )
      : undefined;
    const highlightImageSrc = highlightTile
      ? highlightTile.source.kind === 'finalized'
        ? `/characters/${character.slug}/images/finalized/${highlightTile.filename}`
        : `/characters/${character.slug}/images/file/${highlightTile.relativePath}`
      : undefined;

    res.render('characters/view_generation.njk', {
      ...baseContext(character),
      availableViewDefs: VIEW_DEFINITIONS.filter(
        (def) => !character.views.some((v) => v.key === def.key),
      ),
      highlightRelativePath: highlightTile?.relativePath,
      highlightImageSrc,
    });
  });

  router.post('/:slug/kit/views', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const def = VIEW_DEFINITIONS.find((v) => v.key === req.body.key);
    if (!def) throw new BadRequestError('Unknown view type');
    if (character.views.some((v) => v.key === def.key)) {
      throw new BadRequestError(`${def.label} has already been added`);
    }

    characters.update(character.slug, {
      views: [
        ...character.views,
        {
          key: def.key,
          label: def.label,
          changeClause: def.changeClause,
          reorient: def.reorient,
          status: 'pending',
          seed: null,
          imagePath: '',
          rating: 0,
        },
      ],
    });
    res.redirect(`/characters/${character.slug}/kit/views`);
  });

  router.post('/:slug/kit/views/:key', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const status = ['pending', 'generating', 'done'].includes(req.body.status)
      ? req.body.status
      : 'pending';

    characters.update(character.slug, {
      views: character.views.map((view) =>
        view.key === param(req, 'key')
          ? {
              ...view,
              changeClause: String(req.body.changeClause ?? view.changeClause),
              reorient: Boolean(req.body.reorient),
              status,
              seed: req.body.seed ? Number(req.body.seed) : view.seed,
              imagePath: String(req.body.imagePath ?? view.imagePath),
              rating: Number(req.body.rating) || 0,
            }
          : view,
      ),
    });
    res.redirect(`/characters/${character.slug}/kit/views`);
  });

  router.post('/:slug/kit/views/:key/delete', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    characters.update(character.slug, {
      views: character.views.filter((view) => view.key !== param(req, 'key')),
    });
    res.redirect(`/characters/${character.slug}/kit/views`);
  });

  // ---- Polish ----

  router.get('/:slug/kit/polish/:viewKey', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const view = character.views.find((v) => v.key === param(req, 'viewKey'));
    if (!view) throw new NotFoundError(`View "${param(req, 'viewKey')}" not found`);

    const polish = character.polish.find((p) => p.viewKey === param(req, 'viewKey')) ?? {
      viewKey: param(req, 'viewKey'),
      denoise: 0.21,
      eyesChecked: false,
      accepted: false,
      fixMode: 'remove' as const,
      fixDescription: '',
      brushSize: 14,
      fixApplied: false,
    };

    res.render('characters/polish.njk', { ...baseContext(character), view, polish });
  });

  router.post('/:slug/kit/polish/:viewKey', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const existing = character.polish.find((p) => p.viewKey === param(req, 'viewKey'));

    const next = {
      viewKey: param(req, 'viewKey'),
      denoise: Number(req.body.denoise) || existing?.denoise || 0.21,
      eyesChecked: Boolean(req.body.eyesChecked),
      accepted: Boolean(req.body.accepted) || existing?.accepted || false,
      fixMode: req.body.fixMode === 'add' ? ('add' as const) : ('remove' as const),
      fixDescription: String(req.body.fixDescription ?? existing?.fixDescription ?? ''),
      brushSize: Number(req.body.brushSize) || existing?.brushSize || 14,
      fixApplied: Boolean(req.body.fixApplied) || existing?.fixApplied || false,
    };

    const polish = existing
      ? character.polish.map((p) => (p.viewKey === param(req, 'viewKey') ? next : p))
      : [...character.polish, next];

    characters.update(character.slug, { polish });
    res.redirect(`/characters/${character.slug}/kit/polish/${param(req, 'viewKey')}`);
  });

  // ---- Downstream validation ----

  router.get('/:slug/validation', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    res.render('characters/validation.njk', baseContext(character));
  });

  router.post('/:slug/validation', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const field = (key: string) => ({
      status: ['not-run', 'pass', 'fail'].includes(req.body[key]?.status)
        ? req.body[key].status
        : 'not-run',
      note: String(req.body[key]?.note ?? ''),
    });

    characters.update(character.slug, {
      downstreamValidation: {
        newPose: field('newPose'),
        newOutfit: field('newOutfit'),
        noTemplateProportions: field('noTemplateProportions'),
      },
    });
    res.redirect(`/characters/${character.slug}/validation`);
  });

  // ---- Dataset tracking ----

  router.get('/:slug/dataset', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    res.render('characters/dataset.njk', baseContext(character));
  });

  router.post('/:slug/dataset', (req: Request, res: Response) => {
    const character = getCharacterOr404(characters, param(req, 'slug'));
    const checked = req.body.checklist ?? {};

    characters.update(character.slug, {
      dataset: {
        imagesCount: Number(req.body.imagesCount) || 0,
        targetMin: Number(req.body.targetMin) || character.dataset.targetMin,
        targetMax: Number(req.body.targetMax) || character.dataset.targetMax,
        notes: String(req.body.notes ?? ''),
      },
      checklist: {
        ...character.checklist,
        'dataset.curated': Boolean(checked.curated),
        'dataset.lora_trained': Boolean(checked.lora_trained),
        'dataset.lora_tested': Boolean(checked.lora_tested),
      },
    });
    res.redirect(`/characters/${character.slug}/dataset`);
  });

  return router;
}

function upsertImage(
  images: CharacterRecord['images'],
  label: string,
  path: string,
  notes = '',
): CharacterRecord['images'] {
  const existing = images.find((image) => image.label === label);
  const existingNotes = existing?.notes ?? notes;
  const withoutLabel = images.filter((image) => image.label !== label);
  return [
    ...withoutLabel,
    { label, path, maskPath: existing?.maskPath ?? '', notes: notes || existingNotes },
  ];
}
