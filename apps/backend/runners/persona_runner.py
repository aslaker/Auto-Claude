#!/usr/bin/env python3
"""
Persona Generation Runner

CLI entry point for generating user personas for a project.
Analyzes project structure, documentation, and optionally conducts web research
to generate detailed user personas.

Also supports single persona enrichment for AI-assisted persona creation.

Usage:
    python persona_runner.py [options]

Examples:
    # Generate personas for current directory
    python persona_runner.py

    # Generate personas for specific project
    python persona_runner.py --project /path/to/project

    # Enable web research enrichment
    python persona_runner.py --research

    # Force regeneration
    python persona_runner.py --refresh

    # Enrich a new persona from minimal input
    python persona_runner.py --enrich-new --role "DevOps Engineer" --description "Infrastructure team member"

    # Enrich an existing persona
    python persona_runner.py --enrich-existing --persona-id "persona-123"
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from runners.personas import PersonaOrchestrator
from runners.personas.single_enricher import SinglePersonaEnricher, PersonaEnrichmentInput


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Generate user personas for a project",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python persona_runner.py
    python persona_runner.py --project /path/to/project
    python persona_runner.py --research
    python persona_runner.py --refresh --research
        """,
    )

    parser.add_argument(
        "--project",
        "-p",
        type=str,
        default=".",
        help="Path to project directory (default: current directory)",
    )

    parser.add_argument(
        "--output",
        "-o",
        type=str,
        default=None,
        help="Output directory for personas (default: .auto-claude/personas/)",
    )

    parser.add_argument(
        "--model",
        "-m",
        type=str,
        default="sonnet",
        choices=["sonnet", "opus", "haiku"],
        help="Claude model to use (default: sonnet)",
    )

    parser.add_argument(
        "--thinking-level",
        "-t",
        type=str,
        default="medium",
        choices=["none", "low", "medium", "high"],
        help="Thinking level for agent (default: medium)",
    )

    parser.add_argument(
        "--refresh",
        "-r",
        action="store_true",
        help="Force regeneration even if personas exist",
    )

    parser.add_argument(
        "--research",
        action="store_true",
        help="Enable web research enrichment phase",
    )

    # Single persona enrichment arguments
    parser.add_argument(
        "--enrich-new",
        action="store_true",
        help="Enrich a new persona from minimal input (requires --role and --description)",
    )

    parser.add_argument(
        "--enrich-existing",
        action="store_true",
        help="Enrich an existing persona with AI research (requires --persona-id)",
    )

    parser.add_argument(
        "--role",
        type=str,
        help="Role/title for new persona (required with --enrich-new)",
    )

    parser.add_argument(
        "--description",
        type=str,
        help="Description for new persona (required with --enrich-new)",
    )

    parser.add_argument(
        "--persona-type",
        type=str,
        default="secondary",
        choices=["primary", "secondary", "edge-case"],
        help="Type of persona (default: secondary)",
    )

    parser.add_argument(
        "--primary-goal",
        type=str,
        help="Primary goal for the persona (optional)",
    )

    parser.add_argument(
        "--experience-level",
        type=str,
        choices=["junior", "mid", "senior", "lead", "executive"],
        help="Experience level (optional)",
    )

    parser.add_argument(
        "--industry",
        type=str,
        help="Industry context (optional)",
    )

    parser.add_argument(
        "--persona-id",
        type=str,
        help="ID of existing persona to enrich (required with --enrich-existing)",
    )

    return parser.parse_args()


