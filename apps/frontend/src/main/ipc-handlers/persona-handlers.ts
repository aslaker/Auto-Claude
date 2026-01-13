import { ipcMain, app } from 'electron';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS, AUTO_BUILD_PATHS, DEFAULT_APP_SETTINGS, DEFAULT_FEATURE_MODELS, DEFAULT_FEATURE_THINKING } from '../../shared/constants';
import type { IPCResult, Persona, PersonasConfig, PersonaGenerationStatus, PersonaEnrichmentInput, PersonaEnrichmentStatus, AppSettings } from '../../shared/types';
import type { PersonaConfig } from '../agent/types';
import path from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { projectStore } from '../project-store';
import { AgentManager } from '../agent';
import { debugLog, debugError } from '../../shared/utils/debug-logger';

/**
 * Read feature settings from the settings file
 */
function getFeatureSettings(): { model?: string; thinkingLevel?: string } {
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');

  try {
    if (existsSync(settingsPath)) {
      const content = readFileSync(settingsPath, 'utf-8');
      const settings: AppSettings = { ...DEFAULT_APP_SETTINGS, ...JSON.parse(content) };

      // Get persona-specific settings (use ideation settings as default since personas is similar)
      const featureModels = settings.featureModels || DEFAULT_FEATURE_MODELS;
      const featureThinking = settings.featureThinking || DEFAULT_FEATURE_THINKING;

      return {
        model: featureModels.ideation || 'sonnet', // Use ideation model for personas
        thinkingLevel: featureThinking.ideation || 'medium'
      };
    }
  } catch (error) {
    debugError('[Persona Handler] Failed to read feature settings:', error);
  }

  // Return defaults if settings file doesn't exist or fails to parse
  return {
    model: 'sonnet',
    thinkingLevel: 'medium'
  };
}

/**
 * Transform snake_case persona data from JSON to camelCase for frontend
 */
function transformPersonaFromFile(raw: Record<string, unknown>): Persona {
  return {
    id: raw.id as string,
    name: raw.name as string,
    type: raw.type as 'primary' | 'secondary' | 'edge-case',
    tagline: raw.tagline as string,
    avatar: {
      initials: (raw.avatar as Record<string, unknown>)?.initials as string || '',
      color: (raw.avatar as Record<string, unknown>)?.color as string || '#4F46E5'
    },
    demographics: {
      role: (raw.demographics as Record<string, unknown>)?.role as string || '',
      experienceLevel: (raw.demographics as Record<string, unknown>)?.experienceLevel as Persona['demographics']['experienceLevel'] || 'mid',
      industry: (raw.demographics as Record<string, unknown>)?.industry as string,
      companySize: (raw.demographics as Record<string, unknown>)?.companySize as Persona['demographics']['companySize']
    },
    goals: ((raw.goals as Array<Record<string, unknown>>) || []).map(g => ({
      id: g.id as string,
      description: g.description as string,
      priority: g.priority as 'must-have' | 'should-have' | 'nice-to-have'
    })),
    painPoints: ((raw.painPoints as Array<Record<string, unknown>>) || []).map(p => ({
      id: p.id as string,
      description: p.description as string,
      severity: p.severity as 'high' | 'medium' | 'low',
      currentWorkaround: p.currentWorkaround as string | undefined
    })),
    behaviors: {
      usageFrequency: (raw.behaviors as Record<string, unknown>)?.usageFrequency as Persona['behaviors']['usageFrequency'] || 'weekly',
      preferredChannels: ((raw.behaviors as Record<string, unknown>)?.preferredChannels as string[]) || [],
      decisionFactors: ((raw.behaviors as Record<string, unknown>)?.decisionFactors as string[]) || [],
      toolStack: ((raw.behaviors as Record<string, unknown>)?.toolStack as string[]) || []
    },
    quotes: (raw.quotes as string[]) || [],
    scenarios: ((raw.scenarios as Array<Record<string, unknown>>) || []).map(s => ({
      id: s.id as string,
      title: s.title as string,
      context: s.context as string,
      action: s.action as string,
      outcome: s.outcome as string
    })),
    featurePreferences: {
      mustHave: ((raw.featurePreferences as Record<string, unknown>)?.mustHave as string[]) || [],
      niceToHave: ((raw.featurePreferences as Record<string, unknown>)?.niceToHave as string[]) || [],
      avoid: ((raw.featurePreferences as Record<string, unknown>)?.avoid as string[]) || []
    },
    discoverySource: {
      userTypeId: (raw.discoverySource as Record<string, unknown>)?.userTypeId as string || '',
      confidence: (raw.discoverySource as Record<string, unknown>)?.confidence as 'high' | 'medium' | 'low' || 'medium',
      researchEnriched: (raw.discoverySource as Record<string, unknown>)?.researchEnriched as boolean || false
    },
    createdAt: raw.createdAt as string || new Date().toISOString(),
    updatedAt: raw.updatedAt as string || new Date().toISOString()
  };
}

