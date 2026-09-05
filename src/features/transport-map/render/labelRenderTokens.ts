/**
 * Fixed screen-space offset shared by every renderer for station labels.
 * Positive X moves the label to the right; negative Y moves it above the
 * station marker, leaving the circle unobstructed at every zoom level.
 */
export const TRANSPORT_MAP_STATION_LABEL_PIXEL_OFFSET_CSS_PX = [18, -16] as const;

/**
 * Candidate screen-space placements shared by Canvas2D and Deck labels.
 * Keeping the marker-adjacent position first preserves the existing visual
 * in the common case; the remaining candidates give dense routes a stable
 * way to move a label around its station before it is hidden.
 */
export const TRANSPORT_MAP_STATION_LABEL_OFFSETS = [
  TRANSPORT_MAP_STATION_LABEL_PIXEL_OFFSET_CSS_PX,
  [-18, 18],
  [18, 22],
  [-18, -16],
  [0, -24],
  [0, 30],
] as const;
