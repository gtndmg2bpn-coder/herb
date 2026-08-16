// lib/recipeImage.js
// Single source of truth for recipe image URLs.
//
// Storage objects live in the public `recipe-images` bucket named `<image_id>.jpg`.
// Building this URL in ONE place is deliberate: the home cards and the recipe detail
// page previously built it separately and drifted on the `.jpg` extension — the cards
// omitted it and rendered blank while detail worked. Everything that shows a recipe
// image imports this so that can't happen again.
export function recipeImageUrl(imageId) {
  if (!imageId) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-images/${imageId}.jpg`;
}
