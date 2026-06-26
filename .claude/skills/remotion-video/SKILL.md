---
name: remotion-video
description: >-
  Use this skill when the user wants to create, edit, or render videos and
  motion graphics from code/text using Remotion (React-based video framework).
  Triggers include: "make an intro video", "animate this text", "create a reel
  intro", "logo animation", "render an MP4", "captions animation", or any
  request to generate programmatic/animated video. Remotion is a framework, not
  a downloadable skill package — this skill teaches Claude how to scaffold,
  preview, and render a Remotion project. Requires Node.js.
license: MIT (this guide skill is original Greencar UXD content; Remotion itself is licensed separately — see https://remotion.dev/license)
---

# Remotion — Text-to-Video with Code

Remotion renders videos with React: every frame is a React render, so animation
is "just code." Claude writes the React/Remotion code, so the user does **not**
need to know React. Unlike the other skills in this marketplace, Remotion is a
**framework you scaffold into a project**, not a folder you copy into
`.claude/skills/`. This skill is the playbook for driving it.

> Official guide: https://remotion.dev/docs/ai/claude-code

## Prerequisites

- **Node.js** installed (provides `npm` / `npx`). Check with `node -v`.
- A Claude Code subscription (you already have this).
- If Node is missing, stop and tell the user to install it from https://nodejs.org — do not guess.

## Workflow

### 1. Scaffold a project (once per video project)

```bash
npx create-video@latest
```

Pick a template (the **Blank** or **Hello World** template is the simplest start).
This creates a project folder. Open **that folder** in Claude Code and work from
inside it — Remotion lives in the project, not in a global skills folder.

### 2. Build the composition

Compositions live under `src/`. A composition is a React component plus a
`<Composition>` registration (id, dimensions, fps, durationInFrames) in
`src/Root.tsx` (or `Composition.tsx`).

Core Remotion building blocks to use when writing the code:

- `useCurrentFrame()` — the current frame number; drives all animation.
- `useVideoConfig()` — `{ fps, width, height, durationInFrames }`.
- `interpolate(frame, [inStart, inEnd], [from, to], { extrapolateLeft, extrapolateRight })` — map frames to any value (opacity, position, scale).
- `spring({ frame, fps, config })` — natural spring motion.
- `<Sequence from={n} durationInFrames={m}>` — time-shift/stagger elements.
- `<AbsoluteFill>` — full-frame layered container.
- `<Audio>`, `<Img>`, `<Video>`, `<OffthreadVideo>` — media.
- `staticFile('name.png')` — load assets from `public/`.

Keep durations consistent: `durationInFrames = seconds * fps` (default fps is 30, so a 10s clip = 300 frames).

### 3. Preview live

```bash
npm run dev
```

Opens Remotion Studio in the browser with a real-time preview, timeline, and
prop controls. When the user asks for tweaks ("bigger text", "change the color",
"slower fade"), edit the component and the preview hot-reloads.

### 4. Render to a file

```bash
npx remotion render            # renders the default/first composition to out/
npx remotion render <CompId> out/video.mp4
```

Rendering is local and free (no cloud video service). Common flags:
`--props='{"title":"..."}'` to pass input props, `--frames=0-90` to render a
range, `--codec=h264` (default) or `--codec=gif`.

## Example request → what to do

> "Make a 10-second intro. The text 〈홍익인간〉 fades and scales up over a
> gradient background."

1. Ensure a Remotion project exists (else run `npx create-video@latest`).
2. Add a composition `Intro` (1920×1080, fps 30, durationInFrames 300).
3. Component: `<AbsoluteFill>` with a CSS gradient background; a centered `<h1>`
   whose `opacity` and `transform: scale(...)` are driven by
   `interpolate(frame, [0, 30], [0, 1])` and a `spring(...)`.
4. `npm run dev` to preview; iterate on the user's notes.
5. `npx remotion render Intro out/intro.mp4` for the final file.

## Tips

- Reusable templates: because compositions are code, the user can re-render the
  same template with different `--props` to mass-produce variations (e.g. one
  reel-intro template, many titles).
- Fonts/assets: drop files in `public/`, load with `staticFile(...)`; use
  `@remotion/google-fonts` for web fonts.
- If a render fails on a headless/CI machine, Remotion needs Chromium — it
  downloads one automatically, but in restricted environments point it at an
  existing Chromium with `--browser-executable`.
- This repo cannot ship Remotion itself; always scaffold it per-project.
