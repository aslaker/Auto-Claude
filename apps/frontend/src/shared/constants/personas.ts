/**
 * Persona-related constants
 * Weights, thresholds, and styling for persona analytics and prioritization
 */

import type { PersonaType } from '../types/persona';

// ============================================
// Persona Type Weights
// ============================================

/**
 * Weights for persona impact scoring
 * Primary personas have highest weight as they represent core target users
 */
export const PERSONA_TYPE_WEIGHTS: Record<PersonaType, number> = {
  'primary': 3,
  'secondary': 2,
  'edge-case': 1
} as const;

// ============================================
// Coverage Thresholds
// ============================================

/**
 * Thresholds for persona coverage health indicators
 * - Good (70%+): Persona is well-served
 * - Warning (40-69%): Persona needs attention
 * - Critical (<40%): Persona is underserved
 */
export const PERSONA_COVERAGE_THRESHOLDS = {
  good: 70,
  warning: 40,
  critical: 0
} as const;

// ============================================
// Persona Type Labels & Colors
// ============================================

export const PERSONA_TYPE_LABELS: Record<PersonaType, string> = {
  'primary': 'Primary',
  'secondary': 'Secondary',
  'edge-case': 'Edge Case'
};

export const PERSONA_TYPE_COLORS: Record<PersonaType, string> = {
  'primary': 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  'secondary': 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  'edge-case': 'bg-slate-500/10 text-slate-400 border-slate-500/30'
};

// ============================================
// Coverage Status Colors
// ============================================

export const PERSONA_COVERAGE_COLORS = {
  good: 'bg-success/10 text-success border-success/30',
  warning: 'bg-warning/10 text-warning border-warning/30',
  critical: 'bg-destructive/10 text-destructive border-destructive/30'
} as const;

// ============================================
// Gap Severity Colors
// ============================================

export const PERSONA_GAP_SEVERITY_COLORS: Record<string, string> = {
  high: 'bg-destructive/10 text-destructive border-destructive/30',
  medium: 'bg-warning/10 text-warning border-warning/30',
  low: 'bg-info/10 text-info border-info/30'
};

// ============================================
// Relevance Score Thresholds
// ============================================

/**
 * Thresholds for persona relevance scoring on ideas/features
 * - High (70%+): Strongly relevant to persona
 * - Medium (40-69%): Moderately relevant
 * - Low (<40%): Weakly relevant
 */
export const PERSONA_RELEVANCE_THRESHOLDS = {
  high: 70,
  medium: 40,
  low: 0
} as const;

export const PERSONA_RELEVANCE_COLORS = {
  high: 'bg-success/10 text-success',
  medium: 'bg-warning/10 text-warning',
  low: 'bg-muted text-muted-foreground'
} as const;

// ============================================
// Helper Functions
// ============================================

/**
 * Get coverage status based on score
 */
export function getCoverageStatus(score: number): 'good' | 'warning' | 'critical' {
  if (score >= PERSONA_COVERAGE_THRESHOLDS.good) return 'good';
  if (score >= PERSONA_COVERAGE_THRESHOLDS.warning) return 'warning';
  return 'critical';
}

/**
 * Get relevance level based on score
 */
export function getRelevanceLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= PERSONA_RELEVANCE_THRESHOLDS.high) return 'high';
  if (score >= PERSONA_RELEVANCE_THRESHOLDS.medium) return 'medium';
  return 'low';
}

/**
 * Calculate persona impact score for an item
 */
export function calculatePersonaImpactScore(
  targetPersonaIds: string[] | undefined,
  personas: Array<{ id: string; type: PersonaType }>
): number {
  if (!targetPersonaIds?.length) return 0;

  return targetPersonaIds.reduce((score, personaId) => {
    const persona = personas.find(p => p.id === personaId);
    if (!persona) return score;
    return score + (PERSONA_TYPE_WEIGHTS[persona.type] || 1);
  }, 0);
}
