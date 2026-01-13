import type { Persona, PersonaGenerationStatus } from '../../../shared/types';

export interface PersonasProps {
  projectId: string;
  onGoToTask?: (specId: string) => void;
}

export interface PersonaEmptyStateProps {
  onGenerate: () => void;
}

export interface PersonaHeaderProps {
  personas: Persona[];
  onAddPersona: () => void;
  onRefresh: () => void;
}

export interface PersonaCardProps {
  persona: Persona;
  onSelect: (persona: Persona) => void;
  isSelected?: boolean;
}

export interface PersonaDetailPanelProps {
  persona: Persona;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: (personaId: string) => void;
  onEnrich?: (personaId: string) => void;
  isEnriching?: boolean;
}

export interface PersonaGridProps {
  personas: Persona[];
  selectedPersona: Persona | null;
  onPersonaSelect: (persona: Persona) => void;
}

export interface PersonaGenerationProgressProps {
  generationStatus: PersonaGenerationStatus;
  className?: string;
  onStop?: () => void | Promise<void>;
}

export interface ResearchOptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnableResearch: () => void;
  onSkipResearch: () => void;
}

export interface AddPersonaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onPersonaAdded?: (personaId: string) => void;
}
