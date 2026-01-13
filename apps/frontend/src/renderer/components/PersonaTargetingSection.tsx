import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { Checkbox } from './ui/checkbox';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';
import { usePersonaStore, loadPersonas } from '../stores/persona-store';
import type { Persona, PersonaAlignment } from '../../shared/types';

interface PersonaTargetingSectionProps {
  projectId: string;
  selectedPersonaIds: string[];
  onSelectionChange: (ids: string[]) => void;
  personaAlignment: PersonaAlignment[];
  onAlignmentChange: (alignment: PersonaAlignment[]) => void;
  disabled?: boolean;
}

/**
 * PersonaTargetingSection - A component for selecting target personas in task creation.
 *
 * Features:
 * - Multi-select checkbox list of available personas
 * - Optional goal/pain point alignment for each selected persona
 * - Empty state with link to generate personas
 */
export function PersonaTargetingSection({
  projectId,
  selectedPersonaIds,
  onSelectionChange,
  personaAlignment,
  onAlignmentChange,
  disabled = false,
}: PersonaTargetingSectionProps) {
  const { t } = useTranslation(['tasks', 'personas', 'common']);
  const personas = usePersonaStore((state) => state.personas);
  const [expandedPersonas, setExpandedPersonas] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  // Load personas when component mounts
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await loadPersonas(projectId);
      setIsLoading(false);
    };
    load();
  }, [projectId]);

  // Handle persona selection toggle
  const handlePersonaToggle = (personaId: string) => {
    const newSelection = selectedPersonaIds.includes(personaId)
      ? selectedPersonaIds.filter((id) => id !== personaId)
      : [...selectedPersonaIds, personaId];

    onSelectionChange(newSelection);

    // If deselecting, remove alignment
    if (!newSelection.includes(personaId)) {
      onAlignmentChange(personaAlignment.filter((a) => a.personaId !== personaId));
    }
  };

  // Toggle expanded state for persona alignment details
  const toggleExpanded = (personaId: string) => {
    const newExpanded = new Set(expandedPersonas);
    if (newExpanded.has(personaId)) {
      newExpanded.delete(personaId);
    } else {
      newExpanded.add(personaId);
    }
    setExpandedPersonas(newExpanded);
  };

  // Handle goal selection for a persona
  const handleGoalToggle = (personaId: string, goalId: string) => {
    const existingAlignment = personaAlignment.find((a) => a.personaId === personaId);
    const currentGoalIds = existingAlignment?.goalIds || [];
    const newGoalIds = currentGoalIds.includes(goalId)
      ? currentGoalIds.filter((id) => id !== goalId)
      : [...currentGoalIds, goalId];

    updateAlignment(personaId, newGoalIds, existingAlignment?.painPointIds);
  };

  // Handle pain point selection for a persona
  const handlePainPointToggle = (personaId: string, painPointId: string) => {
    const existingAlignment = personaAlignment.find((a) => a.personaId === personaId);
    const currentPainPointIds = existingAlignment?.painPointIds || [];
    const newPainPointIds = currentPainPointIds.includes(painPointId)
      ? currentPainPointIds.filter((id) => id !== painPointId)
      : [...currentPainPointIds, painPointId];

    updateAlignment(personaId, existingAlignment?.goalIds, newPainPointIds);
  };

  // Update alignment for a persona
  const updateAlignment = (
    personaId: string,
    goalIds?: string[],
    painPointIds?: string[]
  ) => {
    const newAlignment: PersonaAlignment = {
      personaId,
      ...(goalIds && goalIds.length > 0 ? { goalIds } : {}),
      ...(painPointIds && painPointIds.length > 0 ? { painPointIds } : {}),
    };

    const existingIndex = personaAlignment.findIndex((a) => a.personaId === personaId);
    const newAlignmentArray = [...personaAlignment];

    if (existingIndex >= 0) {
      // Check if alignment is empty (no goals or pain points)
      if ((!goalIds || goalIds.length === 0) && (!painPointIds || painPointIds.length === 0)) {
        // Remove empty alignment
        newAlignmentArray.splice(existingIndex, 1);
      } else {
        newAlignmentArray[existingIndex] = newAlignment;
      }
    } else if ((goalIds && goalIds.length > 0) || (painPointIds && painPointIds.length > 0)) {
      newAlignmentArray.push(newAlignment);
    }

    onAlignmentChange(newAlignmentArray);
  };

  // Get alignment for a specific persona
  const getAlignment = (personaId: string): PersonaAlignment | undefined => {
    return personaAlignment.find((a) => a.personaId === personaId);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="p-4 rounded-lg border border-border bg-muted/30">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Users className="h-4 w-4 animate-pulse" />
          <span>{t('common:loading', 'Loading...')}</span>
        </div>
      </div>
    );
  }

  // Empty state - no personas exist
  if (personas.length === 0) {
    return (
      <div className="p-4 rounded-lg border border-border bg-muted/30 text-center">
        <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <h4 className="text-sm font-medium text-foreground mb-1">
          {t('tasks:wizard.personas.emptyState.title', 'No Personas Available')}
        </h4>
        <p className="text-xs text-muted-foreground mb-3">
          {t('tasks:wizard.personas.emptyState.description', 'Generate user personas to enable persona-driven development')}
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            // Navigate to personas tab - this would need to be passed as a prop
            // For now, just show as informational
          }}
        >
          <Sparkles className="h-3 w-3 mr-1" />
          {t('tasks:wizard.personas.emptyState.generateButton', 'Generate Personas')}
        </Button>
      </div>
    );
  }

  // Get personas by type for organized display
  const primaryPersonas = personas.filter((p) => p.type === 'primary');
  const secondaryPersonas = personas.filter((p) => p.type === 'secondary');
  const edgeCasePersonas = personas.filter((p) => p.type === 'edge-case');

  const renderPersonaItem = (persona: Persona) => {
    const isSelected = selectedPersonaIds.includes(persona.id);
    const isExpanded = expandedPersonas.has(persona.id);
    const alignment = getAlignment(persona.id);

    return (
      <div key={persona.id} className="border border-border rounded-lg overflow-hidden">
        {/* Persona checkbox row */}
        <div
          className={`flex items-center gap-3 p-3 transition-colors ${
            isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'
          }`}
        >
          <Checkbox
            id={`persona-${persona.id}`}
            checked={isSelected}
            onCheckedChange={() => handlePersonaToggle(persona.id)}
            disabled={disabled}
          />
          <label
            htmlFor={`persona-${persona.id}`}
            className="flex-1 flex items-center gap-2 cursor-pointer"
          >
            {/* Avatar */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium"
              style={{ backgroundColor: persona.avatar.color }}
            >
              {persona.avatar.initials}
            </div>
            {/* Name and type */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">
                {persona.name}
              </div>
              <div className="text-xs text-muted-foreground">
                {t(`personas:types.${persona.type}`, persona.type)}
              </div>
            </div>
            {/* Alignment indicator */}
            {alignment && (alignment.goalIds?.length || alignment.painPointIds?.length) ? (
              <Badge variant="secondary" className="text-xs">
                {(alignment.goalIds?.length || 0) + (alignment.painPointIds?.length || 0)} aligned
              </Badge>
            ) : null}
          </label>
          {/* Expand button for alignment */}
          {isSelected && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => toggleExpanded(persona.id)}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>

        {/* Expanded alignment section */}
        {isSelected && isExpanded && (
          <div className="border-t border-border p-3 bg-muted/30 space-y-3">
            {/* Goals */}
            {persona.goals.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  {t('tasks:wizard.personas.alignment.goals', 'Goals addressed')}
                </div>
                <div className="space-y-1">
                  {persona.goals.map((goal) => (
                    <div key={goal.id} className="flex items-start gap-2">
                      <Checkbox
                        id={`goal-${goal.id}`}
                        checked={alignment?.goalIds?.includes(goal.id) || false}
                        onCheckedChange={() => handleGoalToggle(persona.id, goal.id)}
                        disabled={disabled}
                        className="mt-0.5"
                      />
                      <label
                        htmlFor={`goal-${goal.id}`}
                        className="text-xs text-foreground cursor-pointer"
                      >
                        {goal.description}
                        <Badge variant="outline" className="ml-1 text-[10px] px-1">
                          {t(`personas:priority.${goal.priority}`, goal.priority)}
                        </Badge>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pain Points */}
            {persona.painPoints.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  {t('tasks:wizard.personas.alignment.painPoints', 'Pain points solved')}
                </div>
                <div className="space-y-1">
                  {persona.painPoints.map((painPoint) => (
                    <div key={painPoint.id} className="flex items-start gap-2">
                      <Checkbox
                        id={`painpoint-${painPoint.id}`}
                        checked={alignment?.painPointIds?.includes(painPoint.id) || false}
                        onCheckedChange={() => handlePainPointToggle(persona.id, painPoint.id)}
                        disabled={disabled}
                        className="mt-0.5"
                      />
                      <label
                        htmlFor={`painpoint-${painPoint.id}`}
                        className="text-xs text-foreground cursor-pointer"
                      >
                        {painPoint.description}
                        <Badge
                          variant={
                            painPoint.severity === 'high'
                              ? 'destructive'
                              : painPoint.severity === 'medium'
                              ? 'secondary'
                              : 'outline'
                          }
                          className="ml-1 text-[10px] px-1"
                        >
                          {t(`personas:severity.${painPoint.severity}`, painPoint.severity)}
                        </Badge>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderPersonaGroup = (title: string, personaList: Persona[]) => {
    if (personaList.length === 0) return null;

    return (
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </div>
        {personaList.map(renderPersonaItem)}
      </div>
    );
  };

  return (
    <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
      <p className="text-xs text-muted-foreground">
        {t('tasks:wizard.personas.description', 'Select which user personas this task is designed for')}
      </p>

      <div className="space-y-4">
        {renderPersonaGroup(t('personas:sections.primary', 'Primary Personas'), primaryPersonas)}
        {renderPersonaGroup(t('personas:sections.secondary', 'Secondary Personas'), secondaryPersonas)}
        {renderPersonaGroup(t('personas:sections.edgeCases', 'Edge Case Personas'), edgeCasePersonas)}
      </div>

      {/* Summary of selection */}
      {selectedPersonaIds.length > 0 && (
        <div className="pt-2 border-t border-border">
          <div className="text-xs text-muted-foreground">
            {t('tasks:wizard.personas.selected', '{{count}} persona(s) selected', {
              count: selectedPersonaIds.length,
            })}
          </div>
        </div>
      )}
    </div>
  );
}
