# Contributing

Contributions are welcome, especially:

- new geometry construction patterns;
- additional symbolic relation types;
- better layout and label-placement heuristics;
- audit rules for misleading visual relationships;
- cross-platform GeoGebra and browser discovery;
- reproducible competition-geometry test cases.

Before opening a pull request:

1. Validate the plugin manifest.
2. Validate the embedded skill.
3. Generate at least one representative `.ggb`.
4. Confirm the audit report is successful.
5. Round-trip load the generated file.
6. Inspect the latest PNG preview.

Do not encode theorem conclusions directly into construction commands merely to make a test pass.
