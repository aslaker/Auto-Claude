/**
 * AddPersonaDialog - Dialog for adding new personas
 *
 * Supports two creation modes:
 * 1. AI-Assisted (Recommended) - User provides minimal key details, AI researches and fills the rest
 * 2. Manual - Power users can enter all details themselves
 */
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sparkles,
  PenLine,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Plus,
  Trash2,
  Check,
  Info
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select';
import { ScrollArea } from '../ui/scroll-area';
import { usePersonaStore, savePersonas } from '../../stores/persona-store';
import type { AddPersonaDialogProps } from './types';
import type {
  PersonaType,
  ExperienceLevel,
  CompanySize,
  UsageFrequency,
  GoalPriority,
  PainPointSeverity,
  Persona,
  PersonaEnrichmentInput
} from '../../../shared/types';

type CreationMode = 'select' | 'ai-assisted' | 'manual';
type ManualStep = 1 | 2 | 3 | 4;

// Persona type options
const PERSONA_TYPE_OPTIONS: { value: PersonaType; labelKey: string }[] = [
  { value: 'primary', labelKey: 'personas:types.primary' },
  { value: 'secondary', labelKey: 'personas:types.secondary' },
  { value: 'edge-case', labelKey: 'personas:types.edge-case' }
];

// Experience level options
const EXPERIENCE_OPTIONS: { value: ExperienceLevel; labelKey: string }[] = [
  { value: 'junior', labelKey: 'personas:experienceLevel.junior' },
  { value: 'mid', labelKey: 'personas:experienceLevel.mid' },
  { value: 'senior', labelKey: 'personas:experienceLevel.senior' },
  { value: 'lead', labelKey: 'personas:experienceLevel.lead' },
  { value: 'executive', labelKey: 'personas:experienceLevel.executive' }
];

// Company size options
const COMPANY_SIZE_OPTIONS: { value: CompanySize; labelKey: string }[] = [
  { value: 'startup', labelKey: 'personas:companySize.startup' },
  { value: 'small', labelKey: 'personas:companySize.small' },
  { value: 'medium', labelKey: 'personas:companySize.medium' },
  { value: 'enterprise', labelKey: 'personas:companySize.enterprise' }
];

// Usage frequency options
const USAGE_FREQUENCY_OPTIONS: { value: UsageFrequency; labelKey: string }[] = [
  { value: 'daily', labelKey: 'personas:usageFrequency.daily' },
  { value: 'weekly', labelKey: 'personas:usageFrequency.weekly' },
  { value: 'monthly', labelKey: 'personas:usageFrequency.monthly' },
  { value: 'occasionally', labelKey: 'personas:usageFrequency.occasionally' }
];

// Priority options
const PRIORITY_OPTIONS: { value: GoalPriority; labelKey: string }[] = [
  { value: 'must-have', labelKey: 'personas:priority.must-have' },
  { value: 'should-have', labelKey: 'personas:priority.should-have' },
  { value: 'nice-to-have', labelKey: 'personas:priority.nice-to-have' }
];

// Severity options
const SEVERITY_OPTIONS: { value: PainPointSeverity; labelKey: string }[] = [
  { value: 'high', labelKey: 'personas:severity.high' },
  { value: 'medium', labelKey: 'personas:severity.medium' },
  { value: 'low', labelKey: 'personas:severity.low' }
];

// Avatar colors for randomly assigning to new personas
const AVATAR_COLORS = [
  '#3B82F6', // blue
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#EF4444', // red
  '#F97316', // orange
  '#EAB308', // yellow
  '#22C55E', // green
  '#06B6D4', // cyan
  '#6366F1', // indigo
  '#A855F7'  // violet
];

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
}

function getRandomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

