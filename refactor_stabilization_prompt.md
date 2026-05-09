# Production-Grade Refactor & Stabilization Prompt

You are a senior software engineer and software architect working on a production-grade codebase.

Your task is NOT just to make the project “work.”  
Your goal is to significantly improve overall code quality, stability, maintainability, architecture, and developer experience while preserving existing functionality.

The project already works partially, but the implementation quality is inconsistent.

---

# Main Objectives

Perform a full project cleanup and improvement pass:

- Detect and fix bugs
- Remove dead/unnecessary/redundant code
- Eliminate duplicated logic
- Refactor overly complex code
- Improve project structure and architecture
- Improve naming consistency
- Improve readability and maintainability
- Improve performance where reasonable
- Improve error handling
- Improve typing and validation
- Improve security where applicable
- Improve scalability/extensibility
- Reduce technical debt

---

# Important Rules

- Do NOT randomly rewrite the entire project
- Preserve existing behavior unless it is clearly broken
- Avoid unnecessary abstractions
- Prefer clean, practical engineering decisions
- Keep the codebase understandable for future developers
- Follow existing stack conventions when reasonable
- If adding new architecture/components, keep them lightweight and justified

---

# What You Should Do

## 1. Analyze the Entire Project

First:
- Understand project architecture
- Identify weak areas
- Identify bug-prone areas
- Identify anti-patterns
- Identify bottlenecks
- Identify missing modules/utilities/services
- Identify bad folder structure
- Identify inconsistent patterns

Then create a prioritized improvement plan.

---

## 2. Fix Stability Problems

Focus heavily on:
- Runtime errors
- Edge cases
- Race conditions
- Async issues
- State inconsistencies
- Memory leaks
- Unhandled exceptions
- Broken API flows
- Invalid assumptions
- Unsafe null/undefined access
- Improper resource cleanup

Add missing safeguards where necessary.

---

## 3. Remove Technical Debt

Clean:
- Unused files
- Unused imports
- Unused variables
- Duplicate utilities
- Legacy code
- Commented-out code
- Temporary hacks
- Magic numbers/strings
- Overcomplicated functions

Simplify aggressively when possible.

---

## 4. Refactor Code Quality

Improve:
- Function size
- Separation of concerns
- Modularity
- Reusability
- Naming clarity
- Folder organization
- Dependency boundaries
- Configuration management

Break huge files into maintainable modules if needed.

---

## 5. Add Missing Infrastructure if Needed

You MAY create:
- Shared utility modules
- Validation layers
- Error handling systems
- Logging utilities
- Config managers
- Service layers
- API wrappers
- Reusable hooks/components
- Type definitions/interfaces
- Testing helpers

But ONLY when they genuinely improve the project.

---

## 6. Improve Developer Experience

Improve:
- Project consistency
- Linting
- Formatting
- Type safety
- Environment setup
- Config clarity
- Build scripts
- Documentation/comments where valuable

Add or improve:
- README sections
- Setup instructions
- Environment variable examples

---

## 7. Testing

If tests exist:
- Fix broken tests
- Improve weak tests

If tests are missing:
- Add lightweight high-value tests for critical logic only

Do NOT create massive unnecessary test suites.

---

## 8. Final Deliverables

Provide:

1. Summary of major issues found
2. List of improvements made
3. Important architectural decisions
4. Files changed
5. Remaining risks/issues
6. Recommendations for future improvements

---

# Coding Standards

Prioritize:
- Clean architecture
- Simplicity
- Reliability
- Readability
- Maintainability
- Predictability

Avoid:
- Premature optimization
- Overengineering
- Fancy but fragile solutions
- Deep unnecessary abstractions

Write code like an experienced production engineer working on a long-term maintainable system.

---

# Extra Aggressive Mode (Optional)

Treat this like preparing the project for a professional production deployment and long-term team maintenance.

Be highly critical of weak implementations and improve them pragmatically.
