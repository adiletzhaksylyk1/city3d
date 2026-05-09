# LOD System Debug & Refactor Task

You are a senior graphics/software engineer specializing in:
- GIS
- 3D rendering
- procedural generation
- mesh optimization
- LOD (Level of Detail) systems
- map/building pipelines

The project already supports multiple LOD levels, but the implementation is broken or inconsistent.

Current issue examples:
- When loading data from API → only LOD4 appears/works
- When loading data from GeoJSON → only LOD2 appears/works
- LOD switching logic behaves inconsistently depending on datasource

Your task is to fully investigate, debug, and stabilize the ENTIRE LOD pipeline.

---

# Main Goal

Make ALL LOD levels work correctly and consistently across ALL supported data sources.

The final system must:
- load correct LODs
- switch correctly between LODs
- preserve expected geometry detail
- behave identically regardless of datasource
- be maintainable and extensible

---

# Investigation Requirements

First perform a deep analysis of:

- LOD architecture
- Mesh generation pipeline
- Data loading pipeline
- API parsing
- GeoJSON parsing
- Geometry conversion
- Coordinate transforms
- Building generation logic
- LOD selection logic
- Rendering pipeline
- Cache behavior
- Async loading behavior

Identify:
- why LOD levels are inconsistent
- where data gets lost or downgraded
- where LOD information is ignored or overwritten
- whether geometry simplification is broken
- whether configuration values are ignored
- whether mesh generation bypasses LOD settings

---

# Things To Specifically Check

## Data Parsing

Verify:
- API data contains all required geometry/detail fields
- GeoJSON parser preserves all attributes
- parsers map fields consistently
- missing fields have safe fallbacks
- no parser hardcodes a specific LOD

---

## LOD Configuration

Check:
- LOD config values
- thresholds/distances
- selection logic
- enum mappings
- default values
- overrides
- environment configs

Ensure:
- no datasource forces a fixed LOD
- no silent fallback always selects same level

---

## Mesh Generation

Investigate:
- mesh simplification
- extrusion logic
- roof generation
- facade detail generation
- vertex reduction
- texture handling
- batching/instancing

Ensure:
- each LOD genuinely produces different geometry complexity
- geometry complexity increases correctly from low → high LOD

---

## Runtime LOD Switching

Verify:
- camera distance calculations
- update loop
- frustum/culling interactions
- async replacement of meshes
- cache invalidation
- renderer updates

Fix:
- stuck LODs
- incorrect switching
- race conditions
- stale meshes
- non-updating objects

---

## Debugging Improvements

Add:
- logging for active LOD selection
- debug visualization tools
- clear diagnostics
- validation checks
- warnings for invalid geometry/configuration

The system should become easy to debug in the future.

---

# Refactor Requirements

Clean and improve:
- duplicated LOD logic
- datasource-specific hacks
- overly coupled systems
- giant functions
- inconsistent naming
- hidden side effects

Unify the pipeline so:
- API and GeoJSON follow the same internal processing flow
- LOD generation behaves consistently everywhere

---

# Performance Requirements

Improve performance where reasonable:
- avoid unnecessary mesh regeneration
- avoid redundant parsing
- improve caching behavior
- avoid memory leaks
- reduce unnecessary draw calls

But:
- correctness and stability are MORE important than micro-optimizations

---

# Final Deliverables

Provide:

1. Root causes discovered
2. Exact bugs fixed
3. Files/modules changed
4. Architectural improvements made
5. Remaining limitations
6. Recommendations for future LOD scalability

---

# Important Constraints

- Do NOT rewrite the entire renderer unless absolutely necessary
- Preserve working features
- Prefer targeted engineering fixes
- Keep architecture understandable
- Avoid overengineering

Act like an experienced engine/rendering engineer debugging a production GIS/3D visualization pipeline.