/**
 * Register all persona-related IPC handlers
 */
export function registerPersonaHandlers(
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null
): void {
  // ============================================
  // Persona Operations
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.PERSONA_GET,
    async (_, projectId: string): Promise<IPCResult<PersonasConfig | null>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const personasPath = path.join(
        project.path,
        AUTO_BUILD_PATHS.PERSONAS_DIR,
        AUTO_BUILD_PATHS.PERSONAS_FILE
      );

      if (!existsSync(personasPath)) {
        return { success: true, data: null };
      }

      try {
        const content = readFileSync(personasPath, 'utf-8');
        const rawData = JSON.parse(content);

        // Transform to frontend format
        const config: PersonasConfig = {
          version: rawData.version || '1.0',
          projectId: rawData.projectId || projectId,
          personas: (rawData.personas || []).map(transformPersonaFromFile),
          metadata: {
            generatedAt: rawData.metadata?.generatedAt || new Date().toISOString(),
            discoverySynced: rawData.metadata?.discoverySynced ?? true,
            researchEnriched: rawData.metadata?.researchEnriched ?? false,
            roadmapSynced: rawData.metadata?.roadmapSynced ?? false,
            personaCount: (rawData.personas || []).length
          }
        };

        return { success: true, data: config };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to read personas'
        };
      }
    }
  );

  ipcMain.on(
    IPC_CHANNELS.PERSONA_GENERATE,
    (_, projectId: string, options: { enableResearch: boolean }) => {
      const featureSettings = getFeatureSettings();
      const config: PersonaConfig = {
        model: featureSettings.model,
        thinkingLevel: featureSettings.thinkingLevel,
        enableResearch: options.enableResearch
      };

      debugLog('[Persona Handler] Generate request:', {
        projectId,
        enableResearch: options.enableResearch,
        config
      });

      const mainWindow = getMainWindow();
      if (!mainWindow) return;

      const project = projectStore.getProject(projectId);
      if (!project) {
        debugError('[Persona Handler] Project not found:', projectId);
        mainWindow.webContents.send(
          IPC_CHANNELS.PERSONA_ERROR,
          projectId,
          'Project not found'
        );
        return;
      }

      debugLog('[Persona Handler] Starting agent manager generation:', {
        projectId,
        projectPath: project.path,
        config
      });

      // Start persona generation via agent manager
      agentManager.startPersonaGeneration(
        projectId,
        project.path,
        false, // refresh (not a refresh operation)
        config
      );

      // Send initial progress
      mainWindow.webContents.send(
        IPC_CHANNELS.PERSONA_PROGRESS,
        projectId,
        {
          phase: 'analyzing',
          progress: 10,
          message: 'Analyzing project structure...'
        } as PersonaGenerationStatus
      );
    }
  );

  ipcMain.on(
    IPC_CHANNELS.PERSONA_REFRESH,
    (_, projectId: string, options: { enableResearch: boolean }) => {
      const featureSettings = getFeatureSettings();
      const config: PersonaConfig = {
        model: featureSettings.model,
        thinkingLevel: featureSettings.thinkingLevel,
        enableResearch: options.enableResearch
      };

      debugLog('[Persona Handler] Refresh request:', {
        projectId,
        enableResearch: options.enableResearch,
        config
      });

      const mainWindow = getMainWindow();
      if (!mainWindow) return;

      const project = projectStore.getProject(projectId);
      if (!project) {
        mainWindow.webContents.send(
          IPC_CHANNELS.PERSONA_ERROR,
          projectId,
          'Project not found'
        );
        return;
      }

      // Start persona regeneration with refresh flag
      agentManager.startPersonaGeneration(
        projectId,
        project.path,
        true, // refresh (this is a refresh operation)
        config
      );

      // Send initial progress
      mainWindow.webContents.send(
        IPC_CHANNELS.PERSONA_PROGRESS,
        projectId,
        {
          phase: 'analyzing',
          progress: 10,
          message: 'Refreshing personas...'
        } as PersonaGenerationStatus
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PERSONA_STOP,
    async (_, projectId: string): Promise<IPCResult> => {
      debugLog('[Persona Handler] Stop generation request:', { projectId });

      const mainWindow = getMainWindow();

      // Stop persona generation for this project
      const wasStopped = agentManager.stopPersonas(projectId);

      debugLog('[Persona Handler] Stop result:', { projectId, wasStopped });

      if (wasStopped && mainWindow) {
        debugLog('[Persona Handler] Sending stopped event to renderer');
        mainWindow.webContents.send(IPC_CHANNELS.PERSONA_STOPPED, projectId);
      }

      return { success: wasStopped };
    }
  );

  // ============================================
  // Persona Save (full state persistence)
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.PERSONA_SAVE,
    async (
      _,
      projectId: string,
      personas: Persona[]
    ): Promise<IPCResult> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const personasDir = path.join(project.path, AUTO_BUILD_PATHS.PERSONAS_DIR);
      const personasPath = path.join(personasDir, AUTO_BUILD_PATHS.PERSONAS_FILE);

      // Ensure directory exists
      if (!existsSync(personasDir)) {
        mkdirSync(personasDir, { recursive: true });
      }

      try {
        let existingData: Record<string, unknown> = {};
        if (existsSync(personasPath)) {
          const content = readFileSync(personasPath, 'utf-8');
          existingData = JSON.parse(content);
        }

        // Update personas and metadata
        existingData.personas = personas;
        existingData.metadata = {
          ...(existingData.metadata as Record<string, unknown> || {}),
          personaCount: personas.length,
          updatedAt: new Date().toISOString()
        };

        writeFileSync(personasPath, JSON.stringify(existingData, null, 2));

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to save personas'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PERSONA_UPDATE,
    async (
      _,
      projectId: string,
      personaId: string,
      updates: Partial<Persona>
    ): Promise<IPCResult> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const personasPath = path.join(
        project.path,
        AUTO_BUILD_PATHS.PERSONAS_DIR,
        AUTO_BUILD_PATHS.PERSONAS_FILE
      );

      if (!existsSync(personasPath)) {
        return { success: false, error: 'Personas not found' };
      }

      try {
        const content = readFileSync(personasPath, 'utf-8');
        const data = JSON.parse(content);

        // Find and update the persona
        const personaIndex = data.personas?.findIndex((p: { id: string }) => p.id === personaId);
        if (personaIndex === -1 || personaIndex === undefined) {
          return { success: false, error: 'Persona not found' };
        }

        data.personas[personaIndex] = {
          ...data.personas[personaIndex],
          ...updates,
          updatedAt: new Date().toISOString()
        };
        data.metadata = data.metadata || {};
        data.metadata.updatedAt = new Date().toISOString();

        writeFileSync(personasPath, JSON.stringify(data, null, 2));

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update persona'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PERSONA_DELETE,
    async (
      _,
      projectId: string,
      personaId: string
    ): Promise<IPCResult> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const personasPath = path.join(
        project.path,
        AUTO_BUILD_PATHS.PERSONAS_DIR,
        AUTO_BUILD_PATHS.PERSONAS_FILE
      );

      if (!existsSync(personasPath)) {
        return { success: false, error: 'Personas not found' };
      }

      try {
        const content = readFileSync(personasPath, 'utf-8');
        const data = JSON.parse(content);

        // Filter out the persona
        const originalCount = data.personas?.length || 0;
        data.personas = (data.personas || []).filter((p: { id: string }) => p.id !== personaId);

        if (data.personas.length === originalCount) {
          return { success: false, error: 'Persona not found' };
        }

        data.metadata = data.metadata || {};
        data.metadata.personaCount = data.personas.length;
        data.metadata.updatedAt = new Date().toISOString();

        writeFileSync(personasPath, JSON.stringify(data, null, 2));

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete persona'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PERSONA_ADD,
    async (
      _,
      projectId: string,
      persona: Persona
    ): Promise<IPCResult> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const personasDir = path.join(project.path, AUTO_BUILD_PATHS.PERSONAS_DIR);
      const personasPath = path.join(personasDir, AUTO_BUILD_PATHS.PERSONAS_FILE);

      // Ensure directory exists
      if (!existsSync(personasDir)) {
        mkdirSync(personasDir, { recursive: true });
      }

      try {
        let data: Record<string, unknown> = {
          version: '1.0',
          projectId,
          personas: [],
          metadata: {
            generatedAt: new Date().toISOString(),
            discoverySynced: false,
            researchEnriched: false,
            roadmapSynced: false,
            personaCount: 0
          }
        };

        if (existsSync(personasPath)) {
          const content = readFileSync(personasPath, 'utf-8');
          data = JSON.parse(content);
        }

        // Add the new persona
        const personas = data.personas as Persona[] || [];
        personas.push({
          ...persona,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        data.personas = personas;

        data.metadata = data.metadata || {};
        (data.metadata as Record<string, unknown>).personaCount = personas.length;
        (data.metadata as Record<string, unknown>).updatedAt = new Date().toISOString();

        writeFileSync(personasPath, JSON.stringify(data, null, 2));

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add persona'
        };
      }
    }
  );

  // ============================================
  // Persona Enrichment Operations (AI-assisted creation)
  // ============================================

  ipcMain.on(
    IPC_CHANNELS.PERSONA_ENRICH_NEW,
    (_, projectId: string, input: PersonaEnrichmentInput) => {
      debugLog('[Persona Handler] Enrich new persona request:', {
        projectId,
        role: input.role,
        type: input.type
      });

      const mainWindow = getMainWindow();
      if (!mainWindow) return;

      const project = projectStore.getProject(projectId);
      if (!project) {
        debugError('[Persona Handler] Project not found:', projectId);
        mainWindow.webContents.send(
          IPC_CHANNELS.PERSONA_ENRICHMENT_ERROR,
          projectId,
          'Project not found'
        );
        return;
      }

      // Send initial progress
      mainWindow.webContents.send(
        IPC_CHANNELS.PERSONA_ENRICHMENT_PROGRESS,
        projectId,
        {
          phase: 'researching',
          progress: 10,
          message: 'Starting AI-assisted persona creation...'
        } as PersonaEnrichmentStatus
      );

      // Start enrichment via agent manager
      agentManager.startPersonaEnrichment(
        projectId,
        project.path,
        input
      );
    }
  );

  ipcMain.on(
    IPC_CHANNELS.PERSONA_ENRICH_EXISTING,
    (_, projectId: string, personaId: string) => {
      debugLog('[Persona Handler] Enrich existing persona request:', {
        projectId,
        personaId
      });

      const mainWindow = getMainWindow();
      if (!mainWindow) return;

      const project = projectStore.getProject(projectId);
      if (!project) {
        debugError('[Persona Handler] Project not found:', projectId);
        mainWindow.webContents.send(
          IPC_CHANNELS.PERSONA_ENRICHMENT_ERROR,
          projectId,
          'Project not found'
        );
        return;
      }

      // Load the existing persona from file
      const personasPath = path.join(
        project.path,
        AUTO_BUILD_PATHS.PERSONAS_DIR,
        AUTO_BUILD_PATHS.PERSONAS_FILE
      );

      if (!existsSync(personasPath)) {
        mainWindow.webContents.send(
          IPC_CHANNELS.PERSONA_ENRICHMENT_ERROR,
          projectId,
          'Personas file not found'
        );
        return;
      }

      try {
        const content = readFileSync(personasPath, 'utf-8');
        const data = JSON.parse(content);
        const persona = data.personas?.find((p: { id: string }) => p.id === personaId);

        if (!persona) {
          mainWindow.webContents.send(
            IPC_CHANNELS.PERSONA_ENRICHMENT_ERROR,
            projectId,
            'Persona not found'
          );
          return;
        }

        // Send initial progress
        mainWindow.webContents.send(
          IPC_CHANNELS.PERSONA_ENRICHMENT_PROGRESS,
          projectId,
          {
            phase: 'researching',
            progress: 10,
            message: 'Starting AI enrichment for existing persona...'
          } as PersonaEnrichmentStatus
        );

        // Start enrichment via agent manager
        agentManager.startPersonaEnrichmentExisting(
          projectId,
          project.path,
          personaId,
          transformPersonaFromFile(persona)
        );
      } catch (error) {
        debugError('[Persona Handler] Failed to read persona:', error);
        mainWindow.webContents.send(
          IPC_CHANNELS.PERSONA_ENRICHMENT_ERROR,
          projectId,
          error instanceof Error ? error.message : 'Failed to read persona'
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PERSONA_ADD_MANUAL,
    async (
      _,
      projectId: string,
      persona: Persona
    ): Promise<IPCResult<Persona>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const personasDir = path.join(project.path, AUTO_BUILD_PATHS.PERSONAS_DIR);
      const personasPath = path.join(personasDir, AUTO_BUILD_PATHS.PERSONAS_FILE);

      // Ensure directory exists
      if (!existsSync(personasDir)) {
        mkdirSync(personasDir, { recursive: true });
      }

      try {
        let data: Record<string, unknown> = {
          version: '1.0',
          projectId,
          personas: [],
          metadata: {
            generatedAt: new Date().toISOString(),
            discoverySynced: false,
            researchEnriched: false,
            roadmapSynced: false,
            personaCount: 0
          }
        };

        if (existsSync(personasPath)) {
          const content = readFileSync(personasPath, 'utf-8');
          data = JSON.parse(content);
        }

        // Generate ID if not provided
        const newPersona: Persona = {
          ...persona,
          id: persona.id || `persona-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        // Add the new persona
        const personas = data.personas as Persona[] || [];
        personas.push(newPersona);
        data.personas = personas;

        data.metadata = data.metadata || {};
        (data.metadata as Record<string, unknown>).personaCount = personas.length;
        (data.metadata as Record<string, unknown>).updatedAt = new Date().toISOString();

        writeFileSync(personasPath, JSON.stringify(data, null, 2));

        return { success: true, data: newPersona };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add manual persona'
        };
      }
    }
  );

  // ============================================
  // Persona Agent Events → Renderer
  // ============================================

  agentManager.on('persona-progress', (projectId: string, status: PersonaGenerationStatus) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.PERSONA_PROGRESS, projectId, status);
    }
  });

  agentManager.on('persona-complete', (projectId: string, config: PersonasConfig) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.PERSONA_COMPLETE, projectId, config);
    }
  });

  agentManager.on('persona-error', (projectId: string, error: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.PERSONA_ERROR, projectId, error);
    }
  });

  // Persona enrichment events
  agentManager.on('persona-enrichment-progress', (projectId: string, status: PersonaEnrichmentStatus) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.PERSONA_ENRICHMENT_PROGRESS, projectId, status);
    }
  });

  agentManager.on('persona-enrichment-complete', (projectId: string, persona: Persona) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.PERSONA_ENRICHMENT_COMPLETE, projectId, persona);
    }
  });

  agentManager.on('persona-enrichment-error', (projectId: string, error: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.PERSONA_ENRICHMENT_ERROR, projectId, error);
    }
  });
}
