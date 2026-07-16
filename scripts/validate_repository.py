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
EXAMPLE_GGB = ROOT / "examples" / "triangle-midline" / "triangle-midline.ggb"

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

if not zipfile.is_zipfile(EXAMPLE_GGB):
    errors.append("example .ggb is not a ZIP-based GeoGebra document")
else:
    with zipfile.ZipFile(EXAMPLE_GGB) as archive:
        if "geogebra.xml" not in archive.namelist():
            errors.append("example .ggb does not contain geogebra.xml")

if errors:
    print("Repository validation failed:")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print("Repository validation passed.")
