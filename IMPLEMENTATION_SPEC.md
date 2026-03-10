# Developer Handoff: Jewelry Sketch-to-Render Tool Specification

## Purpose

This document defines exactly how the tool should convert a jewelry sketch or CAD-style reference into a high-quality, photoreal render output.

The tool's job is not to redesign jewelry. Its job is to preserve the original design as faithfully as possible while upgrading it into a realistic final image.

## Primary Goal

The tool must take an input jewelry sketch and output a photoreal image that:

- preserves the original silhouette
- preserves proportions
- preserves stone count and placement
- preserves setting type and structure
- preserves negative space and component relationships
- improves only realism, materials, lighting, camera quality, and presentation

## Non-Negotiable Behavior

The tool must not:

- redesign the jewelry
- add decorative details that are not in the sketch
- remove components from the sketch
- change band thickness, taper, or proportions unless explicitly instructed
- change stone count, scale, spacing, or placement
- change the setting type
- invent hidden geometry as fact when the sketch is ambiguous

The tool may:

- convert sketch lines into realistic metal surfaces
- convert indicated stones into realistic gemstones
- add photoreal lighting and reflections
- place the piece into a studio-style presentation scene
- improve realism while keeping the design locked

## Tool Objective Order

The developer should optimize the tool in this order:

1. geometry fidelity
2. stone and setting fidelity
3. material realism
4. overall photoreal quality
5. speed and cost

The tool should never prioritize a prettier image over a more accurate one.

## Input Requirements

The tool must accept:

- 1 to 16 source images
- a primary structural reference image
- optional side, top, detail, or material reference images
- a target material request
- a target scene request
- a target camera request
- a mode: `fidelity` or `creative`

Input rules:

- the first image is always treated as the primary structural reference
- additional images are supporting references only
- if multiple views exist, the tool should use them to reduce ambiguity
- if only one view exists, the tool must be conservative about hidden structure

## Output Requirements

For each job, the tool must produce:

- one photoreal render image
- structured extracted constraints from the source
- a structured geometry description
- a locked render prompt payload
- a fidelity grade comparing source to output
- retry instructions if the first output fails fidelity checks

## Expected Tool Behavior

The conversion flow should work like this:

1. Inspect the uploaded sketch/reference images.
2. Extract the visible jewelry structure into JSON.
3. Describe the geometry and must-preserve proportions into JSON.
4. Merge those constraints with the user's requested material and scene.
5. Build a locked render prompt that preserves geometry.
6. Generate a photoreal image edit from the source image(s).
7. Grade the output for fidelity.
8. Retry only if the output drifted from the sketch.

## Fidelity Rules

The tool must preserve the following from the sketch:

- overall silhouette
- head architecture
- shank or band profile
- halo structure if present
- gallery openness or enclosed structure
- stone count
- stone layout
- stone size relationships
- stone setting type
- visible negative space
- viewpoint and composition, as closely as possible

The tool must flag uncertainty rather than hallucinate when the sketch does not clearly show a detail.

## Conversion Modes

### Fidelity mode

Use this mode for production or approval renders.

Behavior:

- strongest geometry lock
- strongest negative prompt restrictions
- viewpoint matching required
- high input fidelity enabled
- minimal creative freedom
- grading threshold set high

### Creative mode

Use this mode only for marketing or mood-driven variations.

Behavior:

- geometry still anchored to the source
- scene and styling may be more flexible
- lower strictness than fidelity mode
- still cannot redesign the jewelry without explicit instruction

## Recommended Pipeline

The tool should use this pipeline:

```text
[Input Images]
    ?
[Image Normalization]
    ?
[Spec Extractor]
    ?
[Geometry Descriptor]
    ?
[Constraint Merger]
    ?
[Render Prompt Builder]
    ?
[Image Edit / Render]
    ?
[Fidelity Grader]
    ?
Pass ? Deliver
Fail ? Correction Instructions ? Retry Render
```

## Required Internal Components

The developer should implement these logical components.

### 1. Spec Extractor

Purpose:

- identify jewelry type
- identify visible materials
- identify stones and settings
- identify visible design elements
- identify must-preserve rules
- identify uncertainties

