# Diagram quality and accidental-relation control

## Canonical triangle

Default:

```text
A=(0,0)
B=(2.4,4.6)
C=(8,0)
```

Approximate values:

- `AC = 8`;
- `BC = 7.25`;
- `AB = 5.19`;
- `∠B = 78.15°`;
- `∠A = 62.45°`;
- `∠C = 39.40°`.

Thus `∠B > ∠A > ∠C` and, consistently, `AC > BC > AB`.

This is an initial shape, not a theorem assumption. Change it when the problem requires an obtuse triangle, an isosceles triangle, a right triangle, an exterior point, or another specific configuration.

## Layout strategy

1. Put a long, nearly horizontal side on the bottom when natural.
2. Keep the main triangle away from equilateral, right, and isosceles appearances unless intended.
3. Keep one or more free points in `layout.variables`.
4. Constrain orientation and required side/angle ordering.
5. Let the optimizer search among valid candidates.
6. Inspect the final preview rather than the initial coordinates.

For the canonical triangle, a useful search box is:

```json
{
  "B": {
    "x": [1.8, 3.2],
    "y": [4.0, 5.1]
  }
}
```

## What the audit protects against

The audit compares every declared combination that could create a plausible visual claim:

- distinct points becoming crowded or coincident;
- undeclared triples appearing collinear;
- undeclared line pairs appearing parallel or perpendicular;
- undeclared segment pairs appearing equal;
- undeclared angle pairs appearing equal;
- angles appearing to be common special values;
- undeclared quadruples appearing concyclic;
- undeclared triples of lines appearing concurrent.

Declare intended relations so they are allowlisted. Do not remove a visible object from `entities` merely to silence an audit warning.

## Interpreting extra relations

- `allowed`: intended by the problem or definition.
- `structural`: genuinely forced by the construction, even if not listed.
- `accidental`: looks true in the chosen layout but is not generally true.
- `unresolved`: the symbolic engine could not decide.

Always repair medium- or high-severity `accidental` and `unresolved` issues. Review low-severity issues manually. A structural relation may still be visually distracting; choose a different layout if it encourages an irrelevant solution path.

## Visual hierarchy

- vertices: dark blue and slightly larger;
- secondary points: medium blue;
- sides: dark gray solid;
- construction lines: light gray dashed;
- theorem-relevant segment or locus: rust highlight;
- circles: thin blue-gray;
- hide axes, grid, algebra panel, and unused infinite lines.

Avoid displaying labels on sides and helper lines unless they are used in the statement.

## Final visual review

Check the latest PNG for:

- clipped circles, labels, or exterior points;
- labels touching lines or other labels;
- nearly overlapping segments;
- unnecessarily long infinite lines;
- excessive whitespace;
- confusing crossings;
- an orientation that conflicts with the statement;
- a “special” appearance not justified by the hypotheses.

The automatic view includes point extents and declared visible circles. Use explicit bounds for unusual loci or very distant intersections.

## Verification discipline

A good-looking diagram is not evidence that a theorem is true.

- Symbolic proof: `proof` is `true` in the audit report.
- Numeric verification: `numeric` is true only for the selected instance.
- Visual plausibility: never report this as a verification result.

When `ProveDetails` supplies nondegeneracy conditions, preserve them in the report and avoid choosing a layout that violates or nearly violates them.
