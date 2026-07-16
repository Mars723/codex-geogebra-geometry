# LaTeX, TikZ, and vector output

## What is possible

LaTeX geometry figures do not have to be pasted photographs.

- TikZ and `tkz-euclide` generate native vector geometry from code.
- GeoGebra Desktop can export PGF/TikZ, PSTricks, and Asymptote.
- SVG can be included as vector artwork rather than a bitmap.

References:

- GeoGebra LaTeX/PGF export: https://geogebra.github.io/docs/manual/en/Export_to_LaTeX_PGF_PSTricks_and_Asymptote/
- `tkz-euclide`: https://ctan.org/pkg/tkz-euclide

## Skill-provided TikZ emitter

After a successful GeoGebra build:

```bash
node scripts/emit_tikz.mjs \
  --spec output/problem.spec.json \
  --audit output/problem.audit.json \
  --output output/problem.tex
```

Use `--fragment` to emit only the `tikzpicture` environment.

The emitter uses verified final coordinates from the audit report. It supports:

- declared points and labels;
- object-backed visible segments;
- object-backed visible lines;
- declared circles with recovered center and radius;
- object-backed angle marks;
- the standard role color hierarchy.

Set `"render": true` on a semantic line or segment entity if it has no GeoGebra `object` but should appear in TikZ.

## Limitations

The TikZ output is a publication rendering, not a dynamic construction.

It does not fully preserve:

- drag dependencies and object constraints;
- every GeoGebra curve or locus;
- all decorations, captions, layers, and custom styles;
- arbitrary polygons, conics, functions, text, or images;
- branch semantics for multi-valued constructions.

Treat the `.ggb` as authoritative. Compare the compiled TikZ PDF with the PNG preview before delivery.

## Compiling

Compile the standalone file with a normal LaTeX engine that includes TikZ:

```bash
latexmk -pdf problem.tex
```

If working in Codex, use the LaTeX compile skill and inspect a rendered PNG of the PDF.

## SVG alternative

When editable LaTeX drawing code is not required, the generated SVG is often the closest visual match to GeoGebra.

Example:

```latex
\usepackage{svg}

\begin{figure}
  \centering
  \includesvg[width=.8\linewidth]{problem}
  \caption{Geometry construction}
\end{figure}
```

This remains vector output, but it is an included external graphic rather than native TikZ geometry.
