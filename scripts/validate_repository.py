#!/usr/bin/env python3

import json
import re
import sys
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "plugins" / "geogebra-geometry"
MANIFEST = PLUGIN / ".codex-plugin" / "plugin.json"
MARKETPLACE = ROOT / ".agents" / "plugins" / "marketplace.json"
SKILL = PLUGIN / "skills" / "generate-geogebra-geometry" / "SKILL.md"
SPEC_TEMPLATE = (
    PLUGIN
    / "skills"
    / "generate-geogebra-geometry"
    / "assets"
    / "spec-template.json"
)
EXAMPLE_GGB_FILES = (
    ROOT / "examples" / "triangle-midline" / "triangle-midline.ggb",
    ROOT / "examples" / "imo-2026-problem-2" / "imo-2026-problem-2.ggb",
)
IMO_AUDIT = (
    ROOT
    / "examples"
    / "imo-2026-problem-2"
    / "imo-2026-problem-2.audit.json"
)
IMO_VISIBLE_AUDIT = (
    ROOT / "examples" / "imo-2026-problem-2" / "visible-segment-audit.json"
)

errors = []


def load_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        errors.append(f"{path.relative_to(ROOT)}: {error}")
        return {}


manifest = load_json(MANIFEST)
marketplace = load_json(MARKETPLACE)
spec_template = load_json(SPEC_TEMPLATE)
imo_audit = load_json(IMO_AUDIT)
imo_visible_audit = load_json(IMO_VISIBLE_AUDIT)

for field in ("name", "version", "description", "author", "skills", "interface"):
    if field not in manifest:
        errors.append(f"plugin manifest is missing {field}")

if manifest.get("name") != "geogebra-geometry":
    errors.append("plugin name must match plugins/geogebra-geometry")

if not re.fullmatch(r"\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?", manifest.get("version", "")):
    errors.append("plugin version must be semver")

interface = manifest.get("interface", {})
for field in (
    "displayName",
    "shortDescription",
    "longDescription",
    "developerName",
    "category",
    "capabilities",
    "defaultPrompt",
):
    if field not in interface:
        errors.append(f"plugin interface is missing {field}")

screenshots = interface.get("screenshots", [])
for screenshot in screenshots:
    target = PLUGIN / screenshot
    if not target.is_file():
        errors.append(f"missing screenshot: {screenshot}")

entries = marketplace.get("plugins", [])
entry = next(
    (candidate for candidate in entries if candidate.get("name") == "geogebra-geometry"),
    None,
)
if not entry:
    errors.append("marketplace is missing geogebra-geometry")
else:
    if entry.get("source", {}).get("path") != "./plugins/geogebra-geometry":
        errors.append("marketplace plugin source path is incorrect")
    if entry.get("policy", {}).get("installation") != "AVAILABLE":
        errors.append("marketplace installation policy must be AVAILABLE")

try:
    skill_text = SKILL.read_text(encoding="utf-8")
except OSError as error:
    errors.append(f"cannot read embedded skill: {error}")
    skill_text = ""

frontmatter = re.match(r"^---\n(.*?)\n---", skill_text, re.DOTALL)
if not frontmatter:
    errors.append("embedded skill has invalid YAML frontmatter")
else:
    header = frontmatter.group(1)
    if not re.search(r"^name:\s*generate-geogebra-geometry\s*$", header, re.MULTILINE):
        errors.append("embedded skill name is incorrect")
    if not re.search(r"^description:\s*.+$", header, re.MULTILINE):
        errors.append("embedded skill description is missing")

if "`fast`" not in skill_text or "`strict`" not in skill_text:
    errors.append("embedded skill must document fast and strict modes")

if spec_template.get("mode") != "fast":
    errors.append("construction template must default to fast mode")

for path in ROOT.rglob("*"):
    if not path.is_file() or ".git" in path.parts:
        continue
    if path.suffix.lower() not in {
        ".md",
        ".json",
        ".yaml",
        ".yml",
        ".py",
        ".mjs",
        ".tex",
        ".xml",
    }:
        continue
    text = path.read_text(encoding="utf-8", errors="replace")
    markers = ("[" + "TODO:", "GITHUB" + "_OWNER", "Local " + "developer")
    for marker in markers:
        if marker in text:
            errors.append(f"{path.relative_to(ROOT)} contains placeholder {marker}")

for example_ggb in EXAMPLE_GGB_FILES:
    relative_path = example_ggb.relative_to(ROOT)
    if not zipfile.is_zipfile(example_ggb):
        errors.append(f"{relative_path} is not a ZIP-based GeoGebra document")
        continue
    with zipfile.ZipFile(example_ggb) as archive:
        if "geogebra.xml" not in archive.namelist():
            errors.append(f"{relative_path} does not contain geogebra.xml")

if not imo_audit.get("successful"):
    errors.append("IMO 2026 Problem 2 audit is not successful")
if imo_audit.get("mode") != "strict":
    errors.append("IMO 2026 Problem 2 showcase must be generated in strict mode")
if imo_audit.get("failedChecks"):
    errors.append("IMO 2026 Problem 2 audit contains failed checks")
imo_checks = imo_audit.get("checks", [])
if not imo_checks or any(not check.get("passed") for check in imo_checks):
    errors.append("IMO 2026 Problem 2 does not have a complete passing check set")
if imo_audit.get("audit", {}).get("severeIssues"):
    errors.append("IMO 2026 Problem 2 audit contains severe accidental relations")

imo_roundtrip = imo_audit.get("roundtrip", {})
if not imo_roundtrip.get("zipSignature") or not imo_roundtrip.get("loaded"):
    errors.append("IMO 2026 Problem 2 .ggb did not pass round-trip loading")
if imo_roundtrip.get("missing") or imo_roundtrip.get("undefined"):
    errors.append("IMO 2026 Problem 2 round-trip has missing or undefined objects")

visible_issues = imo_visible_audit.get("visibleFiniteSegmentAudit", {}).get(
    "mediumOrHighIssues"
)
if visible_issues is None:
    errors.append("IMO 2026 Problem 2 visible-segment audit is incomplete")
elif visible_issues:
    errors.append("IMO 2026 Problem 2 visible-segment audit has serious issues")

if errors:
    print("Repository validation failed:")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print("Repository validation passed.")
