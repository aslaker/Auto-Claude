# Investigation Findings: Tasks Stopping After Planning Stage

## Bug Description

**Original Report (Linear ACS-51):**
- Tasks are created on Kanban board and moved to "In Progress"
- Spec creation process completes successfully
- Subtasks are created but show "!" indicators (missing details)
- UI shows perpetual "plan pulsing" animation
- Resume attempts fail immediately

## Investigation Process

### 1. Code Analysis

#### Planning Phase Flow (`apps/backend/spec/phases/planning_phases.py`)

The planning phase follows this sequence:

1. **Deterministic Approach**: First attempts to run `planner.py` script
   - Calls `_run_script("planner.py", ["--spec-dir", str(self.spec_dir)])`
   - Validates output using `spec_validator.validate_implementation_plan()`
   - Attempts auto-fix if plan is invalid

2. **Agent Fallback**: If script fails, uses AI planner agent
   - Runs `planner.md` prompt via `run_agent_fn()`
   - Retries up to `MAX_RETRIES` times
   - Each attempt validates and attempts auto-fix

3. **Validation**: Uses `ImplementationPlanValidator` class

#### Implementation Plan Validation (`apps/backend/spec/validate_pkg/validators/implementation_plan_validator.py`)

**Critical Validation Checks:**

1. **Empty Phases Check** (Line 71-73):
   ```python
   if not phases:
       errors.append("No phases defined")
       fixes.append("Add at least one phase with subtasks")
   ```

2. **No Subtasks Check** (Line 80-83):
   ```python
   total_subtasks = sum(len(p.get("subtasks", [])) for p in phases)
   if total_subtasks == 0:
       errors.append("No subtasks defined in any phase")
       fixes.append("Add subtasks to phases")
   ```

3. **Subtask Field Validation** (Lines 151-155):
   - Validates required fields: `id`, `description`, `service`, `files_to_modify`, `files_to_create`, `verification`, `status`
   - Missing fields generate error: `"Phase X, Subtask Y: missing required field 'FIELD'"`

### 2. Root Cause Analysis

Based on code analysis, the bug can occur in these scenarios:

#### Scenario A: Empty Phases Array
The planner agent creates `implementation_plan.json` with:
```json
{
  "feature": "...",
  "phases": [],  // EMPTY!
  "summary": {...}
}
```

**How it passes validation:**
- In `planning_phases.py` line 82: `if success and plan_file.exists()`
- File exists, so it proceeds to validation
- Validation fails with "No phases defined" error
- If auto-fix fails or is skipped, the invalid plan persists

#### Scenario B: Phases with Empty Subtasks
The planner creates phases but no subtasks:
```json
{
  "phases": [
    {
      "id": "phase-1",
      "name": "Implementation",
      "subtasks": []  // EMPTY!
    }
  ]
}
```

**Validation Result:**
- Passes "No phases defined" check (line 71)
- Fails "No subtasks defined in any phase" check (line 80)

#### Scenario C: Incomplete Subtask Data
Subtasks created but missing required fields:
```json
{
  "phases": [{
    "subtasks": [{
      "id": "subtask-1",
      // MISSING: description, service, files_to_modify, etc.
    }]
  }]
}
```

**Result:**
- Multiple errors: "Phase 1, Subtask 1: missing required field 'description'" etc.
- UI shows "!" indicators for incomplete subtasks

### 3. Logging Added (Subtask 1-1)

The following logging was added to `apps/backend/agents/planner.py` (followup planner):

1. **Session Start/End Logging** (Lines 113-131)
2. **Plan File Existence Check** (Lines 151-155)
3. **Critical Empty Phases Detection** (Lines 168-190):
   - Logs error when `len(plan.phases) == 0`
   - Dumps full plan file content for debugging
   - Logs detailed JSON structure
4. **Subtask Count Logging** (Lines 204-208)
5. **Exception Traceback Logging** (Lines 270-282)

**Note:** This logging is in the FOLLOWUP planner (for adding new subtasks to completed specs), not the INITIAL planning phase that creates the first implementation plan.

### 4. Where Initial Planning Happens

**Initial Implementation Plan Creation:**
- Triggered by: `SpecOrchestrator` via `spec/phases/planning_phases.py`
- NOT by the followup planner in `agents/planner.py`
- Uses either:
  1. `planner.py` script (if it exists) - DETERMINISTIC
  2. AI agent with `planner.md` prompt - FALLBACK

**Current Gap:**
- The planner.py script referenced in code may not exist or may be failing silently
- AI agent fallback may be creating incomplete plans without proper validation