This component must return strict JSON only.

### 2. Geometry Descriptor

Purpose:

- describe silhouette
- capture band, head, gallery, halo, bezel, prongs, shoulders, and other visible structure
- define spatial relationships
- define relative proportions
- define must-preserve geometry

This component must return strict JSON only.

### 3. Constraint Merger

Purpose:

- combine extracted structure with user requests and retry corrections
- resolve conflicts deterministically

Priority order:

1. user hard constraints
2. retry correction instructions
3. geometry must-preserve rules
4. spec fidelity rules
5. aesthetic render requests

### 4. Render Prompt Builder

Purpose:

- produce a final locked prompt payload for the image generation step
- include positive prompt
- include negative prompt
- include camera, scene, and realism directives
- include explicit allowed and forbidden edit rules

### 5. Image Edit Worker

Purpose:

- transform the sketch/reference into a photoreal render
- preserve structure from the source image(s)

### 6. Fidelity Grader

Purpose:

- compare the render to the input sketch/reference
- score fidelity
- determine pass or fail
- generate correction instructions when needed

## Required Structured Outputs

Every non-render step should emit strict JSON.

### Spec Extractor JSON

```json
{
  "job_id": "uuid",
  "jewelry_type": "ring | pendant | earring | bracelet | necklace | other",
  "materials": {
    "metal": "unknown | white_gold | yellow_gold | rose_gold | platinum | silver",
    "finish": "high_polish | satin | matte | brushed | mixed"
  },
  "gemstones": [
    {
      "zone_id": "center_1",
      "type": "diamond | sapphire | emerald | ruby | unknown",
      "shape": "oval | round | pear | princess | baguette | marquise | trillion | unknown",
      "setting": "prong | bezel | channel | pave | flush | halo | unknown",
      "count_estimate": 1,
      "size_estimate_mm": "8x6"
    }
  ],
  "design_elements": [
    {
      "element_id": "head_1",
      "category": "head | shank | halo | gallery | basket | shoulder | bezel_wall | motif | fringe | clasp",
      "description": "..."
    }
  ],
  "critical_fidelity_rules": [
    "Preserve exact silhouette.",
    "Do not alter stone count.",
    "Do not redesign gallery structure."
  ],
  "allowed_render_changes": [
    "Change metal material",
    "Add photoreal lighting",
    "Add controlled reflections"
  ],
  "uncertainties": [
    "Side gallery not fully visible"
  ]
}
```

### Geometry Descriptor JSON

```json
{
  "job_id": "uuid",
  "overall_view": "front | side | top | 3_4 | multi_view",
  "symmetry": "symmetrical | asymmetrical | likely_symmetrical | unknown",
  "silhouette_notes": "Rounded square shank rising into cathedral shoulders...",
  "proportion_rules": [
    "Head width is approximately 1.8x band width.",
    "Band remains consistent until taper near shoulders."
  ],
  "zone_relationships": [
    {
      "from": "shank",
      "to": "head_1",
      "relationship": "tapers_into"
    }
  ],
  "must_preserve": [
    "Negative space beneath center head",
    "Raised cathedral shoulders",
    "Open gallery"
  ],
  "risk_flags": [
    "Perspective may hide left shoulder thickness",
    "Pave count uncertain from single view"
  ]
}
```

### Render Prompt Payload JSON

```json
{
  "job_id": "uuid",
  "render_mode": "fidelity",
  "reference_directive": "Use the uploaded image as the primary structural reference. Match silhouette, proportions, spatial relationships, negative space, and element placement exactly.",
  "positive_prompt": "Convert this exact jewelry design into a photoreal luxury studio render...",
  "negative_prompt": "Do not redesign. Do not change proportions. Do not add or remove stones...",
  "camera": {
    "lens": "100mm macro",
    "angle_lock": "match source perspective",
    "framing": "hero crop"
  },
  "scene": {
    "environment": "dark spotlight studio",
    "surface": "black fine grain sand",
    "lighting": "controlled caustics, crisp speculars"
  },
  "edit_policy": {
    "allowed": [
      "material substitution",
      "realism enhancement",
      "studio lighting"
    ],
    "forbidden": [
      "geometry changes",
      "proportion changes",
      "stone count changes",
      "extra ornamentation"
    ]
  }
}
```

