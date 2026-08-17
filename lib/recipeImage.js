// lib/recipeImage.js
// Single source of truth for recipe image URLs.
// Phase 1: images are served from the repo at public/assets/<image_id>.jpg.
// CRITICAL: every recipe's <image_id>.jpg must exist in public/assets/ before this
// ships — a recipe whose image_id has no matching file will 404. All 55 files in first.
// The URL is an EXACT echo of the stored filename — do not transform the id, or the
// URL and the file can silently diverge. Keep image_ids clean at the data layer.
export function recipeImageUrl(imageId) {
  if (!imageId || typeof imageId !== 'string') return null;
  return `/assets/${imageId}.jpg`;
}
