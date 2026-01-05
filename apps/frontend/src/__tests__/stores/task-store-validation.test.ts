/**
 * Unit tests for task store validation
 * Tests that updateTaskFromPlan correctly rejects invalid plans
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useTaskStore } from '../../renderer/stores/task-store';
import type { Task, ImplementationPlan } from '../../shared/types';

// Helper to create a minimal valid task
function createTestTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    specId: 'spec-1',
    projectId: 'project-1',
    title: 'Test Task',
    description: 'Test Description',
    status: 'in_progress',
    subtasks: [],
    logs: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

// Helper to create a minimal valid implementation plan
function createTestPlan(overrides: Partial<ImplementationPlan> = {}): ImplementationPlan {
  return {
    feature: 'Test Feature',
    workflow_type: 'feature',
    services_involved: [],
    phases: [
      {
        phase: 1,
        name: 'Test Phase',
        type: 'implementation',
        subtasks: [
          { id: 'subtask-1', description: 'Subtask 1', status: 'pending' }
        ]
      }
    ],
    final_acceptance: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    spec_file: 'spec.md',
    ...overrides
  };
}

describe('Task Store - Plan Validation', () => {
  beforeEach(() => {
    // Reset store to clean state before each test
    const store = useTaskStore.getState();
    store.clearTasks();
  });

  describe('updateTaskFromPlan', () => {
    it('should reject plan with error field and set task to human_review', () => {
      const task = createTestTask();
      useTaskStore.getState().addTask(task);

      const invalidPlan = createTestPlan({
        error: 'Planner failed to create phases'
      });

      useTaskStore.getState().updateTaskFromPlan(task.id, invalidPlan);

      const updatedTask = useTaskStore.getState().tasks.find(t => t.id === task.id);
      expect(updatedTask).toBeDefined();
      expect(updatedTask?.status).toBe('human_review');
      expect(updatedTask?.reviewReason).toBe('errors');
      expect(updatedTask?.planError).toBe('Planner failed to create phases');
      expect(updatedTask?.subtasks).toHaveLength(0); // Should not create subtasks
    });

    it('should reject plan with empty phases array', () => {
      const task = createTestTask();
      useTaskStore.getState().addTask(task);

      const invalidPlan = createTestPlan({
        phases: []
      });

      useTaskStore.getState().updateTaskFromPlan(task.id, invalidPlan);

      const updatedTask = useTaskStore.getState().tasks.find(t => t.id === task.id);
      expect(updatedTask).toBeDefined();
      expect(updatedTask?.status).toBe('human_review');
      expect(updatedTask?.reviewReason).toBe('errors');
      expect(updatedTask?.planError).toBe('Plan has no phases');
      expect(updatedTask?.subtasks).toHaveLength(0); // Should not create subtasks
    });

    it('should reject plan with undefined phases property', () => {
      const task = createTestTask();
      useTaskStore.getState().addTask(task);

      const invalidPlan = createTestPlan();
      // @ts-expect-error Testing runtime validation of invalid data
      delete invalidPlan.phases;

      useTaskStore.getState().updateTaskFromPlan(task.id, invalidPlan);

      const updatedTask = useTaskStore.getState().tasks.find(t => t.id === task.id);
      expect(updatedTask).toBeDefined();
      expect(updatedTask?.status).toBe('human_review');
      expect(updatedTask?.reviewReason).toBe('errors');
      expect(updatedTask?.planError).toBe('Plan has no phases');
      expect(updatedTask?.subtasks).toHaveLength(0);
    });

    it('should accept valid plan and clear previous planError', () => {
      const task = createTestTask({
        planError: 'Previous error',
        status: 'human_review',
        reviewReason: 'errors'
      });
      useTaskStore.getState().addTask(task);

      const validPlan = createTestPlan();

      useTaskStore.getState().updateTaskFromPlan(task.id, validPlan);

      const updatedTask = useTaskStore.getState().tasks.find(t => t.id === task.id);
      expect(updatedTask).toBeDefined();
      expect(updatedTask?.planError).toBeUndefined(); // Error should be cleared
      expect(updatedTask?.subtasks).toHaveLength(1); // Should create subtasks
      expect(updatedTask?.subtasks[0].id).toBe('subtask-1');
      expect(updatedTask?.subtasks[0].status).toBe('pending');
      // Status remains unchanged when all subtasks are pending (no in_progress or completed)
      expect(updatedTask?.status).toBe('human_review');
    });

    it('should create subtasks from valid plan phases', () => {
      const task = createTestTask();
      useTaskStore.getState().addTask(task);

      const validPlan = createTestPlan({
        phases: [
          {
            phase: 1,
            name: 'Phase 1',
            type: 'implementation',
            subtasks: [
              { id: 'subtask-1', description: 'Subtask 1', status: 'pending' },
              { id: 'subtask-2', description: 'Subtask 2', status: 'pending' }
            ]
          },
          {
            phase: 2,
            name: 'Phase 2',
            type: 'testing',
            subtasks: [
              { id: 'subtask-3', description: 'Subtask 3', status: 'pending' }
            ]
          }
        ]
      });

      useTaskStore.getState().updateTaskFromPlan(task.id, validPlan);

      const updatedTask = useTaskStore.getState().tasks.find(t => t.id === task.id);
      expect(updatedTask).toBeDefined();
      expect(updatedTask?.subtasks).toHaveLength(3); // All subtasks from all phases
      expect(updatedTask?.subtasks[0].id).toBe('subtask-1');
      expect(updatedTask?.subtasks[1].id).toBe('subtask-2');
      expect(updatedTask?.subtasks[2].id).toBe('subtask-3');
    });

    it('should not update non-existent task', () => {
      const validPlan = createTestPlan();

      useTaskStore.getState().updateTaskFromPlan('nonexistent-task', validPlan);

      expect(useTaskStore.getState().tasks).toHaveLength(0); // Store should remain empty
    });

    it('should handle plan with both error and phases (error takes precedence)', () => {
      const task = createTestTask();
      useTaskStore.getState().addTask(task);

      const invalidPlan = createTestPlan({
        error: 'Planning error occurred',
        phases: [
          {
            phase: 1,
            name: 'Test Phase',
            type: 'implementation',
            subtasks: [
              { id: 'subtask-1', description: 'Subtask 1', status: 'pending' }
            ]
          }
        ]
      });

      useTaskStore.getState().updateTaskFromPlan(task.id, invalidPlan);

      const updatedTask = useTaskStore.getState().tasks.find(t => t.id === task.id);
      expect(updatedTask).toBeDefined();
      expect(updatedTask?.status).toBe('human_review');
      expect(updatedTask?.planError).toBe('Planning error occurred');
      expect(updatedTask?.subtasks).toHaveLength(0); // Error takes precedence, no subtasks created
    });

    it('should update task title from plan feature', () => {
      const task = createTestTask({ title: 'Old Title' });
      useTaskStore.getState().addTask(task);

      const validPlan = createTestPlan({
        feature: 'New Feature Title'
      });

      useTaskStore.getState().updateTaskFromPlan(task.id, validPlan);

      const updatedTask = useTaskStore.getState().tasks.find(t => t.id === task.id);
      expect(updatedTask).toBeDefined();
      expect(updatedTask?.title).toBe('New Feature Title');
    });
  });
});
