# Investigation: File Watcher Empty Plan Completion Bug

**Issue:** Tasks move to `human_review` status prematurely after planning stage, showing 0/0 subtasks

**Investigation Date:** 2025-01-05

## Root Causes Identified

### 1. File Watcher Lacks Content Validation
**File:** `apps/frontend/src/main/file-watcher.ts` (lines 52-60)

The file watcher emits progress events for ANY valid JSON without checking if the plan contains actual subtasks:

```typescript
watcher.on('change', () => {
  try {
    const content = readFileSync(planPath, 'utf-8');
    const plan: ImplementationPlan = JSON.parse(content);
    this.emit('progress', taskId, plan);  // No validation!
  } catch {
    // Ignores parse errors
  }
});
```

### 2. Agent Exit Handler: Inverted Logic Bug
**File:** `apps/frontend/src/main/ipc-handlers/agent-events-handlers.ts` (lines 110-122)

Exit handler treats "no subtasks" as "all complete" due to inverted boolean logic:

```typescript
const hasIncompleteSubtasks = task.subtasks && task.subtasks.length > 0 &&
  task.subtasks.some((s) => s.status !== 'completed');

if (isActiveStatus && !hasIncompleteSubtasks) {
  // When subtasks.length === 0, hasIncompleteSubtasks is FALSE
  // So !hasIncompleteSubtasks is TRUE → incorrectly marks complete!
  persistStatus('human_review');
}
```

### 3. Task Store: Empty Array Vacuous Truth
**File:** `apps/frontend/src/renderer/stores/task-store.ts` (lines 113-138)

Status logic uses `Array.every()` which returns `true` for empty arrays:

```typescript
const subtasks: Subtask[] = plan.phases.flatMap(...);  // May be []

const allCompleted = subtasks.every((s) => s.status === 'completed');
// When subtasks = [], every() returns TRUE (vacuous truth)

if (allCompleted) {
  status = 'ai_review';  // Empty plan triggers completion!
}
```

## Complete Flow

1. Backend writes empty/skeleton plan during initialization
2. File watcher detects change, emits plan without validation
3. Main process forwards to renderer via IPC
4. Task store extracts empty subtasks array
5. `subtasks.every(...)` returns `true` for empty array
6. Task marked as `ai_review`
7. Process exits, exit handler sees "no incomplete subtasks"
8. Task moved to `human_review`

**Result:** Task appears complete before any implementation work

## Recommended Fix

**Option 2: Fix Completion Logic** (most robust)

### In `task-store.ts`:
```typescript
const allCompleted = subtasks.length > 0 &&
  subtasks.every((s) => s.status === 'completed');
```

### In `agent-events-handlers.ts`:
```typescript
const allSubtasksComplete = task.subtasks.length > 0 &&
  task.subtasks.every((s) => s.status === 'completed');

if (isActiveStatus && allSubtasksComplete) {
  persistStatus('human_review');
}
```

**Why this fix:**
- Minimal code changes
- Fixes root cause (empty array edge case)
- Consistent with existing patterns in recovery handler
- Defensive against future backend changes

## Testing Scenarios

1. Empty plan file → task stays `in_progress`
2. Plan with no subtasks → task stays `in_progress`
3. Process killed during planning → task doesn't move to `human_review`
4. Normal completion → task moves to `human_review` correctly
5. Partial completion + crash → task stays `in_progress`

## Related Files

- `apps/frontend/src/main/file-watcher.ts` - File watching logic
- `apps/frontend/src/main/ipc-handlers/agent-events-handlers.ts` - Process exit handling
- `apps/frontend/src/main/ipc-handlers/task/execution-handlers.ts` - Recovery logic (has correct pattern)
- `apps/frontend/src/renderer/stores/task-store.ts` - Task state management
- `apps/frontend/src/renderer/hooks/useIpc.ts` - IPC event routing

## Pattern to Follow

The recovery handler in `execution-handlers.ts` (line 59-73) has the correct pattern:

```typescript
function checkSubtasksCompletion(plan) {
  const allSubtasks = plan?.phases?.flatMap(...) || [];
  const completedCount = allSubtasks.filter(s => s.status === 'completed').length;
  const totalCount = allSubtasks.length;
  const allCompleted = totalCount > 0 && completedCount === totalCount;  // ← Guards against empty!

  return { allSubtasks, completedCount, totalCount, allCompleted };
}
```

This should be applied consistently across all completion checks.
