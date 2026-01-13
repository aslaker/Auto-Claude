import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sparkles,
  TrendingUp,
  Users,
  Clock,
  Info,
  CheckCircle,
  RefreshCw,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Badge } from '../ui/badge';

export interface RoadmapGenerationOptions {
  enableCompetitorAnalysis: boolean;
  refreshCompetitorAnalysis: boolean;
  enablePersonaGeneration: boolean;
  refreshPersonas: boolean;
}

interface RoadmapOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (options: RoadmapGenerationOptions) => void;
  hasExistingCompetitorAnalysis: boolean;
  hasExistingPersonas: boolean;
  existingCompetitorAnalysisDate?: string;
  existingPersonaCount?: number;
}

export function RoadmapOptionsDialog({
  open,
  onOpenChange,
  onGenerate,
  hasExistingCompetitorAnalysis,
  hasExistingPersonas,
  existingCompetitorAnalysisDate,
  existingPersonaCount = 0,
}: RoadmapOptionsDialogProps) {
  const { t } = useTranslation(['roadmap', 'common']);

  // State for checkboxes
  const [enableCompetitorAnalysis, setEnableCompetitorAnalysis] = useState(hasExistingCompetitorAnalysis);
  const [enablePersonaGeneration, setEnablePersonaGeneration] = useState(hasExistingPersonas);

  // State for existing data options (use existing vs refresh)
  const [competitorMode, setCompetitorMode] = useState<'existing' | 'refresh'>('existing');
  const [personaMode, setPersonaMode] = useState<'existing' | 'refresh'>('existing');

  // Calculate total time estimate
  const timeEstimate = useMemo(() => {
    let minTime = 2;
    let maxTime = 3;

    if (enableCompetitorAnalysis) {
      if (hasExistingCompetitorAnalysis && competitorMode === 'existing') {
        // Using existing - no extra time
      } else {
        minTime += 3;
        maxTime += 5;
      }
    }

    if (enablePersonaGeneration) {
      if (hasExistingPersonas && personaMode === 'existing') {
        // Using existing - no extra time
      } else {
        minTime += 2;
        maxTime += 4;
      }
    }

    return `~${minTime}-${maxTime} min`;
  }, [enableCompetitorAnalysis, enablePersonaGeneration, hasExistingCompetitorAnalysis, hasExistingPersonas, competitorMode, personaMode]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return t('common:labels.recently');
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(date);
    } catch {
      return t('common:labels.recently');
    }
  };

  const handleGenerate = () => {
    onGenerate({
      enableCompetitorAnalysis,
      refreshCompetitorAnalysis: enableCompetitorAnalysis && (!hasExistingCompetitorAnalysis || competitorMode === 'refresh'),
      enablePersonaGeneration,
      refreshPersonas: enablePersonaGeneration && (!hasExistingPersonas || personaMode === 'refresh'),
    });
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[550px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-foreground">
            <Sparkles className="h-5 w-5 text-primary" />
            {t('roadmap:optionsDialog.title')}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {t('roadmap:optionsDialog.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4 space-y-4">
          {/* Base Roadmap Section */}
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-foreground">
                    {t('roadmap:optionsDialog.baseRoadmap.title')}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('roadmap:optionsDialog.baseRoadmap.description')}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                <Clock className="h-3 w-3 mr-1" />
                {t('roadmap:optionsDialog.baseRoadmap.time')}
              </Badge>
            </div>
          </div>

          {/* Optional Enhancements */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">
              {t('roadmap:optionsDialog.enhancements')}
            </h4>

            {/* Competitor Analysis Option */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="competitor-analysis"
                  checked={enableCompetitorAnalysis}
                  onCheckedChange={(checked) => setEnableCompetitorAnalysis(checked === true)}
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="competitor-analysis"
                      className="text-sm font-medium cursor-pointer flex items-center gap-2"
                    >
                      <TrendingUp className="h-4 w-4 text-orange-500" />
                      {t('roadmap:optionsDialog.competitorAnalysis.title')}
                    </Label>
                    <Badge variant="outline" className="text-xs">
                      <Clock className="h-3 w-3 mr-1" />
                      {hasExistingCompetitorAnalysis && competitorMode === 'existing' && enableCompetitorAnalysis
                        ? '+0 min'
                        : t('roadmap:optionsDialog.competitorAnalysis.time')}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('roadmap:optionsDialog.competitorAnalysis.description')}
                  </p>
                </div>
              </div>

              {/* Existing analysis options */}
              {enableCompetitorAnalysis && hasExistingCompetitorAnalysis && (
                <div className="ml-6 pt-2 border-t border-border/50">
                  <p className="text-xs text-muted-foreground mb-2">
                    {t('roadmap:optionsDialog.competitorAnalysis.existing', {
                      date: formatDate(existingCompetitorAnalysisDate),
                    })}
                  </p>
                  <RadioGroup
                    value={competitorMode}
                    onValueChange={(value) => setCompetitorMode(value as 'existing' | 'refresh')}
                    className="space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="existing" id="comp-existing" />
                      <Label htmlFor="comp-existing" className="text-xs cursor-pointer flex items-center gap-1.5">
                        <CheckCircle className="h-3 w-3 text-success" />
                        {t('roadmap:optionsDialog.competitorAnalysis.useExisting')}
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="refresh" id="comp-refresh" />
                      <Label htmlFor="comp-refresh" className="text-xs cursor-pointer flex items-center gap-1.5">
                        <RefreshCw className="h-3 w-3 text-muted-foreground" />
                        {t('roadmap:optionsDialog.competitorAnalysis.refresh')}
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}
            </div>

            {/* User Personas Option */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="persona-generation"
                  checked={enablePersonaGeneration}
                  onCheckedChange={(checked) => setEnablePersonaGeneration(checked === true)}
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="persona-generation"
                      className="text-sm font-medium cursor-pointer flex items-center gap-2"
                    >
                      <Users className="h-4 w-4 text-purple-500" />
                      {t('roadmap:optionsDialog.personas.title')}
                    </Label>
                    <Badge variant="outline" className="text-xs">
                      <Clock className="h-3 w-3 mr-1" />
                      {hasExistingPersonas && personaMode === 'existing' && enablePersonaGeneration
                        ? '+0 min'
                        : t('roadmap:optionsDialog.personas.time')}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('roadmap:optionsDialog.personas.description')}
                  </p>
                </div>
              </div>

              {/* Existing personas options */}
              {enablePersonaGeneration && hasExistingPersonas && (
                <div className="ml-6 pt-2 border-t border-border/50">
                  <p className="text-xs text-muted-foreground mb-2">
                    {t('roadmap:optionsDialog.personas.existing', {
                      count: existingPersonaCount,
                    })}
                  </p>
                  <RadioGroup
                    value={personaMode}
                    onValueChange={(value) => setPersonaMode(value as 'existing' | 'refresh')}
                    className="space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="existing" id="persona-existing" />
                      <Label htmlFor="persona-existing" className="text-xs cursor-pointer flex items-center gap-1.5">
                        <CheckCircle className="h-3 w-3 text-success" />
                        {t('roadmap:optionsDialog.personas.keepExisting')}
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="refresh" id="persona-refresh" />
                      <Label htmlFor="persona-refresh" className="text-xs cursor-pointer flex items-center gap-1.5">
                        <RefreshCw className="h-3 w-3 text-muted-foreground" />
                        {t('roadmap:optionsDialog.personas.regenerate')}
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}
            </div>
          </div>

          {/* Total Time Estimate */}
          <div className="flex items-center justify-between px-1">
            <span className="text-sm font-medium text-foreground">
              {t('roadmap:optionsDialog.totalTime', { time: timeEstimate })}
            </span>
          </div>

          {/* Footer note */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md p-3">
            <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{t('roadmap:optionsDialog.laterNote')}</span>
          </div>
        </div>

        <AlertDialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('roadmap:optionsDialog.cancel')}
          </Button>
          <Button onClick={handleGenerate}>
            <Sparkles className="h-4 w-4 mr-2" />
            {t('roadmap:optionsDialog.generate')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