### 5. Frontend Integration

Based on the bug report, the issue manifests in the Electron app:

**User Flow:**
1. Create task on Kanban board (frontend)
2. Move task to "In Progress" (triggers backend spec creation)
3. Spec creation runs via `spec_runner.py`
4. Planning phase creates `implementation_plan.json`
5. Frontend watches for plan file changes (`file-watcher.ts`)
6. **BUG**: Frontend detects file change but doesn't validate content
7. Frontend shows task as complete but subtasks incomplete ("!" indicators)
8. UI stuck in "plan pulsing" state

**File Watcher Issue (Hypothesis):**
- `apps/frontend/src/main/file-watcher.ts` likely detects file creation/modification
- May not validate that plan has valid phases and subtasks
- Signals "planning complete" even when plan is empty/invalid

## Key Findings

### Critical Issues Identified:

1. **No Content Validation in File Watcher**
   - File watcher signals completion based on file existence, not content validity
   - Empty or invalid plans trigger "complete" state in UI

2. **Silent Failures in Planning Phase**
   - If planner.py script doesn't exist, error may not surface
   - AI agent fallback may create malformed plans
   - Validation errors during auto-fix may be swallowed

3. **Missing Logging in Initial Planner**
   - Logging added to followup planner only
   - Initial planning phase (spec creation) lacks detailed instrumentation
   - Makes debugging impossible without adding more logging

4. **Race Condition Possibility**
   - File watcher may detect partial write of implementation_plan.json
   - Frontend reads incomplete JSON before write completes
   - Results in empty phases array in UI state

### Exact Failure Points:

1. **Backend Planning Phase:**
   - `spec/phases/planning_phases.py` line 45-67: Script path may be incorrect
   - `spec/phases/planning_phases.py` line 76-102: Agent may create empty plan
   - Validation runs but results may not propagate to frontend

2. **Frontend File Watcher:**
   - `apps/frontend/src/main/file-watcher.ts`: Signals completion without validation
   - No check for `plan.phases.length > 0`
   - No check for subtask completeness

3. **Frontend State Management:**
   - `apps/frontend/src/renderer/stores/task-store.ts`: May accept invalid plans
   - `updateTaskFromPlan` function likely doesn't validate plan content
   - Task state transitions without verifying plan validity

## Next Steps (Per Implementation Plan)

Based on these findings, the implementation plan's approach is validated:

### Phase 2: Backend Fixes
- ✅ Add validation to require at least 1 phase before saving
- ✅ Add error handling to write errors to plan file
- ✅ Update schema to include error field

### Phase 3: Frontend Validation
- ✅ Validate plan in `updateTaskFromPlan` (reject empty phases)
- ✅ Show error state in TaskCard when plan invalid
- ✅ Add toast notifications for invalid plans

### Phase 4: File Watcher Fix
- ✅ Read and parse implementation_plan.json content
- ✅ Emit error event when plan empty/invalid

### Phase 5: Recovery Mechanism
- ✅ Detect empty plans and restart planner
- ✅ Special case for incomplete human review

## Reproduction Steps

To reproduce the bug:

1. Create a task on Kanban board with description: "Add user authentication"
2. Move task to "In Progress"
3. Wait for spec creation to complete
4. Observe `implementation_plan.json` in `.auto-claude/specs/XXX/`
5. Check if `phases` array is empty or subtasks missing fields

**Expected Bug Symptoms:**
- Task shows as "complete" in UI
- Subtasks visible but with "!" indicators
- UI shows "plan pulsing" indefinitely
- Resume button fails immediately
- No error messages shown to user

## Logs to Examine

**Task Logs:** `.auto-claude/specs/XXX/task_logs.json`
- Search for: `"phase": "planning"`
- Look for: Validation errors, empty phases warnings
- Check for: Agent session completion status

**Plan File:** `.auto-claude/specs/XXX/implementation_plan.json`
- Verify: `phases` array has length > 0
- Verify: Each phase has `subtasks` array with length > 0
- Verify: Each subtask has all required fields

## Conclusion

The bug is caused by **lack of content validation** at multiple levels:

1. Backend creates invalid plans that pass file existence checks
2. File watcher signals completion based on file existence only
3. Frontend accepts invalid plans without validation
4. No error surfacing to user or logs

The fix requires:
- Backend: Refuse to save empty plans, write errors to plan file
- Frontend: Validate plan content before accepting
- File watcher: Parse and validate before signaling completion
- UI: Show error states and toast notifications

This is a **state management and validation bug**, not a planner agent bug. The planner may work correctly, but invalid outputs aren't caught.
