// lib/recipe-image.js
// Phase 1 — single-source local assets.
// CRITICAL: all 55 recipe images must exist in public/assets/ before this ships.
// Any recipe with an image_id but no matching file will 404.

/**
 * Return the public URL for a recipe image.
 * @param {string|null} imageId — filename stem (no extension)
 * @returns {string|null}
 */
export function recipeImageUrl(imageId) {
  if (!imageId || typeof imageId !== 'string') return null;
  // Sanitize to match asset filenames: lowercase, hyphenated
  const clean = imageId.toLowerCase().trim().replace(/\s+/g, '-');
  return `/assets/${clean}.jpg`;
}

/**
 * Return a CSS background-image value or null.
 * @param {string|null} imageId
 * @returns {string|null}
 */
export function recipeBackground(imageId) {
  const url = recipeImageUrl(imageId);
  return url ? `url(${url})` : null;
}
