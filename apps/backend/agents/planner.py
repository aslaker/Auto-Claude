"""
Planner Agent Module
====================

Handles follow-up planner sessions for adding new subtasks to completed specs.
"""

import logging
from pathlib import Path

from core.client import create_client
from phase_config import get_phase_model, get_phase_thinking_budget
from phase_event import ExecutionPhase, emit_phase
from task_logger import (
    LogEntryType,
    LogPhase,
    get_task_logger,
)
from ui import (
    BuildState,
    Icons,
    StatusManager,
    bold,
    box,
    highlight,
    icon,
    muted,
    print_status,
)

from .session import run_agent_session

logger = logging.getLogger(__name__)


async def run_followup_planner(
    project_dir: Path,
    spec_dir: Path,
    model: str,
    verbose: bool = False,
) -> bool:
    """
    Run the follow-up planner to add new subtasks to a completed spec.

    This is a simplified version of run_autonomous_agent that:
    1. Creates a client
    2. Loads the followup planner prompt
    3. Runs a single planning session
    4. Returns after the plan is updated (doesn't enter coding loop)

    The planner agent will:
    - Read FOLLOWUP_REQUEST.md for the new task
    - Read the existing implementation_plan.json
    - Add new phase(s) with pending subtasks
    - Update the plan status back to in_progress

    Args:
        project_dir: Root directory for the project
        spec_dir: Directory containing the completed spec
        model: Claude model to use
        verbose: Whether to show detailed output

    Returns:
        bool: True if planning completed successfully
    """
    from implementation_plan import ImplementationPlan
    from prompts import get_followup_planner_prompt

    # Initialize status manager for ccstatusline
    status_manager = StatusManager(project_dir)
    status_manager.set_active(spec_dir.name, BuildState.PLANNING)
    emit_phase(ExecutionPhase.PLANNING, "Follow-up planning")

    # Initialize task logger for persistent logging
    task_logger = get_task_logger(spec_dir)

    # Show header
    content = [
        bold(f"{icon(Icons.GEAR)} FOLLOW-UP PLANNER SESSION"),
        "",
        f"Spec: {highlight(spec_dir.name)}",
        muted("Adding follow-up work to completed spec."),
        "",
        muted("The agent will read your FOLLOWUP_REQUEST.md and add new subtasks."),
    ]
    print()
    print(box(content, width=70, style="heavy"))
    print()

    # Start planning phase in task logger
    if task_logger:
        task_logger.start_phase(LogPhase.PLANNING, "Starting follow-up planning...")
        task_logger.set_session(1)

    # Create client with phase-specific model and thinking budget
    # Respects task_metadata.json configuration when no CLI override
    planning_model = get_phase_model(spec_dir, "planning", model)
    planning_thinking_budget = get_phase_thinking_budget(spec_dir, "planning")
    client = create_client(
        project_dir,
        spec_dir,
        planning_model,
        max_thinking_tokens=planning_thinking_budget,
    )

    # Generate follow-up planner prompt
    prompt = get_followup_planner_prompt(spec_dir)

    print_status("Running follow-up planner...", "progress")
    print()

    # Log planning session start
    if task_logger:
        task_logger.log_info(
            "Starting follow-up planner agent session",
            phase=LogPhase.PLANNING,
        )

    try:
        # Run single planning session
        async with client:
            status, response = await run_agent_session(
                client, prompt, spec_dir, verbose, phase=LogPhase.PLANNING
            )

        # Log session completion
        if task_logger:
            task_logger.log_info(
                f"Follow-up planner session completed with status: {status}",
                phase=LogPhase.PLANNING,
            )

        # End planning phase in task logger
        if task_logger:
            task_logger.end_phase(
                LogPhase.PLANNING,
                success=(status != "error"),
                message="Follow-up planning session completed",
            )

        if status == "error":
            print()
            print_status("Follow-up planning failed", "error")
            status_manager.update(state=BuildState.ERROR)
            return False

        # Verify the plan was updated (should have pending subtasks now)
        plan_file = spec_dir / "implementation_plan.json"

        # Log plan file existence check
        if task_logger:
            task_logger.log_info(
                f"Checking for plan file: {plan_file.exists()}",
                phase=LogPhase.PLANNING,
            )

        if plan_file.exists():
            plan = ImplementationPlan.load(plan_file)

            # CRITICAL VALIDATION: Require at least 1 phase
            if len(plan.phases) == 0:
                error_msg = "Planning failed: Planner agent did not create any phases. At least 1 phase is required for implementation."

                if task_logger:
                    task_logger.log_error(
                        "VALIDATION FAILED: Plan has no phases. At least 1 phase is required.",
                        phase=LogPhase.PLANNING,
                    )
                    # Read and log the raw plan file content for debugging
                    try:
                        import json

                        with open(plan_file, "r") as f:
                            plan_content = json.load(f)
                        task_logger.log_with_detail(
                            content="Empty phases array detected - Plan file content:",
                            detail=json.dumps(plan_content, indent=2),
                            entry_type=LogEntryType.ERROR,
                            phase=LogPhase.PLANNING,
                            collapsed=False,
                        )
                    except Exception as e:
                        task_logger.log_error(
                            f"Failed to read plan file for debugging: {e}",
                            phase=LogPhase.PLANNING,
                        )

                # Write error to plan file instead of leaving it with empty phases
                plan.error = error_msg
                plan.status = "backlog"
                plan.planStatus = "pending"
                plan.save(plan_file)

                if task_logger:
                    task_logger.log_info(
                        "Wrote error to plan file for frontend to display",
                        phase=LogPhase.PLANNING,
                    )

                print()
                print_status(
                    "Follow-up planning failed: Plan must have at least 1 phase",
                    "error",
                )
                status_manager.update(state=BuildState.ERROR)
                return False

            # CRITICAL LOGGING: Capture plan structure for debugging
            if task_logger:
                task_logger.log_info(
                    f"Plan loaded successfully. Phases count: {len(plan.phases)}",
                    phase=LogPhase.PLANNING,
                )
                # Log phase names
                phase_names = [p.name for p in plan.phases]
                task_logger.log_info(
                    f"Plan has {len(plan.phases)} phases: {', '.join(phase_names)}",
                    phase=LogPhase.PLANNING,
                )

            # Check if there are any pending subtasks
            all_subtasks = [c for p in plan.phases for c in p.subtasks]
            pending_subtasks = [c for c in all_subtasks if c.status.value == "pending"]

            # Log subtask counts
            if task_logger:
                task_logger.log_info(
                    f"Total subtasks: {len(all_subtasks)}, Pending: {len(pending_subtasks)}",
                    phase=LogPhase.PLANNING,
                )

            if pending_subtasks:
                # Reset the plan status to in_progress (in case planner didn't)
                plan.reset_for_followup()
                plan.save(plan_file)

                print()
                content = [
                    bold(f"{icon(Icons.SUCCESS)} FOLLOW-UP PLANNING COMPLETE"),
                    "",
                    f"New pending subtasks: {highlight(str(len(pending_subtasks)))}",
                    f"Total subtasks: {len(all_subtasks)}",
                    "",
                    muted("Next steps:"),
                    f"  Run: {highlight(f'python auto-claude/run.py --spec {spec_dir.name}')}",
                ]
                print(box(content, width=70, style="heavy"))
                print()
                status_manager.update(state=BuildState.PAUSED)
                return True
            else:
                # Log the warning condition
                if task_logger:
                    if len(plan.phases) == 0:
                        task_logger.log_error(
                            "No pending subtasks found: Plan has NO phases after planner session",
                            phase=LogPhase.PLANNING,
                        )
                    else:
                        task_logger.log_error(
                            f"No pending subtasks found: Plan has {len(plan.phases)} phases but all subtasks are non-pending",
                            phase=LogPhase.PLANNING,
                        )

                print()
                print_status(
                    "Warning: No pending subtasks found after planning", "warning"
                )
                print(muted("The planner may not have added new subtasks."))
                print(muted("Check implementation_plan.json manually."))
                status_manager.update(state=BuildState.PAUSED)
                return False
        else:
            # Log plan file missing
            if task_logger:
                task_logger.log_error(
                    f"implementation_plan.json not found at {plan_file}",
                    phase=LogPhase.PLANNING,
                )

            print()
            print_status(
                "Error: implementation_plan.json not found after planning", "error"
            )
            status_manager.update(state=BuildState.ERROR)
            return False

    except Exception as e:
        print()
        print_status(f"Follow-up planning error: {e}", "error")
        if task_logger:
            import traceback

            task_logger.log_error(
                f"Follow-up planning exception: {e}", LogPhase.PLANNING
            )
            # Log full traceback for debugging
            task_logger.log_with_detail(
                content="Follow-up planning exception traceback:",
                detail=traceback.format_exc(),
                entry_type=LogEntryType.ERROR,
                phase=LogPhase.PLANNING,
                collapsed=False,
            )
        status_manager.update(state=BuildState.ERROR)
        return False
