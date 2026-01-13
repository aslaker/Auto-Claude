import { useEffect, useState, useCallback } from 'react';
import {
  usePersonaStore,
  loadPersonas,
  generatePersonas,
  refreshPersonas,
  stopPersonas,
  savePersonas,
} from '../../stores/persona-store';
import type { Persona, PersonaGenerationStatus, PersonaEnrichmentStatus } from '../../../shared/types';

export function usePersonaData(projectId: string) {
  const personas = usePersonaStore((state) => state.personas);
  const generationStatus = usePersonaStore((state) => state.generationStatus);
  const currentProjectId = usePersonaStore((state) => state.currentProjectId);

  useEffect(() => {
    if (projectId) {
      loadPersonas(projectId);
    }
  }, [projectId]);

  // Set up event listeners for generation progress
  useEffect(() => {
    if (!projectId) return;

    const handleProgress = (eventProjectId: string, status: PersonaGenerationStatus) => {
      if (eventProjectId === projectId) {
        usePersonaStore.getState().setGenerationStatus(status);
      }
    };

    const handleComplete = async (eventProjectId: string) => {
      if (eventProjectId === projectId) {
        usePersonaStore.getState().setGenerationStatus({
          phase: 'complete',
          progress: 100,
          message: 'Persona generation complete!',
        });
        // Reload personas after generation
        await loadPersonas(projectId);
      }
    };

    const handleError = (eventProjectId: string, error: string) => {
      if (eventProjectId === projectId) {
        usePersonaStore.getState().setGenerationStatus({
          phase: 'error',
          progress: 0,
          message: 'Generation failed',
          error,
        });
      }
    };

    const handleStopped = (eventProjectId: string) => {
      if (eventProjectId === projectId) {
        usePersonaStore.getState().setGenerationStatus({
          phase: 'idle',
          progress: 0,
          message: 'Generation stopped',
        });
      }
    };

    // Subscribe to events
    window.electronAPI.onPersonaProgress?.(handleProgress);
    window.electronAPI.onPersonaComplete?.(handleComplete);
    window.electronAPI.onPersonaError?.(handleError);
    window.electronAPI.onPersonaStopped?.(handleStopped);

    return () => {
      window.electronAPI.offPersonaProgress?.(handleProgress);
      window.electronAPI.offPersonaComplete?.(handleComplete);
      window.electronAPI.offPersonaError?.(handleError);
      window.electronAPI.offPersonaStopped?.(handleStopped);
    };
  }, [projectId]);

  return {
    personas,
    generationStatus,
    currentProjectId,
  };
}

export function usePersonaGeneration(projectId: string) {
  const [showResearchDialog, setShowResearchDialog] = useState(false);
  const [isRefresh, setIsRefresh] = useState(false);

  const handleGenerate = useCallback(() => {
    setIsRefresh(false);
    setShowResearchDialog(true);
  }, []);

  const handleRefresh = useCallback(() => {
    setIsRefresh(true);
    setShowResearchDialog(true);
  }, []);

  const handleEnableResearch = useCallback(() => {
    setShowResearchDialog(false);
    if (isRefresh) {
      refreshPersonas(projectId, true);
    } else {
      generatePersonas(projectId, true);
    }
  }, [projectId, isRefresh]);

  const handleSkipResearch = useCallback(() => {
    setShowResearchDialog(false);
    if (isRefresh) {
      refreshPersonas(projectId, false);
    } else {
      generatePersonas(projectId, false);
    }
  }, [projectId, isRefresh]);

  const handleStop = useCallback(async () => {
    await stopPersonas(projectId);
  }, [projectId]);

  return {
    showResearchDialog,
    setShowResearchDialog,
    handleGenerate,
    handleRefresh,
    handleEnableResearch,
    handleSkipResearch,
    handleStop,
  };
}

export function usePersonaSave(projectId: string) {
  const personas = usePersonaStore((state) => state.personas);

  const handleSave = useCallback(async () => {
    if (!projectId) return false;
    return await savePersonas(projectId, personas);
  }, [projectId, personas]);

  return { savePersonas: handleSave };
}

