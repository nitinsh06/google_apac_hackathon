import React from 'react';
import { Briefcase, Heart, Leaf, Lightbulb, MapPin, User } from 'lucide-react';
import type { JournalCategory } from '../types.ts';
import { categoryStyle } from '../lib/places.ts';

type IconComponent = React.ComponentType<{ className?: string }>;

/** One drawn icon per journal category, from the icon set used app-wide. */
export const CATEGORY_ICONS: Record<JournalCategory, IconComponent> = {
  Personal: User,
  Work: Briefcase,
  Ideas: Lightbulb,
  Gratitude: Heart,
  Mindfulness: Leaf,
};

export const categoryIcon = (category?: string): IconComponent =>
  (category && CATEGORY_ICONS[category as JournalCategory]) || MapPin;

/**
 * The gradient chip that stands in for a photo thumbnail — on map pins and on
 * the cards in the sheet, so a place looks the same wherever it appears.
 */
export const CoverTile: React.FC<{ category: JournalCategory; size?: 'sm' | 'md' | 'lg' }> = ({
  category,
  size = 'md',
}) => {
  const style = categoryStyle(category);
  const Icon = categoryIcon(category);
  const box =
    size === 'lg'
      ? 'w-12 h-12 rounded-2xl'
      : size === 'sm'
      ? 'w-7 h-7 rounded-lg'
      : 'w-10 h-10 rounded-xl';
  const glyph = size === 'lg' ? 'w-5 h-5' : size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <span
      className={`${box} shrink-0 flex items-center justify-center text-white shadow-sm ring-1 ring-black/5`}
      style={{ backgroundImage: `linear-gradient(140deg, ${style.from}, ${style.to})` }}
      aria-hidden="true"
    >
      <Icon className={`${glyph} stroke-[2.2]`} />
    </span>
  );
};
