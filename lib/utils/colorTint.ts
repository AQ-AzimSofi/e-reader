// A translucent wash of a theme color that stays legible on both the light and dark reader grounds.
export function toTint(color: string, opacityPercent: number): string {
  return `color-mix(in srgb, ${color} ${opacityPercent}%, transparent)`;
}
