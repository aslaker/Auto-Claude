import { IPC_CHANNELS } from '../../../shared/constants';
import type {
  Persona,
  PersonasConfig,
  PersonaGenerationStatus,
  PersonaEnrichmentInput,
  PersonaEnrichmentStatus,
  IPCResult
} from '../../../shared/types';
import { createIpcListener, invokeIpc, sendIpc, IpcListenerCleanup } from './ipc-utils';

export interface PersonaGenerationOptions {
  enableResearch: boolean;
}

/**
 * Persona API operations
 */
export interface PersonaAPI {
  // Operations
  getPersonas: (projectId: string) => Promise<IPCResult<PersonasConfig | null>>;
  generatePersonas: (projectId: string, options: PersonaGenerationOptions) => void;
  refreshPersonas: (projectId: string, options: PersonaGenerationOptions) => void;
  stopPersonas: (projectId: string) => Promise<IPCResult>;
  savePersonas: (projectId: string, personas: Persona[]) => Promise<IPCResult>;
  updatePersona: (
    projectId: string,
    personaId: string,
    updates: Partial<Persona>
  ) => Promise<IPCResult>;
  deletePersona: (projectId: string, personaId: string) => Promise<IPCResult>;
  addPersona: (projectId: string, persona: Persona) => Promise<IPCResult>;

  // Enrichment operations (AI-assisted creation)
  enrichNewPersona: (projectId: string, input: PersonaEnrichmentInput) => void;
  enrichExistingPersona: (projectId: string, personaId: string) => void;
  addManualPersona: (projectId: string, persona: Persona) => Promise<IPCResult<Persona>>;

  // Event Listeners
  onPersonaProgress: (
    callback: (projectId: string, status: PersonaGenerationStatus) => void
  ) => IpcListenerCleanup;
  onPersonaComplete: (
    callback: (projectId: string, config: PersonasConfig) => void
  ) => IpcListenerCleanup;
  onPersonaError: (
    callback: (projectId: string, error: string) => void
  ) => IpcListenerCleanup;
  onPersonaStopped: (
    callback: (projectId: string) => void
  ) => IpcListenerCleanup;

  // Enrichment event listeners
  onPersonaEnrichmentProgress: (
    callback: (projectId: string, status: PersonaEnrichmentStatus) => void
  ) => IpcListenerCleanup;
  onPersonaEnrichmentComplete: (
    callback: (projectId: string, persona: Persona) => void
  ) => IpcListenerCleanup;
  onPersonaEnrichmentError: (
    callback: (projectId: string, error: string) => void
  ) => IpcListenerCleanup;
}

/**
 * Creates the Persona API implementation
 */
export const createPersonaAPI = (): PersonaAPI => ({
  // Operations
  getPersonas: (projectId: string): Promise<IPCResult<PersonasConfig | null>> =>
    invokeIpc(IPC_CHANNELS.PERSONA_GET, projectId),

  generatePersonas: (projectId: string, options: PersonaGenerationOptions): void =>
    sendIpc(IPC_CHANNELS.PERSONA_GENERATE, projectId, options),

  refreshPersonas: (projectId: string, options: PersonaGenerationOptions): void =>
    sendIpc(IPC_CHANNELS.PERSONA_REFRESH, projectId, options),

  stopPersonas: (projectId: string): Promise<IPCResult> =>
    invokeIpc(IPC_CHANNELS.PERSONA_STOP, projectId),

  savePersonas: (projectId: string, personas: Persona[]): Promise<IPCResult> =>
    invokeIpc(IPC_CHANNELS.PERSONA_SAVE, projectId, personas),

  updatePersona: (
    projectId: string,
    personaId: string,
    updates: Partial<Persona>
  ): Promise<IPCResult> =>
    invokeIpc(IPC_CHANNELS.PERSONA_UPDATE, projectId, personaId, updates),

  deletePersona: (projectId: string, personaId: string): Promise<IPCResult> =>
    invokeIpc(IPC_CHANNELS.PERSONA_DELETE, projectId, personaId),

  addPersona: (projectId: string, persona: Persona): Promise<IPCResult> =>
    invokeIpc(IPC_CHANNELS.PERSONA_ADD, projectId, persona),

  // Enrichment operations
  enrichNewPersona: (projectId: string, input: PersonaEnrichmentInput): void =>
    sendIpc(IPC_CHANNELS.PERSONA_ENRICH_NEW, projectId, input),

  enrichExistingPersona: (projectId: string, personaId: string): void =>
    sendIpc(IPC_CHANNELS.PERSONA_ENRICH_EXISTING, projectId, personaId),

  addManualPersona: (projectId: string, persona: Persona): Promise<IPCResult<Persona>> =>
    invokeIpc(IPC_CHANNELS.PERSONA_ADD_MANUAL, projectId, persona),

  // Event Listeners
  onPersonaProgress: (
    callback: (projectId: string, status: PersonaGenerationStatus) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.PERSONA_PROGRESS, callback),

  onPersonaComplete: (
    callback: (projectId: string, config: PersonasConfig) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.PERSONA_COMPLETE, callback),

  onPersonaError: (
    callback: (projectId: string, error: string) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.PERSONA_ERROR, callback),

  onPersonaStopped: (
    callback: (projectId: string) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.PERSONA_STOPPED, callback),

  // Enrichment event listeners
  onPersonaEnrichmentProgress: (
    callback: (projectId: string, status: PersonaEnrichmentStatus) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.PERSONA_ENRICHMENT_PROGRESS, callback),

  onPersonaEnrichmentComplete: (
    callback: (projectId: string, persona: Persona) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.PERSONA_ENRICHMENT_COMPLETE, callback),

  onPersonaEnrichmentError: (
    callback: (projectId: string, error: string) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.PERSONA_ENRICHMENT_ERROR, callback)
});
