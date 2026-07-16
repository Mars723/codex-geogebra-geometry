# GeoGebra engine and file notes

## Why the skill uses the engine

A `.ggb` file is a ZIP-based GeoGebra document containing `geogebra.xml` and related resources. Hand-writing that archive is possible, but it is brittle across versions.

The generator instead:

1. loads the official GeoGebra web engine;
2. executes construction commands with `evalCommand`;
3. styles objects through the Apps API;
4. waits for CAS when proof is needed;
5. exports the canonical document with `getBase64`;
6. reloads that base64 into GeoGebra and checks every object.

Official references:

- File format: https://geogebra.github.io/docs/reference/en/File_Format/
- Apps API: https://geogebra.github.io/docs/reference/en/GeoGebra_Apps_API/
- `Prove`: https://geogebra.github.io/docs/manual/en/commands/Prove/
- `ProveDetails`: https://geogebra.github.io/docs/manual/en/commands/ProveDetails/
- `CASLoaded`: https://geogebra.github.io/docs/manual/en/commands/CASLoaded/

## Engine discovery

`build_geogebra.mjs` searches for:

- `GEOGEBRA_WEB3D_MODULE`;
- a GeoGebra Calculator Suite, Classic, or Geometry installation;
- common Linux installation paths;
- the official GeoGebra CDN as fallback.

Override with:

```bash
node build_geogebra.mjs \
  --geogebra-module /path/to/web3d.nocache.mjs \
  --spec problem.json \
  --out-dir output
```

Use `--online` to force the official CDN.

## Browser and Playwright discovery

The script searches for a bundled Codex Playwright runtime and common Chrome, Chromium, or Edge executables.

Overrides:

```bash
PLAYWRIGHT_PATH=/path/to/playwright \
CHROME_PATH=/path/to/chrome \
node build_geogebra.mjs --spec problem.json
```

Or pass `--browser`.

If a sandbox blocks browser launch, request approval for the exact generator command. Do not disable validation to avoid the approval.

## Proof interpretation

The builder evaluates the boolean statement numerically first. For `verify: "symbolic"`, it then calls `ProveDetails`.

- `proof: "true"`: structurally true under the reported nondegeneracy conditions.
- `proof: "false"`: structurally false.
- `proof: "unresolved"`: the prover did not settle the statement.

A numeric `true` with unresolved proof is not a theorem proof.

## Round-trip validation

The generated base64 must:

- begin with the ZIP signature;
- load through `setBase64`;
- restore every exported object;
- leave no restored object undefined.

This catches malformed archives and incomplete export state.

## Troubleshooting

### Commands fail

- Use English command names.
- Check construction order.
- Check object labels and branch selection.
- Inspect `commands[].created` and `commands[].undefined`.

### CAS never becomes ready

- Confirm the engine was created with CAS enabled.
- Retry once with the local GeoGebra module or official CDN.
- Keep the result unresolved if CAS remains unavailable.

### Browser console errors

- Treat any recorded error as a failed build.
- Verify the GeoGebra module path and browser version.
- Use `--headed` only for debugging.

### Preview is blank or cropped

- Verify required objects are visible.
- Check `canvas.bounds`.
- Increase `canvas.padding`.
- Ensure visible circles are declared in `entities.circles`.

### `.ggb` opens but loses objects

Do not deliver it. Inspect `roundtrip.missing` and `roundtrip.undefined`, fix the construction, and regenerate.
