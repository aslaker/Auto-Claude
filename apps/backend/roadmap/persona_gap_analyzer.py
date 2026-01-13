"""
Persona Gap Analyzer

Analyzes coverage gaps for each persona by examining how well their goals
and pain points are addressed by roadmap features, ideation ideas, and tasks.
"""

from dataclasses import dataclass, field
from typing import Any
from datetime import datetime
import json
from pathlib import Path


@dataclass
class PersonaCoverage:
    """Coverage metrics for a single persona."""
    persona_id: str
    persona_name: str
    persona_type: str  # 'primary', 'secondary', 'edge-case'
    idea_count: int = 0
    feature_count: int = 0
    task_count: int = 0
    goals_covered: int = 0
    goals_total: int = 0
    pain_points_covered: int = 0
    pain_points_total: int = 0
    overall_coverage_score: float = 0.0


@dataclass
class PersonaGap:
    """Represents an identified gap for a persona."""
    persona_id: str
    gap_type: str  # 'unaddressed_goal', 'unaddressed_pain_point', 'low_coverage'
    description: str
    severity: str  # 'high', 'medium', 'low'
    suggested_action: str | None = None
    related_goal_id: str | None = None
    related_pain_point_id: str | None = None


@dataclass
class PersonaHealthDashboard:
    """Complete health dashboard for all personas."""
    personas: list[PersonaCoverage] = field(default_factory=list)
    gaps: list[PersonaGap] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)
    last_updated: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'personas': [
                {
                    'personaId': p.persona_id,
                    'personaName': p.persona_name,
                    'personaType': p.persona_type,
                    'ideaCount': p.idea_count,
                    'featureCount': p.feature_count,
                    'taskCount': p.task_count,
                    'goalsCovered': p.goals_covered,
                    'goalsTotal': p.goals_total,
                    'painPointsCovered': p.pain_points_covered,
                    'painPointsTotal': p.pain_points_total,
                    'overallCoverageScore': p.overall_coverage_score
                }
                for p in self.personas
            ],
            'gaps': [
                {
                    'personaId': g.persona_id,
                    'gapType': g.gap_type,
                    'description': g.description,
                    'severity': g.severity,
                    'suggestedAction': g.suggested_action,
                    'relatedGoalId': g.related_goal_id,
                    'relatedPainPointId': g.related_pain_point_id
                }
                for g in self.gaps
            ],
            'recommendations': self.recommendations,
            'lastUpdated': self.last_updated
        }


# Persona type weights for coverage scoring
PERSONA_TYPE_WEIGHTS = {
    'primary': 3,
    'secondary': 2,
    'edge-case': 1
}

# Coverage thresholds
COVERAGE_THRESHOLDS = {
    'good': 70,
    'warning': 40,
    'critical': 0
}


