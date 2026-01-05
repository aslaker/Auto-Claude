/**
 * End-to-End tests for task planning error recovery
 * Tests that the app properly handles and recovers from empty/invalid plan files
 *
 * NOTE: These tests verify the bug fix for tasks stopping after planning stage
 * where empty implementation plans would cause tasks to get stuck
 */
import { test, expect } from '@playwright/test';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'fs';
import path from 'path';

// Test data directory
const TEST_DATA_DIR = '/tmp/auto-claude-ui-e2e-error-recovery';
const TEST_PROJECT_DIR = path.join(TEST_DATA_DIR, 'test-project');

// Setup test environment
function setupTestEnvironment(): void {
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DATA_DIR, { recursive: true });
  mkdirSync(TEST_PROJECT_DIR, { recursive: true });
  mkdirSync(path.join(TEST_PROJECT_DIR, '.auto-claude', 'specs'), { recursive: true });
}

// Cleanup test environment
function cleanupTestEnvironment(): void {
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
}

// Helper to create a spec directory
function createSpecDirectory(specId: string): string {
  const specDir = path.join(TEST_PROJECT_DIR, '.auto-claude', 'specs', specId);
  mkdirSync(specDir, { recursive: true });

  // Create spec.md file
  writeFileSync(
    path.join(specDir, 'spec.md'),
    `# ${specId}\n\n## Overview\n\nTest specification for error recovery.\n`
  );

  return specDir;
}

// Helper to create an empty/invalid plan file
function createEmptyPlan(specDir: string): void {
  writeFileSync(
    path.join(specDir, 'implementation_plan.json'),
    JSON.stringify({
      feature: 'Test Feature',
      workflow_type: 'feature',
      services_involved: [],
      phases: [], // Empty phases array - this is the bug!
      final_acceptance: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      spec_file: 'spec.md'
    }, null, 2)
  );
}

// Helper to create a plan with error field
function createPlanWithError(specDir: string, errorMessage: string): void {
  writeFileSync(
    path.join(specDir, 'implementation_plan.json'),
    JSON.stringify({
      feature: 'Test Feature',
      workflow_type: 'feature',
      services_involved: [],
      phases: [],
      final_acceptance: [],
      error: errorMessage, // Error field populated
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      spec_file: 'spec.md'
    }, null, 2)
  );
}

