"""
Persona generation wrapper for roadmap generation.

Wraps the PersonaOrchestrator for use within the roadmap generation pipeline.
"""

import json
from datetime import datetime
from pathlib import Path

from ui import print_status

from .models import RoadmapPhaseResult


class PersonaGenerator:
    """Generates user personas as part of roadmap generation."""

    def __init__(
        self,
        project_dir: Path,
        refresh: bool,
        model: str = "sonnet",
        thinking_level: str = "medium",
    ):
        self.project_dir = Path(project_dir)
        self.refresh = refresh
        self.model = model
        self.thinking_level = thinking_level
        self.personas_dir = self.project_dir / ".auto-claude" / "personas"
        self.personas_file = self.personas_dir / "personas.json"

    async def generate(self, enabled: bool = False) -> RoadmapPhaseResult:
        """Generate user personas (if enabled).

        This is an optional phase - it gracefully degrades if disabled or if generation fails.
        Personas enhance roadmap features but are not required.
        """
        if not enabled:
            print_status("Persona generation not enabled, skipping", "info")
            return RoadmapPhaseResult(
                "persona_generation", True, [], [], 0
            )

        if self.personas_file.exists() and not self.refresh:
            # Load existing personas and report count
            try:
                with open(self.personas_file) as f:
                    data = json.load(f)
                persona_count = len(data.get("personas", []))
                print_status(
                    f"Using {persona_count} existing personas (use --refresh-personas to regenerate)",
                    "success",
                )
                return RoadmapPhaseResult(
                    "persona_generation", True, [str(self.personas_file)], [], 0
                )
            except (json.JSONDecodeError, IOError):
                # Continue to regeneration if file is corrupt
                pass

        # Import PersonaOrchestrator here to avoid circular imports
        from runners.personas import PersonaOrchestrator

        print_status("Running persona generation...", "progress")

        orchestrator = PersonaOrchestrator(
            project_dir=self.project_dir,
            output_dir=self.personas_dir,
            model=self.model,
            thinking_level=self.thinking_level,
            refresh=self.refresh,
            enable_research=False,  # Skip web research for faster generation
        )

        try:
            success = await orchestrator.run()

            if success and self.personas_file.exists():
                with open(self.personas_file) as f:
                    data = json.load(f)
                persona_count = len(data.get("personas", []))
                print_status(
                    f"Generated {persona_count} personas",
                    "success",
                )
                return RoadmapPhaseResult(
                    "persona_generation", True, [str(self.personas_file)], [], 0
                )
            else:
                print_status(
                    "Persona generation failed, continuing without personas",
                    "warning",
                )
                return RoadmapPhaseResult(
                    "persona_generation",
                    True,  # Return True for graceful degradation
                    [],
                    ["Persona generation failed"],
                    1,
                )

        except Exception as e:
            print_status(
                f"Persona generation error: {e}, continuing without personas",
                "warning",
            )
            return RoadmapPhaseResult(
                "persona_generation",
                True,  # Return True for graceful degradation
                [],
                [str(e)],
                1,
            )