export function AddPersonaDialog({
  open,
  onOpenChange,
  projectId,
  onPersonaAdded
}: AddPersonaDialogProps) {
  const { t } = useTranslation(['personas', 'common']);

  // Mode state
  const [mode, setMode] = useState<CreationMode>('select');
  const [manualStep, setManualStep] = useState<ManualStep>(1);

  // AI-Assisted form state
  const [aiRole, setAiRole] = useState('');
  const [aiDescription, setAiDescription] = useState('');
  const [aiType, setAiType] = useState<PersonaType>('secondary');
  const [aiPrimaryGoal, setAiPrimaryGoal] = useState('');
  const [aiExperienceLevel, setAiExperienceLevel] = useState<ExperienceLevel | ''>('');
  const [aiIndustry, setAiIndustry] = useState('');

  // Manual form state - Step 1: Identity
  const [manualName, setManualName] = useState('');
  const [manualType, setManualType] = useState<PersonaType>('secondary');
  const [manualRole, setManualRole] = useState('');
  const [manualTagline, setManualTagline] = useState('');

  // Manual form state - Step 2: Demographics
  const [manualExperienceLevel, setManualExperienceLevel] = useState<ExperienceLevel | ''>('');
  const [manualIndustry, setManualIndustry] = useState('');
  const [manualCompanySize, setManualCompanySize] = useState<CompanySize | ''>('');
  const [manualUsageFrequency, setManualUsageFrequency] = useState<UsageFrequency | ''>('');

  // Manual form state - Step 3: Goals & Pain Points
  const [manualGoals, setManualGoals] = useState<Array<{ description: string; priority: GoalPriority }>>([
    { description: '', priority: 'should-have' }
  ]);
  const [manualPainPoints, setManualPainPoints] = useState<Array<{
    description: string;
    severity: PainPointSeverity;
    currentWorkaround?: string;
  }>>([{ description: '', severity: 'medium', currentWorkaround: '' }]);

  // Manual form state - Step 4: Details (Optional)
  const [manualChannels, setManualChannels] = useState('');
  const [manualDecisionFactors, setManualDecisionFactors] = useState('');
  const [manualToolStack, setManualToolStack] = useState('');
  const [manualQuotes, setManualQuotes] = useState<string[]>(['']);

  // UI state
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Store
  const personas = usePersonaStore((state) => state.personas);
  const addPersona = usePersonaStore((state) => state.addPersona);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setMode('select');
      setManualStep(1);
      resetAiForm();
      resetManualForm();
      setError(null);
    }
  }, [open]);

  const resetAiForm = () => {
    setAiRole('');
    setAiDescription('');
    setAiType('secondary');
    setAiPrimaryGoal('');
    setAiExperienceLevel('');
    setAiIndustry('');
  };

  const resetManualForm = () => {
    setManualName('');
    setManualType('secondary');
    setManualRole('');
    setManualTagline('');
    setManualExperienceLevel('');
    setManualIndustry('');
    setManualCompanySize('');
    setManualUsageFrequency('');
    setManualGoals([{ description: '', priority: 'should-have' }]);
    setManualPainPoints([{ description: '', severity: 'medium', currentWorkaround: '' }]);
    setManualChannels('');
    setManualDecisionFactors('');
    setManualToolStack('');
    setManualQuotes(['']);
  };

  // AI-Assisted validation
  const isAiFormValid = aiRole.trim().length > 0 && aiDescription.trim().length > 0;

  // Manual step validation
  const isManualStep1Valid = manualName.trim().length > 0 && manualRole.trim().length > 0;
  const isManualStep3Valid =
    manualGoals.some((g) => g.description.trim().length > 0) &&
    manualPainPoints.some((p) => p.description.trim().length > 0);

  const canProceedManualStep = (step: ManualStep): boolean => {
    switch (step) {
      case 1:
        return isManualStep1Valid;
      case 2:
        return true; // Optional fields
      case 3:
        return isManualStep3Valid;
      case 4:
        return true; // Optional fields
      default:
        return false;
    }
  };

  // Goal management
  const addGoal = () => {
    setManualGoals([...manualGoals, { description: '', priority: 'should-have' }]);
  };

  const removeGoal = (index: number) => {
    if (manualGoals.length > 1) {
      setManualGoals(manualGoals.filter((_, i) => i !== index));
    }
  };

  const updateGoal = (index: number, updates: Partial<{ description: string; priority: GoalPriority }>) => {
    setManualGoals(
      manualGoals.map((goal, i) => (i === index ? { ...goal, ...updates } : goal))
    );
  };

  // Pain point management
  const addPainPoint = () => {
    setManualPainPoints([
      ...manualPainPoints,
      { description: '', severity: 'medium', currentWorkaround: '' }
    ]);
  };

  const removePainPoint = (index: number) => {
    if (manualPainPoints.length > 1) {
      setManualPainPoints(manualPainPoints.filter((_, i) => i !== index));
    }
  };

  const updatePainPoint = (
    index: number,
    updates: Partial<{ description: string; severity: PainPointSeverity; currentWorkaround: string }>
  ) => {
    setManualPainPoints(
      manualPainPoints.map((pp, i) => (i === index ? { ...pp, ...updates } : pp))
    );
  };

  // Quote management
  const addQuote = () => {
    setManualQuotes([...manualQuotes, '']);
  };

  const removeQuote = (index: number) => {
    if (manualQuotes.length > 1) {
      setManualQuotes(manualQuotes.filter((_, i) => i !== index));
    }
  };

  const updateQuote = (index: number, value: string) => {
    setManualQuotes(manualQuotes.map((q, i) => (i === index ? value : q)));
  };

  // Create manual persona
  const handleCreateManualPersona = async () => {
    if (!isManualStep3Valid) {
      setError(t('personas:addDialog.validation.minOneGoal'));
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // Build the persona object
      const personaData: Omit<Persona, 'id' | 'createdAt' | 'updatedAt'> = {
        name: manualName.trim(),
        type: manualType,
        tagline: manualTagline.trim() || `${manualRole.trim()} persona`,
        avatar: {
          initials: getInitials(manualName.trim()),
          color: getRandomColor()
        },
        demographics: {
          role: manualRole.trim(),
          experienceLevel: (manualExperienceLevel as ExperienceLevel) || 'mid',
          industry: manualIndustry.trim() || undefined,
          companySize: (manualCompanySize as CompanySize) || undefined
        },
        goals: manualGoals
          .filter((g) => g.description.trim().length > 0)
          .map((g, i) => ({
            id: `goal-${i + 1}`,
            description: g.description.trim(),
            priority: g.priority
          })),
        painPoints: manualPainPoints
          .filter((p) => p.description.trim().length > 0)
          .map((p, i) => ({
            id: `pain-${i + 1}`,
            description: p.description.trim(),
            severity: p.severity,
            currentWorkaround: p.currentWorkaround?.trim() || undefined
          })),
        behaviors: {
          usageFrequency: (manualUsageFrequency as UsageFrequency) || 'weekly',
          preferredChannels: manualChannels
            .split(',')
            .map((c) => c.trim())
            .filter((c) => c.length > 0),
          decisionFactors: manualDecisionFactors
            .split(',')
            .map((d) => d.trim())
            .filter((d) => d.length > 0),
          toolStack: manualToolStack
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
        },
        quotes: manualQuotes.filter((q) => q.trim().length > 0),
        scenarios: [],
        featurePreferences: {
          mustHave: [],
          niceToHave: [],
          avoid: []
        },
        discoverySource: {
          userTypeId: 'manual',
          confidence: 'high',
          researchEnriched: false
        }
      };

      // Add to store
      const newPersonaId = addPersona(personaData);

      // Persist to file
      const updatedPersonas = [...personas, { ...personaData, id: newPersonaId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
      await savePersonas(projectId, updatedPersonas);

      // Success
      onOpenChange(false);
      onPersonaAdded?.(newPersonaId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create persona');
    } finally {
      setIsCreating(false);
    }
  };

  // Create AI-assisted persona
  const handleCreateAiPersona = async () => {
    if (!isAiFormValid) {
      setError(t('personas:addDialog.form.role.required'));
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const input: PersonaEnrichmentInput = {
        role: aiRole.trim(),
        description: aiDescription.trim(),
        type: aiType,
        primaryGoal: aiPrimaryGoal.trim() || undefined,
        experienceLevel: aiExperienceLevel || undefined,
        industry: aiIndustry.trim() || undefined
      };

      // Call the AI enrichment API
      window.electronAPI.enrichNewPersona(projectId, input);

      // The dialog will be closed by the event handler when enrichment completes
      // For now, we'll close immediately and let the user see progress elsewhere
      // TODO: Add enrichment progress UI to this dialog
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start AI enrichment');
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      onOpenChange(false);
    }
  };

  const handleBack = () => {
    if (mode === 'ai-assisted' || mode === 'manual') {
      if (mode === 'manual' && manualStep > 1) {
        setManualStep((manualStep - 1) as ManualStep);
      } else {
        setMode('select');
      }
    }
  };

  // Render mode selection screen
  const renderModeSelection = () => (
    <div className="space-y-4 py-4">
      <p className="text-sm text-muted-foreground">
        {t('personas:addDialog.modeSelection.description')}
      </p>

      {/* AI-Assisted Option (Recommended) */}
      <button
        className="w-full rounded-lg bg-purple-500/10 border border-purple-500/30 p-4 text-left hover:bg-purple-500/20 transition-colors"
        onClick={() => setMode('ai-assisted')}
      >
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-purple-500/20 p-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-medium">{t('personas:addDialog.aiAssisted.title')}</h4>
              <span className="text-xs bg-purple-500 text-white px-2 py-0.5 rounded-full">
                {t('personas:addDialog.aiAssisted.recommended')}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {t('personas:addDialog.aiAssisted.description')}
            </p>
            <ul className="text-xs text-muted-foreground mt-2 space-y-1">
              <li className="flex items-center gap-1">
                <Check className="h-3 w-3 text-green-500" />
                {t('personas:addDialog.aiAssisted.benefit1')}
              </li>
              <li className="flex items-center gap-1">
                <Check className="h-3 w-3 text-green-500" />
                {t('personas:addDialog.aiAssisted.benefit2')}
              </li>
              <li className="flex items-center gap-1">
                <Check className="h-3 w-3 text-green-500" />
                {t('personas:addDialog.aiAssisted.benefit3')}
              </li>
            </ul>
          </div>
        </div>
      </button>

      {/* Manual Option */}
      <button
        className="w-full rounded-lg bg-muted border border-border p-4 text-left hover:bg-muted/80 transition-colors"
        onClick={() => setMode('manual')}
      >
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-muted-foreground/20 p-2">
            <PenLine className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <h4 className="font-medium">{t('personas:addDialog.manual.title')}</h4>
            <p className="text-sm text-muted-foreground mt-1">
              {t('personas:addDialog.manual.description')}
            </p>
            <ul className="text-xs text-muted-foreground mt-2 space-y-1">
              <li className="flex items-center gap-1">
                <Check className="h-3 w-3 text-muted-foreground" />
                {t('personas:addDialog.manual.benefit1')}
              </li>
              <li className="flex items-center gap-1">
                <Check className="h-3 w-3 text-muted-foreground" />
                {t('personas:addDialog.manual.benefit2')}
              </li>
            </ul>
          </div>
        </div>
      </button>
    </div>
  );

  // Render AI-assisted form
  const renderAiAssistedForm = () => (
    <div className="space-y-4 py-4">
      {/* Role (Required) */}
      <div className="space-y-2">
        <Label htmlFor="ai-role" className="text-sm font-medium">
          {t('personas:addDialog.form.role.label')} <span className="text-destructive">*</span>
        </Label>
        <Input
          id="ai-role"
          placeholder={t('personas:addDialog.form.role.placeholder')}
          value={aiRole}
          onChange={(e) => setAiRole(e.target.value)}
          disabled={isCreating}
        />
      </div>

      {/* Description (Required) */}
      <div className="space-y-2">
        <Label htmlFor="ai-description" className="text-sm font-medium">
          {t('personas:addDialog.form.description.label')} <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="ai-description"
          placeholder={t('personas:addDialog.form.description.placeholder')}
          value={aiDescription}
          onChange={(e) => setAiDescription(e.target.value)}
          rows={3}
          disabled={isCreating}
        />
      </div>

      {/* Type (Required) */}
      <div className="space-y-2">
        <Label htmlFor="ai-type" className="text-sm font-medium">
          {t('personas:addDialog.form.type.label')} <span className="text-destructive">*</span>
        </Label>
        <Select value={aiType} onValueChange={(v) => setAiType(v as PersonaType)} disabled={isCreating}>
          <SelectTrigger id="ai-type">
            <SelectValue placeholder={t('personas:addDialog.form.type.placeholder')} />
          </SelectTrigger>
          <SelectContent>
            {PERSONA_TYPE_OPTIONS.map(({ value, labelKey }) => (
              <SelectItem key={value} value={value}>
                {t(labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Primary Goal (Recommended) */}
      <div className="space-y-2">
        <Label htmlFor="ai-goal" className="text-sm font-medium">
          {t('personas:addDialog.form.primaryGoal.label')}
          <span className="text-muted-foreground font-normal ml-1">
            ({t('personas:addDialog.form.primaryGoal.hint')})
          </span>
        </Label>
        <Textarea
          id="ai-goal"
          placeholder={t('personas:addDialog.form.primaryGoal.placeholder')}
          value={aiPrimaryGoal}
          onChange={(e) => setAiPrimaryGoal(e.target.value)}
          rows={2}
          disabled={isCreating}
        />
      </div>

      {/* Optional fields in a grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Experience Level */}
        <div className="space-y-2">
          <Label htmlFor="ai-experience" className="text-sm font-medium">
            {t('personas:addDialog.form.experienceLevel.label')}
          </Label>
          <Select
            value={aiExperienceLevel}
            onValueChange={(v) => setAiExperienceLevel(v as ExperienceLevel)}
            disabled={isCreating}
          >
            <SelectTrigger id="ai-experience">
              <SelectValue placeholder={t('personas:addDialog.form.experienceLevel.placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {EXPERIENCE_OPTIONS.map(({ value, labelKey }) => (
                <SelectItem key={value} value={value}>
                  {t(labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Industry */}
        <div className="space-y-2">
          <Label htmlFor="ai-industry" className="text-sm font-medium">
            {t('personas:addDialog.form.industry.label')}
          </Label>
          <Input
            id="ai-industry"
            placeholder={t('personas:addDialog.form.industry.placeholder')}
            value={aiIndustry}
            onChange={(e) => setAiIndustry(e.target.value)}
            disabled={isCreating}
          />
        </div>
      </div>
    </div>
  );

  // Render manual form step 1: Identity
  const renderManualStep1 = () => (
    <div className="space-y-4">
      {/* Name (Required) */}
      <div className="space-y-2">
        <Label htmlFor="manual-name" className="text-sm font-medium">
          {t('personas:addDialog.form.name.label')} <span className="text-destructive">*</span>
        </Label>
        <Input
          id="manual-name"
          placeholder={t('personas:addDialog.form.name.placeholder')}
          value={manualName}
          onChange={(e) => setManualName(e.target.value)}
          disabled={isCreating}
        />
      </div>

      {/* Type (Required) */}
      <div className="space-y-2">
        <Label htmlFor="manual-type" className="text-sm font-medium">
          {t('personas:addDialog.form.type.label')} <span className="text-destructive">*</span>
        </Label>
        <Select
          value={manualType}
          onValueChange={(v) => setManualType(v as PersonaType)}
          disabled={isCreating}
        >
          <SelectTrigger id="manual-type">
            <SelectValue placeholder={t('personas:addDialog.form.type.placeholder')} />
          </SelectTrigger>
          <SelectContent>
            {PERSONA_TYPE_OPTIONS.map(({ value, labelKey }) => (
              <SelectItem key={value} value={value}>
                {t(labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Role (Required) */}
      <div className="space-y-2">
        <Label htmlFor="manual-role" className="text-sm font-medium">
          {t('personas:addDialog.form.role.label')} <span className="text-destructive">*</span>
        </Label>
        <Input
          id="manual-role"
          placeholder={t('personas:addDialog.form.role.placeholder')}
          value={manualRole}
          onChange={(e) => setManualRole(e.target.value)}
          disabled={isCreating}
        />
      </div>

      {/* Tagline (Optional) */}
      <div className="space-y-2">
        <Label htmlFor="manual-tagline" className="text-sm font-medium">
          {t('personas:addDialog.form.tagline.label')}
        </Label>
        <Input
          id="manual-tagline"
          placeholder={t('personas:addDialog.form.tagline.placeholder')}
          value={manualTagline}
          onChange={(e) => setManualTagline(e.target.value)}
          disabled={isCreating}
        />
      </div>
    </div>
  );

  // Render manual form step 2: Demographics
  const renderManualStep2 = () => (
    <div className="space-y-4">
      {/* Experience Level */}
      <div className="space-y-2">
        <Label htmlFor="manual-experience" className="text-sm font-medium">
          {t('personas:addDialog.form.experienceLevel.label')}
        </Label>
        <Select
          value={manualExperienceLevel}
          onValueChange={(v) => setManualExperienceLevel(v as ExperienceLevel)}
          disabled={isCreating}
        >
          <SelectTrigger id="manual-experience">
            <SelectValue placeholder={t('personas:addDialog.form.experienceLevel.placeholder')} />
          </SelectTrigger>
          <SelectContent>
            {EXPERIENCE_OPTIONS.map(({ value, labelKey }) => (
              <SelectItem key={value} value={value}>
                {t(labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Industry */}
      <div className="space-y-2">
        <Label htmlFor="manual-industry" className="text-sm font-medium">
          {t('personas:addDialog.form.industry.label')}
        </Label>
        <Input
          id="manual-industry"
          placeholder={t('personas:addDialog.form.industry.placeholder')}
          value={manualIndustry}
          onChange={(e) => setManualIndustry(e.target.value)}
          disabled={isCreating}
        />
      </div>

      {/* Company Size */}
      <div className="space-y-2">
        <Label htmlFor="manual-company-size" className="text-sm font-medium">
          {t('personas:addDialog.form.companySize.label')}
        </Label>
        <Select
          value={manualCompanySize}
          onValueChange={(v) => setManualCompanySize(v as CompanySize)}
          disabled={isCreating}
        >
          <SelectTrigger id="manual-company-size">
            <SelectValue placeholder={t('personas:addDialog.form.companySize.placeholder')} />
          </SelectTrigger>
          <SelectContent>
            {COMPANY_SIZE_OPTIONS.map(({ value, labelKey }) => (
              <SelectItem key={value} value={value}>
                {t(labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Usage Frequency */}
      <div className="space-y-2">
        <Label htmlFor="manual-frequency" className="text-sm font-medium">
          {t('personas:addDialog.form.usageFrequency.label')}
        </Label>
        <Select
          value={manualUsageFrequency}
          onValueChange={(v) => setManualUsageFrequency(v as UsageFrequency)}
          disabled={isCreating}
        >
          <SelectTrigger id="manual-frequency">
            <SelectValue placeholder={t('personas:addDialog.form.usageFrequency.placeholder')} />
          </SelectTrigger>
          <SelectContent>
            {USAGE_FREQUENCY_OPTIONS.map(({ value, labelKey }) => (
              <SelectItem key={value} value={value}>
                {t(labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  // Render manual form step 3: Goals & Pain Points
  const renderManualStep3 = () => (
    <ScrollArea className="h-[400px] pr-4">
      <div className="space-y-6">
        {/* Goals */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">
              {t('personas:addDialog.goals.title')} <span className="text-destructive">*</span>
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addGoal}
              disabled={isCreating}
            >
              <Plus className="h-3 w-3 mr-1" />
              {t('personas:addDialog.goals.addButton')}
            </Button>
          </div>
          {manualGoals.map((goal, index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className="flex-1 space-y-2">
                <Input
                  placeholder={t('personas:addDialog.goals.placeholder')}
                  value={goal.description}
                  onChange={(e) => updateGoal(index, { description: e.target.value })}
                  disabled={isCreating}
                />
                <Select
                  value={goal.priority}
                  onValueChange={(v) => updateGoal(index, { priority: v as GoalPriority })}
                  disabled={isCreating}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map(({ value, labelKey }) => (
                      <SelectItem key={value} value={value}>
                        {t(labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {manualGoals.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => removeGoal(index)}
                  disabled={isCreating}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>

        {/* Pain Points */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">
              {t('personas:addDialog.painPoints.title')} <span className="text-destructive">*</span>
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addPainPoint}
              disabled={isCreating}
            >
              <Plus className="h-3 w-3 mr-1" />
              {t('personas:addDialog.painPoints.addButton')}
            </Button>
          </div>
          {manualPainPoints.map((painPoint, index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className="flex-1 space-y-2">
                <Input
                  placeholder={t('personas:addDialog.painPoints.placeholder')}
                  value={painPoint.description}
                  onChange={(e) => updatePainPoint(index, { description: e.target.value })}
                  disabled={isCreating}
                />
                <div className="flex gap-2">
                  <Select
                    value={painPoint.severity}
                    onValueChange={(v) => updatePainPoint(index, { severity: v as PainPointSeverity })}
                    disabled={isCreating}
                  >
                    <SelectTrigger className="h-8 w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITY_OPTIONS.map(({ value, labelKey }) => (
                        <SelectItem key={value} value={value}>
                          {t(labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder={t('personas:addDialog.painPoints.workaround')}
                    value={painPoint.currentWorkaround || ''}
                    onChange={(e) => updatePainPoint(index, { currentWorkaround: e.target.value })}
                    className="h-8 flex-1"
                    disabled={isCreating}
                  />
                </div>
              </div>
              {manualPainPoints.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => removePainPoint(index)}
                  disabled={isCreating}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  );

  // Render manual form step 4: Details (Optional)
  const renderManualStep4 = () => (
    <ScrollArea className="h-[400px] pr-4">
      <div className="space-y-4">
        {/* Behaviors */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">{t('personas:addDialog.behaviors.title')}</Label>

          <div className="space-y-2">
            <Label htmlFor="manual-channels" className="text-xs text-muted-foreground">
              {t('personas:addDialog.behaviors.channels.label')}
            </Label>
            <Input
              id="manual-channels"
              placeholder={t('personas:addDialog.behaviors.channels.placeholder')}
              value={manualChannels}
              onChange={(e) => setManualChannels(e.target.value)}
              disabled={isCreating}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-factors" className="text-xs text-muted-foreground">
              {t('personas:addDialog.behaviors.decisionFactors.label')}
            </Label>
            <Input
              id="manual-factors"
              placeholder={t('personas:addDialog.behaviors.decisionFactors.placeholder')}
              value={manualDecisionFactors}
              onChange={(e) => setManualDecisionFactors(e.target.value)}
              disabled={isCreating}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-tools" className="text-xs text-muted-foreground">
              {t('personas:addDialog.behaviors.toolStack.label')}
            </Label>
            <Input
              id="manual-tools"
              placeholder={t('personas:addDialog.behaviors.toolStack.placeholder')}
              value={manualToolStack}
              onChange={(e) => setManualToolStack(e.target.value)}
              disabled={isCreating}
            />
          </div>
        </div>

        {/* Quotes */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">{t('personas:addDialog.quotes.title')}</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addQuote}
              disabled={isCreating}
            >
              <Plus className="h-3 w-3 mr-1" />
              {t('personas:addDialog.quotes.addButton')}
            </Button>
          </div>
          {manualQuotes.map((quote, index) => (
            <div key={index} className="flex gap-2">
              <Input
                placeholder={t('personas:addDialog.quotes.placeholder')}
                value={quote}
                onChange={(e) => updateQuote(index, e.target.value)}
                disabled={isCreating}
              />
              {manualQuotes.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => removeQuote(index)}
                  disabled={isCreating}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Info className="h-3 w-3" />
          You can add usage scenarios later by editing the persona.
        </p>
      </div>
    </ScrollArea>
  );

  // Render manual form with current step
  const renderManualForm = () => {
    // Step indicators
    const steps = [
      { num: 1, label: t('personas:addDialog.steps.identity') },
      { num: 2, label: t('personas:addDialog.steps.demographics') },
      { num: 3, label: t('personas:addDialog.steps.goalsAndPainPoints') },
      { num: 4, label: t('personas:addDialog.steps.details') }
    ];

    return (
      <div className="space-y-4 py-2">
        {/* Step indicators */}
        <div className="flex justify-between px-2">
          {steps.map(({ num, label }) => (
            <div
              key={num}
              className={`flex flex-col items-center gap-1 ${
                num === manualStep ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  num < manualStep
                    ? 'bg-primary text-primary-foreground'
                    : num === manualStep
                    ? 'bg-primary/20 text-primary border border-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {num < manualStep ? <Check className="h-4 w-4" /> : num}
              </div>
              <span className="text-xs hidden sm:block">{label}</span>
            </div>
          ))}
        </div>

        {/* Current step content */}
        {manualStep === 1 && renderManualStep1()}
        {manualStep === 2 && renderManualStep2()}
        {manualStep === 3 && renderManualStep3()}
        {manualStep === 4 && renderManualStep4()}
      </div>
    );
  };

  // Determine dialog title based on mode
  const getDialogTitle = () => {
    if (mode === 'select') {
      return t('personas:addDialog.title');
    } else if (mode === 'ai-assisted') {
      return t('personas:addDialog.aiAssisted.title');
    } else {
      return t('personas:addDialog.manual.title');
    }
  };

  // Determine dialog description based on mode
  const getDialogDescription = () => {
    if (mode === 'select') {
      return t('personas:addDialog.modeSelection.title');
    } else if (mode === 'ai-assisted') {
      return t('personas:addDialog.aiAssisted.description');
    } else {
      return t('personas:addDialog.manual.description');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{getDialogTitle()}</DialogTitle>
          <DialogDescription>{getDialogDescription()}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {mode === 'select' && renderModeSelection()}
          {mode === 'ai-assisted' && renderAiAssistedForm()}
          {mode === 'manual' && renderManualForm()}

          {/* Error display */}
          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0">
          {mode !== 'select' && (
            <Button variant="ghost" onClick={handleBack} disabled={isCreating}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('personas:addDialog.buttons.back')}
            </Button>
          )}

          <div className="flex-1" />

          <Button variant="outline" onClick={handleClose} disabled={isCreating}>
            {t('personas:addDialog.buttons.cancel')}
          </Button>

          {mode === 'ai-assisted' && (
            <Button onClick={handleCreateAiPersona} disabled={isCreating || !isAiFormValid}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {t('personas:addDialog.buttons.createWithAI')}
                </>
              )}
            </Button>
          )}

          {mode === 'manual' && manualStep < 4 && (
            <Button
              onClick={() => setManualStep((manualStep + 1) as ManualStep)}
              disabled={!canProceedManualStep(manualStep)}
            >
              {t('personas:addDialog.buttons.next')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}

          {mode === 'manual' && manualStep === 4 && (
            <Button onClick={handleCreateManualPersona} disabled={isCreating || !isManualStep3Valid}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                t('personas:addDialog.buttons.create')
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
