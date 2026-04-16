<!-- prettier-ignore-start -->

<div align="center">

# `maptiveui-tunable`

**Live-edit CSS on React components.** Wrap any element, open a floating glass panel in dev mode, drag sliders and pick colors — then copy the final CSS or Tailwind into your code.

[![npm version](https://img.shields.io/npm/v/maptiveui-tunable.svg?style=flat-square&color=818cf8)](https://www.npmjs.com/package/maptiveui-tunable)
[![license](https://img.shields.io/npm/l/maptiveui-tunable.svg?style=flat-square&color=818cf8)](./LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/maptiveui-tunable?style=flat-square&color=818cf8)](https://bundlephobia.com/package/maptiveui-tunable)

</div>

<!-- prettier-ignore-end -->

> 🚧 **[maptiveui.dev](https://maptiveui.dev) is coming soon.** A live demo, full docs, and more tools in the Maptive UI family will land there. Star the [GitHub repo](https://github.com/jugert-mucoimaj/maptiveui-dev) to follow along.

---

## What this is

A dev-only tool for tuning component styles directly in your browser. Wrap a component in `<Tunable>`, define which CSS properties you want to tweak, and get a floating control panel that edits the element live. When it looks right, copy the final CSS or Tailwind classes and paste them into your code.

## What this isn't

- Not a visual page builder
- Not a design system
- Not shipped to your end users (gated to `NODE_ENV === "development"` by default)

---

## Install

```bash
npm i -D maptiveui-tunable
# or
pnpm add -D maptiveui-tunable
# or
yarn add -D maptiveui-tunable
```

**Peer deps:** React 17+, React DOM 17+.

## Five-line example

```tsx
import { Tunable } from "maptiveui-tunable";

<Tunable
  label="Hero"
  controls={{
    padding: { type: "range", min: 0, max: 80, default: 24 },
    borderRadius: { type: "range", min: 0, max: 32, default: 12 },
    background: { type: "color", default: "#818cf8" },
  }}
>
  <section>My hero section</section>
</Tunable>
```

In dev mode you'll see a `◆ HERO` badge appear when you hover the section. Click it to open the tune panel.

---

## How to drive it

**Open the panel**
- Click the floating `◆` badge that appears on hover
- Or hold **Alt / Option** and click the element (DevTools-style inspect)

**Work in the panel**
- Drag sliders for numeric properties (padding, radius, opacity, font-size…)
- Click the color swatch to open the HSV picker — hue, saturation, value, **alpha**, eyedropper, and preset swatches
- Toggle switches for boolean properties
- Dropdowns for enum properties
- Drag the panel header to reposition; drag the bottom-right corner to resize

**Keyboard shortcuts** (while a panel is open)
- `Esc` — close
- `⌘Z` / `Ctrl+Z` — undo
- `⌘⇧Z` / `Ctrl+Shift+Z` — redo

**Export your work**
- `Copy CSS` → clipboard as a ready-to-paste CSS block
- `Copy TW` → Tailwind utility classes (falls back to arbitrary-property syntax for anything without a direct utility)

**Persist across reloads**
```tsx
<Tunable label="Hero" persistKey="hero-section" controls={{ ... }}>
```

Values are saved to `localStorage` under `__tunable_v1:hero-section`.

---

## Controls

### `range`
Numeric slider mapped to a CSS property.

```ts
{ type: "range", min: 0, max: 100, step: 1, default: 20, unit: "px", maps: "padding" }
```

### `color`
HSV picker with alpha channel, eyedropper, and presets.

```ts
{ type: "color", default: "#818cf8", maps: "background" }
```

### `select`
Dropdown of string values.

```ts
{ type: "select", options: ["flex", "grid", "block"], default: "flex", maps: "display" }
```

### `toggle`
On/off switch that flips between two CSS values.

```ts
{ type: "toggle", default: 1, onValue: "block", offValue: "none", maps: "display" }
```

### The `maps` field
Specifies which CSS property a control writes to. If omitted, the object key is used directly. So `{ padding: { type: "range", ... } }` writes to `padding`; `{ heroPad: { type: "range", maps: "padding" } }` writes to `padding` but shows "Hero Pad" in the UI.

### Special range mappings
When a range's `maps` is one of these keys, its value composes into richer CSS:

| `maps` value            | Effect                                                     |
| ----------------------- | ---------------------------------------------------------- |
| `depth` / `boxShadow`   | Composes a realistic drop shadow with spread, blur, offset |
| `blur` / `backdropBlur` | Maps to `backdrop-filter: blur(...)`                       |
| `glow`                  | Composes a colored outer glow                              |

---

## `<Tunable>` props

| Prop            | Type                               | Default                              | Description                                                         |
| --------------- | ---------------------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| `children`      | `ReactNode`                        | —                                    | Element(s) to wrap                                                  |
| `controls`      | `TunableControls`                  | —                                    | Control definitions (required)                                      |
| `label`         | `string`                           | `undefined`                          | Name shown in the panel header and hover badge                      |
| `enabled`       | `boolean`                          | `NODE_ENV === "development"`         | Whether the tool is active                                          |
| `panelPosition` | `"right" \| "left" \| "bottom"`    | `"right"`                            | Where the panel appears relative to the element                     |
| `collapsed`     | `boolean`                          | `false`                              | Start with panel collapsed                                          |
| `as`            | `ElementType`                      | `"div"`                              | Wrapper element tag (use `"span"` in inline contexts, `"tr"`, etc.) |
| `persistKey`    | `string`                           | `undefined`                          | If set, saves values to `localStorage` under this key               |

---

## FAQ

**Does it ship to production?**
No. `enabled` defaults to `NODE_ENV === "development"`. The component early-returns children in prod. If your bundler doesn't dead-code-eliminate the rest, wrap the import behind an env check.

**What about bundle size?**
~10 kB min+gzip with React and React-DOM externalized. If you need it out of your prod bundle entirely, dynamic-import it only in dev, or pass `enabled={false}` and rely on your bundler's tree-shaking (the component early-returns children).

**Does it work with shadcn / MUI / Chakra / my design system?**
Yes. `<Tunable>` wraps whatever you put inside it. If the wrapper `<div>` breaks layout (inline text, table rows, flex children), use the `as` prop.

**Clicking a button inside my Tunable didn't select the panel — is that a bug?**
No. Regular clicks pass through to children untouched. To open the tune panel, click the `◆` badge or hold Alt/Option when you click.

**Is this safe to use in production code that's behind a feature flag?**
Yes — pass `enabled={isDevUser}` or similar. Just be aware that the component's internal state is still live, so panels opened by your internal team share the same localStorage namespace as anyone else with access.

---

## Roadmap

Things in the air for future versions:

- Theme-aware Tailwind output (`p-16` instead of `p-[64px]` when your config allows)
- Save-to-source-file via a build plugin (Vite / Next)
- Preset control bundles (`container`, `text`, `button`, …)
- Component-library-specific adapters (`maptiveui-tunable-shadcn`, etc.)
- A full interactive site at [maptiveui.dev](https://maptiveui.dev)

---

## Disclaimer

**Maptive UI is an independent open-source project and is not affiliated with Maptive Inc.** (the mapping software company at [maptive.com](https://maptive.com)).

## License

MIT © [Jugert Mucoimaj](https://github.com/jugert-mucoimaj)
