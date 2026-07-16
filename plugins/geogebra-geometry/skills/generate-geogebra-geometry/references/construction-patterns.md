# Translating geometry into GeoGebra

## Structural rule

Build only the hypotheses and definitions. Verify the conclusion afterward.

Bad:

```text
p=ParallelLine(D,Line(A,B))
E=Intersect(p,Line(A,C))
```

when the theorem is supposed to prove `DE ∥ AB`.

Good:

```text
D=Midpoint(B,C)
E=Midpoint(C,A)
m=Segment(D,E)
```

followed by a symbolic `AreParallel(Line(A,B),Line(D,E))` relation.

## Core patterns

### Base triangle

```text
A=(0,0)
B=(2.4,4.6)
C=(8,0)
a=Segment(B,C)
b=Segment(C,A)
c=Segment(A,B)
```

### Point, segment, and line

```text
s=Segment(A,B)
g=Line(A,B)
P=Point(s)
Q=Point(g)
```

Use `Point(s)` when the point must remain on a segment and `Point(g)` when it may lie on the entire line.

### Midpoint and fixed ratio

```text
M=Midpoint(A,B)
t=0.35
D=A+t*(B-A)
```

For a theorem with a symbolic ratio, prefer a dependent construction using the actual given parameter rather than a decimal chosen only for appearance.

### Intersection

```text
P=Intersect(g,h)
```

When two objects may have multiple intersections, use the GeoGebra form that selects the intended branch and verify the result visually.

### Perpendicular foot

```text
g=Line(B,C)
h=PerpendicularLine(A,g)
D=Intersect(g,h)
```

Keep infinite helper lines hidden and display `Segment(A,D)` if the competition diagram should show only the altitude segment.

### Parallel through a point

```text
p=ParallelLine(D,Line(A,B))
```

Use this only when parallelism is a given or a definition, not when it is the target conclusion.

### Angle bisector

```text
u=AngleBisector(B,A,C)
D=Intersect(u,Line(B,C))
```

### Perpendicular bisector

```text
u=PerpendicularBisector(A,B)
```

### Circle constructions

```text
omega=Circle(O,A)
omega=Circle(A,B,C)
D=Point(omega)
```

For a free point on a circle, use `Point(omega, parameter)` when a stable initial location helps the layout.

### Tangent

```text
t=Tangent(D,omega)
```

Check whether the command creates one or two tangent objects and name the intended branch explicitly.

### Reflection, rotation, and translation

```text
P1=Reflect(P,g)
P2=Rotate(P,60°,O)
P3=Translate(P,Vector(A,B))
```

### Triangle centers

Prefer definitions that expose the theorem structure.

Orthocenter:

```text
lBC=Line(B,C)
lCA=Line(C,A)
ha=PerpendicularLine(A,lBC)
hb=PerpendicularLine(B,lCA)
H=Intersect(ha,hb)
```

Circumcenter:

```text
u=PerpendicularBisector(A,B)
v=PerpendicularBisector(B,C)
O=Intersect(u,v)
```

Incenter:

```text
u=AngleBisector(B,A,C)
v=AngleBisector(A,B,C)
I=Intersect(u,v)
```

### Cevians and concurrency

Create each point on the relevant side from its given definition, then construct the cevians. Register all three line entities and verify concurrency with `AreConcurrent`.

### Cyclic quadrilateral

If concyclicity is a hypothesis, construct the fourth point on the circle. If it is a conclusion, construct the fourth point from the stated line or angle conditions and verify with `AreConcyclic`.

## Naming and visibility

- Use conventional uppercase labels for points.
- Give helper lines stable names such as `lAB`, `ha`, or `bisA`.
- Give visible segments separate objects such as `altA=Segment(A,H)`.
- Mark infinite construction lines `hidden` unless the problem explicitly displays them.
- Keep every meaningful visible geometric object represented under `entities`.

## Ambiguity handling

Common ambiguities include:

- point on a segment versus the full line;
- internal versus external angle bisector;
- which of two circle intersections is intended;
- whether “passes through” is a given or a conclusion;
- directed versus undirected angles;
- internal versus external division.

Choose the branch consistent with all stated hypotheses and the conventional competition diagram. If more than one branch remains genuinely possible, state the chosen interpretation.