export function usePersonaDelete(projectId: string) {
  const deletePersona = useCallback(
    async (personaId: string) => {
      const store = usePersonaStore.getState();
      const currentPersonas = store.personas;
      const updatedPersonas = currentPersonas.filter((p) => p.id !== personaId);

      // Update store
      store.setPersonas(updatedPersonas);

      // Save to disk
      const result = await window.electronAPI.savePersonas(projectId, updatedPersonas);
      if (!result.success) {
        // Revert on failure
        store.setPersonas(currentPersonas);
        console.error('Failed to delete persona:', result.error);
        return false;
      }

      return true;
    },
    [projectId]
  );

  return { deletePersona };
}

export function usePersonaUpdate(projectId: string) {
  const updatePersona = useCallback(
    async (personaId: string, updates: Partial<Persona>) => {
      const store = usePersonaStore.getState();
      const currentPersonas = store.personas;

      // Update locally first
      store.updatePersona(personaId, updates);

      // Get updated list
      const updatedPersonas = usePersonaStore.getState().personas;

      // Save to disk
      const result = await window.electronAPI.savePersonas(projectId, updatedPersonas);
      if (!result.success) {
        // Revert on failure
        store.setPersonas(currentPersonas);
        console.error('Failed to update persona:', result.error);
        return false;
      }

      return true;
    },
    [projectId]
  );

  return { updatePersona };
}

/**
 * Hook for enriching personas with AI research.
 * Handles both new AI-assisted persona creation and enriching existing personas.
 */
export function usePersonaEnrichment(projectId: string) {
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichmentStatus, setEnrichmentStatus] = useState<PersonaEnrichmentStatus | null>(null);
  const [enrichingPersonaId, setEnrichingPersonaId] = useState<string | null>(null);

  // Enrich an existing persona
  const enrichExistingPersona = useCallback(
    (personaId: string) => {
      setIsEnriching(true);
      setEnrichingPersonaId(personaId);
      setEnrichmentStatus({
        phase: 'researching',
        progress: 0,
        message: 'Starting enrichment...',
      });

      window.electronAPI.enrichExistingPersona?.(projectId, personaId);
    },
    [projectId]
  );

  // Set up event listeners for enrichment progress
  useEffect(() => {
    if (!projectId) return;

    const handleProgress = (eventProjectId: string, status: PersonaEnrichmentStatus) => {
      if (eventProjectId === projectId) {
        setEnrichmentStatus(status);
      }
    };

    const handleComplete = async (eventProjectId: string, persona: Persona) => {
      if (eventProjectId === projectId) {
        setEnrichmentStatus({
          phase: 'complete',
          progress: 100,
          message: 'Enrichment complete!',
        });
        setIsEnriching(false);
        setEnrichingPersonaId(null);

        // Update the persona in store
        const store = usePersonaStore.getState();
        store.updatePersona(persona.id, persona);

        // Reload personas to get updated data
        await loadPersonas(projectId);
      }
    };

    const handleError = (eventProjectId: string, error: string) => {
      if (eventProjectId === projectId) {
        setEnrichmentStatus({
          phase: 'error',
          progress: 0,
          message: 'Enrichment failed',
          error,
        });
        setIsEnriching(false);
        setEnrichingPersonaId(null);
      }
    };

    // Subscribe to enrichment events
    const unsubProgress = window.electronAPI.onPersonaEnrichmentProgress?.(handleProgress);
    const unsubComplete = window.electronAPI.onPersonaEnrichmentComplete?.(handleComplete);
    const unsubError = window.electronAPI.onPersonaEnrichmentError?.(handleError);

    return () => {
      unsubProgress?.();
      unsubComplete?.();
      unsubError?.();
    };
  }, [projectId]);

  return {
    isEnriching,
    enrichmentStatus,
    enrichingPersonaId,
    enrichExistingPersona,
  };
}