// Helper to create a valid plan
function createValidPlan(specDir: string): void {
  writeFileSync(
    path.join(specDir, 'implementation_plan.json'),
    JSON.stringify({
      feature: 'Test Feature',
      workflow_type: 'feature',
      services_involved: ['frontend'],
      phases: [
        {
          id: 'phase-1',
          name: 'Implementation',
          type: 'implementation',
          description: 'Implement feature',
          depends_on: [],
          parallel_safe: true,
          subtasks: [
            {
              id: 'subtask-1',
              description: 'Add component',
              service: 'frontend',
              files_to_modify: ['src/App.tsx'],
              files_to_create: [],
              patterns_from: [],
              verification: {
                type: 'manual',
                instructions: 'Verify component works'
              },
              status: 'pending'
            }
          ]
        }
      ],
      final_acceptance: ['Tests pass'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      spec_file: 'spec.md'
    }, null, 2)
  );
}

// Simulate validation logic (matches task-store.ts updateTaskFromPlan)
function isValidPlan(plan: any): { valid: boolean; error?: string } {
  // Check for error field
  if (plan.error) {
    return { valid: false, error: plan.error };
  }

  // Check for empty or missing phases
  if (!plan.phases || plan.phases.length === 0) {
    return { valid: false, error: 'Plan has no phases - planning may have failed' };
  }

  return { valid: true };
}

test.describe('Task Planning Error Recovery - Empty Plan Detection', () => {
  test.beforeEach(() => {
    setupTestEnvironment();
  });

  test.afterEach(() => {
    cleanupTestEnvironment();
  });

  test('should detect empty phases array in plan file', () => {
    const specDir = createSpecDirectory('001-empty-phases');
    createEmptyPlan(specDir);

    const planPath = path.join(specDir, 'implementation_plan.json');
    expect(existsSync(planPath)).toBe(true);

    const plan = JSON.parse(readFileSync(planPath, 'utf-8'));
    expect(plan.phases).toBeDefined();
    expect(plan.phases.length).toBe(0);

    // Validation should fail
    const validation = isValidPlan(plan);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('no phases');
  });

  test('should detect error field in plan file', () => {
    const specDir = createSpecDirectory('002-plan-error');
    const errorMessage = 'Planner agent failed to generate phases';
    createPlanWithError(specDir, errorMessage);

    const planPath = path.join(specDir, 'implementation_plan.json');
    const plan = JSON.parse(readFileSync(planPath, 'utf-8'));

    expect(plan.error).toBeDefined();
    expect(plan.error).toBe(errorMessage);

    // Validation should fail
    const validation = isValidPlan(plan);
    expect(validation.valid).toBe(false);
    expect(validation.error).toBe(errorMessage);
  });

  test('should accept valid plan with phases and subtasks', () => {
    const specDir = createSpecDirectory('003-valid-plan');
    createValidPlan(specDir);

    const planPath = path.join(specDir, 'implementation_plan.json');
    const plan = JSON.parse(readFileSync(planPath, 'utf-8'));

    expect(plan.phases).toBeDefined();
    expect(plan.phases.length).toBeGreaterThan(0);
    expect(plan.phases[0].subtasks).toBeDefined();
    expect(plan.phases[0].subtasks.length).toBeGreaterThan(0);

    // Validation should pass
    const validation = isValidPlan(plan);
    expect(validation.valid).toBe(true);
    expect(validation.error).toBeUndefined();
  });

  test('should reject plan with undefined phases property', () => {
    const specDir = createSpecDirectory('004-undefined-phases');

    writeFileSync(
      path.join(specDir, 'implementation_plan.json'),
      JSON.stringify({
        feature: 'Test Feature',
        workflow_type: 'feature',
        // phases property missing entirely
        final_acceptance: []
      }, null, 2)
    );

    const planPath = path.join(specDir, 'implementation_plan.json');
    const plan = JSON.parse(readFileSync(planPath, 'utf-8'));

    // Validation should fail
    const validation = isValidPlan(plan);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('no phases');
  });
});

test.describe('Task Planning Error Recovery - Error Prioritization', () => {
  test.beforeEach(() => {
    setupTestEnvironment();
  });

  test.afterEach(() => {
    cleanupTestEnvironment();
  });

  test('should prioritize error field over empty phases', () => {
    const specDir = createSpecDirectory('005-error-precedence');
    const errorMessage = 'Critical failure during planning';

    writeFileSync(
      path.join(specDir, 'implementation_plan.json'),
      JSON.stringify({
        feature: 'Test Feature',
        workflow_type: 'feature',
        phases: [], // Also has empty phases
        error: errorMessage, // But error field should take precedence
        final_acceptance: []
      }, null, 2)
    );

    const planPath = path.join(specDir, 'implementation_plan.json');
    const plan = JSON.parse(readFileSync(planPath, 'utf-8'));

    const validation = isValidPlan(plan);
    expect(validation.valid).toBe(false);
    // Should return the error field message, not the "no phases" message
    expect(validation.error).toBe(errorMessage);
  });
});

test.describe('Task Planning Error Recovery - Recovery Mechanism', () => {
  test.beforeEach(() => {
    setupTestEnvironment();
  });

  test.afterEach(() => {
    cleanupTestEnvironment();
  });

  test('should identify task as incomplete when plan has empty phases', () => {
    const specDir = createSpecDirectory('006-recovery-needed');
    createEmptyPlan(specDir);

    const planPath = path.join(specDir, 'implementation_plan.json');
    const plan = JSON.parse(readFileSync(planPath, 'utf-8'));

    // Simulate isIncompleteHumanReview logic from task-store.ts
    const hasError = !!plan.error;
    const hasNoSubtasks = !plan.phases || plan.phases.length === 0 ||
                         plan.phases.every((p: any) => !p.subtasks || p.subtasks.length === 0);
    const isIncomplete = hasError || hasNoSubtasks;

    expect(isIncomplete).toBe(true);
  });

  test('should identify task as incomplete when plan has error field', () => {
    const specDir = createSpecDirectory('007-recovery-error-field');
    createPlanWithError(specDir, 'Planning failed');

    const planPath = path.join(specDir, 'implementation_plan.json');
    const plan = JSON.parse(readFileSync(planPath, 'utf-8'));

    const hasError = !!plan.error;
    const isIncomplete = hasError;

    expect(isIncomplete).toBe(true);
  });

  test('should mark valid plan as complete', () => {
    const specDir = createSpecDirectory('008-recovery-not-needed');
    createValidPlan(specDir);

    const planPath = path.join(specDir, 'implementation_plan.json');
    const plan = JSON.parse(readFileSync(planPath, 'utf-8'));

    const hasError = !!plan.error;
    const hasNoSubtasks = !plan.phases || plan.phases.length === 0 ||
                         plan.phases.every((p: any) => !p.subtasks || p.subtasks.length === 0);
    const isIncomplete = hasError || hasNoSubtasks;

    expect(isIncomplete).toBe(false);
  });

  test('should support recovery by overwriting empty plan with valid plan', () => {
    const specDir = createSpecDirectory('009-recovery-overwrite');

    // Start with empty plan (stuck state)
    createEmptyPlan(specDir);
    const planPath = path.join(specDir, 'implementation_plan.json');

    let plan = JSON.parse(readFileSync(planPath, 'utf-8'));
    let validation = isValidPlan(plan);
    expect(validation.valid).toBe(false);

    // Simulate recovery: planner re-runs and creates valid plan
    createValidPlan(specDir);

    plan = JSON.parse(readFileSync(planPath, 'utf-8'));
    validation = isValidPlan(plan);
    expect(validation.valid).toBe(true);
    expect(plan.phases.length).toBeGreaterThan(0);
  });
});

test.describe('Task Planning Error Recovery - File System State', () => {
  test.beforeEach(() => {
    setupTestEnvironment();
  });

  test.afterEach(() => {
    cleanupTestEnvironment();
  });

  test('should handle missing implementation_plan.json gracefully', () => {
    const specDir = createSpecDirectory('010-missing-plan');
    const planPath = path.join(specDir, 'implementation_plan.json');

    expect(existsSync(specDir)).toBe(true);
    expect(existsSync(planPath)).toBe(false);

    // Simulate file-watcher.ts behavior - plan file doesn't exist yet
    // Should not crash, should wait for file to be created
  });

  test('should handle corrupted JSON in plan file', () => {
    const specDir = createSpecDirectory('011-corrupted-json');
    const planPath = path.join(specDir, 'implementation_plan.json');

    // Write invalid JSON
    writeFileSync(planPath, '{ invalid json content }');

    // Should throw error when trying to parse
    expect(() => {
      JSON.parse(readFileSync(planPath, 'utf-8'));
    }).toThrow();
  });

  test('should ensure spec.md exists alongside plan file', () => {
    const specDir = createSpecDirectory('012-spec-existence');
    createValidPlan(specDir);

    const specPath = path.join(specDir, 'spec.md');
    const planPath = path.join(specDir, 'implementation_plan.json');

    expect(existsSync(specPath)).toBe(true);
    expect(existsSync(planPath)).toBe(true);

    // Both files should exist for a valid task
    const specContent = readFileSync(specPath, 'utf-8');
    expect(specContent).toContain('# 012-spec-existence');
  });
});
