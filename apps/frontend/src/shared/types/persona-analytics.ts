/**
 * Persona analytics types for coverage tracking and gap analysis
 */

import type { PersonaType } from './persona';

// ============================================
// Coverage Analysis Types
// ============================================

/**
 * Coverage metrics for a single persona across all features, ideas, and tasks
 */
export interface PersonaCoverage {
  personaId: string;
  personaName: string;
  personaType: PersonaType;
  // Counts of items targeting this persona
  ideaCount: number;
  featureCount: number;
  taskCount: number;
  // Goal coverage tracking
  goalsCovered: number;
  goalsTotal: number;
  // Pain point coverage tracking
  painPointsCovered: number;
  painPointsTotal: number;
  // Overall health score (0-100)
  overallCoverageScore: number;
}

// ============================================
// Gap Analysis Types
// ============================================

export type PersonaGapType = 'unaddressed_goal' | 'unaddressed_pain_point' | 'low_coverage';

/**
 * Represents a gap in persona coverage that should be addressed
 */
export interface PersonaGap {
  personaId: string;
  gapType: PersonaGapType;
  description: string;
  severity: 'high' | 'medium' | 'low';
  suggestedAction?: string;
  // Reference to the unaddressed goal or pain point
  relatedItemId?: string;
}

// ============================================
// Dashboard Types
// ============================================

/**
 * Complete health dashboard data for all personas
 */
export interface PersonaHealthDashboard {
  personas: PersonaCoverage[];
  gaps: PersonaGap[];
  recommendations: string[];
  lastUpdated: string;
}

/**
 * Summary statistics for quick display
 */
export interface PersonaCoverageSummary {
  totalPersonas: number;
  wellServedCount: number;    // Coverage > 70%
  needsAttentionCount: number; // Coverage 40-70%
  underservedCount: number;   // Coverage < 40%
  averageCoverage: number;
}

// ============================================
// Filter Types
// ============================================

/**
 * Filter options for persona-based filtering in UI
 */
export interface PersonaFilterOption {
  personaId: string;
  personaName: string;
  personaType: PersonaType;
  itemCount: number; // Number of matching items
}

/**
 * Active filter state
 */
export interface PersonaFilterState {
  selectedPersonaIds: string[];
  showUnassigned: boolean; // Show items without persona assignment
}
