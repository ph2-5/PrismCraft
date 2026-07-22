---
name: "dead-code-cleanup"
description: "Evaluates suspected dead code with a 4-step judgment flow (independent logic? same-name replacement? dead vs forgotten? test migration). Invoke when finding unused exports, no-unused-vars warnings, or code review flags suspect code."
---

# Dead Code Cleanup

A structured decision flow for evaluating suspected dead code. **Never mechanically delete** — always judge first whether code is truly dead or a forgotten feature that was never wired up.

## When to Invoke

- ESLint reports `no-unused-vars` / `no-unused-modules`
- Grep finds an exported symbol with no inbound references
- Code review flags a function as "unused" or "placeholder"
- AI analysis report claims a feature is "not implemented" or "stub"
- You are about to delete a function because "nothing calls it"

**Do NOT invoke for**: obvious scratch/debug code, deprecated APIs with migration notes, or feature-flagged code (those have explicit reasons to exist).

## The 4-Step Judgment Flow

### Step 1: Does it have independent logic?

```
suspect function/module
  │
  ├── Body is a one-line delegation (return otherFn(...))?
  │   ├── Yes → leans "dead code", go to Step 2
  │   └── No  → has business logic, go to Step 2 (could be "forgotten")
  │
  └── Accepts parameters but ignores them?
      ├── Yes → leans "dead code" (params are misleading)
      └── No  → go to Step 2
```

### Step 2: Is there a same-name / same-function replacement?

Search the same module and adjacent modules:

```
- Exists a function with similar name (performXxx vs checkXxx)?
  ├── Yes → leans "dead code" (naming collision leftover)
  └── No  → go to Step 3
- Exists a functionally equivalent implementation?
  ├── Yes → leans "dead code" (already replaced)
  └── No  → go to Step 3
```

### Step 3: Dead code vs forgotten feature?

| Signal | Dead code | Forgotten feature |
|--------|-----------|-------------------|
| Function body | pure delegation / empty / placeholder | complete business logic |
| Parameter usage | accepts but ignores | all used |
| Naming | mismatched with actual behavior | matches behavior |
| Same-function replacement | exists | does not exist |
| Comments | "TODO" / "temporary" / "placeholder" | no special comments |
| Tests | only test delegation | test independent behavior |

**Decision**:
- Most signals point to "dead code" → execute Step 4A (delete)
- Most signals point to "forgotten" → execute Step 4B (wire up)
- Mixed signals → **pause and ask the user**

### Step 4A: Delete dead code

1. Delete the function/module implementation
2. Delete the corresponding `export` statement
3. Update `contract.json` `publicAPI` declaration
4. Update `MODULE.md` public API list
5. Update `API_REFERENCE` docs
6. **Handle tests** (see decision tree below)
7. Run `npm run typecheck && npm run lint:arch` to verify
8. Run affected tests to verify

### Step 4B: Wire up forgotten feature

1. Analyze why it was not called (route missing? Hook not exported? DI token not registered?)
2. Find the correct call site
3. Wire it up and verify
4. Add integration tests for the newly connected path

## Test Handling Decision Tree

```
deleted function has tests
  │
  ├── What do the tests verify?
  │   ├── Only delegation (result === otherFn()) → delete tests
  │   ├── Independent business behavior → evaluate migration
  │   └── Side effects / integration → evaluate migration
  │
  └── If migrate, where?
      ├── Same-function replacement exists → migrate to its test file
      └── No replacement → do not migrate (feature does not exist)
```

## Naming Audit (after deletion)

After cleanup, audit sibling names in the same module:

| Anti-pattern | Problem | Fix |
|--------------|---------|-----|
| `performConsistencyCheck` only does config check | Name implies "consistency check", actually only checks config | Rename to `performConfigCheck` or delete |
| `checkVisualConsistency` does not accept visual input | Name implies "visual", actually checks text | Rename or add visual path |
| `generateXxx` returns hardcoded value | Name implies "generate", actually returns constant | Rename to `getXxxDefault` or implement real generation |

## Documentation Sync Checklist

After deleting dead code, sync these locations:

- [ ] `src/modules/<module>/index.ts` — remove export
- [ ] `src/modules/<module>/MODULE.md` — remove public API entry
- [ ] `src/modules/<module>/<subdomain>/contract.json` — remove publicAPI declaration
- [ ] `docs/API_REFERENCE_PART*.md` — remove function doc
- [ ] `docs/PROJECT-GUIDE.md` — check for references
- [ ] `.ai/modules/*.md` — check AI maintenance guide references

## Commit Message Format

Always explain the judgment in the commit body:

```
refactor(<module>): delete misleading-name dead code

<Function> accepted <param> but ignored it, delegating to <otherFn>.
Real <feature> is in <replacementFn>.

Deleted because:
1. Dead code - just a wrapper around <otherFn>, no independent logic
2. Misleading name - name implied "<X>", actually only did <Y>
3. No production callers - only referenced in tests

Synced:
- MODULE.md: removed entry, clarified <otherFn> is "<accurate description>"
- API_REFERENCE: removed doc entry
- contract.json: removed publicAPI declaration
```

## Worked Example

**Suspect**: `performConsistencyCheck` in `shot/consistency-check/services/config-check-service.ts`

```typescript
export function performConsistencyCheck(params: {
  videoUrl: string;                    // ← accepted
  featureAnchoring: FeatureAnchoringConfig;
  elements: StoryElement[];
}): ConsistencyCheckResult {
  return performConfigCheck({           // ← one-line delegation
    featureAnchoring: params.featureAnchoring,
    elements: params.elements,
  });                                   // ← videoUrl ignored
}
```

**Step 1**: One-line delegation, accepts `videoUrl` but ignores it → leans dead
**Step 2**: Same module has `checkVisualConsistency` (real visual check via VLM) → leans dead
**Step 3**: All signals point to dead code (delegation, ignored params, misleading name, replacement exists)
**Step 4A**: Delete function + export + contract.json + MODULE.md + API_REFERENCE
**Tests**: Only tested delegation (`expect(result).toEqual(expected)`), deleted tests
**Naming audit**: `performConfigCheck` already has accurate name, no rename needed

Result: cleaner API surface, no more misleading "consistency check" that actually does config check.