async def run_enrich_new(args, project_dir: Path, output_dir: Path) -> bool:
    """Enrich a new persona from minimal input."""
    if not args.role:
        print("Error: --role is required with --enrich-new")
        return False
    if not args.description:
        print("Error: --description is required with --enrich-new")
        return False

    print(f"ENRICHMENT_PHASE:researching")
    print(f"Creating AI-enriched persona for: {args.role}")

    # Create the enricher (we need an agent executor which we'll get from orchestrator)
    # The orchestrator initializes the agent_executor in its __init__
    orchestrator = PersonaOrchestrator(
        project_dir=project_dir,
        output_dir=output_dir,
        model=args.model,
        thinking_level=args.thinking_level,
        refresh=False,
        enable_research=True,  # Always use research for enrichment
    )

    enricher = SinglePersonaEnricher(
        output_dir=output_dir or project_dir / ".auto-claude" / "personas",
        agent_executor=orchestrator.agent_executor,
    )

    input_data = PersonaEnrichmentInput(
        role=args.role,
        description=args.description,
        persona_type=args.persona_type,
        primary_goal=args.primary_goal,
        experience_level=args.experience_level,
        industry=args.industry,
    )

    print(f"ENRICHMENT_PHASE:generating")
    result = await enricher.enrich_new_persona(input_data)

    if result.success and result.persona:
        # Output the result as JSON for the frontend to parse
        print(f"ENRICHMENT_COMPLETE:{json.dumps(result.persona)}")
        return True
    else:
        print(f"ENRICHMENT_ERROR:{result.error or 'Unknown error'}")
        return False


async def run_enrich_existing(args, project_dir: Path, output_dir: Path) -> bool:
    """Enrich an existing persona with AI research."""
    if not args.persona_id:
        print("Error: --persona-id is required with --enrich-existing")
        return False

    # Load the existing persona from the personas file
    personas_file = (output_dir or project_dir / ".auto-claude" / "personas") / "personas.json"
    if not personas_file.exists():
        print(f"Error: Personas file not found: {personas_file}")
        return False

    try:
        with open(personas_file) as f:
            data = json.load(f)
        personas = data.get("personas", [])
        persona = next((p for p in personas if p.get("id") == args.persona_id), None)
        if not persona:
            print(f"Error: Persona not found: {args.persona_id}")
            return False
    except json.JSONDecodeError as e:
        print(f"Error: Invalid personas file: {e}")
        return False

    print(f"ENRICHMENT_PHASE:researching")
    print(f"Enriching persona: {persona.get('name', args.persona_id)}")

    # Create the enricher
    # The orchestrator initializes the agent_executor in its __init__
    orchestrator = PersonaOrchestrator(
        project_dir=project_dir,
        output_dir=output_dir,
        model=args.model,
        thinking_level=args.thinking_level,
        refresh=False,
        enable_research=True,
    )

    enricher = SinglePersonaEnricher(
        output_dir=output_dir or project_dir / ".auto-claude" / "personas",
        agent_executor=orchestrator.agent_executor,
    )

    print(f"ENRICHMENT_PHASE:generating")
    result = await enricher.enrich_existing_persona(persona)

    if result.success and result.persona:
        # Update the persona in the file
        for i, p in enumerate(personas):
            if p.get("id") == args.persona_id:
                personas[i] = result.persona
                break

        data["personas"] = personas
        with open(personas_file, "w") as f:
            json.dump(data, f, indent=2)

        print(f"ENRICHMENT_COMPLETE:{json.dumps(result.persona)}")
        return True
    else:
        print(f"ENRICHMENT_ERROR:{result.error or 'Unknown error'}")
        return False


async def main():
    """Main entry point."""
    args = parse_args()

    project_dir = Path(args.project).resolve()
    if not project_dir.exists():
        print(f"Error: Project directory not found: {project_dir}")
        sys.exit(1)

    output_dir = Path(args.output).resolve() if args.output else None

    # Handle enrichment modes
    if args.enrich_new:
        success = await run_enrich_new(args, project_dir, output_dir)
        sys.exit(0 if success else 1)

    if args.enrich_existing:
        success = await run_enrich_existing(args, project_dir, output_dir)
        sys.exit(0 if success else 1)

    # Standard persona generation
    orchestrator = PersonaOrchestrator(
        project_dir=project_dir,
        output_dir=output_dir,
        model=args.model,
        thinking_level=args.thinking_level,
        refresh=args.refresh,
        enable_research=args.research,
    )

    success = await orchestrator.run()

    if success:
        print("\n✓ Persona generation completed successfully")
        sys.exit(0)
    else:
        print("\n✗ Persona generation failed")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
