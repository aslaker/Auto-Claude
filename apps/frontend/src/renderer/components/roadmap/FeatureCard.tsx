import { useTranslation } from 'react-i18next';
import { ExternalLink, Play, TrendingUp, Users } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import {
  ROADMAP_PRIORITY_COLORS,
  ROADMAP_PRIORITY_LABELS,
  ROADMAP_COMPLEXITY_COLORS,
  ROADMAP_IMPACT_COLORS,
} from '../../../shared/constants';
import { usePersonaStore, getPersonaById } from '../../stores/persona-store';
import type { FeatureCardProps } from './types';

export function FeatureCard({
  feature,
  onClick,
  onConvertToSpec,
  onGoToTask,
  hasCompetitorInsight = false,
}: FeatureCardProps) {
  const { t } = useTranslation('personas');
  const personas = usePersonaStore((state) => state.personas);

  // Get persona names for tooltip
  const getPersonaNames = (): string[] => {
    if (!feature.targetPersonaIds?.length) return [];
    return feature.targetPersonaIds
      .map((id) => getPersonaById(personas, id)?.name)
      .filter((name): name is string => !!name);
  };

  const hasPersonaTargeting = feature.targetPersonaIds && feature.targetPersonaIds.length > 0;

  return (
    <Card className="p-4 hover:bg-muted/50 cursor-pointer transition-colors" onClick={onClick}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant="outline" className={ROADMAP_PRIORITY_COLORS[feature.priority]}>
              {ROADMAP_PRIORITY_LABELS[feature.priority]}
            </Badge>
            <Badge
              variant="outline"
              className={`text-xs ${ROADMAP_COMPLEXITY_COLORS[feature.complexity]}`}
            >
              {feature.complexity}
            </Badge>
            <Badge
              variant="outline"
              className={`text-xs ${ROADMAP_IMPACT_COLORS[feature.impact]}`}
            >
              {feature.impact} impact
            </Badge>
            {hasCompetitorInsight && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-xs text-primary border-primary/50">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    Competitor Insight
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>This feature addresses competitor pain points</TooltipContent>
              </Tooltip>
            )}
            {/* Persona targeting badge */}
            {hasPersonaTargeting && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-xs text-purple-400 border-purple-500/30 bg-purple-500/10">
                    <Users className="h-3 w-3 mr-1" />
                    {feature.targetPersonaIds!.length}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-sm">
                    <div className="font-medium mb-1">{t('impact.targetedPersonas')}</div>
                    <div className="text-muted-foreground">
                      {getPersonaNames().join(', ') || t('relevance.unknownPersonas')}
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <h3 className="font-medium">{feature.title}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2">{feature.description}</p>
        </div>
        {feature.linkedSpecId ? (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onGoToTask(feature.linkedSpecId!);
            }}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Go to Task
          </Button>
        ) : (
          feature.status !== 'done' && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onConvertToSpec(feature);
              }}
            >
              <Play className="h-3 w-3 mr-1" />
              Build
            </Button>
          )
        )}
      </div>
    </Card>
  );
}
