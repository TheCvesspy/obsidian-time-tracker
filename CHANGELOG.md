# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Calendar Heatmap — readability of in-tile hours labels.** The previous
  `mix-blend-mode: difference` trick on `.time-tracker-month-hours-label`
  produced low-contrast olive/lime greens on the purple gradient and a muddy
  teal on coral overtime tiles. Replaced with a dedicated styling pair:
  - **Default tiles (purple/blue/green levels 1–4):** opaque white fill with
    a thin semi-transparent dark stroke (`paint-order: stroke`), giving the
    text a subtle halo that reads cleanly across the full intensity range
    and across all color schemes.
  - **Overtime tiles (level 5, coral `#ff6b6b`):** opaque deep-maroon fill
    (`#2a0808`), no stroke, slightly heavier weight (700). Yields ~7:1
    contrast (WCAG AAA) and stays tonally harmonious with the coral
    background.
- HeatmapRenderer now tags level-5 cells' hours labels with an `is-overtime`
  modifier class so the styling can be scoped without conditional inline
  styles.

### Files touched
- `src/ui/charts/HeatmapRenderer.ts` — month-view hours-label class assignment
- `styles.css` — `.time-tracker-month-hours-label` and `.is-overtime` rules

## [1.3.0] — Baseline

Initial entry in this changelog. See `README.md` and `agents.md` for the full
feature set as of 1.3.0.
