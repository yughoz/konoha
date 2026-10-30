# Motion QA — villager-1 walk

- Provider: Bumi Digital (`google/nano-banana-2.1`), referenced base `villager-1.png`.
- Pipeline: prepare → Bumi row → sprite-gen extract → compose-atlas → preview → inspect.
- Structural QA: pass. Four frames extracted, alpha clean, 192×256 cells, 6 fps loop.
- Identity/anatomy: pass. Face, hair, terracotta shirt, cream trousers and sandals remain stable; no detached limbs in the selected row.
- Motion QA: experimental/fail for strict locomotion. Frame 1 and frame 3 share too much of the same support-leg phase; the row reads as a two-pose repeat more than a complete left/right cycle.
- Runtime decision: removed from the active game after the user reported wobbling. Runtime now uses a separate manual CSS cutout rig for all four original Bumi PNGs. This generated row remains experimental evidence only.