class PersonaGapAnalyzer:
    """Analyzes coverage gaps for each persona."""

    def __init__(self, project_dir: str | Path):
        """Initialize the analyzer with project directory.

        Args:
            project_dir: Path to the project directory
        """
        self.project_dir = Path(project_dir)
        self.personas_path = self.project_dir / '.auto-claude' / 'personas' / 'personas.json'

    def load_personas(self) -> list[dict[str, Any]]:
        """Load personas from the personas.json file.

        Returns:
            List of persona dictionaries
        """
        if not self.personas_path.exists():
            return []

        with open(self.personas_path, 'r') as f:
            data = json.load(f)
            return data.get('personas', [])

    def analyze_gaps(
        self,
        personas: list[dict[str, Any]] | None = None,
        roadmap_features: list[dict[str, Any]] | None = None,
        ideation_ideas: list[dict[str, Any]] | None = None,
        tasks: list[dict[str, Any]] | None = None
    ) -> PersonaHealthDashboard:
        """Analyze coverage gaps for all personas.

        Args:
            personas: List of persona dicts (loads from file if not provided)
            roadmap_features: List of roadmap feature dicts
            ideation_ideas: List of ideation idea dicts
            tasks: List of task dicts

        Returns:
            PersonaHealthDashboard with coverage and gap analysis
        """
        if personas is None:
            personas = self.load_personas()

        roadmap_features = roadmap_features or []
        ideation_ideas = ideation_ideas or []
        tasks = tasks or []

        dashboard = PersonaHealthDashboard()

        for persona in personas:
            # Calculate coverage for this persona
            coverage = self.calculate_coverage(
                persona, roadmap_features, ideation_ideas, tasks
            )
            dashboard.personas.append(coverage)

            # Find unaddressed needs
            gaps = self.identify_unaddressed_needs(
                persona, roadmap_features, ideation_ideas, tasks
            )
            dashboard.gaps.extend(gaps)

        # Generate recommendations
        dashboard.recommendations = self._generate_recommendations(dashboard)

        return dashboard

    def calculate_coverage(
        self,
        persona: dict[str, Any],
        roadmap_features: list[dict[str, Any]],
        ideation_ideas: list[dict[str, Any]],
        tasks: list[dict[str, Any]]
    ) -> PersonaCoverage:
        """Calculate coverage score for a persona.

        Args:
            persona: The persona dictionary
            roadmap_features: List of roadmap features
            ideation_ideas: List of ideation ideas
            tasks: List of tasks

        Returns:
            PersonaCoverage with calculated metrics
        """
        persona_id = persona.get('id', '')
        goals = persona.get('goals', [])
        pain_points = persona.get('painPoints', [])

        # Count items targeting this persona
        idea_count = sum(
            1 for idea in ideation_ideas
            if self._persona_in_relevance(persona_id, idea.get('personaRelevance', []))
        )

        feature_count = sum(
            1 for feature in roadmap_features
            if persona_id in (feature.get('targetPersonaIds', []) or feature.get('target_persona_ids', []))
        )

        task_count = sum(
            1 for task in tasks
            if persona_id in (task.get('targetPersonaIds', []) or [])
        )

        # Calculate covered goals and pain points
        covered_goal_ids = self._get_covered_goal_ids(
            persona_id, roadmap_features, ideation_ideas, tasks
        )
        covered_pain_point_ids = self._get_covered_pain_point_ids(
            persona_id, roadmap_features, ideation_ideas, tasks
        )

        goals_covered = len([g for g in goals if g.get('id') in covered_goal_ids])
        pain_points_covered = len([p for p in pain_points if p.get('id') in covered_pain_point_ids])

        # Calculate overall coverage score (0-100)
        goals_total = len(goals)
        pain_points_total = len(pain_points)

        if goals_total + pain_points_total == 0:
            overall_score = 0.0
        else:
            # Weight goals and pain points equally
            goal_coverage = (goals_covered / goals_total * 100) if goals_total > 0 else 0
            pain_coverage = (pain_points_covered / pain_points_total * 100) if pain_points_total > 0 else 0
            overall_score = (goal_coverage + pain_coverage) / 2

        return PersonaCoverage(
            persona_id=persona_id,
            persona_name=persona.get('name', 'Unknown'),
            persona_type=persona.get('type', 'secondary'),
            idea_count=idea_count,
            feature_count=feature_count,
            task_count=task_count,
            goals_covered=goals_covered,
            goals_total=goals_total,
            pain_points_covered=pain_points_covered,
            pain_points_total=pain_points_total,
            overall_coverage_score=round(overall_score, 1)
        )

    def identify_unaddressed_needs(
        self,
        persona: dict[str, Any],
        roadmap_features: list[dict[str, Any]],
        ideation_ideas: list[dict[str, Any]],
        tasks: list[dict[str, Any]]
    ) -> list[PersonaGap]:
        """Find goals and pain points not addressed by any item.

        Args:
            persona: The persona dictionary
            roadmap_features: List of roadmap features
            ideation_ideas: List of ideation ideas
            tasks: List of tasks

        Returns:
            List of PersonaGap objects
        """
        persona_id = persona.get('id', '')
        persona_type = persona.get('type', 'secondary')
        goals = persona.get('goals', [])
        pain_points = persona.get('painPoints', [])

        gaps: list[PersonaGap] = []

        # Get covered IDs
        covered_goal_ids = self._get_covered_goal_ids(
            persona_id, roadmap_features, ideation_ideas, tasks
        )
        covered_pain_point_ids = self._get_covered_pain_point_ids(
            persona_id, roadmap_features, ideation_ideas, tasks
        )

        # Find unaddressed goals
        for goal in goals:
            goal_id = goal.get('id', '')
            if goal_id and goal_id not in covered_goal_ids:
                priority = goal.get('priority', 'medium')
                severity = self._calculate_gap_severity(persona_type, priority)

                gaps.append(PersonaGap(
                    persona_id=persona_id,
                    gap_type='unaddressed_goal',
                    description=goal.get('description', 'Unknown goal'),
                    severity=severity,
                    suggested_action=f"Create a feature or idea addressing: {goal.get('description', '')}",
                    related_goal_id=goal_id
                ))

        # Find unaddressed pain points
        for pain_point in pain_points:
            pp_id = pain_point.get('id', '')
            if pp_id and pp_id not in covered_pain_point_ids:
                pp_severity = pain_point.get('severity', 'medium')
                gap_severity = self._calculate_gap_severity(persona_type, pp_severity)

                gaps.append(PersonaGap(
                    persona_id=persona_id,
                    gap_type='unaddressed_pain_point',
                    description=pain_point.get('description', 'Unknown pain point'),
                    severity=gap_severity,
                    suggested_action=f"Address pain point: {pain_point.get('description', '')}",
                    related_pain_point_id=pp_id
                ))

        return gaps

    def _persona_in_relevance(
        self,
        persona_id: str,
        relevance_list: list[dict[str, Any]]
    ) -> bool:
        """Check if persona is in the relevance list."""
        for r in relevance_list:
            if r.get('personaId') == persona_id or r.get('persona_id') == persona_id:
                return True
        return False

    def _get_covered_goal_ids(
        self,
        persona_id: str,
        roadmap_features: list[dict[str, Any]],
        ideation_ideas: list[dict[str, Any]],
        tasks: list[dict[str, Any]]
    ) -> set[str]:
        """Get all goal IDs covered by features, ideas, and tasks."""
        covered = set()

        # From roadmap features
        for feature in roadmap_features:
            for impact in (feature.get('personaImpact', []) or feature.get('persona_impact', [])):
                if (impact.get('personaId') == persona_id or
                    impact.get('persona_id') == persona_id):
                    goal_ids = impact.get('addressedGoalIds', []) or impact.get('addressed_goal_ids', [])
                    covered.update(goal_ids)

        # From ideation ideas
        for idea in ideation_ideas:
            for relevance in (idea.get('personaRelevance', []) or idea.get('persona_relevance', [])):
                if (relevance.get('personaId') == persona_id or
                    relevance.get('persona_id') == persona_id):
                    goal_ids = relevance.get('addressedGoalIds', []) or relevance.get('addressed_goal_ids', [])
                    covered.update(goal_ids)

        return covered

    def _get_covered_pain_point_ids(
        self,
        persona_id: str,
        roadmap_features: list[dict[str, Any]],
        ideation_ideas: list[dict[str, Any]],
        tasks: list[dict[str, Any]]
    ) -> set[str]:
        """Get all pain point IDs covered by features, ideas, and tasks."""
        covered = set()

        # From roadmap features
        for feature in roadmap_features:
            for impact in (feature.get('personaImpact', []) or feature.get('persona_impact', [])):
                if (impact.get('personaId') == persona_id or
                    impact.get('persona_id') == persona_id):
                    pp_ids = impact.get('addressedPainPointIds', []) or impact.get('addressed_pain_point_ids', [])
                    covered.update(pp_ids)

        # From ideation ideas
        for idea in ideation_ideas:
            for relevance in (idea.get('personaRelevance', []) or idea.get('persona_relevance', [])):
                if (relevance.get('personaId') == persona_id or
                    relevance.get('persona_id') == persona_id):
                    pp_ids = relevance.get('addressedPainPointIds', []) or relevance.get('addressed_pain_point_ids', [])
                    covered.update(pp_ids)

        return covered

    def _calculate_gap_severity(self, persona_type: str, item_priority: str) -> str:
        """Calculate gap severity based on persona type and item priority.

        Args:
            persona_type: 'primary', 'secondary', or 'edge-case'
            item_priority: 'high', 'medium', or 'low'

        Returns:
            'high', 'medium', or 'low' severity
        """
        # Primary personas with high priority items = high severity
        if persona_type == 'primary':
            if item_priority == 'high':
                return 'high'
            elif item_priority == 'medium':
                return 'medium'
            else:
                return 'low'
        elif persona_type == 'secondary':
            if item_priority == 'high':
                return 'medium'
            else:
                return 'low'
        else:  # edge-case
            return 'low'

    def _generate_recommendations(self, dashboard: PersonaHealthDashboard) -> list[str]:
        """Generate recommendations based on coverage analysis.

        Args:
            dashboard: The health dashboard with coverage data

        Returns:
            List of recommendation strings
        """
        recommendations = []

        # Find underserved primary personas
        for coverage in dashboard.personas:
            if coverage.persona_type == 'primary' and coverage.overall_coverage_score < COVERAGE_THRESHOLDS['warning']:
                recommendations.append(
                    f"CRITICAL: Primary persona '{coverage.persona_name}' has only "
                    f"{coverage.overall_coverage_score}% coverage. Focus on their needs."
                )
            elif coverage.overall_coverage_score < COVERAGE_THRESHOLDS['good']:
                recommendations.append(
                    f"Consider improving coverage for '{coverage.persona_name}' "
                    f"(currently {coverage.overall_coverage_score}%)."
                )

        # Count high severity gaps
        high_severity_gaps = [g for g in dashboard.gaps if g.severity == 'high']
        if high_severity_gaps:
            recommendations.append(
                f"Address {len(high_severity_gaps)} high-severity gaps "
                f"affecting primary personas."
            )

        # Check for personas with no features/ideas
        orphan_personas = [
            c for c in dashboard.personas
            if c.feature_count == 0 and c.idea_count == 0 and c.persona_type != 'edge-case'
        ]
        if orphan_personas:
            names = ', '.join(p.persona_name for p in orphan_personas)
            recommendations.append(
                f"Personas with no features or ideas: {names}. "
                f"Consider running ideation targeting these personas."
            )

        return recommendations

    def save_dashboard(self, dashboard: PersonaHealthDashboard, output_path: str | Path) -> None:
        """Save the dashboard to a JSON file.

        Args:
            dashboard: The health dashboard to save
            output_path: Path to save the JSON file
        """
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, 'w') as f:
            json.dump(dashboard.to_dict(), f, indent=2)
