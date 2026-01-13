import { useState } from 'react';
import { RoadmapGenerationProgress } from './RoadmapGenerationProgress';
import { CompetitorAnalysisViewer } from './CompetitorAnalysisViewer';
import { AddFeatureDialog } from './AddFeatureDialog';
import { RoadmapHeader } from './roadmap/RoadmapHeader';
import { RoadmapEmptyState } from './roadmap/RoadmapEmptyState';
import { RoadmapTabs } from './roadmap/RoadmapTabs';
import { FeatureDetailPanel } from './roadmap/FeatureDetailPanel';
import { PersonaSuggestionDialog } from './roadmap/PersonaSuggestionDialog';
import { RoadmapOptionsDialog } from './roadmap/RoadmapOptionsDialog';
import { useRoadmapData, useFeatureActions, useRoadmapGeneration, useRoadmapSave, useFeatureDelete, usePersonaSuggestion } from './roadmap/hooks';
import { getCompetitorInsightsForFeature } from './roadmap/utils';
import { useRoadmapStore } from '../stores/roadmap-store';
import type { RoadmapFeature } from '../../shared/types';
import type { RoadmapProps } from './roadmap/types';

export function Roadmap({ projectId, onGoToTask }: RoadmapProps) {
  // State management
  const [selectedFeature, setSelectedFeature] = useState<RoadmapFeature | null>(null);
  const [activeTab, setActiveTab] = useState('kanban');
  const [showAddFeatureDialog, setShowAddFeatureDialog] = useState(false);
  const [showCompetitorViewer, setShowCompetitorViewer] = useState(false);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);

  // Custom hooks
  const { roadmap, competitorAnalysis, generationStatus } = useRoadmapData(projectId);
  const { convertFeatureToSpec } = useFeatureActions();
  const { saveRoadmap } = useRoadmapSave(projectId);
  const { deleteFeature } = useFeatureDelete(projectId);
  const {
    hasExistingCompetitorAnalysis,
    hasExistingPersonas: hasPersonasForOptions,
    competitorAnalysisDate,
    existingPersonaCount: personaCountFromHook,
    // Unified options dialog
    showOptionsDialog,
    setShowOptionsDialog,
    handleGenerate,
    handleRefresh,
    handleGenerateWithOptions,
    handleStop,
  } = useRoadmapGeneration(projectId);

  // Get generation options for progress UI
  const generationOptions = useRoadmapStore((state) => state.generationOptions);

  // Persona suggestion after roadmap generation
  const {
    showPersonaSuggestionDialog,
    setShowPersonaSuggestionDialog,
    hasExistingPersonas,
    existingPersonaCount,
    targetUserCount,
    handleGeneratePersonas,
    handleSkipPersonaSuggestion,
    handleKeepExistingPersonas,
  } = usePersonaSuggestion(projectId);

  // Event handlers
  const handleConvertToSpec = async (feature: RoadmapFeature) => {
    await convertFeatureToSpec(projectId, feature, selectedFeature, setSelectedFeature);
  };

  const handleGoToTask = (specId: string) => {
    if (onGoToTask) {
      onGoToTask(specId);
    }
  };

  // Show generation progress
  if (generationStatus.phase !== 'idle' && generationStatus.phase !== 'complete') {
    return (
      <div className="flex h-full items-center justify-center">
        <RoadmapGenerationProgress
          generationStatus={generationStatus}
          className="w-full max-w-md"
          onStop={handleStop}
          enabledOptions={generationOptions ?? undefined}
        />
      </div>
    );
  }

  // Show empty state
  if (!roadmap) {
    return (
      <>
        <RoadmapEmptyState onGenerate={handleGenerate} />
        {/* Unified options dialog for roadmap generation */}
        <RoadmapOptionsDialog
          open={showOptionsDialog}
          onOpenChange={setShowOptionsDialog}
          onGenerate={handleGenerateWithOptions}
          hasExistingCompetitorAnalysis={hasExistingCompetitorAnalysis}
          hasExistingPersonas={hasPersonasForOptions}
          existingCompetitorAnalysisDate={competitorAnalysisDate ? competitorAnalysisDate.toISOString() : undefined}
          existingPersonaCount={personaCountFromHook}
        />
      </>
    );
  }

  // Main roadmap view
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <RoadmapHeader
        roadmap={roadmap}
        competitorAnalysis={competitorAnalysis}
        onAddFeature={() => setShowAddFeatureDialog(true)}
        onRefresh={handleRefresh}
        onViewCompetitorAnalysis={() => setShowCompetitorViewer(true)}
      />

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <RoadmapTabs
          roadmap={roadmap}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onFeatureSelect={setSelectedFeature}
          onConvertToSpec={handleConvertToSpec}
          onGoToTask={handleGoToTask}
          onSave={saveRoadmap}
          selectedPersonaId={selectedPersonaId}
          onPersonaChange={setSelectedPersonaId}
        />
      </div>

      {/* Feature Detail Panel */}
      {selectedFeature && (
        <FeatureDetailPanel
          feature={selectedFeature}
          onClose={() => setSelectedFeature(null)}
          onConvertToSpec={handleConvertToSpec}
          onGoToTask={handleGoToTask}
          onDelete={deleteFeature}
          competitorInsights={getCompetitorInsightsForFeature(selectedFeature, competitorAnalysis)}
        />
      )}

      {/* Unified options dialog for roadmap generation */}
      <RoadmapOptionsDialog
        open={showOptionsDialog}
        onOpenChange={setShowOptionsDialog}
        onGenerate={handleGenerateWithOptions}
        hasExistingCompetitorAnalysis={hasExistingCompetitorAnalysis}
        hasExistingPersonas={hasPersonasForOptions}
        existingCompetitorAnalysisDate={competitorAnalysisDate ? competitorAnalysisDate.toISOString() : undefined}
        existingPersonaCount={personaCountFromHook}
      />

      {/* Competitor Analysis Viewer */}
      <CompetitorAnalysisViewer
        analysis={competitorAnalysis}
        open={showCompetitorViewer}
        onOpenChange={setShowCompetitorViewer}
      />

      {/* Add Feature Dialog */}
      <AddFeatureDialog
        phases={roadmap.phases}
        open={showAddFeatureDialog}
        onOpenChange={setShowAddFeatureDialog}
      />

      {/* Persona Suggestion Dialog (shown after roadmap generation completes) */}
      <PersonaSuggestionDialog
        open={showPersonaSuggestionDialog}
        onOpenChange={setShowPersonaSuggestionDialog}
        hasExistingPersonas={hasExistingPersonas}
        existingPersonaCount={existingPersonaCount}
        targetUserCount={targetUserCount}
        onGeneratePersonas={handleGeneratePersonas}
        onSkip={handleSkipPersonaSuggestion}
        onKeepExisting={handleKeepExistingPersonas}
      />
    </div>
  );
}
