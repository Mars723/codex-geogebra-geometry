---
name: generate-geogebra-geometry
description: Generate verified GeoGebra .ggb construction files from geometry problem text, screenshots, or LaTeX. Use when a user wants an importable dynamic geometry diagram, a checked competition-geometry figure, misleading-relation auditing, preview exports, or optional TikZ output.
---

# Generate GeoGebra Geometry

Create a genuine `.ggb` file with the official GeoGebra engine, verify the stated relationships, round-trip the file, and deliver a preview. Use `fast` mode by default and reserve `strict` mode for explicitly requested research-grade auditing.

## Select the mode first

| Mode | Use when | Effective engine policy |
| --- | --- | --- |
| `fast` | Default; normal diagram generation and iteration | At most 120 layout trials, at most 4 symbolic statement checks, numeric accidental-relation scan, high-severity findings block delivery |
| `strict` | The user explicitly asks for strict, exhaustive, proof-grade, publication-grade, or full misleading-relation auditing | At most 1,000 layout trials, at most 32 symbolic statement checks, up to 24 symbolic accidental-relation classifications, medium- and high-severity findings block delivery |

Both modes must use structural constructions, verify requested conclusions, export with the GeoGebra engine, round-trip load the `.ggb`, and visually inspect the PNG.

Do not silently escalate from `fast` to `strict`. If a valid fast result cannot be produced within the fast budget, report the obstacle and offer strict mode.

## Load references only when needed

Do not read every reference preemptively.

- Start from `assets/spec-template.json`. Read [spec-format.md](references/spec-format.md) only when the required field or relation syntax is unclear.
- Read [construction-patterns.md](references/construction-patterns.md) only for an unfamiliar construction.
- Read [diagram-quality.md](references/diagram-quality.md) in strict mode or when the first preview/audit reveals a layout problem.
- Read [engine-notes.md](references/engine-notes.md) only when the browser, proof system, engine, or export fails.
- Read [latex-output.md](references/latex-output.md) only when the user asks for LaTeX, TikZ, SVG, or publication output.

## Workflow

### 1. Parse the problem

Extract free objects, givens, dependent constructions, conclusions, labels, and orientation requirements.

For a screenshot, inspect it directly and transcribe the mathematical statement. Ask only when an ambiguity would materially change the construction; otherwise state the assumption and proceed. Never add a missing theorem hypothesis merely because it makes a familiar result true.

In fast mode, do not browse for the official solution or research alternate configurations unless the statement itself is missing or the user asks for that research.

### 2. Build the construction spec

Copy `assets/spec-template.json` into a working directory and set:

```json
{"mode": "fast"}
```

Use `strict` only when selected above. The command-line `--mode` option overrides the file.

Use English GeoGebra command names. Encode givens as dependencies, not lucky coordinates:

- midpoint: `D=Midpoint(B,C)`;
- perpendicular foot: construct the side line, a perpendicular line, then their intersection;
- point on a circle: `D=Point(omega)`;
- intersection: `P=Intersect(g,h)`.

Do not construct a claimed conclusion directly. Construct its objects, then verify the relation.

Use the canonical triangle unless the problem dictates another shape:

```text
A=(0,0), B=(2.4,4.6), C=(8,0)
```

It gives `∠B > ∠A > ∠C` and `AC > BC > AB`. Keep a genuinely free object in `layout.variables` when a small coordinate search can remove distracting coincidences.

### 3. Declare verification geometry

List meaningful visible points, lines, segments, angles, and circles under `entities`. Add intended geometric relations to `relations`; these are both verification targets and an allowlist for the visual audit.

- Use `status: "construction"` for givens and definitions.
- Use `status: "conclusion"` for claimed results.
- In fast mode, use symbolic verification only for central conclusions supported by GeoGebra, with at most 4 symbolic statements total.
- In strict mode, use symbolic verification for supported conclusions, with at most 32 symbolic statements total.
- Use numeric verification for construction sanity and unsupported symbolic forms.

Never describe a numerically true statement as proved.

### 4. Generate

Run:

```bash
node /absolute/path/to/this-skill/scripts/build_geogebra.mjs \
  --mode fast \
  --spec /absolute/path/to/problem.json \
  --out-dir /absolute/path/to/output
```

Replace `fast` with `strict` only when strict mode was selected. The script prefers an installed GeoGebra module and otherwise uses GeoGebra's official CDN. It launches Chrome or Chromium through Playwright.

### 5. Validate and repair

For both modes, accept the build only when:

- the process exits successfully and `successful` is `true`;
- all required objects exist and are defined;
- `failedChecks` is empty;
- the requested conclusions have the declared numeric or symbolic result;
- ZIP signature and round-trip loading pass with no missing or undefined objects;
- the PNG is legible and consistent with the statement.

Fast-mode budget:

- no more than 3 generation passes;
- no bespoke optimizer, brute-force theorem search, or large coordinate-search script;
- repair high-severity audit findings;
- review medium findings, but repair at most once when the preview is genuinely misleading;
- report low findings without chasing them;
- do not spend more than about 10 minutes silently expanding the task.

Strict-mode budget:

- no more than 6 generation passes under the built-in profile;
- repair every undeclared medium- or high-severity `accidental`, `unresolved`, or `numeric-only` finding;
- inspect both `.audit.json` and PNG after material changes;
- before exceeding the built-in limits or creating a custom global optimizer, explain why and get the user's approval.

Repair the construction model before changing appearance. Revisit parsed hypotheses when a conclusion fails; vary only genuinely free coordinates to remove accidental relations.

### 6. Optional TikZ output

After a successful build, run:

```bash
node /absolute/path/to/this-skill/scripts/emit_tikz.mjs \
  --spec /absolute/path/to/output/problem.spec.json \
  --audit /absolute/path/to/output/problem.audit.json \
  --output /absolute/path/to/output/problem.tex
```

Compile and inspect the `.tex` before delivery. The `.ggb` remains the authoritative dynamic construction.

### 7. Deliver

Normally provide:

- the `.ggb` file;
- the PNG preview;
- the `.audit.json` report.

State the mode used, which conclusions were symbolically proved or numerically checked, and any non-blocking audit caveat. Provide SVG, GeoGebra XML, or TikZ only when useful or requested.

## Non-negotiable rules

- Use the GeoGebra engine for the canonical `.ggb`; do not hand-author ZIP/XML as the primary method.
- Encode hypotheses structurally and keep conclusions separate from construction commands.
- Preserve the distinction between symbolic proof, numeric verification, and visual plausibility.
- Never deliver a file that has not been round-trip loaded.
- Never let fast mode grow into an unannounced research project.
