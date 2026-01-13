import { useTranslation } from 'react-i18next';
import { Zap, Palette, BookOpen, Shield, Gauge, Users } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { usePersonaStore } from '../../stores/persona-store';
import type { Persona } from '../../../shared/types';

interface IdeationFiltersProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  selectedPersonaId: string | null;
  onPersonaChange: (personaId: string | null) => void;
  children: React.ReactNode;
}

export function IdeationFilters({
  activeTab,
  onTabChange,
  selectedPersonaId,
  onPersonaChange,
  children
}: IdeationFiltersProps) {
  const { t } = useTranslation('personas');
  const personas = usePersonaStore((state) => state.personas);

  // Group personas by type for better organization
  const primaryPersonas = personas.filter((p: Persona) => p.type === 'primary');
  const secondaryPersonas = personas.filter((p: Persona) => p.type === 'secondary');
  const edgeCasePersonas = personas.filter((p: Persona) => p.type === 'edge-case');

  const handlePersonaChange = (value: string) => {
    onPersonaChange(value === 'all' ? null : value);
  };

  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="h-full flex flex-col">
      <div className="shrink-0 mx-4 mt-4 flex items-center gap-3 flex-wrap">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="code_improvements">
            <Zap className="h-3 w-3 mr-1" />
            Code
          </TabsTrigger>
          <TabsTrigger value="ui_ux_improvements">
            <Palette className="h-3 w-3 mr-1" />
            UI/UX
          </TabsTrigger>
          <TabsTrigger value="documentation_gaps">
            <BookOpen className="h-3 w-3 mr-1" />
            Docs
          </TabsTrigger>
          <TabsTrigger value="security_hardening">
            <Shield className="h-3 w-3 mr-1" />
            Security
          </TabsTrigger>
          <TabsTrigger value="performance_optimizations">
            <Gauge className="h-3 w-3 mr-1" />
            Performance
          </TabsTrigger>
        </TabsList>

        {/* Persona filter dropdown */}
        {personas.length > 0 && (
          <Select
            value={selectedPersonaId || 'all'}
            onValueChange={handlePersonaChange}
          >
            <SelectTrigger className="w-[180px] h-8">
              <Users className="h-3 w-3 mr-2 text-purple-400" />
              <SelectValue placeholder={t('filter.allPersonas')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filter.allPersonas')}</SelectItem>

              {primaryPersonas.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    {t('coverage.primary')}
                  </div>
                  {primaryPersonas.map((persona: Persona) => (
                    <SelectItem key={persona.id} value={persona.id}>
                      {persona.name}
                    </SelectItem>
                  ))}
                </>
              )}

              {secondaryPersonas.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    {t('coverage.secondary')}
                  </div>
                  {secondaryPersonas.map((persona: Persona) => (
                    <SelectItem key={persona.id} value={persona.id}>
                      {persona.name}
                    </SelectItem>
                  ))}
                </>
              )}

              {edgeCasePersonas.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    {t('coverage.edgeCase')}
                  </div>
                  {edgeCasePersonas.map((persona: Persona) => (
                    <SelectItem key={persona.id} value={persona.id}>
                      {persona.name}
                    </SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
        )}
      </div>
      {children}
    </Tabs>
  );
}