### Fidelity Grade JSON

```json
{
  "job_id": "uuid",
  "score_total": 0.86,
  "scores": {
    "silhouette_match": 0.95,
    "proportion_match": 0.88,
    "stone_layout_match": 0.91,
    "setting_match": 0.84,
    "extra_element_penalty": 0.0,
    "material_accuracy": 0.9
  },
  "pass": true,
  "failure_modes": [],
  "correction_instructions": []
}
```

## Prompt Rules for the Tool

The render prompt must always be structured like this:

```text
REFERENCE LOCK
Use the uploaded image(s) as the primary structural reference.
Match silhouette, proportions, spatial relationships, element placement, stone count, and negative space exactly.

ALLOWED CHANGES
Apply only material substitution, gemstone realism, lighting, studio environment, reflections, and camera realism.

FORBIDDEN CHANGES
Do not redesign.
Do not add or remove elements.
Do not change proportions.
Do not alter setting type.
Do not change stone count, spacing, or scale.
Do not thicken, slim, taper, or reshape the band or structure.

RENDER GOAL
Photoreal luxury jewelry photography.
[scene + material + camera instructions]

PERSPECTIVE LOCK
Match the source viewing angle and composition as closely as possible.
```

If a retry is needed, the tool should prepend only the needed corrections:

```text
CORRECTIONS FROM PRIOR PASS
- The shank became too thick. Restore original width and taper.
- The center stone appears enlarged. Match original stone-to-band ratio.
- Extra decorative bead detail appeared. Remove all added ornamentation.
```

## Quality Control Rules

The tool must grade every final output.

The grader should score:

- silhouette match
- proportion match
- stone layout match
- setting match
- extra element penalty
- material accuracy

The tool should automatically fail output when any of the following is visible:

- major silhouette drift
- major proportion drift
- incorrect stone count
- stone placement changes
- setting type changes
- added ornamentation
- missing components
- viewpoint drift in fidelity mode

## Failure Taxonomy

Use this exact failure vocabulary:

- `silhouette_drift`
- `proportion_drift`
- `stone_count_error`
- `stone_scale_error`
- `stone_placement_error`
- `setting_type_error`
- `added_ornamentation`
- `missing_component`
- `viewpoint_drift`
- `material_error`
- `overstylized_lighting_hides_geometry`

## Retry Rules

The tool should not reroll endlessly.

Retry policy:

- maximum 3 total passes
- pass 1: standard fidelity prompt
- pass 2: stronger geometry prohibitions
- pass 3: realism only, exact structure preservation

Failure-specific retry behavior:

- silhouette drift: strengthen silhouette lock
- proportion drift: strengthen ratio instructions
- stone errors: explicitly forbid changes to count, spacing, and scale
- ornamentation hallucination: strengthen negative prompt against decoration
- material error only: refine material wording without touching geometry rules

## Suggested Technical Implementation

The developer should implement the tool using:

- Responses API for analysis, prompt building, grading, and correction planning
- Image API for direct one-shot image edit generation
- Responses API image workflows for iterative correction passes if needed

Recommended internal modules:

```text
/openai
  specExtractor.ts
  geometryDescriptor.ts
  promptBuilder.ts
  imageEdit.ts
  fidelityGrader.ts

/schemas
  spec.schema.ts
  geometry.schema.ts
  prompt.schema.ts
  grade.schema.ts

/orchestration
  runJob.ts
  mergeConstraints.ts
  retryPolicy.ts
```

## Acceptance Criteria for the Developer

The tool is ready when it can:

- accept a jewelry sketch as the primary structural reference
- preserve the design instead of redesigning it
- output a photoreal render with realistic materials and lighting
- enforce strict geometry lock in fidelity mode
- emit valid structured JSON from all analysis stages
- grade output automatically
- retry failed renders with stricter corrections
- persist pass-by-pass results and metadata

## Plain-English Summary for the Developer

Build the tool so it behaves like a controlled sketch-to-render converter, not a creative image generator.

The sketch is the source of truth. The render should look like the same exact jewelry design, only upgraded into a realistic luxury product image.
