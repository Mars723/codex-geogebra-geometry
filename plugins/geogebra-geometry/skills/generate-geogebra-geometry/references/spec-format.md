# Construction specification

## Contents

1. Top-level fields
2. Commands and styling
3. Audited entities
4. Relations and checks
5. Layout search
6. Audit configuration
7. Canvas and exports
8. Reading the report

## 1. Top-level fields

Start from `assets/spec-template.json`.

| Field | Purpose |
| --- | --- |
| `title` | Human-readable problem name |
| `slug` | Output filename stem |
| `commands` | Ordered GeoGebra construction commands |
| `postCommands` | Commands run after styling and layout |
| `requiredObjects` | Objects that must exist and be defined |
| `roles` | Standard visual role for each object |
| `styles` | Per-object style overrides |
| `entities` | Geometry used by layout, checks, and audit |
| `relations` | Intended givens and conclusions |
| `checks` | Raw boolean checks |
| `layout` | Randomized layout search |
| `audit` | Misleading-relation audit |
| `canvas` | View and raster export settings |
| `exports` | `.ggb`, PNG, SVG, and XML switches |

`commands` is the only required non-empty field, but a useful verified diagram also needs `requiredObjects`, `entities`, and `relations`.

## 2. Commands and styling

Commands are either strings or objects containing `command`:

```json
[
  "A=(0,0)",
  {"command": "D=Midpoint(B,C)"}
]
```

Standard roles:

| Role | Default appearance |
| --- | --- |
| `vertex` | dark blue, larger point, visible label |
| `point` | blue, visible label |
| `side` | dark solid segment |
| `auxiliary` | light dashed line |
| `highlight` | thicker rust-colored object |
| `circle` | thin blue-gray circle |
| `angle` | ochre angle |
| `hidden` | object and label hidden |

Style overrides support:

```json
{
  "m": {
    "color": "#C45A4A",
    "visible": true,
    "labelVisible": false,
    "caption": "DE",
    "pointSize": 5,
    "pointStyle": 0,
    "lineThickness": 6,
    "lineStyle": 1,
    "filling": 0.15,
    "layer": 2,
    "fixed": true,
    "selectionAllowed": false,
    "auxiliary": false,
    "decoration": 1
  }
}
```

`decoration` is passed to GeoGebra `SetDecoration`.

## 3. Audited entities

Declare semantic geometry even when no extra GeoGebra object is needed:

```json
{
  "points": ["A", "B", "C", "D"],
  "lines": {
    "AB": {"through": ["A", "B"]},
    "altitude_A": {"object": "ha", "through": ["A", "H"]}
  },
  "segments": {
    "AB": {"object": "c", "points": ["A", "B"]},
    "BD": {"points": ["B", "D"]}
  },
  "angles": {
    "angle_A": {"points": ["B", "A", "C"]},
    "alpha": {"object": "alpha", "points": ["B", "A", "D"]}
  },
  "circles": {
    "omega": {"object": "omega"}
  }
}
```

Entity IDs are used in relations and audit messages. `object` names the actual GeoGebra object. A line may instead use `expression`; a segment may use `lengthExpression`.

For TikZ, semantic lines and segments are not rendered unless they have `object` or set `"render": true`.

## 4. Relations and checks

Supported relation types:

| Type | Required fields |
| --- | --- |
| `collinear` | `points` |
| `concyclic` | `points` |
| `coincident` | `points` |
| `parallel` | `lines` |
| `perpendicular` | `lines` |
| `concurrent` | `lines` |
| `equal_length` | `segments` |
| `equal_angle` | `angles` |
| `tangent` | `line`, `circle` |
| `point_on_circle` | `point`, `circle` |

Example:

```json
{
  "id": "midline_parallel",
  "type": "parallel",
  "lines": ["AB", "DE"],
  "status": "conclusion",
  "verify": "symbolic",
  "expected": true
}
```

Use `expression` for a custom GeoGebra boolean:

```json
{
  "id": "custom_ratio",
  "expression": "Distance(A,D)==2*Distance(D,B)",
  "status": "construction",
  "verify": "numeric"
}
```

`verify` values:

- `symbolic`: numeric truth plus `ProveDetails`;
- `numeric`: truth in the selected construction;
- `none`: allowlist only, no check.

Raw `checks` use `id`, `expression`, `expected`, `verify`, and `status`.

## 5. Layout search

The optimizer samples free-point coordinates, rejects candidates that violate constraints, and minimizes undeclared visual relations.

```json
{
  "trials": 80,
  "seed": 20260717,
  "variables": {
    "B": {"x": [1.8, 3.2], "y": [4.0, 5.1]}
  },
  "constraints": [
    {
      "type": "orientation",
      "points": ["A", "C", "B"],
      "sign": "positive"
    },
    {
      "type": "length_order",
      "segments": ["CA", "BC", "AB"],
      "order": "descending",
      "margin": 0.12
    },
    {
      "type": "angle_order",
      "angles": ["angle_B", "angle_A", "angle_C"],
      "order": "descending",
      "marginDegrees": 1
    },
    {
      "type": "angle_range",
      "angle": "angle_C",
      "min": 32,
      "max": 47
    },
    {
      "type": "point_distance",
      "points": ["P", "Q"],
      "min": 0.8,
      "max": 6
    }
  ]
}
```

Variables may use explicit `x` and `y` ranges or `jitterX` and `jitterY` around their initial coordinates.

## 6. Audit configuration

Default audit categories:

- point crowding or coincidence;
- near collinearity;
- near parallelism and perpendicularity;
- near equal segment lengths;
- near equal and special angles;
- near concyclicity;
- near concurrency.

Configuration:

```json
{
  "enabled": true,
  "symbolicFilter": true,
  "maxSymbolicChecks": 24,
  "maxPointsForConcyclic": 11,
  "failOnSeverity": "medium",
  "specialAngles": [30, 45, 60, 90, 120, 135, 150],
  "allowSpecialAngles": ["special_angle:angle_A:60"],
  "thresholds": {
    "pointCrowding": 0.035,
    "collinear": 0.025,
    "parallelDegrees": 2,
    "perpendicularDegrees": 2,
    "equalLengthRelative": 0.02,
    "equalAngleDegrees": 1.5,
    "specialAngleDegrees": 1.25,
    "concyclicRelative": 0.018,
    "concurrentRelative": 0.018
  }
}
```

Intended relations are automatically allowed. Three declared lines that explicitly share the same `through` point are also treated as intended concurrency.

## 7. Canvas and exports

```json
{
  "canvas": {
    "width": 1100,
    "height": 760,
    "axes": false,
    "grid": false,
    "fit": true,
    "padding": 0.17,
    "pngScale": 2,
    "transparent": false,
    "dpi": 144
  },
  "exports": {
    "ggb": true,
    "png": true,
    "svg": true,
    "xml": true
  }
}
```

Use `canvas.bounds: [xmin, xmax, ymin, ymax]` for a fixed view. Automatic fitting includes declared points and visible declared circles.

## 8. Reading the report

Important fields in `<slug>.audit.json`:

- `successful`;
- `engine.casReady`;
- `failedChecks`;
- `layout.initialScore` and `layout.bestScore`;
- `audit.accidentalIssues` and `audit.severeIssues`;
- `audit.pointCoordinates`, lengths, and angles;
- `geometry.circles`;
- `roundtrip`;
- `consoleErrors`.

An audit issue classification is:

- `allowed`: explicitly intended;
- `structural`: symbolically true from the construction;
- `accidental`: symbolically false despite looking true;
- `unresolved`: proof system could not classify it.
