// The body image and where each body area sits on it.
// To use a different image: drop it in src/assets/body/, change the import, the size and the spots.
// x / y are percentages of the image width / height. `side` is where the label goes (outside the figure).
import body from '../../../assets/body/body-full.webp';
import type { RegionId } from '../../../types/contracts';

/** `aura` = whole-body area: drawn as a halo around the figure, its dot sits on the halo. */
export interface Spot { x: number; y: number; side: 'left' | 'right'; short?: string; aura?: boolean }

export const PLATE = {
  src: body,
  width: 653,
  height: 2315,
  alt: 'Full-length human figure showing the brain, lymph nodes, heart, lungs, digestive organs, muscles and bones',
  credit: 'Mikael Häggström, "Female shadow anatomy without labels" (Wikimedia Commons), public domain.',
};

/** How far the radiation halo reaches outside the figure (% of figure width / height). */
export const AURA = { x: 9, y: 1.2 };

export const SPOTS: Record<RegionId, Spot> = {
  brain_mood: { x: 48.5, y: 4.7, side: 'left', short: 'Brain & mood' },
  immune: { x: 61, y: 14.3, side: 'right', short: 'Immune' },
  lungs: { x: 37.5, y: 20.3, side: 'left' },
  heart: { x: 50.5, y: 24.2, side: 'right' },
  metabolism: { x: 49, y: 33.3, side: 'left' },
  radiation: { x: -AURA.x, y: 55, side: 'left', short: 'Radiation', aura: true },
  bones_muscles: { x: 66, y: 68, side: 'right', short: 'Bones & muscle' },
};

/** v4 glow zones: centre (% of the image, like SPOTS) and size in px on an 840 px tall figure. Radiation has no zone
 *  (whole body: the aura and a chip near the feet). */
export const ZONES: Partial<Record<RegionId, { cx: number; cy: number; w: number; h: number }>> = {
  brain_mood: { cx: 49, cy: 4.6, w: 70, h: 70 },
  immune: { cx: 61, cy: 14.3, w: 46, h: 36 },
  lungs: { cx: 46, cy: 20.5, w: 116, h: 78 },
  heart: { cx: 54, cy: 24, w: 48, h: 48 },
  metabolism: { cx: 49, cy: 34, w: 96, h: 76 },
  bones_muscles: { cx: 62, cy: 70, w: 110, h: 290 },
};
