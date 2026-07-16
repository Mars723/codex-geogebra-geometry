#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function usage() {
  console.log(`Usage:
  node emit_tikz.mjs --spec construction.spec.json --audit construction.audit.json --output diagram.tex

Options:
  --fragment  Emit only the tikzpicture environment
`);
}

function parseArgs(argv) {
  const args = { fragment: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--fragment") args.fragment = true;
    else if (arg === "--spec") args.spec = argv[++index];
    else if (arg === "--audit") args.audit = argv[++index];
    else if (arg === "--output") args.output = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function texEscape(value) {
  return String(value)
    .replaceAll("\\", "\\textbackslash{}")
    .replaceAll("&", "\\&")
    .replaceAll("%", "\\%")
    .replaceAll("$", "\\$")
    .replaceAll("#", "\\#")
    .replaceAll("_", "\\_")
    .replaceAll("{", "\\{")
    .replaceAll("}", "\\}")
    .replaceAll("~", "\\textasciitilde{}")
    .replaceAll("^", "\\textasciicircum{}");
}

function labelText(name) {
  if (/^[A-Za-z][A-Za-z0-9']*$/.test(name)) return `$${name}$`;
  return `{\\sffamily ${texEscape(name)}}`;
}

function labelAnchor(point, center) {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const horizontal = Math.abs(dx) > 0.18 ? (dx > 0 ? "west" : "east") : "";
  const vertical = Math.abs(dy) > 0.18 ? (dy > 0 ? "south" : "north") : "";
  return [vertical, horizontal].filter(Boolean).join(" ") || "south";
}

const roleStyle = {
  vertex: "ggb vertex line",
  point: "ggb point line",
  side: "ggb side",
  auxiliary: "ggb auxiliary",
  highlight: "ggb highlight",
  circle: "ggb circle",
  angle: "ggb angle",
  hidden: "ggb hidden",
};

function objectAppearance(spec, object, fallbackRole) {
  const role = spec.roles?.[object] || fallbackRole;
  const override = spec.styles?.[object] || {};
  return {
    role,
    visible: role !== "hidden" && override.visible !== false,
    labelVisible: override.labelVisible !== false,
    tikz: roleStyle[role] || roleStyle[fallbackRole] || "ggb side",
  };
}

function pointMap(report) {
  return new Map(
    (report.audit?.pointCoordinates || []).map(({ name, x, y }, index) => [
      name,
      { name, x, y, tikzName: `ggbPoint${index + 1}` },
    ]),
  );
}

function diagramBody(spec, report) {
  const points = pointMap(report);
  const pointValues = [...points.values()];
  if (!pointValues.length) {
    throw new Error("Audit report has no pointCoordinates.");
  }
  const bounds = report.viewBounds || [
    Math.min(...pointValues.map(({ x }) => x)),
    Math.max(...pointValues.map(({ x }) => x)),
    Math.min(...pointValues.map(({ y }) => y)),
    Math.max(...pointValues.map(({ y }) => y)),
  ];
  const center = {
    x: (bounds[0] + bounds[1]) / 2,
    y: (bounds[2] + bounds[3]) / 2,
  };
  const unitScale = Math.min(1.2, 13 / Math.max(bounds[1] - bounds[0], 1));
  const lines = [];
  lines.push(
    `\\begin{tikzpicture}[x=${unitScale.toFixed(4)}cm,y=${unitScale.toFixed(4)}cm]`,
  );
  lines.push(
    `  \\clip (${bounds[0].toFixed(6)},${bounds[2].toFixed(6)}) rectangle (${bounds[1].toFixed(6)},${bounds[3].toFixed(6)});`,
  );

  for (const point of pointValues) {
    lines.push(
      `  \\coordinate (${point.tikzName}) at (${point.x.toFixed(8)},${point.y.toFixed(8)});`,
    );
  }

  for (const [id, entity] of Object.entries(spec.entities?.circles || {})) {
    const object = entity.object || id;
    const appearance = objectAppearance(spec, object, "circle");
    if (!appearance.visible) continue;
    const geometry = report.geometry?.circles?.[id];
    if (!geometry) {
      lines.push(`  % Circle ${texEscape(id)} omitted: geometry unavailable.`);
      continue;
    }
    lines.push(
      `  \\draw[${appearance.tikz}] (${geometry.center.x.toFixed(8)},${geometry.center.y.toFixed(8)}) circle[radius=${geometry.radius.toFixed(8)}];`,
    );
  }

  const segmentObjects = new Set(
    Object.values(spec.entities?.segments || {})
      .map((entity) => entity.object)
      .filter(Boolean),
  );
  for (const [id, entity] of Object.entries(spec.entities?.lines || {})) {
    if (!entity.object && entity.render !== true) continue;
    const object = entity.object || id;
    if (segmentObjects.has(object)) continue;
    const appearance = objectAppearance(spec, object, "auxiliary");
    const [firstName, secondName] = entity.through || [];
    const first = points.get(firstName);
    const second = points.get(secondName);
    if (!appearance.visible || !first || !second) continue;
    lines.push(
      `  \\draw[${appearance.tikz}] ($(${first.tikzName})!-20!(${second.tikzName})$) -- ($(${first.tikzName})!20!(${second.tikzName})$);`,
    );
  }

  for (const [id, entity] of Object.entries(spec.entities?.segments || {})) {
    if (!entity.object && entity.render !== true) continue;
    const object = entity.object || id;
    const appearance = objectAppearance(spec, object, "side");
    const [firstName, secondName] = entity.points || [];
    const first = points.get(firstName);
    const second = points.get(secondName);
    if (!appearance.visible || !first || !second) continue;
    lines.push(
      `  \\draw[${appearance.tikz}] (${first.tikzName}) -- (${second.tikzName});`,
    );
  }

  for (const [id, entity] of Object.entries(spec.entities?.angles || {})) {
    if (!entity.object) continue;
    const appearance = objectAppearance(spec, entity.object || id, "angle");
    const [firstName, vertexName, thirdName] = entity.points || [];
    const first = points.get(firstName);
    const vertex = points.get(vertexName);
    const third = points.get(thirdName);
    if (!appearance.visible || !first || !vertex || !third) continue;
    lines.push(
      `  \\pic[${appearance.tikz},angle radius=7mm] {angle = ${first.tikzName}--${vertex.tikzName}--${third.tikzName}};`,
    );
  }

  const declaredPoints = Array.isArray(spec.entities?.points)
    ? spec.entities.points
    : Object.keys(spec.entities?.points || {});
  for (const name of declaredPoints) {
    const point = points.get(name);
    if (!point) continue;
    const appearance = objectAppearance(spec, name, "point");
    if (!appearance.visible) continue;
    const label = appearance.labelVisible
      ? ` node[anchor=${labelAnchor(point, center)},inner sep=3pt] {${labelText(name)}}`
      : "";
    lines.push(
      `  \\filldraw[${appearance.tikz}] (${point.tikzName}) circle[radius=1.7pt]${label};`,
    );
  }

  lines.push("\\end{tikzpicture}");
  return lines.join("\n");
}

function standalone(body, title) {
  return `\\documentclass[tikz,border=8pt]{standalone}
\\usepackage{xcolor}
\\usetikzlibrary{angles,calc,quotes}
\\definecolor{ggbVertex}{HTML}{234E7A}
\\definecolor{ggbPoint}{HTML}{497AA6}
\\definecolor{ggbSide}{HTML}{444A50}
\\definecolor{ggbAux}{HTML}{9299A0}
\\definecolor{ggbHighlight}{HTML}{C45A4A}
\\definecolor{ggbCircle}{HTML}{657786}
\\definecolor{ggbAngle}{HTML}{B3832F}
\\tikzset{
  ggb vertex line/.style={draw=ggbVertex,fill=ggbVertex},
  ggb point line/.style={draw=ggbPoint,fill=ggbPoint},
  ggb side/.style={draw=ggbSide,line width=1.1pt},
  ggb auxiliary/.style={draw=ggbAux,line width=0.75pt,dashed},
  ggb highlight/.style={draw=ggbHighlight,line width=1.35pt},
  ggb circle/.style={draw=ggbCircle,line width=0.75pt},
  ggb angle/.style={draw=ggbAngle,line width=0.75pt},
  ggb hidden/.style={draw=none}
}
% Generated from: ${texEscape(title || "GeoGebra construction")}
\\begin{document}
${body}
\\end{document}
`;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  usage();
  process.exit(0);
}
if (!args.spec || !args.audit || !args.output) {
  usage();
  process.exit(1);
}

const spec = readJson(path.resolve(args.spec));
const report = readJson(path.resolve(args.audit));
const body = diagramBody(spec, report);
const output = args.fragment ? `${body}\n` : standalone(body, spec.title);
const outputPath = path.resolve(args.output);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output);
console.log(
  JSON.stringify(
    {
      output: outputPath,
      bytes: fs.statSync(outputPath).size,
      fragment: args.fragment,
    },
    null,
    2,
  ),
);
