#!/usr/bin/env python3
"""Verify ImplementationPlan schema includes error field and validation methods."""
import sys
sys.path.insert(0, './apps/backend')

from implementation_plan import ImplementationPlan

print("ImplementationPlan.__annotations__:")
for key, value in ImplementationPlan.__annotations__.items():
    print(f"  {key}: {value}")

# Check if error field exists
if 'error' not in ImplementationPlan.__annotations__:
    print("\n✗ Error: 'error' field NOT found in schema")
    sys.exit(1)

print("\n✓ Success: 'error' field found in schema")

# Check if validation methods exist
if not hasattr(ImplementationPlan, 'is_valid'):
    print("✗ Error: 'is_valid' method NOT found")
    sys.exit(1)

print("✓ Success: 'is_valid' method found")

if not hasattr(ImplementationPlan, 'validate'):
    print("✗ Error: 'validate' method NOT found")
    sys.exit(1)

print("✓ Success: 'validate' method found")

# Test the validation methods
print("\nTesting validation methods...")

# Create a minimal valid plan
from implementation_plan import Phase, Subtask, PhaseType, SubtaskStatus

valid_plan = ImplementationPlan(
    feature="Test Feature",
    phases=[
        Phase(
            phase=1,
            name="Test Phase",
            type=PhaseType.IMPLEMENTATION,
            subtasks=[
                Subtask(
                    id="test-1",
                    description="Test subtask",
                    service="backend",
                    status=SubtaskStatus.PENDING
                )
            ]
        )
    ]
)

if not valid_plan.is_valid():
    print("✗ Error: Valid plan incorrectly marked as invalid")
    sys.exit(1)

is_valid, error = valid_plan.validate()
if not is_valid or error is not None:
    print(f"✗ Error: Valid plan validation failed: {error}")
    sys.exit(1)

print("✓ Valid plan passes validation")

# Test invalid plan (no phases)
invalid_plan_no_phases = ImplementationPlan(feature="Test Feature", phases=[])
if invalid_plan_no_phases.is_valid():
    print("✗ Error: Plan with no phases incorrectly marked as valid")
    sys.exit(1)

is_valid, error = invalid_plan_no_phases.validate()
if is_valid or "no phases" not in error.lower():
    print(f"✗ Error: Expected 'no phases' error, got: {error}")
    sys.exit(1)

print("✓ Invalid plan (no phases) correctly rejected")

# Test invalid plan (with error)
invalid_plan_error = ImplementationPlan(
    feature="Test Feature",
    phases=[
        Phase(
            phase=1,
            name="Test Phase",
            type=PhaseType.IMPLEMENTATION,
            subtasks=[Subtask(id="test-1", description="Test", service="backend")]
        )
    ],
    error="Test error message"
)

if invalid_plan_error.is_valid():
    print("✗ Error: Plan with error field incorrectly marked as valid")
    sys.exit(1)

is_valid, error = invalid_plan_error.validate()
if is_valid or "Test error message" not in error:
    print(f"✗ Error: Expected error message in validation, got: {error}")
    sys.exit(1)

print("✓ Invalid plan (with error) correctly rejected")

print("\n" + "="*50)
print("ALL VERIFICATION CHECKS PASSED!")
print("="*50)
sys.exit(0)
