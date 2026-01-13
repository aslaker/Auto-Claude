"""
Single Persona Enricher - Handles AI-assisted persona creation and enrichment.

This module provides functionality to:
1. Create a new persona from minimal user input via AI enrichment
2. Enrich an existing manually-created persona with AI research

It reuses the research and generation phase logic but operates on single personas.
"""

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

from debug import debug, debug_error, debug_success, debug_warning
from ui import print_status

if TYPE_CHECKING:
    from .executor import AgentExecutor


@dataclass
class PersonaEnrichmentInput:
    """Input for AI-assisted persona creation."""

    role: str
    description: str
    persona_type: str  # 'primary' | 'secondary' | 'edge-case'
    primary_goal: str | None = None
    experience_level: str | None = None
    industry: str | None = None


@dataclass
class SinglePersonaResult:
    """Result of single persona enrichment."""

    success: bool
    persona: dict[str, Any] | None
    error: str | None = None


class SinglePersonaEnricher:
    """Handles single persona enrichment with AI research."""

    MAX_RETRIES = 2

    def __init__(
        self,
        output_dir: Path,
        agent_executor: "AgentExecutor",
    ):
        self.output_dir = output_dir
        self.agent_executor = agent_executor
        # Temp files for single persona enrichment
        self.temp_discovery_file = output_dir / "temp_single_discovery.json"
        self.temp_research_file = output_dir / "temp_single_research.json"
        self.temp_persona_file = output_dir / "temp_single_persona.json"

    async def enrich_new_persona(
        self, input_data: PersonaEnrichmentInput
    ) -> SinglePersonaResult:
        """
        Create a new persona from minimal user input.

        1. Create a discovery entry from user input
        2. Run research phase for this user type
        3. Generate the persona from research
        4. Return the enriched persona
        """
        debug("single_enricher", "Starting new persona enrichment", role=input_data.role)
        print_status("Starting AI-assisted persona creation...", "progress")

        try:
            # Step 1: Create discovery entry from user input
            discovery_data = self._create_discovery_entry(input_data)
            self._write_json(self.temp_discovery_file, discovery_data)
            debug_success("single_enricher", "Created discovery entry")

            # Step 2: Run research for this user type
            research_success = await self._run_research(input_data)
            if not research_success:
                debug_warning(
                    "single_enricher",
                    "Research failed, proceeding with basic persona",
                )

            # Step 3: Generate persona from discovery and research
            persona = await self._generate_single_persona(input_data)
            if persona:
                debug_success("single_enricher", "Created enriched persona")
                print_status("Persona created successfully!", "success")
                return SinglePersonaResult(success=True, persona=persona)
            else:
                debug_error("single_enricher", "Failed to generate persona")
                return SinglePersonaResult(
                    success=False, persona=None, error="Failed to generate persona"
                )

        except Exception as e:
            debug_error("single_enricher", f"Enrichment failed: {e}")
            return SinglePersonaResult(success=False, persona=None, error=str(e))

        finally:
            # Cleanup temp files
            self._cleanup_temp_files()

    async def enrich_existing_persona(
        self, persona: dict[str, Any]
    ) -> SinglePersonaResult:
        """
        Enrich an existing manually-created persona with AI research.

        1. Create a discovery entry from existing persona data
        2. Run research phase for this user type
        3. Merge research results into existing persona
        4. Return the enriched persona
        """
        debug(
            "single_enricher",
            "Starting existing persona enrichment",
            persona_id=persona.get("id"),
        )
        print_status("Starting AI enrichment for existing persona...", "progress")

        try:
            # Extract input from existing persona
            demographics = persona.get("demographics", {})
            input_data = PersonaEnrichmentInput(
                role=demographics.get("role", "Unknown Role"),
                description=persona.get("tagline", ""),
                persona_type=persona.get("type", "secondary"),
                primary_goal=persona.get("goals", [{}])[0].get("description")
                if persona.get("goals")
                else None,
                experience_level=demographics.get("experienceLevel"),
                industry=demographics.get("industry"),
            )

            # Step 1: Create discovery entry from existing persona
            discovery_data = self._create_discovery_entry(input_data)
            self._write_json(self.temp_discovery_file, discovery_data)
            debug_success("single_enricher", "Created discovery entry from persona")

            # Step 2: Run research for this user type
            research_success = await self._run_research(input_data)
            if not research_success:
                debug_warning(
                    "single_enricher",
                    "Research failed, returning original persona",
                )
                return SinglePersonaResult(
                    success=False, persona=None, error="Research phase failed"
                )

            # Step 3: Merge research results into existing persona
            enriched_persona = await self._merge_research_into_persona(persona)
            if enriched_persona:
                debug_success("single_enricher", "Enriched existing persona")
                print_status("Persona enriched successfully!", "success")
                return SinglePersonaResult(success=True, persona=enriched_persona)
            else:
                debug_error("single_enricher", "Failed to merge research results")
                return SinglePersonaResult(
                    success=False, persona=None, error="Failed to enrich persona"
                )

        except Exception as e:
            debug_error("single_enricher", f"Enrichment failed: {e}")
            return SinglePersonaResult(success=False, persona=None, error=str(e))

        finally:
            # Cleanup temp files
            self._cleanup_temp_files()

    def _create_discovery_entry(
        self, input_data: PersonaEnrichmentInput
    ) -> dict[str, Any]:
        """Create a discovery JSON structure from user input."""
        user_type_id = f"manual-{datetime.now().strftime('%Y%m%d%H%M%S')}"

        return {
            "project_name": "Manual Persona",
            "identified_user_types": [
                {
                    "id": user_type_id,
                    "suggested_name": input_data.role,
                    "category": input_data.persona_type,
                    "confidence": "high",  # User-provided, so high confidence
                    "evidence": {
                        "readme_mentions": [],
                        "code_patterns": [],
                        "documentation_hints": [],
                        "roadmap_alignment": [],
                        "user_provided": [input_data.description],
                    },
                    "inferred_characteristics": {
                        "technical_level": input_data.experience_level or "mid",
                        "likely_role": input_data.role,
                        "usage_frequency": "weekly",
                        "primary_goal": input_data.primary_goal or "",
                        "key_pain_points": [],
                    },
                }
            ],
            "discovery_sources": {
                "readme_analyzed": False,
                "docs_analyzed": False,
                "code_analyzed": False,
                "roadmap_synced": False,
                "user_provided": True,
            },
            "recommended_persona_count": 1,
            "created_at": datetime.now().isoformat(),
        }

    async def _run_research(self, input_data: PersonaEnrichmentInput) -> bool:
        """Run research phase for the single user type."""
        debug("single_enricher", "Running research phase")
        print_status("Researching user type...", "progress")

        context = f"""
**Discovery File**: {self.temp_discovery_file}
**Output File**: {self.temp_research_file}

Research this single user type:
- Role: {input_data.role}
- Description: {input_data.description}
- Industry: {input_data.industry or "General"}

Focus on finding:
1. Common pain points for this role
2. Typical goals and success metrics
3. Realistic quotes from people in this role
4. Tool preferences and behaviors

IMPORTANT: This runs NON-INTERACTIVELY. Create the research file immediately.
"""

        for attempt in range(self.MAX_RETRIES):
            debug(
                "single_enricher", f"Research attempt {attempt + 1}/{self.MAX_RETRIES}"
            )
            success, _ = await self.agent_executor.run_agent(
                "persona_research.md",
                additional_context=context,
            )

            if success and self.temp_research_file.exists():
                try:
                    with open(self.temp_research_file) as f:
                        data = json.load(f)
                    if "user_type_enrichments" in data:
                        debug_success("single_enricher", "Research completed")
                        return True
                except json.JSONDecodeError:
                    pass

        # Research failed - create fallback file
        debug_warning("single_enricher", "Research failed, creating fallback")
        self._write_json(
            self.temp_research_file,
            {
                "research_completed_at": datetime.now().isoformat(),
                "user_type_enrichments": [],
                "research_sources": [],
                "research_limitations": ["Research phase failed - using basic enrichment"],
            },
        )
        return False

    async def _generate_single_persona(
        self, input_data: PersonaEnrichmentInput
    ) -> dict[str, Any] | None:
        """Generate a single persona from discovery and research."""
        debug("single_enricher", "Generating persona")
        print_status("Generating persona profile...", "progress")

        context = f"""
**Discovery File**: {self.temp_discovery_file}
**Research File**: {self.temp_research_file}
**Output File**: {self.temp_persona_file}

Generate a SINGLE detailed persona based on the discovery and research data.

User-provided details:
- Role: {input_data.role}
- Description: {input_data.description}
- Type: {input_data.persona_type}
- Industry: {input_data.industry or "Not specified"}

Output format: Write to {self.temp_persona_file} with structure:
{{
  "version": "1.0",
  "projectId": "manual",
  "personas": [<single persona object>],
  "metadata": {{...}}
}}

IMPORTANT: This runs NON-INTERACTIVELY. Create the persona file immediately.
"""

        for attempt in range(self.MAX_RETRIES):
            debug(
                "single_enricher",
                f"Generation attempt {attempt + 1}/{self.MAX_RETRIES}",
            )
            success, _ = await self.agent_executor.run_agent(
                "persona_generation.md",
                additional_context=context,
            )

            if success and self.temp_persona_file.exists():
                try:
                    with open(self.temp_persona_file) as f:
                        data = json.load(f)
                    personas = data.get("personas", [])
                    if personas:
                        persona = personas[0]
                        # Ensure research enriched flag is set
                        if "discoverySource" in persona:
                            persona["discoverySource"]["researchEnriched"] = True
                        debug_success("single_enricher", "Generated persona")
                        return persona
                except json.JSONDecodeError:
                    pass

        debug_error("single_enricher", "Failed to generate persona")
        return None

    async def _merge_research_into_persona(
        self, persona: dict[str, Any]
    ) -> dict[str, Any] | None:
        """Merge research results into existing persona."""
        debug("single_enricher", "Merging research into persona")
        print_status("Applying research insights...", "progress")

        # Read research results
        if not self.temp_research_file.exists():
            debug_error("single_enricher", "Research file not found")
            return None

        try:
            with open(self.temp_research_file) as f:
                research_data = json.load(f)
        except json.JSONDecodeError:
            debug_error("single_enricher", "Invalid research file")
            return None

        enrichments = research_data.get("user_type_enrichments", [])
        if not enrichments:
            debug_warning("single_enricher", "No enrichments found")
            # Still mark as enriched even if no additional data
            enriched = {**persona}
            if "discoverySource" not in enriched:
                enriched["discoverySource"] = {}
            enriched["discoverySource"]["researchEnriched"] = True
            enriched["updatedAt"] = datetime.now().isoformat()
            return enriched

        enrichment = enrichments[0]

        # Merge the enrichment data
        enriched = {**persona}

        # Add discovered pain points
        discovered_pain_points = enrichment.get("discovered_pain_points", [])
        if discovered_pain_points and "painPoints" in enriched:
            existing_ids = {pp.get("id") for pp in enriched["painPoints"]}
            for i, dp in enumerate(discovered_pain_points):
                new_id = f"research-pain-{i + 1}"
                if new_id not in existing_ids:
                    enriched["painPoints"].append(
                        {
                            "id": new_id,
                            "description": dp.get("description", ""),
                            "severity": dp.get("severity", "medium"),
                            "currentWorkaround": dp.get("current_workaround"),
                        }
                    )

        # Add quotes from research
        quotes_found = enrichment.get("quotes_found", [])
        if quotes_found and "quotes" in enriched:
            existing_quotes = set(enriched["quotes"])
            for quote_data in quotes_found:
                quote_text = quote_data.get("quote", "")
                if quote_text and quote_text not in existing_quotes:
                    enriched["quotes"].append(quote_text)

        # Add behavior patterns
        behavior_patterns = enrichment.get("behavior_patterns", {})
        if behavior_patterns and "behaviors" in enriched:
            # Merge tool preferences
            tools = behavior_patterns.get("tool_preferences", [])
            if tools:
                existing_tools = set(enriched["behaviors"].get("toolStack", []))
                enriched["behaviors"]["toolStack"] = list(
                    existing_tools.union(set(tools[:5]))  # Limit to 5 new tools
                )

            # Merge decision factors
            factors = behavior_patterns.get("decision_factors", [])
            if factors:
                existing_factors = set(
                    enriched["behaviors"].get("decisionFactors", [])
                )
                enriched["behaviors"]["decisionFactors"] = list(
                    existing_factors.union(set(factors[:5]))
                )

        # Mark as research enriched
        if "discoverySource" not in enriched:
            enriched["discoverySource"] = {}
        enriched["discoverySource"]["researchEnriched"] = True
        enriched["updatedAt"] = datetime.now().isoformat()

        debug_success("single_enricher", "Merged research into persona")
        return enriched

    def _write_json(self, path: Path, data: dict[str, Any]) -> None:
        """Write JSON data to file."""
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(data, f, indent=2)

    def _cleanup_temp_files(self) -> None:
        """Remove temporary files."""
        for temp_file in [
            self.temp_discovery_file,
            self.temp_research_file,
            self.temp_persona_file,
        ]:
            try:
                if temp_file.exists():
                    temp_file.unlink()
            except Exception:
                pass
