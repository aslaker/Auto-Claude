import { Users, Sparkles, RefreshCw, UserCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { Button } from '../ui/button';

interface PersonaSuggestionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Whether personas already exist for this project
   */
  hasExistingPersonas: boolean;
  /**
   * Number of existing personas
   */
  existingPersonaCount?: number;
  /**
   * Number of target user types discovered in roadmap
   */
  targetUserCount?: number;
  /**
   * Called when user wants to generate/refresh personas
   */
  onGeneratePersonas: () => void;
  /**
   * Called when user wants to skip persona generation
   */
  onSkip: () => void;
  /**
   * Called when user wants to keep existing personas (only shown when hasExistingPersonas is true)
   */
  onKeepExisting?: () => void;
}

export function PersonaSuggestionDialog({
  open,
  onOpenChange,
  hasExistingPersonas,
  existingPersonaCount = 0,
  targetUserCount = 0,
  onGeneratePersonas,
  onSkip,
  onKeepExisting,
}: PersonaSuggestionDialogProps) {
  const { t } = useTranslation('personas');

  const handleGeneratePersonas = () => {
    onGeneratePersonas();
    onOpenChange(false);
  };

  const handleSkip = () => {
    onSkip();
    onOpenChange(false);
  };

  const handleKeepExisting = () => {
    onKeepExisting?.();
    onOpenChange(false);
  };

  // Render different content based on whether personas exist
  if (hasExistingPersonas) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent className="sm:max-w-[500px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <RefreshCw className="h-5 w-5 text-primary" />
              {t('suggestionDialog.refreshTitle', 'Update User Personas?')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t('suggestionDialog.refreshDescription', 'Your roadmap identified new target audience information. Would you like to update your personas?')}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4 space-y-3">
            {/* Option 1: Keep existing (recommended if only minor changes) */}
            <button
              onClick={handleKeepExisting}
              className="w-full rounded-lg bg-primary/10 border border-primary/30 p-4 text-left hover:bg-primary/20 transition-colors"
            >
              <div className="flex items-start gap-3">
                <UserCheck className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                    {t('suggestionDialog.keepExisting', 'Keep current personas')}
                    <span className="text-xs text-primary font-normal">
                      ({existingPersonaCount} {existingPersonaCount === 1 ? 'persona' : 'personas'})
                    </span>
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('suggestionDialog.keepExistingDescription', 'Your existing personas are already well-defined. Continue using them.')}
                  </p>
                </div>
              </div>
            </button>

            {/* Option 2: Refresh personas */}
            <button
              onClick={handleGeneratePersonas}
              className="w-full rounded-lg bg-muted/50 border border-border p-4 text-left hover:bg-muted transition-colors"
            >
              <div className="flex items-start gap-3">
                <RefreshCw className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-foreground">
                    {t('suggestionDialog.refreshPersonas', 'Refresh personas')}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('suggestionDialog.refreshPersonasDescription', 'Regenerate personas using the latest roadmap insights. This will replace existing personas.')}
                  </p>
                </div>
              </div>
            </button>
          </div>

          <AlertDialogFooter className="sm:justify-start">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common:cancel', 'Cancel')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  // No existing personas - show generate dialog
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[500px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-foreground">
            <Users className="h-5 w-5 text-primary" />
            {t('suggestionDialog.title', 'Generate User Personas?')}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            {t('suggestionDialog.description', 'Your roadmap identified {{count}} target user types. Generate detailed personas to guide feature development.', { count: targetUserCount })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4 space-y-4">
          {/* What personas provide */}
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
            <h4 className="text-sm font-medium text-foreground mb-2">
              {t('suggestionDialog.benefitsTitle', 'User personas help you:')}
            </h4>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li className="flex items-start gap-2">
                <Users className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                <span>{t('suggestionDialog.benefit1', 'Understand who your users are and their goals')}</span>
              </li>
              <li className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                <span>{t('suggestionDialog.benefit2', 'Prioritize features based on user impact')}</span>
              </li>
              <li className="flex items-start gap-2">
                <UserCheck className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                <span>{t('suggestionDialog.benefit3', 'Tag tasks with target personas for persona-driven development')}</span>
              </li>
            </ul>
          </div>

          {/* Target audience preview */}
          {targetUserCount > 0 && (
            <div className="rounded-lg bg-muted/50 border border-border p-4">
              <div className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {t('suggestionDialog.targetAudience', 'Target audience discovered:')}
                </span>
                <span className="font-medium text-foreground">
                  {targetUserCount} {targetUserCount === 1 ? 'user type' : 'user types'}
                </span>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {t('suggestionDialog.skipNote', 'You can always generate personas later from the Personas tab.')}
          </p>
        </div>

        <AlertDialogFooter>
          <Button variant="outline" onClick={handleSkip}>
            {t('suggestionDialog.skipButton', 'Skip for Now')}
          </Button>
          <Button onClick={handleGeneratePersonas}>
            <Sparkles className="h-4 w-4 mr-2" />
            {t('suggestionDialog.generateButton', 'Generate Personas')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
