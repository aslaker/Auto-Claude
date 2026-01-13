import { useState } from 'react';
import { PersonaGenerationProgress } from './PersonaGenerationProgress';
import { PersonaEmptyState } from './PersonaEmptyState';
import { PersonaHeader } from './PersonaHeader';
import { PersonaGrid } from './PersonaGrid';
import { PersonaDetailPanel } from './PersonaDetailPanel';
import { ResearchOptionDialog } from './ResearchOptionDialog';
import { AddPersonaDialog } from './AddPersonaDialog';
import { usePersonaData, usePersonaGeneration, usePersonaDelete, usePersonaEnrichment } from './hooks';
import type { Persona } from '../../../shared/types';
import type { PersonasProps } from './types';

export function Personas({ projectId }: PersonasProps) {
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Custom hooks
  const { personas, generationStatus } = usePersonaData(projectId);
  const {
    showResearchDialog,
    setShowResearchDialog,
    handleGenerate,
    handleRefresh,
    handleEnableResearch,
    handleSkipResearch,
    handleStop,
  } = usePersonaGeneration(projectId);
  const { deletePersona } = usePersonaDelete(projectId);
  const { isEnriching, enrichingPersonaId, enrichExistingPersona } = usePersonaEnrichment(projectId);

  // Handle persona deletion
  const handleDeletePersona = async (personaId: string) => {
    const success = await deletePersona(personaId);
    if (success && selectedPersona?.id === personaId) {
      setSelectedPersona(null);
    }
  };

  // Show generation progress
  if (generationStatus.phase !== 'idle' && generationStatus.phase !== 'complete') {
    return (
      <div className="flex h-full items-center justify-center">
        <PersonaGenerationProgress
          generationStatus={generationStatus}
          className="w-full max-w-md"
          onStop={handleStop}
        />
      </div>
    );
  }

  // Show empty state
  if (personas.length === 0) {
    return (
      <>
        <PersonaEmptyState onGenerate={handleGenerate} />
        <ResearchOptionDialog
          open={showResearchDialog}
          onOpenChange={setShowResearchDialog}
          onEnableResearch={handleEnableResearch}
          onSkipResearch={handleSkipResearch}
        />
      </>
    );
  }

  // Main personas view
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <PersonaHeader
        personas={personas}
        onAddPersona={() => setShowAddDialog(true)}
        onRefresh={handleRefresh}
      />

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <PersonaGrid
          personas={personas}
          selectedPersona={selectedPersona}
          onPersonaSelect={setSelectedPersona}
        />
      </div>

      {/* Detail Panel */}
      {selectedPersona && (
        <PersonaDetailPanel
          persona={selectedPersona}
          onClose={() => setSelectedPersona(null)}
          onDelete={handleDeletePersona}
          onEnrich={enrichExistingPersona}
          isEnriching={isEnriching && enrichingPersonaId === selectedPersona.id}
        />
      )}

      {/* Research Option Dialog */}
      <ResearchOptionDialog
        open={showResearchDialog}
        onOpenChange={setShowResearchDialog}
        onEnableResearch={handleEnableResearch}
        onSkipResearch={handleSkipResearch}
      />

      {/* Add Persona Dialog */}
      <AddPersonaDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        projectId={projectId}
        onPersonaAdded={(personaId) => {
          // Optionally select the newly added persona
          const newPersona = personas.find((p) => p.id === personaId);
          if (newPersona) {
            setSelectedPersona(newPersona);
          }
        }}
      />
    </div>
  );
}
