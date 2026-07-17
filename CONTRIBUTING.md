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
4. Test the representative spec in both `fast` and `strict` modes.
5. Confirm both audit reports are successful.
6. Round-trip load the generated files.
7. Inspect the latest PNG previews.

Do not encode theorem conclusions directly into construction commands merely to make a test pass.
