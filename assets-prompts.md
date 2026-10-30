# Desa Komen — asset generation brief

Status: **generated and verified, 30 October 2026**. All eight assets were generated with Bumi Digital, model `google/nano-banana-2.1`, using the [create_image_bd skill](/Users/yughoz/.codex/skills/create-image-bd/SKILL.md). The API reported **3.6 credits** total: 2K house/background at 0.6 each, six 1K cutouts at 0.4 each. Final assets and provenance are in `public/assets/`; raw outputs and metadata are preserved in `output/imagegen/`. The house pilot was checked before the rest of the family was submitted.

## Art direction and exact prompts

Cozy Indonesian village in rounded hand-painted 2D editorial storybook style. Warm paper-like texture stays inside illustrated subjects. Use clean readable silhouettes, restrained dark forest-green outlines, sage/olive foliage, cream, terracotta, muted ochre and dusty blue. Elevated orthographic three-quarter view and diffuse daylight from upper left are shared across the whole family. No photorealism, 3D rendering, pixel art, text, logos or watermarks. Text, names and comment bubbles remain HTML.

Each file below contains the complete exact production prompt. The shared style is repeated explicitly; no prompt claims an image reference is attached. Generate the house as the representative pilot, inspect its silhouette at 300 px width on mint ground, then keep its visual direction consistent for the remaining family.

| Runtime asset | Exact prompt source | Source frame | Display role |
| --- | --- | --- | --- |
| `house.png` | [prompts/house.txt](prompts/house.txt) | 1:1 | One chief house, 300 px wide, bottom-center anchor |
| `background.png` | [prompts/background.txt](prompts/background.txt) | 3:2, 2K | Empty landscape, queue path, boundary fence/lamp |
| `tree.png` | [prompts/tree.txt](prompts/tree.txt) | 1:1 | Decorative shade tree, 150 px wide |
| `bush.png` | [prompts/bush.txt](prompts/bush.txt) | 1:1 | Decorative low shrub, 90 px wide |
| `villager-1.png` | [prompts/villager-1.txt](prompts/villager-1.txt) | 1:1 | Man in terracotta shirt |
| `villager-2.png` | [prompts/villager-2.txt](prompts/villager-2.txt) | 1:1 | Woman in sage blouse and cream hijab |
| `villager-3.png` | [prompts/villager-3.txt](prompts/villager-3.txt) | 1:1 | Man in ochre shirt and dark peci |
| `villager-4.png` | [prompts/villager-4.txt](prompts/villager-4.txt) | 1:1 | Woman in dusty-blue blouse with tied hair |

## Provider route

Use the Bumi Digital REST API through `tools/generate-images.py`. Read `BUMI_API_KEY` from the local key source specified by the skill into a temporary process environment; never print or persist the secret. No OpenAI API key is needed for this selected provider route.

Before any paid call, fetch the authenticated image catalog in the same process that will generate. Require a non-empty catalog entry with the exact requested model ID. Stop if the catalog is empty or unauthorized, or the pilot returns model-not-found. Do not rotate through guessed model IDs or spend credits on test payloads. After a successful read-only gate, run at most one paid house pilot; inspect it before generating the rest. Root verified the catalog contains exact `google/nano-banana-2.1`; the generator must verify availability again at runtime and use that selected model. Poll by exact returned generation ID, then download the public result URL without an authorization header. The catalog's actual parameter/cost metadata overrides historical model examples in skill documentation.

Isolated object/character prompts deliberately request a perfectly solid **magenta `#ff00ff` backdrop**, without shadows, gradients, checkerboard or magenta-colored subject details. This backdrop is a processing aid, not the shipped background. Extract alpha deterministically after download; verify edges and remove matte halos before saving transparent runtime PNGs. This route does not assume provider-native transparency support.

## Normalization and acceptance

Once downloads are complete, run `/Users/yughoz/.codex/skills/sprite-gen/.venv/bin/python tools/prepare-assets.py` for all eight assets, or append asset names such as `tree bush` to process only those completed entries. The normalizer verifies source files and writes runtime PNGs atomically; it never generates images or updates manifest approval status.

- Preserve raw downloads, exact prompts, model, generation IDs, timestamps and normalization notes. Mark manifest entries generated only after actual successful output, and ready only after visual checks.
- Remove the magenta matte from cutouts, crop excess source padding without cutting outlines, preserve alpha, and align bottom-center pivots. House/tree/shrub bases and resident feet must be stable. Check real transparency with an image tool over a checkerboard; a baked checkerboard is a failure.
- The generated background is 2528 × 1696, normalized to **1600 × 1120 without cropping**. The final background stretches to 100% scene width and height instead of using `cover`, so normalized path coordinates stay aligned in the mobile 10:9 layout.
- Actual generated path was inspected before placement: house feet sit around y38%; desktop queue anchors are x43+6.1i%, y43/48/54/60/67/75/83/91%. Mobile shows four residents at x43/56/69/82%, y43/55/70/87%. The background contains no buildings or people; fence and lamp remain at boundaries.
- Inspect cutout edges over mint grass and tan path for magenta fringe and cropped pixels. All assets use smooth browser scaling.
- Inspect the live scene on desktop and a 390 px phone viewport. The house must meet the path entrance, feet must stay on the path, and comment bubbles must stay readable. Compare source and rendered output before marking assets ready.
- First-version movement uses whole-sprite CSS translation and bobbing. These single-frame residents are not generated walking sprite sheets.

Visual QA passed over dark and sage backgrounds, and in-browser at 1440 px desktop and 390 px phone widths. Residents share a 232 px visible height with a stable baseline on 192 × 256 canvases. Review [contact-sheet.png](output/imagegen/contact-sheet.png) for the final asset family. Generation safety checks run offline with `python3 test/generation.test.py`; `--dry-run` validates a proposed command without keys or network. Use `--resume ID` after interruptions rather than creating another job.
