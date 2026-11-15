import { Bone, Brain, Drop, Heart, Radioactive, ShieldPlus, Wind, type Icon, type IconWeight } from '@phosphor-icons/react';
import type { RegionId } from '../../types/contracts';

const ICONS: Record<RegionId, Icon> = {
  brain_mood: Brain,
  heart: Heart,
  lungs: Wind,
  immune: ShieldPlus,
  metabolism: Drop,
  bones_muscles: Bone,
  radiation: Radioactive,
};

/** Icon for a body region; takes its color from the text color. */
export function RegionIcon({ id, className = 'h-5 w-5', weight = 'regular' }: { id: RegionId; className?: string; weight?: IconWeight }) {
  const IconComponent = ICONS[id];
  return <IconComponent className={className} weight={weight} aria-hidden />;
}
