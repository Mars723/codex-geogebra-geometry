#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const DEFAULT_CDN_MODULE =
  "https://www.geogebra.org/apps/latest/web3d/web3d.nocache.mjs";

function usage() {
  console.log(`Usage:
  node build_geogebra.mjs --spec construction.json --out-dir output

Options:
  --geogebra-module PATH_OR_URL  Override the GeoGebra web3d module
  --browser PATH                 Override Chrome/Chromium executable
  --online                       Force the official GeoGebra CDN module
  --headed                       Show the browser window
  --keep-temp                    Keep the generated loader HTML
`);
}

function parseArgs(argv) {
  const args = {
    headed: false,
    keepTemp: false,
    online: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--headed") {
      args.headed = true;
    } else if (arg === "--keep-temp") {
      args.keepTemp = true;
    } else if (arg === "--online") {
      args.online = true;
    } else if (arg === "--spec") {
      args.spec = argv[++index];
    } else if (arg === "--out-dir") {
      args.outDir = argv[++index];
    } else if (arg === "--geogebra-module") {
      args.geogebraModule = argv[++index];
    } else if (arg === "--browser") {
      args.browser = argv[++index];
    } else if (!arg.startsWith("-") && !args.spec) {
      args.spec = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read JSON spec ${filePath}: ${error.message}`);
  }
}

function slugify(value) {
  const result = String(value || "geometry")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return result || "geometry";
}

function normalizeSpec(input) {
  if (!input || typeof input !== "object") {
    throw new Error("The construction spec must be a JSON object.");
  }
  if (!Array.isArray(input.commands) || input.commands.length === 0) {
    throw new Error("The construction spec needs a non-empty commands array.");
  }

  const canvas = {
    width: 1100,
    height: 760,
    axes: false,
    grid: false,
    fit: true,
    padding: 0.16,
    pngScale: 2,
    transparent: false,
    dpi: 144,
    ...input.canvas,
  };

  const audit = {
    enabled: true,
    symbolicFilter: true,
    maxSymbolicChecks: 24,
    maxPointsForConcyclic: 11,
    failOnSeverity: "medium",
    thresholds: {
      pointCrowding: 0.035,
      collinear: 0.025,
      parallelDegrees: 2,
      perpendicularDegrees: 2,
      equalLengthRelative: 0.02,
      equalAngleDegrees: 1.5,
      specialAngleDegrees: 1.25,
      concyclicRelative: 0.018,
      concurrentRelative: 0.018,
      ...input.audit?.thresholds,
    },
    ...input.audit,
  };
  audit.thresholds = {
    pointCrowding: 0.035,
    collinear: 0.025,
    parallelDegrees: 2,
    perpendicularDegrees: 2,
    equalLengthRelative: 0.02,
    equalAngleDegrees: 1.5,
    specialAngleDegrees: 1.25,
    concyclicRelative: 0.018,
    concurrentRelative: 0.018,
    ...input.audit?.thresholds,
  };

  return {
    title: input.title || "GeoGebra geometry construction",
    slug: slugify(input.slug || input.title),
    language: input.language || "en",
    appName: input.appName || "classic",
    canvas,
    commands: input.commands,
    postCommands: input.postCommands || [],
    requiredObjects: input.requiredObjects || [],
    roles: input.roles || {},
    styles: input.styles || {},
    entities: {
      points: input.entities?.points || [],
      lines: input.entities?.lines || {},
      segments: input.entities?.segments || {},
      angles: input.entities?.angles || {},
      circles: input.entities?.circles || {},
    },
    relations: input.relations || [],
    checks: input.checks || [],
    layout: {
      trials: 0,
      seed: 1729,
      variables: {},
      constraints: [],
      ...input.layout,
    },
    audit,
    exports: {
      ggb: true,
      png: true,
      svg: true,
      xml: true,
      ...input.exports,
    },
  };
}

function existingExecutable(candidate) {
  if (!candidate) return null;
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return candidate;
  } catch {
    return null;
  }
}

function commandPath(command) {
  const result = spawnSync(process.platform === "win32" ? "where" : "which", [command], {
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  return result.stdout.split(/\r?\n/).find(Boolean) || null;
}

function discoverBrowser(explicit) {
  const candidates = [
    explicit,
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : null,
    process.platform === "darwin"
      ? "/Applications/Chromium.app/Contents/MacOS/Chromium"
      : null,
    process.platform === "darwin"
      ? "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
      : null,
    process.platform === "win32"
      ? path.join(process.env.PROGRAMFILES || "", "Google/Chrome/Application/chrome.exe")
      : null,
    process.platform === "win32"
      ? path.join(
          process.env["PROGRAMFILES(X86)"] || "",
          "Microsoft/Edge/Application/msedge.exe",
        )
      : null,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const candidate of candidates) {
    const found = existingExecutable(candidate);
    if (found) return found;
  }
  for (const command of ["google-chrome", "chromium", "chromium-browser", "msedge"]) {
    const found = commandPath(command);
    if (found) return found;
  }
  return null;
}

function candidatePlaywrightFiles() {
  const files = [];
  const add = (candidate) => {
    if (!candidate) return;
    const resolved = candidate.endsWith(".mjs")
      ? candidate
      : path.join(candidate, "index.mjs");
    if (fs.existsSync(resolved)) files.push(resolved);
  };

  add(process.env.PLAYWRIGHT_PATH);
  add(
    path.join(
      os.homedir(),
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
    ),
  );
  add(path.join(os.homedir(), ".codex/skills/develop-web-game/node_modules/playwright"));

  const runtimesRoot = path.join(os.homedir(), ".cache/codex-runtimes");
  if (fs.existsSync(runtimesRoot)) {
    for (const entry of fs.readdirSync(runtimesRoot)) {
      add(
        path.join(
          runtimesRoot,
          entry,
          "dependencies/node/node_modules/playwright",
        ),
      );
    }
  }
  return [...new Set(files)];
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    for (const file of candidatePlaywrightFiles()) {
      try {
        return await import(pathToFileURL(file).href);
      } catch {
        // Try the next bundled runtime.
      }
    }
  }
  throw new Error(
    "Playwright was not found. Install it locally, set PLAYWRIGHT_PATH, or run inside a Codex workspace with bundled dependencies.",
  );
}

function geogebraModuleCandidates() {
  const candidates = [
    process.env.GEOGEBRA_WEB3D_MODULE,
    "/Applications/GeoGebra Calculator Suite.app/Contents/Resources/app/html/web3d/web3d.nocache.mjs",
    "/Applications/GeoGebra Classic 6.app/Contents/Resources/app/html/web3d/web3d.nocache.mjs",
    "/Applications/GeoGebra Geometry.app/Contents/Resources/app/html/web3d/web3d.nocache.mjs",
    "/usr/share/geogebra/web3d/web3d.nocache.mjs",
    "/opt/geogebra/html/web3d/web3d.nocache.mjs",
  ];

  if (process.platform === "win32") {
    for (const root of [
      process.env.LOCALAPPDATA,
      process.env.PROGRAMFILES,
      process.env["PROGRAMFILES(X86)"],
    ]) {
      if (!root) continue;
      candidates.push(
        path.join(
          root,
          "GeoGebra Calculator Suite/resources/app/html/web3d/web3d.nocache.mjs",
        ),
      );
      candidates.push(
        path.join(
          root,
          "GeoGebra Classic/resources/app/html/web3d/web3d.nocache.mjs",
        ),
      );
    }
  }

  if (process.platform === "darwin" && fs.existsSync("/Applications")) {
    for (const app of fs.readdirSync("/Applications")) {
      if (!/^GeoGebra.*\.app$/i.test(app)) continue;
      candidates.push(
        path.join(
          "/Applications",
          app,
          "Contents/Resources/app/html/web3d/web3d.nocache.mjs",
        ),
      );
    }
  }
  return [...new Set(candidates.filter(Boolean))];
}

function discoverGeoGebraModule(explicit, forceOnline) {
  if (forceOnline) return DEFAULT_CDN_MODULE;
  if (explicit) {
    if (/^https?:\/\//i.test(explicit)) return explicit;
    if (!fs.existsSync(explicit)) {
      throw new Error(`GeoGebra module not found: ${explicit}`);
    }
    return pathToFileURL(path.resolve(explicit)).href;
  }
  for (const candidate of geogebraModuleCandidates()) {
    if (/^https?:\/\//i.test(candidate)) return candidate;
    if (fs.existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  return DEFAULT_CDN_MODULE;
}

function makeLoaderHtml(moduleUrl, spec) {
  const options = {
    appName: spec.appName,
    width: spec.canvas.width,
    height: spec.canvas.height,
    language: spec.language,
    showToolBar: false,
    showMenuBar: false,
    showAlgebraInput: false,
    showResetIcon: false,
    enableRightClick: false,
    enableShiftDragZoom: false,
    showZoomButtons: false,
    errorDialogsActive: false,
    enableCAS: true,
    useBrowserForJS: false,
  };
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GeoGebra generator</title>
  <style>html,body,#applet{width:100%;height:100%;margin:0;overflow:hidden}</style>
</head>
<body>
  <div id="applet"></div>
  <script type="module">
    import { mathApps } from ${JSON.stringify(moduleUrl)};
    const options = ${JSON.stringify(options)};
    const widget = mathApps.create({
      ...options,
      appletOnLoad(api) { window.ggbApi = api; }
    }).inject(document.querySelector("#applet"));
    widget.getAPI().then(api => { window.ggbApi = api; });
  </script>
</body>
</html>`;
}

function severityRank(value) {
  return { none: 0, low: 1, medium: 2, high: 3 }[value] ?? 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  if (!args.spec) {
    usage();
    throw new Error("Missing --spec.");
  }

  const specPath = path.resolve(args.spec);
  const spec = normalizeSpec(readJson(specPath));
  const outDir = path.resolve(
    args.outDir || path.join(path.dirname(specPath), `${spec.slug}-output`),
  );
  fs.mkdirSync(outDir, { recursive: true });

  const moduleUrl = discoverGeoGebraModule(args.geogebraModule, args.online);
  const browserExecutable = discoverBrowser(args.browser);
  const { chromium } = await loadPlaywright();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "geogebra-generator-"));
  const loaderPath = path.join(tempDir, "loader.html");
  fs.writeFileSync(loaderPath, makeLoaderHtml(moduleUrl, spec));

  const consoleErrors = [];
  let browser;
  try {
    const launchOptions = {
      headless: !args.headed,
      args: [
        "--allow-file-access-from-files",
        "--disable-web-security",
        "--use-gl=angle",
        "--use-angle=swiftshader",
      ],
    };
    if (browserExecutable) launchOptions.executablePath = browserExecutable;
    browser = await chromium.launch(launchOptions);
    const page = await browser.newPage({
      viewport: {
        width: spec.canvas.width,
        height: spec.canvas.height,
      },
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push({ type: "console.error", text: message.text() });
      }
    });
    page.on("pageerror", (error) => {
      consoleErrors.push({ type: "pageerror", text: String(error) });
    });

    await page.goto(pathToFileURL(loaderPath).href, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForFunction(
      () =>
        window.ggbApi &&
        typeof window.ggbApi.evalCommand === "function" &&
        typeof window.ggbApi.getBase64 === "function",
      null,
      { timeout: 120_000 },
    );

    const result = await page.evaluate(async (constructionSpec) => {
      const ggb = window.ggbApi;
      const helperObjects = [];
      let helperCounter = 0;
      const sleep = (milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds));
      const nextHelper = (kind = "Tmp") => {
        helperCounter += 1;
        const label = `zzGgbGen${kind}${helperCounter}`;
        helperObjects.push(label);
        return label;
      };
      const cleanHelpers = () => {
        for (const label of [...helperObjects].reverse()) {
          if (ggb.exists(label)) ggb.deleteObject(label);
        }
        helperObjects.length = 0;
      };
      const pointNames = Array.isArray(constructionSpec.entities.points)
        ? constructionSpec.entities.points
        : Object.keys(constructionSpec.entities.points || {});
      const lines = constructionSpec.entities.lines || {};
      const segments = constructionSpec.entities.segments || {};
      const angles = constructionSpec.entities.angles || {};
      const circles = constructionSpec.entities.circles || {};
      const relationKeys = new Set();

      const commandText = (entry) =>
        typeof entry === "string" ? entry : entry.command;
      const point = (name) => ({
        x: ggb.getXcoord(name),
        y: ggb.getYcoord(name),
      });
      const distance = (first, second) => {
        const a = typeof first === "string" ? point(first) : first;
        const b = typeof second === "string" ? point(second) : second;
        return Math.hypot(a.x - b.x, a.y - b.y);
      };
      const cross = (a, b) => a.x * b.y - a.y * b.x;
      const dot = (a, b) => a.x * b.x + a.y * b.y;
      const vector = (from, to) => {
        const a = typeof from === "string" ? point(from) : from;
        const b = typeof to === "string" ? point(to) : to;
        return { x: b.x - a.x, y: b.y - a.y };
      };
      const sortedKey = (type, values) =>
        `${type}:${[...values].sort().join("|")}`;
      const relationKey = (relation) => {
        if (relation.key) return relation.key;
        switch (relation.type) {
          case "collinear":
          case "concyclic":
            return sortedKey(relation.type, relation.points || []);
          case "coincident":
            return sortedKey("coincident", relation.points || []);
          case "parallel":
          case "perpendicular":
          case "concurrent":
            return sortedKey(relation.type, relation.lines || []);
          case "equal_length":
            return sortedKey("equal_length", relation.segments || []);
          case "equal_angle":
            return sortedKey("equal_angle", relation.angles || []);
          default:
            return null;
        }
      };
      for (const relation of constructionSpec.relations) {
        const key = relationKey(relation);
        if (key) {
          relationKeys.add(key);
          relation.__key = key;
        }
      }
      const lineIdsAtPoint = {};
      for (const [id, entity] of Object.entries(lines)) {
        for (const pointName of entity.through || []) {
          lineIdsAtPoint[pointName] ||= [];
          lineIdsAtPoint[pointName].push(id);
        }
      }
      for (const ids of Object.values(lineIdsAtPoint)) {
        for (let i = 0; i < ids.length; i += 1) {
          for (let j = i + 1; j < ids.length; j += 1) {
            for (let k = j + 1; k < ids.length; k += 1) {
              relationKeys.add(sortedKey("concurrent", [ids[i], ids[j], ids[k]]));
            }
          }
        }
      }

      const lineExpression = (id) => {
        const entity = lines[id];
        if (!entity) throw new Error(`Unknown line entity: ${id}`);
        if (entity.expression) return entity.expression;
        if (entity.object) return entity.object;
        if (Array.isArray(entity.through) && entity.through.length === 2) {
          return `Line(${entity.through[0]},${entity.through[1]})`;
        }
        throw new Error(`Line ${id} needs object, expression, or through.`);
      };
      const segmentExpression = (id) => {
        const entity = segments[id];
        if (!entity) throw new Error(`Unknown segment entity: ${id}`);
        if (entity.lengthExpression) return entity.lengthExpression;
        if (entity.object) return entity.object;
        if (Array.isArray(entity.points) && entity.points.length === 2) {
          return `Distance(${entity.points[0]},${entity.points[1]})`;
        }
        throw new Error(`Segment ${id} needs object or points.`);
      };
      const angleExpression = (id) => {
        const entity = angles[id];
        if (!entity) throw new Error(`Unknown angle entity: ${id}`);
        if (entity.expression) return entity.expression;
        if (entity.object) return entity.object;
        if (Array.isArray(entity.points) && entity.points.length === 3) {
          return `Angle(${entity.points.join(",")})`;
        }
        throw new Error(`Angle ${id} needs object, expression, or points.`);
      };
      const circleExpression = (id) => {
        const entity = circles[id];
        if (!entity) throw new Error(`Unknown circle entity: ${id}`);
        if (entity.expression) return entity.expression;
        if (entity.object) return entity.object;
        throw new Error(`Circle ${id} needs object or expression.`);
      };
      const getCircleGeometry = (id) => {
        const centerLabel = nextHelper("CircleCenter");
        const radiusLabel = nextHelper("CircleRadius");
        const expression = circleExpression(id);
        const centerOk = ggb.evalCommand(
          `${centerLabel}=Center(${expression})`,
        );
        const radiusOk = ggb.evalCommand(
          `${radiusLabel}=Radius(${expression})`,
        );
        const radius = radiusOk ? ggb.getValue(radiusLabel) : NaN;
        if (
          !centerOk ||
          !Number.isFinite(radius) ||
          radius <= 0 ||
          !ggb.isDefined(centerLabel)
        ) {
          return null;
        }
        return {
          center: point(centerLabel),
          radius,
        };
      };
      const expressionForRelation = (relation) => {
        if (relation.expression) return relation.expression;
        switch (relation.type) {
          case "collinear":
            return `AreCollinear(${relation.points.join(",")})`;
          case "concyclic":
            return `AreConcyclic(${relation.points.join(",")})`;
          case "coincident":
            return `AreEqual(${relation.points.join(",")})`;
          case "parallel":
            return `AreParallel(${relation.lines.map(lineExpression).join(",")})`;
          case "perpendicular":
            return `ArePerpendicular(${relation.lines
              .map(lineExpression)
              .join(",")})`;
          case "concurrent":
            return `AreConcurrent(${relation.lines.map(lineExpression).join(",")})`;
          case "equal_length":
            return relation.segments
              .map(segmentExpression)
              .join("==");
          case "equal_angle":
            return relation.angles.map(angleExpression).join("==");
          case "tangent":
            return `IsTangent(${lineExpression(relation.line)},${circleExpression(
              relation.circle,
            )})`;
          case "point_on_circle":
            return `Distance(${relation.point},${circleExpression(relation.circle)})==0`;
          default:
            throw new Error(
              `Relation ${relation.id || relation.type} needs an expression.`,
            );
        }
      };

      const getLineVector = (id) => {
        const entity = lines[id];
        if (!entity) return null;
        if (Array.isArray(entity.through) && entity.through.length === 2) {
          return vector(entity.through[0], entity.through[1]);
        }
        const expression = entity.object || entity.expression;
        if (!expression) return null;
        const label = nextHelper("Direction");
        if (!ggb.evalCommand(`${label}=Direction(${expression})`)) return null;
        const result = { x: ggb.getXcoord(label), y: ggb.getYcoord(label) };
        ggb.deleteObject(label);
        return result;
      };
      const getSegmentLength = (id) => {
        const entity = segments[id];
        if (!entity) return NaN;
        if (Array.isArray(entity.points) && entity.points.length === 2) {
          return distance(entity.points[0], entity.points[1]);
        }
        if (entity.object) return ggb.getValue(entity.object);
        return NaN;
      };
      const getAngleDegrees = (id) => {
        const entity = angles[id];
        if (!entity) return NaN;
        if (Array.isArray(entity.points) && entity.points.length === 3) {
          const [first, vertex, third] = entity.points;
          const u = vector(vertex, first);
          const v = vector(vertex, third);
          const denominator = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
          if (!denominator) return NaN;
          const cosine = Math.max(-1, Math.min(1, dot(u, v) / denominator));
          return (Math.acos(cosine) * 180) / Math.PI;
        }
        const expression = entity.object || entity.expression;
        if (!expression) return NaN;
        const label = nextHelper("Angle");
        if (!ggb.evalCommand(`${label}=${expression}`)) return NaN;
        const radians = ggb.getValue(label);
        ggb.deleteObject(label);
        return (radians * 180) / Math.PI;
      };
      const pointCoordinates = () =>
        pointNames
          .filter((name) => ggb.exists(name) && ggb.isDefined(name))
          .map((name) => ({ name, ...point(name) }));
      const geometryScale = () => {
        const lengths = Object.keys(segments)
          .map(getSegmentLength)
          .filter((value) => Number.isFinite(value) && value > 1e-9)
          .sort((a, b) => a - b);
        if (lengths.length) return lengths[Math.floor(lengths.length / 2)];
        const points = pointCoordinates();
        if (points.length < 2) return 1;
        const xs = points.map(({ x }) => x);
        const ys = points.map(({ y }) => y);
        return Math.max(
          Math.max(...xs) - Math.min(...xs),
          Math.max(...ys) - Math.min(...ys),
          1,
        );
      };

      const relationIssue = ({
        type,
        key,
        metric,
        threshold,
        severity,
        description,
        expression,
        details = {},
      }) => ({
        type,
        key,
        metric,
        threshold,
        severity,
        description,
        expression,
        allowed: relationKeys.has(key),
        details,
      });

      const numericAudit = () => {
        const thresholds = constructionSpec.audit.thresholds;
        const points = pointCoordinates();
        const scale = geometryScale();
        const issues = [];
        const lineIds = Object.keys(lines);
        const segmentIds = Object.keys(segments);
        const angleIds = Object.keys(angles);
        const specialAngles =
          constructionSpec.audit.specialAngles || [30, 45, 60, 90, 120, 135, 150];

        for (let i = 0; i < points.length; i += 1) {
          for (let j = i + 1; j < points.length; j += 1) {
            const relative = distance(points[i], points[j]) / scale;
            if (relative < thresholds.pointCrowding) {
              const names = [points[i].name, points[j].name];
              issues.push(
                relationIssue({
                  type: "point_crowding",
                  key: sortedKey("coincident", names),
                  metric: relative,
                  threshold: thresholds.pointCrowding,
                  severity:
                    relative < thresholds.pointCrowding * 0.35 ? "high" : "medium",
                  description: `${names.join(", ")} are visually crowded or coincident.`,
                  expression: `AreEqual(${names.join(",")})`,
                  details: { points: names },
                }),
              );
            }
          }
        }

        for (let i = 0; i < points.length; i += 1) {
          for (let j = i + 1; j < points.length; j += 1) {
            for (let k = j + 1; k < points.length; k += 1) {
              const a = points[i];
              const b = points[j];
              const c = points[k];
              const ab = vector(a, b);
              const ac = vector(a, c);
              const span = Math.max(distance(a, b), distance(a, c), distance(b, c));
              if (span < 1e-9) continue;
              const normalizedArea = Math.abs(cross(ab, ac)) / (span * span);
              if (normalizedArea < thresholds.collinear) {
                const names = [a.name, b.name, c.name];
                issues.push(
                  relationIssue({
                    type: "collinear",
                    key: sortedKey("collinear", names),
                    metric: normalizedArea,
                    threshold: thresholds.collinear,
                    severity:
                      normalizedArea < thresholds.collinear * 0.25
                        ? "high"
                        : "medium",
                    description: `${names.join(", ")} look collinear.`,
                    expression: `AreCollinear(${names.join(",")})`,
                    details: { points: names },
                  }),
                );
              }
            }
          }
        }

        for (let i = 0; i < lineIds.length; i += 1) {
          const first = getLineVector(lineIds[i]);
          if (!first) continue;
          const firstLength = Math.hypot(first.x, first.y);
          if (!firstLength) continue;
          for (let j = i + 1; j < lineIds.length; j += 1) {
            const second = getLineVector(lineIds[j]);
            if (!second) continue;
            const secondLength = Math.hypot(second.x, second.y);
            if (!secondLength) continue;
            const sine = Math.abs(cross(first, second)) / (firstLength * secondLength);
            const cosine = Math.abs(dot(first, second)) / (firstLength * secondLength);
            const parallelLimit =
              Math.sin((thresholds.parallelDegrees * Math.PI) / 180);
            const perpendicularLimit =
              Math.sin((thresholds.perpendicularDegrees * Math.PI) / 180);
            const ids = [lineIds[i], lineIds[j]];
            if (sine < parallelLimit) {
              issues.push(
                relationIssue({
                  type: "parallel",
                  key: sortedKey("parallel", ids),
                  metric: sine,
                  threshold: parallelLimit,
                  severity: sine < parallelLimit * 0.25 ? "high" : "medium",
                  description: `${ids.join(" and ")} look parallel.`,
                  expression: `AreParallel(${ids.map(lineExpression).join(",")})`,
                  details: { lines: ids },
                }),
              );
            }
            if (cosine < perpendicularLimit) {
              issues.push(
                relationIssue({
                  type: "perpendicular",
                  key: sortedKey("perpendicular", ids),
                  metric: cosine,
                  threshold: perpendicularLimit,
                  severity: cosine < perpendicularLimit * 0.25 ? "high" : "medium",
                  description: `${ids.join(" and ")} look perpendicular.`,
                  expression: `ArePerpendicular(${ids
                    .map(lineExpression)
                    .join(",")})`,
                  details: { lines: ids },
                }),
              );
            }
          }
        }

        for (let i = 0; i < segmentIds.length; i += 1) {
          const first = getSegmentLength(segmentIds[i]);
          if (!Number.isFinite(first) || first < 1e-9) continue;
          for (let j = i + 1; j < segmentIds.length; j += 1) {
            const second = getSegmentLength(segmentIds[j]);
            if (!Number.isFinite(second) || second < 1e-9) continue;
            const relative = Math.abs(first - second) / Math.max(first, second);
            if (relative < thresholds.equalLengthRelative) {
              const ids = [segmentIds[i], segmentIds[j]];
              issues.push(
                relationIssue({
                  type: "equal_length",
                  key: sortedKey("equal_length", ids),
                  metric: relative,
                  threshold: thresholds.equalLengthRelative,
                  severity: "low",
                  description: `${ids.join(" and ")} look equal in length.`,
                  expression: `${ids.map(segmentExpression).join("==")}`,
                  details: { segments: ids, lengths: [first, second] },
                }),
              );
            }
          }
        }

        const angleValues = Object.fromEntries(
          angleIds.map((id) => [id, getAngleDegrees(id)]),
        );
        for (let i = 0; i < angleIds.length; i += 1) {
          const first = angleValues[angleIds[i]];
          if (!Number.isFinite(first)) continue;
          for (const special of specialAngles) {
            const difference = Math.abs(first - special);
            const key = `special_angle:${angleIds[i]}:${special}`;
            if (
              difference < thresholds.specialAngleDegrees &&
              !(constructionSpec.audit.allowSpecialAngles || []).includes(key)
            ) {
              issues.push({
                type: "special_angle",
                key,
                metric: difference,
                threshold: thresholds.specialAngleDegrees,
                severity: special === 90 ? "medium" : "low",
                description: `${angleIds[i]} looks like the special angle ${special}°.`,
                expression: null,
                allowed: false,
                details: { angle: angleIds[i], value: first, special },
              });
            }
          }
          for (let j = i + 1; j < angleIds.length; j += 1) {
            const second = angleValues[angleIds[j]];
            if (!Number.isFinite(second)) continue;
            const difference = Math.abs(first - second);
            if (difference < thresholds.equalAngleDegrees) {
              const ids = [angleIds[i], angleIds[j]];
              issues.push(
                relationIssue({
                  type: "equal_angle",
                  key: sortedKey("equal_angle", ids),
                  metric: difference,
                  threshold: thresholds.equalAngleDegrees,
                  severity: "low",
                  description: `${ids.join(" and ")} look equal.`,
                  expression: `${ids.map(angleExpression).join("==")}`,
                  details: { angles: ids, values: [first, second] },
                }),
              );
            }
          }
        }

        if (
          points.length >= 4 &&
          points.length <= constructionSpec.audit.maxPointsForConcyclic
        ) {
          const circumcircleResidual = (a, b, c, d) => {
            const determinant =
              2 *
              (a.x * (b.y - c.y) +
                b.x * (c.y - a.y) +
                c.x * (a.y - b.y));
            if (Math.abs(determinant) < 1e-10) return Infinity;
            const a2 = a.x * a.x + a.y * a.y;
            const b2 = b.x * b.x + b.y * b.y;
            const c2 = c.x * c.x + c.y * c.y;
            const ux =
              (a2 * (b.y - c.y) +
                b2 * (c.y - a.y) +
                c2 * (a.y - b.y)) /
              determinant;
            const uy =
              (a2 * (c.x - b.x) +
                b2 * (a.x - c.x) +
                c2 * (b.x - a.x)) /
              determinant;
            const radius = Math.hypot(a.x - ux, a.y - uy);
            if (radius < 1e-9) return Infinity;
            return Math.abs(Math.hypot(d.x - ux, d.y - uy) - radius) / radius;
          };
          for (let i = 0; i < points.length; i += 1) {
            for (let j = i + 1; j < points.length; j += 1) {
              for (let k = j + 1; k < points.length; k += 1) {
                for (let l = k + 1; l < points.length; l += 1) {
                  const residual = circumcircleResidual(
                    points[i],
                    points[j],
                    points[k],
                    points[l],
                  );
                  if (residual < thresholds.concyclicRelative) {
                    const names = [
                      points[i].name,
                      points[j].name,
                      points[k].name,
                      points[l].name,
                    ];
                    issues.push(
                      relationIssue({
                        type: "concyclic",
                        key: sortedKey("concyclic", names),
                        metric: residual,
                        threshold: thresholds.concyclicRelative,
                        severity: "medium",
                        description: `${names.join(", ")} look concyclic.`,
                        expression: `AreConcyclic(${names.join(",")})`,
                        details: { points: names },
                      }),
                    );
                  }
                }
              }
            }
          }
        }

        const throughLine = (id) => {
          const entity = lines[id];
          if (!entity?.through || entity.through.length !== 2) return null;
          const anchor = point(entity.through[0]);
          const direction = vector(entity.through[0], entity.through[1]);
          return { anchor, direction };
        };
        const intersectLines = (first, second) => {
          const denominator = cross(first.direction, second.direction);
          if (Math.abs(denominator) < 1e-10) return null;
          const delta = {
            x: second.anchor.x - first.anchor.x,
            y: second.anchor.y - first.anchor.y,
          };
          const parameter = cross(delta, second.direction) / denominator;
          return {
            x: first.anchor.x + parameter * first.direction.x,
            y: first.anchor.y + parameter * first.direction.y,
          };
        };
        const pointLineDistance = (candidate, line) =>
          Math.abs(
            cross(
              {
                x: candidate.x - line.anchor.x,
                y: candidate.y - line.anchor.y,
              },
              line.direction,
            ),
          ) / Math.hypot(line.direction.x, line.direction.y);

        for (let i = 0; i < lineIds.length; i += 1) {
          const first = throughLine(lineIds[i]);
          if (!first) continue;
          for (let j = i + 1; j < lineIds.length; j += 1) {
            const second = throughLine(lineIds[j]);
            if (!second) continue;
            const intersection = intersectLines(first, second);
            if (!intersection) continue;
            for (let k = j + 1; k < lineIds.length; k += 1) {
              const third = throughLine(lineIds[k]);
              if (!third) continue;
              const relative = pointLineDistance(intersection, third) / scale;
              if (relative < thresholds.concurrentRelative) {
                const ids = [lineIds[i], lineIds[j], lineIds[k]];
                issues.push(
                  relationIssue({
                    type: "concurrent",
                    key: sortedKey("concurrent", ids),
                    metric: relative,
                    threshold: thresholds.concurrentRelative,
                    severity: "medium",
                    description: `${ids.join(", ")} look concurrent.`,
                    expression: `AreConcurrent(${ids
                      .map(lineExpression)
                      .join(",")})`,
                    details: { lines: ids },
                  }),
                );
              }
            }
          }
        }

        const deduplicated = new Map();
        for (const issue of issues) {
          const existing = deduplicated.get(issue.key);
          if (!existing || issue.metric < existing.metric) {
            deduplicated.set(issue.key, issue);
          }
        }
        return {
          scale,
          issues: [...deduplicated.values()],
          pointCoordinates: points,
          segmentLengths: Object.fromEntries(
            segmentIds.map((id) => [id, getSegmentLength(id)]),
          ),
          angleDegrees: angleValues,
        };
      };

      const checkLayoutConstraint = (constraint) => {
        switch (constraint.type) {
          case "orientation": {
            const [a, b, c] = constraint.points;
            const signedArea = cross(vector(a, b), vector(a, c));
            const sign = constraint.sign === "negative" || constraint.sign === -1 ? -1 : 1;
            return sign * signedArea > (constraint.minimum || 1e-5);
          }
          case "length_order": {
            const values = constraint.segments.map(getSegmentLength);
            const margin = constraint.margin || 1e-5;
            for (let index = 0; index < values.length - 1; index += 1) {
              if (constraint.order === "ascending") {
                if (!(values[index + 1] - values[index] > margin)) return false;
              } else if (!(values[index] - values[index + 1] > margin)) {
                return false;
              }
            }
            return true;
          }
          case "angle_order": {
            const values = constraint.angles.map(getAngleDegrees);
            const margin = constraint.marginDegrees || 0.2;
            for (let index = 0; index < values.length - 1; index += 1) {
              if (constraint.order === "ascending") {
                if (!(values[index + 1] - values[index] > margin)) return false;
              } else if (!(values[index] - values[index + 1] > margin)) {
                return false;
              }
            }
            return true;
          }
          case "angle_range": {
            const value = getAngleDegrees(constraint.angle);
            return value >= constraint.min && value <= constraint.max;
          }
          case "point_distance": {
            const value = distance(constraint.points[0], constraint.points[1]);
            return value >= (constraint.min || 0) && value <= (constraint.max || Infinity);
          }
          default:
            return true;
        }
      };

      const scoreAudit = (audit) => {
        const weights = { high: 100, medium: 20, low: 4 };
        let score = 0;
        for (const issue of audit.issues) {
          if (issue.allowed) continue;
          const closeness =
            Number.isFinite(issue.metric) && issue.threshold
              ? Math.max(0, 1 - issue.metric / issue.threshold)
              : 0;
          score += (weights[issue.severity] || 1) * (1 + closeness);
        }
        return score;
      };

      const makeRng = (seedValue) => {
        let state = (Number(seedValue) || 1729) >>> 0;
        return () => {
          state += 0x6d2b79f5;
          let value = state;
          value = Math.imul(value ^ (value >>> 15), value | 1);
          value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
          return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
        };
      };

      const optimizeLayout = () => {
        const layout = constructionSpec.layout;
        const variableEntries = Object.entries(layout.variables || {});
        if (!layout.trials || !variableEntries.length) {
          return {
            enabled: false,
            trials: 0,
            initialScore: null,
            bestScore: null,
            coordinates: {},
          };
        }
        const rng = makeRng(layout.seed);
        const original = Object.fromEntries(
          variableEntries.map(([name]) => [name, point(name)]),
        );
        const candidates = [
          Object.fromEntries(
            variableEntries.map(([name]) => [name, { ...original[name] }]),
          ),
        ];
        for (let trial = 1; trial < layout.trials; trial += 1) {
          const candidate = {};
          for (const [name, range] of variableEntries) {
            const xRange = range.x || [
              original[name].x - (range.jitterX || 0),
              original[name].x + (range.jitterX || 0),
            ];
            const yRange = range.y || [
              original[name].y - (range.jitterY || 0),
              original[name].y + (range.jitterY || 0),
            ];
            candidate[name] = {
              x: xRange[0] + rng() * (xRange[1] - xRange[0]),
              y: yRange[0] + rng() * (yRange[1] - yRange[0]),
            };
          }
          candidates.push(candidate);
        }

        let best = null;
        let initialScore = null;
        let feasibleTrials = 0;
        for (let index = 0; index < candidates.length; index += 1) {
          for (const [name, coordinates] of Object.entries(candidates[index])) {
            ggb.setCoords(name, coordinates.x, coordinates.y);
          }
          const constraintsOk = (layout.constraints || []).every(checkLayoutConstraint);
          if (!constraintsOk) continue;
          if (
            constructionSpec.requiredObjects.some(
              (name) => !ggb.exists(name) || !ggb.isDefined(name),
            )
          ) {
            continue;
          }
          feasibleTrials += 1;
          const audit = numericAudit();
          const score = scoreAudit(audit);
          if (index === 0) initialScore = score;
          if (!best || score < best.score) {
            best = {
              score,
              coordinates: JSON.parse(JSON.stringify(candidates[index])),
            };
          }
        }
        const chosen = best?.coordinates || original;
        for (const [name, coordinates] of Object.entries(chosen)) {
          ggb.setCoords(name, coordinates.x, coordinates.y);
        }
        return {
          enabled: true,
          trials: candidates.length,
          feasibleTrials,
          initialScore,
          bestScore: best?.score ?? null,
          coordinates: chosen,
        };
      };

      const ROLE_STYLES = {
        vertex: {
          color: "#234E7A",
          pointSize: 5,
          pointStyle: 0,
          labelVisible: true,
        },
        point: {
          color: "#497AA6",
          pointSize: 4,
          pointStyle: 0,
          labelVisible: true,
        },
        side: {
          color: "#444A50",
          lineThickness: 5,
          lineStyle: 0,
          labelVisible: false,
        },
        auxiliary: {
          color: "#9299A0",
          lineThickness: 3,
          lineStyle: 1,
          labelVisible: false,
        },
        highlight: {
          color: "#C45A4A",
          lineThickness: 6,
          lineStyle: 0,
          labelVisible: false,
        },
        circle: {
          color: "#657786",
          lineThickness: 3,
          lineStyle: 0,
          labelVisible: false,
        },
        angle: {
          color: "#B3832F",
          lineThickness: 3,
          labelVisible: false,
        },
        hidden: {
          visible: false,
          labelVisible: false,
        },
      };
      const colorComponents = (color) => {
        const match = /^#?([0-9a-f]{6})$/i.exec(color || "");
        if (!match) return null;
        return [
          Number.parseInt(match[1].slice(0, 2), 16),
          Number.parseInt(match[1].slice(2, 4), 16),
          Number.parseInt(match[1].slice(4, 6), 16),
        ];
      };
      const applyStyle = (name, style) => {
        if (!ggb.exists(name)) return;
        const color = colorComponents(style.color);
        if (color) ggb.setColor(name, ...color);
        if (style.visible !== undefined) ggb.setVisible(name, Boolean(style.visible));
        if (style.labelVisible !== undefined) {
          ggb.setLabelVisible(name, Boolean(style.labelVisible));
        }
        if (style.labelStyle !== undefined) ggb.setLabelStyle(name, style.labelStyle);
        if (style.caption !== undefined) ggb.setCaption(name, style.caption);
        if (style.pointSize !== undefined) ggb.setPointSize(name, style.pointSize);
        if (style.pointStyle !== undefined) ggb.setPointStyle(name, style.pointStyle);
        if (style.lineThickness !== undefined) {
          ggb.setLineThickness(name, style.lineThickness);
        }
        if (style.lineStyle !== undefined) ggb.setLineStyle(name, style.lineStyle);
        if (style.filling !== undefined) ggb.setFilling(name, style.filling);
        if (style.layer !== undefined) ggb.setLayer(name, style.layer);
        if (style.fixed !== undefined) {
          ggb.setFixed(name, Boolean(style.fixed), style.selectionAllowed !== false);
        }
        if (style.auxiliary !== undefined) {
          ggb.setAuxiliary(name, Boolean(style.auxiliary));
        }
        if (style.decoration !== undefined) {
          ggb.evalCommand(`SetDecoration(${name},${style.decoration})`);
        }
      };

      const fitView = () => {
        const canvas = constructionSpec.canvas;
        if (Array.isArray(canvas.bounds) && canvas.bounds.length === 4) {
          ggb.setCoordSystem(...canvas.bounds);
          return canvas.bounds;
        }
        const points = pointCoordinates();
        const extentPoints = [...points];
        for (const [id, entity] of Object.entries(circles)) {
          if (
            entity.object &&
            ggb.exists(entity.object) &&
            !ggb.getVisible(entity.object)
          ) {
            continue;
          }
          const geometry = getCircleGeometry(id);
          if (geometry) {
            const { center, radius } = geometry;
            extentPoints.push(
              { x: center.x - radius, y: center.y - radius },
              { x: center.x + radius, y: center.y + radius },
            );
          }
        }
        if (!extentPoints.length) {
          ggb.showAllObjects();
          return null;
        }
        let xmin = Math.min(...extentPoints.map(({ x }) => x));
        let xmax = Math.max(...extentPoints.map(({ x }) => x));
        let ymin = Math.min(...extentPoints.map(({ y }) => y));
        let ymax = Math.max(...extentPoints.map(({ y }) => y));
        let width = Math.max(xmax - xmin, 1);
        let height = Math.max(ymax - ymin, 1);
        const padding = canvas.padding ?? 0.16;
        xmin -= width * padding;
        xmax += width * padding;
        ymin -= height * padding;
        ymax += height * padding;
        width = xmax - xmin;
        height = ymax - ymin;
        const targetRatio = canvas.width / canvas.height;
        const currentRatio = width / height;
        if (currentRatio < targetRatio) {
          const targetWidth = height * targetRatio;
          const extra = (targetWidth - width) / 2;
          xmin -= extra;
          xmax += extra;
        } else {
          const targetHeight = width / targetRatio;
          const extra = (targetHeight - height) / 2;
          ymin -= extra;
          ymax += extra;
        }
        const bounds = [xmin, xmax, ymin, ymax];
        ggb.setCoordSystem(...bounds);
        return bounds;
      };

      const waitForCas = async () => {
        const label = nextHelper("CasReady");
        ggb.evalCommand(`${label}=CASLoaded()`);
        const deadline = Date.now() + 45_000;
        while (ggb.getValue(label) !== 1 && Date.now() < deadline) {
          await sleep(100);
        }
        return ggb.getValue(label) === 1;
      };

      const parseProof = (value, defined) => {
        if (!defined || value.includes("?")) return "unresolved";
        if (value.includes("{true")) return "true";
        if (value.includes("{false")) return "false";
        if (value.includes("{}")) return "unresolved";
        return "unresolved";
      };

      const evaluateStatement = async ({
        id,
        expression,
        expected = true,
        verify = "numeric",
        status = "check",
      }) => {
        const checkLabel = nextHelper("Check");
        const checkCommand = `${checkLabel}=${expression}`;
        const commandOk = ggb.evalCommand(checkCommand);
        const defined = commandOk && ggb.isDefined(checkLabel);
        const numeric = defined ? ggb.getValue(checkLabel) === 1 : null;
        let proof = null;
        let proofValue = null;
        if (verify === "symbolic") {
          const proofLabel = nextHelper("Proof");
          const proofOk = ggb.evalCommand(
            `${proofLabel}=ProveDetails(${expression})`,
          );
          const deadline = Date.now() + 45_000;
          while (
            proofOk &&
            !ggb.isDefined(proofLabel) &&
            Date.now() < deadline
          ) {
            await sleep(100);
          }
          proofValue = proofOk
            ? ggb.getValueString(proofLabel, false)
            : `${proofLabel} = ?`;
          proof = parseProof(proofValue, proofOk && ggb.isDefined(proofLabel));
        }
        const passedNumeric = numeric === Boolean(expected);
        const passedSymbolic =
          verify !== "symbolic" ||
          (expected ? proof === "true" : proof === "false");
        return {
          id,
          status,
          expression,
          expected: Boolean(expected),
          verify,
          commandOk,
          defined,
          numeric,
          proof,
          proofValue,
          passed: passedNumeric && passedSymbolic,
        };
      };

      ggb.setErrorDialogsActive(false);
      ggb.newConstruction();
      ggb.setAxesVisible(
        Boolean(constructionSpec.canvas.axes),
        Boolean(constructionSpec.canvas.axes),
      );
      ggb.setGridVisible(Boolean(constructionSpec.canvas.grid));

      const commandResults = [];
      for (const entry of constructionSpec.commands) {
        const command = commandText(entry);
        if (!command) {
          commandResults.push({
            command: null,
            ok: false,
            error: "Missing command text.",
          });
          continue;
        }
        const before = new Set(ggb.getAllObjectNames());
        const ok = ggb.evalCommand(command);
        const created = ggb
          .getAllObjectNames()
          .filter((name) => !before.has(name));
        commandResults.push({
          command,
          ok,
          created,
          defined: created.filter((name) => ggb.isDefined(name)),
          undefined: created.filter((name) => !ggb.isDefined(name)),
        });
      }

      const requiredObjects = [
        ...new Set([
          ...constructionSpec.requiredObjects,
          ...pointNames,
          ...Object.values(lines).map((entity) => entity.object).filter(Boolean),
          ...Object.values(segments)
            .map((entity) => entity.object)
            .filter(Boolean),
          ...Object.values(angles).map((entity) => entity.object).filter(Boolean),
          ...Object.values(circles).map((entity) => entity.object).filter(Boolean),
        ]),
      ];
      const missingObjects = requiredObjects.filter((name) => !ggb.exists(name));
      const undefinedObjects = requiredObjects.filter(
        (name) => ggb.exists(name) && !ggb.isDefined(name),
      );

      const layoutResult = optimizeLayout();

      for (const [name, role] of Object.entries(constructionSpec.roles)) {
        applyStyle(name, ROLE_STYLES[role] || {});
      }
      for (const [name, style] of Object.entries(constructionSpec.styles)) {
        const roleStyle = ROLE_STYLES[constructionSpec.roles[name]] || {};
        applyStyle(name, { ...roleStyle, ...style });
      }
      for (const command of constructionSpec.postCommands) {
        commandResults.push({
          command: commandText(command),
          ok: ggb.evalCommand(commandText(command)),
          created: [],
          defined: [],
          undefined: [],
          postCommand: true,
        });
      }

      const needsCas =
        constructionSpec.relations.some(
          (relation) =>
            relation.verify === "symbolic" ||
            (relation.verify === undefined && relation.status === "conclusion"),
        ) ||
        constructionSpec.checks.some((check) => check.verify === "symbolic") ||
        constructionSpec.audit.symbolicFilter;
      const casReady = needsCas ? await waitForCas() : null;
      const checks = [];
      for (let index = 0; index < constructionSpec.relations.length; index += 1) {
        const relation = constructionSpec.relations[index];
        if (relation.verify === "none") continue;
        const verify =
          relation.verify ||
          (relation.status === "conclusion" ? "symbolic" : "numeric");
        checks.push(
          await evaluateStatement({
            id: relation.id || `relation-${index + 1}`,
            expression: expressionForRelation(relation),
            expected: relation.expected !== false,
            verify,
            status: relation.status || "relation",
          }),
        );
      }
      for (let index = 0; index < constructionSpec.checks.length; index += 1) {
        const check = constructionSpec.checks[index];
        checks.push(
          await evaluateStatement({
            id: check.id || `check-${index + 1}`,
            expression: check.expression,
            expected: check.expected !== false,
            verify: check.verify || "numeric",
            status: check.status || "check",
          }),
        );
      }

      const audit = constructionSpec.audit.enabled
        ? numericAudit()
        : { scale: null, issues: [] };
      const auditProofs = [];
      if (constructionSpec.audit.enabled && constructionSpec.audit.symbolicFilter) {
        const candidates = audit.issues
          .filter((issue) => !issue.allowed && issue.expression)
          .slice(0, constructionSpec.audit.maxSymbolicChecks);
        for (let index = 0; index < candidates.length; index += 1) {
          const issue = candidates[index];
          const result = await evaluateStatement({
            id: `audit-${index + 1}`,
            expression: issue.expression,
            expected: true,
            verify: "symbolic",
            status: "audit",
          });
          issue.symbolic = result.proof;
          issue.proofValue = result.proofValue;
          issue.classification =
            result.proof === "true" ? "structural" : result.proof === "false"
              ? "accidental"
              : "unresolved";
          auditProofs.push(result);
        }
      }
      for (const issue of audit.issues) {
        if (issue.allowed) issue.classification = "allowed";
        else if (!issue.classification) issue.classification = "unresolved";
      }

      ggb.evalCommand('SetPerspective("G")');
      const circleGeometries = Object.fromEntries(
        Object.keys(circles)
          .map((id) => [id, getCircleGeometry(id)])
          .filter(([, geometry]) => geometry),
      );
      const bounds = fitView();
      await sleep(250);
      cleanHelpers();
      await sleep(100);

      const finalObjects = ggb.getAllObjectNames().map((name) => ({
        name,
        type: ggb.getObjectType(name),
        defined: ggb.isDefined(name),
        visible: ggb.getVisible(name),
        command: ggb.getCommandString(name, false),
        value: ggb.getValueString(name, false),
        x: ggb.getObjectType(name) === "point" ? ggb.getXcoord(name) : undefined,
        y: ggb.getObjectType(name) === "point" ? ggb.getYcoord(name) : undefined,
      }));
      const objectNamesBeforeExport = finalObjects.map(({ name }) => name);
      const base64 = await new Promise((resolve) => ggb.getBase64(resolve));
      const svg = constructionSpec.exports.svg
        ? await new Promise((resolve) => ggb.exportSVG(resolve))
        : null;
      const pngBase64 = constructionSpec.exports.png
        ? ggb.getPNGBase64(
            constructionSpec.canvas.pngScale,
            Boolean(constructionSpec.canvas.transparent),
            constructionSpec.canvas.dpi,
          )
        : null;
      const xml = constructionSpec.exports.xml ? ggb.getXML() : null;

      const zipSignature = atob(base64.slice(0, 8)).startsWith("PK");
      const roundtrip = await new Promise((resolve) => {
        ggb.setBase64(base64, async () => {
          await sleep(150);
          const names = ggb.getAllObjectNames();
          const missing = objectNamesBeforeExport.filter(
            (name) => !names.includes(name),
          );
          const undefinedAfterLoad = objectNamesBeforeExport.filter(
            (name) => ggb.exists(name) && !ggb.isDefined(name),
          );
          resolve({
            loaded: true,
            objectCount: names.length,
            missing,
            undefined: undefinedAfterLoad,
          });
        });
      });

      return {
        version: ggb.getVersion(),
        commandResults,
        missingObjects,
        undefinedObjects,
        casReady,
        layout: layoutResult,
        checks,
        audit: {
          ...audit,
          proofs: auditProofs,
        },
        geometry: {
          circles: circleGeometries,
        },
        bounds,
        finalObjects,
        base64,
        svg,
        pngBase64,
        xml,
        zipSignature,
        roundtrip,
      };
    }, spec);

    const stem = spec.slug;
    const outputPaths = {};
    if (spec.exports.ggb) {
      outputPaths.ggb = path.join(outDir, `${stem}.ggb`);
      fs.writeFileSync(outputPaths.ggb, Buffer.from(result.base64, "base64"));
    }
    if (spec.exports.png && result.pngBase64) {
      outputPaths.png = path.join(outDir, `${stem}.png`);
      fs.writeFileSync(outputPaths.png, Buffer.from(result.pngBase64, "base64"));
    }
    if (spec.exports.svg && result.svg) {
      outputPaths.svg = path.join(outDir, `${stem}.svg`);
      fs.writeFileSync(outputPaths.svg, result.svg);
    }
    if (spec.exports.xml && result.xml) {
      outputPaths.xml = path.join(outDir, `${stem}.geogebra.xml`);
      fs.writeFileSync(outputPaths.xml, result.xml);
    }
    outputPaths.spec = path.join(outDir, `${stem}.spec.json`);
    fs.writeFileSync(outputPaths.spec, JSON.stringify(spec, null, 2));

    const accidentalIssues = result.audit.issues.filter(
      (issue) =>
        !issue.allowed &&
        issue.classification !== "structural" &&
        issue.classification !== "allowed",
    );
    const failedChecks = result.checks.filter((check) => !check.passed);
    const failThreshold = severityRank(spec.audit.failOnSeverity);
    const severeAuditIssues = accidentalIssues.filter(
      (issue) => severityRank(issue.severity) >= failThreshold,
    );
    const successful =
      result.commandResults.every(({ ok }) => ok) &&
      result.missingObjects.length === 0 &&
      result.undefinedObjects.length === 0 &&
      failedChecks.length === 0 &&
      result.zipSignature &&
      result.roundtrip.loaded &&
      result.roundtrip.missing.length === 0 &&
      result.roundtrip.undefined.length === 0 &&
      severeAuditIssues.length === 0 &&
      consoleErrors.length === 0;

    const report = {
      successful,
      title: spec.title,
      engine: {
        version: result.version,
        module: moduleUrl,
        browser: browserExecutable || "playwright-managed",
        casReady: result.casReady,
      },
      outputs: Object.fromEntries(
        Object.entries(outputPaths).map(([name, file]) => [
          name,
          {
            path: file,
            bytes: fs.statSync(file).size,
          },
        ]),
      ),
      commands: result.commandResults,
      missingObjects: result.missingObjects,
      undefinedObjects: result.undefinedObjects,
      layout: result.layout,
      checks: result.checks,
      failedChecks,
      audit: {
        scale: result.audit.scale,
        thresholds: spec.audit.thresholds,
        issues: result.audit.issues,
        accidentalIssues,
        severeIssues: severeAuditIssues,
        pointCoordinates: result.audit.pointCoordinates,
        segmentLengths: result.audit.segmentLengths,
        angleDegrees: result.audit.angleDegrees,
      },
      geometry: result.geometry,
      viewBounds: result.bounds,
      roundtrip: {
        zipSignature: result.zipSignature,
        ...result.roundtrip,
      },
      finalObjects: result.finalObjects,
      consoleErrors,
    };
    outputPaths.report = path.join(outDir, `${stem}.audit.json`);
    fs.writeFileSync(outputPaths.report, JSON.stringify(report, null, 2));

    console.log(
      JSON.stringify(
        {
          successful,
          title: spec.title,
          outputs: outputPaths,
          failedChecks: failedChecks.map(({ id }) => id),
          accidentalIssues: accidentalIssues.map(
            ({ type, description, severity, classification }) => ({
              type,
              description,
              severity,
              classification,
            }),
          ),
          roundtrip: report.roundtrip,
          consoleErrors,
        },
        null,
        2,
      ),
    );
    if (!successful) process.exitCode = 2;
  } finally {
    if (browser) await browser.close();
    if (!args.keepTemp) fs.rmSync(tempDir, { recursive: true, force: true });
    else console.error(`Kept loader at ${loaderPath}`);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
