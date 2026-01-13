import { useEffect, useState, useCallback, useRef } from 'react';
import { useRoadmapStore, loadRoadmap, generateRoadmap, refreshRoadmap, stopRoadmap } from '../../stores/roadmap-store';
import { usePersonaStore, loadPersonas, generatePersonas } from '../../stores/persona-store';
import { useTaskStore } from '../../stores/task-store';
import type { RoadmapFeature } from '../../../shared/types';

/**
 * Hook to manage roadmap data and loading
 *
 * When the projectId changes, this hook:
 * 1. Loads the new project's roadmap data
 * 2. Queries the backend to check if generation is running for this project
 * 3. Restores the generation status UI state accordingly
 *
 * NOTE: Generation continues in the background when switching projects.
 * The loadRoadmap function queries the backend to restore the correct UI state.
 */
export function useRoadmapData(projectId: string) {
  const roadmap = useRoadmapStore((state) => state.roadmap);
  const competitorAnalysis = useRoadmapStore((state) => state.competitorAnalysis);
  const generationStatus = useRoadmapStore((state) => state.generationStatus);

  useEffect(() => {
    // Load roadmap data and query generation status for this project
    // The loadRoadmap function handles checking if generation is running
    // and restores the UI state accordingly
    loadRoadmap(projectId);
  }, [projectId]);

  return {
    roadmap,
    competitorAnalysis,
    generationStatus,
  };
}

/**
 * Hook to manage feature actions (convert, link, etc.)
 */
export function useFeatureActions() {
  const updateFeatureLinkedSpec = useRoadmapStore((state) => state.updateFeatureLinkedSpec);
  const addTask = useTaskStore((state) => state.addTask);

  const convertFeatureToSpec = async (
    projectId: string,
    feature: RoadmapFeature,
    selectedFeature: RoadmapFeature | null,
    setSelectedFeature: (feature: RoadmapFeature | null) => void
  ) => {
    const result = await window.electronAPI.convertFeatureToSpec(projectId, feature.id);
    if (result.success && result.data) {
      // Add the created task to the task store so it appears in the kanban immediately
      addTask(result.data);

      // Update the roadmap feature with the linked spec
      updateFeatureLinkedSpec(feature.id, result.data.specId);
      if (selectedFeature?.id === feature.id) {
        setSelectedFeature({
          ...feature,
          linkedSpecId: result.data.specId,
          status: 'in_progress',
        });
      }
    }
  };

  return {
    convertFeatureToSpec,
  };
}

/**
 * Hook to save roadmap changes to disk
 *
 * NOTE: Gets roadmap from store at call time (not render time) to ensure
 * we save the latest state after Zustand updates (e.g., after drag-drop status change)
 */
export function useRoadmapSave(projectId: string) {
  const saveRoadmap = async () => {
    // Get current state at call time to avoid stale closure issues
    const roadmap = useRoadmapStore.getState().roadmap;
    if (!roadmap) return;

    try {
      await window.electronAPI.saveRoadmap(projectId, roadmap);
    } catch (error) {
      console.error('Failed to save roadmap:', error);
    }
  };

  return { saveRoadmap };
}

/**
 * Hook to delete features from roadmap
 */
export function useFeatureDelete(projectId: string) {
  const deleteFeature = useRoadmapStore((state) => state.deleteFeature);

  const handleDeleteFeature = async (featureId: string) => {
    // Delete from store
    deleteFeature(featureId);

    // Persist to file
    const roadmap = useRoadmapStore.getState().roadmap;
    if (roadmap) {
      try {
        await window.electronAPI.saveRoadmap(projectId, roadmap);
      } catch (error) {
        console.error('Failed to save roadmap after delete:', error);
      }
    }
  };

  return { deleteFeature: handleDeleteFeature };
}

/**
 * Hook to manage roadmap generation actions
 *
 * Uses a unified options dialog that allows users to:
 * - Enable/disable competitor analysis
 * - Enable/disable persona generation
 * - Choose to use existing data or refresh
 */
