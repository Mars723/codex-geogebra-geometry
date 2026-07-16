---
name: generate-geogebra-geometry
description: Generate verified GeoGebra .ggb construction files from geometry problem text, screenshots, or LaTeX. Use when a user wants an importable dynamic geometry diagram, a checked competition-geometry figure, misleading-relation auditing, preview exports, or optional TikZ output.
---

# Generate GeoGebra Geometry

Create a genuine `.ggb` file with the official GeoGebra engine, verify the stated relationships, audit accidental visual implications, and deliver a preview plus an evidence report.

## Read the relevant references

- Read [spec-format.md](references/spec-format.md) before creating or editing a construction spec.
- Read [construction-patterns.md](references/construction-patterns.md) when translating a problem statement into GeoGebra commands.
- Read [diagram-quality.md](references/diagram-quality.md) whenever choosing coordinates, optimizing layout, or reviewing audit findings.
- Read [engine-notes.md](references/engine-notes.md) when the engine, browser, proof system, or `.ggb` export fails.
- Read [latex-output.md](references/latex-output.md) only when the user asks for LaTeX, TikZ, SVG, or publication output.

## Workflow

### 1. Parse the problem

Extract:

- free objects and givens;
- dependent constructions;
- conclusions to verify;
- naming and orientation requirements;
- any genuinely ambiguous wording.

For a screenshot, inspect it directly and transcribe the mathematical statement. Preserve labels and symbols. Ask only when an ambiguity would materially change the construction; otherwise state the assumption and proceed.

Never infer a missing theorem hypothesis merely because it makes a familiar result true.

### 2. Build a construction spec

Copy `assets/spec-template.json` into a working directory and adapt it.

Use English GeoGebra command names. Encode givens as dependencies, not as lucky coordinates. Examples:

- midpoint: `D=Midpoint(B,C)`;
- perpendicular foot: construct the side line, a perpendicular line, then their intersection;
- point on a circle: `D=Point(omega)`;
- intersection: `P=Intersect(g,h)`.

Do not construct a claimed conclusion directly. For example, if the theorem concludes that `DE` is parallel to `AB`, construct `D`, `E`, and `Segment(D,E)`, then verify `AreParallel(...)`.

Use the canonical triangle as the initial layout unless the problem dictates another shape:

```text
A=(0,0), B=(2.4,4.6), C=(8,0)
```

This gives `∠B > ∠A > ∠C` and `AC > BC > AB`. Keep at least one free base object in `layout.variables` so the optimizer can repair accidental alignments.

### 3. Declare every audited entity

List all meaningful visible points, lines, segments, angles, and circles under `entities`.

Add every intended geometric relation to `relations`. This serves both as a verification list and as an allowlist for the accidental-relation audit.

- Use `status: "construction"` for givens and defining properties.
- Use `status: "conclusion"` and `verify: "symbolic"` for theorem conclusions whenever GeoGebra supports the statement.
- Use `verify: "numeric"` only for construction sanity or unsupported symbolic forms.
- Use a raw `expression` when no built-in relation type fits.

Never describe a numerically true statement as proved.

### 4. Generate and validate

Run:

```bash
node /absolute/path/to/this-skill/scripts/build_geogebra.mjs \
  --spec /absolute/path/to/problem.json \
  --out-dir /absolute/path/to/output
```

The script prefers an installed GeoGebra module and falls back to GeoGebra's official CDN. It uses Chrome or Chromium through Playwright, so a sandboxed environment may require approval to launch the browser.

The build is acceptable only when:

- the process exits successfully;
- `successful` is `true` in the audit report;
- all required objects exist and are defined;
- `failedChecks` is empty;
- every requested conclusion has the required numeric or symbolic result;
- `roundtrip.zipSignature` and `roundtrip.loaded` are true;
- round-trip `missing` and `undefined` lists are empty;
- no undeclared medium- or high-severity accidental relation remains;
- the PNG preview is visually legible.

Inspect the generated `.audit.json`, then inspect the PNG with an image viewer. Do not rely on the report alone for label collisions, excessive whitespace, or awkward line crossings.

### 5. Repair failures

Repair the model, not only the appearance.

- Failed construction: correct command order, names, or dependencies.
- Failed conclusion: revisit the parsed hypotheses before changing coordinates.
- Accidental relation: vary free coordinates or broaden `layout.variables`; keep the relation in the audit.
- Structural but distracting extra relation: choose a different valid layout when possible.
- Cropped content: increase `canvas.padding` or provide explicit `canvas.bounds`.
- Unresolved proof: report it as unresolved, even if the numeric check passes.

Re-run until the latest output passes both report and visual inspection.

### 6. Optional TikZ output

After a successful build, run:

```bash
node /absolute/path/to/this-skill/scripts/emit_tikz.mjs \
  --spec /absolute/path/to/output/problem.spec.json \
  --audit /absolute/path/to/output/problem.audit.json \
  --output /absolute/path/to/output/problem.tex
```

Compile and visually inspect the `.tex` before delivery. The emitter covers common points, object-backed segments and lines, circles, angles, and labels. The `.ggb` remains the authoritative dynamic construction.

### 7. Deliver

Normally provide:

- the `.ggb` file;
- the PNG preview;
- the `.audit.json` verification report.

Also provide SVG, GeoGebra XML, or TikZ only when useful or requested. Summarize which conclusions were symbolically proved, which were checked numerically, and any remaining caveat.

## Non-negotiable rules

- Use the GeoGebra engine to create the canonical `.ggb`; do not hand-author ZIP/XML as the primary method.
- Encode hypotheses structurally.
- Keep conclusions separate from construction commands.
- Audit undeclared collinearity, concurrency, parallelism, perpendicularity, equal lengths, equal angles, special angles, concyclicity, and point crowding.
- Preserve the distinction between symbolic proof, numeric verification, and visual plausibility.
- Do not deliver a file that has not been round-trip loaded.
