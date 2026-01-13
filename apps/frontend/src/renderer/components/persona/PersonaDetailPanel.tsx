import { useState } from 'react';
import { X, Trash2, Edit, Target, AlertTriangle, Quote, Play, Briefcase, Building, TrendingUp, ChevronDown, ChevronRight, Sparkles, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { cn } from '../../lib/utils';
import type { PersonaDetailPanelProps } from './types';

const PRIORITY_STYLES = {
  'must-have': 'bg-destructive/10 text-destructive border-destructive/30',
  'should-have': 'bg-warning/10 text-warning border-warning/30',
  'nice-to-have': 'bg-muted text-muted-foreground border-muted',
};

const SEVERITY_STYLES = {
  high: 'bg-destructive/10 text-destructive border-destructive/30',
  medium: 'bg-warning/10 text-warning border-warning/30',
  low: 'bg-muted text-muted-foreground border-muted',
};

export function PersonaDetailPanel({
  persona,
  onClose,
  onEdit,
  onDelete,
  onEnrich,
  isEnriching
}: PersonaDetailPanelProps) {
  const { t } = useTranslation(['personas', 'common']);
  const [openScenarios, setOpenScenarios] = useState<Record<string, boolean>>({});

  // Check if persona can be enriched (manually created, not yet enriched)
  const canEnrich = !persona.discoverySource.researchEnriched && onEnrich;

  return (
    <div className="fixed right-0 top-0 h-full w-[450px] bg-card border-l shadow-lg z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-base font-semibold text-white flex-shrink-0"
            style={{ backgroundColor: persona.avatar.color }}
          >
            {persona.avatar.initials}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">{persona.name}</h2>
              {persona.discoverySource.researchEnriched ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-purple-500/10 text-purple-500 border-purple-500/30"
                      >
                        <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                        {t('personas:enrichment.enriched.badge')}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('personas:enrichment.enriched.tooltip')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : canEnrich ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-muted text-muted-foreground"
                      >
                        {t('personas:enrichment.notEnriched.badge')}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('personas:enrichment.notEnriched.tooltip')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">{persona.tagline}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {canEnrich && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEnrich(persona.id)}
                    disabled={isEnriching}
                    className="text-purple-500 hover:text-purple-600"
                  >
                    {isEnriching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {isEnriching
                      ? t('personas:enrichment.enrichExisting.inProgress')
                      : t('personas:enrichment.enrichExisting.tooltip')}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {onEdit && (
            <Button variant="ghost" size="icon" onClick={onEdit}>
              <Edit className="h-4 w-4" />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(persona.id)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Demographics */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              {t('personas:detail.demographics')}
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">{t('personas:detail.role')}</span>
                <p className="font-medium">{persona.demographics.role}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t('personas:detail.experience')}</span>
                <p className="font-medium">{t(`personas:experienceLevel.${persona.demographics.experienceLevel}`)}</p>
              </div>
              {persona.demographics.industry && (
                <div>
                  <span className="text-muted-foreground">{t('personas:detail.industry')}</span>
                  <p className="font-medium">{persona.demographics.industry}</p>
                </div>
              )}
              {persona.demographics.companySize && (
                <div>
                  <span className="text-muted-foreground">{t('personas:detail.companySize')}</span>
                  <p className="font-medium">{t(`personas:companySize.${persona.demographics.companySize}`)}</p>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Goals */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4" />
              {t('personas:detail.goals')} ({persona.goals.length})
            </h3>
            <div className="space-y-2">
              {persona.goals.map((goal) => (
                <div key={goal.id} className="p-2 rounded-md bg-muted/50">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm">{goal.description}</p>
                    <Badge
                      variant="outline"
                      className={cn('text-[10px] flex-shrink-0', PRIORITY_STYLES[goal.priority])}
                    >
                      {t(`personas:priority.${goal.priority}`)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Pain Points */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {t('personas:detail.painPoints')} ({persona.painPoints.length})
            </h3>
            <div className="space-y-2">
              {persona.painPoints.map((painPoint) => (
                <div key={painPoint.id} className="p-2 rounded-md bg-muted/50">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm">{painPoint.description}</p>
                      {painPoint.currentWorkaround && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('personas:detail.workaround')}: {painPoint.currentWorkaround}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={cn('text-[10px] flex-shrink-0', SEVERITY_STYLES[painPoint.severity])}
                    >
                      {t(`personas:severity.${painPoint.severity}`)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Quotes */}
          {persona.quotes.length > 0 && (
            <>
              <div className="space-y-2">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Quote className="h-4 w-4" />
                  {t('personas:detail.quotes')}
                </h3>
                <div className="space-y-2">
                  {persona.quotes.map((quote, index) => (
                    <div key={index} className="p-2 rounded-md bg-muted/50 italic text-sm">
                      "{quote}"
                    </div>
                  ))}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Scenarios */}
          {persona.scenarios.length > 0 && (
            <>
              <div className="space-y-2">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Play className="h-4 w-4" />
                  {t('personas:detail.scenarios')} ({persona.scenarios.length})
                </h3>
                <div className="space-y-2">
                  {persona.scenarios.map((scenario) => (
                    <Collapsible
                      key={scenario.id}
                      open={openScenarios[scenario.id]}
                      onOpenChange={(open) =>
                        setOpenScenarios((prev) => ({ ...prev, [scenario.id]: open }))
                      }
                    >
                      <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-md bg-muted/50 hover:bg-muted text-sm font-medium text-left">
                        {openScenarios[scenario.id] ? (
                          <ChevronDown className="h-4 w-4 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 flex-shrink-0" />
                        )}
                        {scenario.title}
                      </CollapsibleTrigger>
                      <CollapsibleContent className="px-2 pt-2">
                        <div className="space-y-2 text-sm pl-6">
                          <div>
                            <span className="text-muted-foreground">{t('personas:detail.context')}:</span>
                            <p>{scenario.context}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('personas:detail.action')}:</span>
                            <p>{scenario.action}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('personas:detail.outcome')}:</span>
                            <p>{scenario.outcome}</p>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Behaviors */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              {t('personas:detail.behaviors')}
            </h3>
            <div className="space-y-3">
              <div>
                <span className="text-xs text-muted-foreground">{t('personas:detail.usageFrequency')}</span>
                <p className="text-sm font-medium">{t(`personas:usageFrequency.${persona.behaviors.usageFrequency}`)}</p>
              </div>
              {persona.behaviors.preferredChannels.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">{t('personas:detail.preferredChannels')}</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {persona.behaviors.preferredChannels.map((channel) => (
                      <Badge key={channel} variant="outline" className="text-xs">
                        {channel}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {persona.behaviors.toolStack.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">{t('personas:detail.toolStack')}</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {persona.behaviors.toolStack.map((tool) => (
                      <Badge key={tool} variant="outline" className="text-xs">
                        {tool}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {persona.behaviors.decisionFactors.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">{t('personas:detail.decisionFactors')}</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {persona.behaviors.decisionFactors.map((factor) => (
                      <Badge key={factor} variant="outline" className="text-xs">
                        {factor}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Feature Preferences */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Building className="h-4 w-4" />
              {t('personas:detail.featurePreferences')}
            </h3>
            <div className="space-y-3">
              {persona.featurePreferences.mustHave.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">{t('personas:detail.mustHave')}</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {persona.featurePreferences.mustHave.map((feature) => (
                      <Badge key={feature} variant="outline" className="text-xs bg-success/10 text-success border-success/30">
                        {feature}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {persona.featurePreferences.niceToHave.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">{t('personas:detail.niceToHave')}</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {persona.featurePreferences.niceToHave.map((feature) => (
                      <Badge key={feature} variant="outline" className="text-xs">
                        {feature}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {persona.featurePreferences.avoid.length > 0 && (
                <div>
                  <span className="text-xs text-muted-foreground">{t('personas:detail.avoid')}</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {persona.featurePreferences.avoid.map((feature) => (
                      <Badge key={feature} variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30">
                        {feature}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