export function useRoadmapGeneration(projectId: string) {
  const competitorAnalysis = useRoadmapStore((state) => state.competitorAnalysis);
  const setGenerationOptions = useRoadmapStore((state) => state.setGenerationOptions);
  const personas = usePersonaStore((state) => state.personas);
  const [pendingAction, setPendingAction] = useState<'generate' | 'refresh' | null>(null);
  const [showOptionsDialog, setShowOptionsDialog] = useState(false);

  // Check if we have existing data
  const hasExistingCompetitorAnalysis = !!competitorAnalysis;
  const hasExistingPersonas = personas.length > 0;

  const handleGenerate = () => {
    setPendingAction('generate');
    setShowOptionsDialog(true);
  };

  const handleRefresh = () => {
    setPendingAction('refresh');
    setShowOptionsDialog(true);
  };

  // Handler for unified options dialog
  const handleGenerateWithOptions = (options: {
    enableCompetitorAnalysis: boolean;
    refreshCompetitorAnalysis: boolean;
    enablePersonaGeneration: boolean;
    refreshPersonas: boolean;
  }) => {
    // Store the generation options for progress UI
    setGenerationOptions({
      competitorAnalysis: options.enableCompetitorAnalysis,
      personaGeneration: options.enablePersonaGeneration,
    });

    if (pendingAction === 'generate') {
      generateRoadmap(
        projectId,
        options.enableCompetitorAnalysis,
        options.refreshCompetitorAnalysis,
        options.enablePersonaGeneration,
        options.refreshPersonas
      );
    } else if (pendingAction === 'refresh') {
      refreshRoadmap(
        projectId,
        options.enableCompetitorAnalysis,
        options.refreshCompetitorAnalysis,
        options.enablePersonaGeneration,
        options.refreshPersonas
      );
    }
    setPendingAction(null);
  };

  const handleStop = async () => {
    await stopRoadmap(projectId);
  };

  return {
    pendingAction,
    // Existing data checks
    hasExistingCompetitorAnalysis,
    hasExistingPersonas,
    competitorAnalysisDate: competitorAnalysis?.createdAt,
    existingPersonaCount: personas.length,
    // Unified options dialog
    showOptionsDialog,
    setShowOptionsDialog,
    handleGenerate,
    handleRefresh,
    handleGenerateWithOptions,
    handleStop,
  };
}

/**
 * Hook to manage persona suggestion after roadmap generation completes
 *
 * Shows a dialog suggesting persona generation when:
 * 1. Roadmap generation completes (status changes from generating → complete)
 * 2. Either no personas exist OR roadmap target audience has changed
 */
export function usePersonaSuggestion(projectId: string) {
  const generationStatus = useRoadmapStore((state) => state.generationStatus);
  const roadmap = useRoadmapStore((state) => state.roadmap);
  const personas = usePersonaStore((state) => state.personas);
  const [showPersonaSuggestionDialog, setShowPersonaSuggestionDialog] = useState(false);
  const [personasLoaded, setPersonasLoaded] = useState(false);

  // Track the previous generation status to detect completion
  const prevStatusRef = useRef(generationStatus.phase);

  // Load personas when project changes
  useEffect(() => {
    const load = async () => {
      await loadPersonas(projectId);
      setPersonasLoaded(true);
    };
    load();
  }, [projectId]);

  // Detect roadmap generation completion
  useEffect(() => {
    const prevPhase = prevStatusRef.current;
    const currentPhase = generationStatus.phase;

    // Update ref for next comparison
    prevStatusRef.current = currentPhase;

    // Check if we just completed generation (was generating/analyzing/discovering, now complete or idle with roadmap)
    const wasGenerating = prevPhase === 'analyzing' || prevPhase === 'discovering' || prevPhase === 'generating';
    const isNowComplete = currentPhase === 'complete' || (currentPhase === 'idle' && roadmap);

    if (wasGenerating && isNowComplete && personasLoaded) {
      // Roadmap generation just completed - check if we should suggest personas
      const hasExistingPersonas = personas.length > 0;
      const targetUserCount = getTargetUserCount(roadmap);

      // Show dialog if:
      // 1. No personas exist, OR
      // 2. Personas exist but target audience count differs significantly
      if (!hasExistingPersonas) {
        // No personas - always suggest generating them
        setShowPersonaSuggestionDialog(true);
      } else if (targetUserCount > 0) {
        // Has personas - check if target audience changed significantly
        // Show refresh dialog if difference is >= 2
        const diff = Math.abs(personas.length - targetUserCount);
        if (diff >= 2) {
          setShowPersonaSuggestionDialog(true);
        }
      }
    }
  }, [generationStatus.phase, roadmap, personas.length, personasLoaded]);

  // Count target user types from roadmap discovery
  const getTargetUserCount = useCallback((rm: typeof roadmap): number => {
    if (!rm?.targetAudience) return 0;
    let count = 0;
    if (rm.targetAudience.primary) count += 1;
    if (rm.targetAudience.secondary) {
      count += rm.targetAudience.secondary.length;
    }
    return count;
  }, []);

  // Handler for "Generate Personas" action
  const handleGeneratePersonas = useCallback(() => {
    // Navigate to personas or trigger generation
    // For now, we'll just start generation directly
    generatePersonas(projectId, false); // Can add research option later
    setShowPersonaSuggestionDialog(false);
  }, [projectId]);

  // Handler for "Skip" action
  const handleSkipPersonaSuggestion = useCallback(() => {
    setShowPersonaSuggestionDialog(false);
  }, []);

  // Handler for "Keep Existing" action
  const handleKeepExistingPersonas = useCallback(() => {
    setShowPersonaSuggestionDialog(false);
  }, []);

  const hasExistingPersonas = personas.length > 0;
  const targetUserCount = getTargetUserCount(roadmap);

  return {
    showPersonaSuggestionDialog,
    setShowPersonaSuggestionDialog,
    hasExistingPersonas,
    existingPersonaCount: personas.length,
    targetUserCount,
    handleGeneratePersonas,
    handleSkipPersonaSuggestion,
    handleKeepExistingPersonas,
  };
}
