const SHOPPING_WORDS = /\b(buy|purchase|shop|shopping|wishlist|want to get|should i get)\b/i;

/** Outfit/wear questions are owned by Wardrobe unless the person explicitly asks to shop. */
export function isWardrobeQuestion(question) {
  const text = String(question ?? '');
  if (SHOPPING_WORDS.test(text)) return false;
  return /\b(wardrobe|closet|garments?|clothes?|owned|what should i wear|wear tomorrow|suggest .*outfit|outfit .*using|outfit for)\b/i.test(text);
}

export function validWardrobeItems(items, inventoryIds) {
  const allowed = new Set(inventoryIds);
  return (Array.isArray(items) ? items : []).filter((item) => item && allowed.has(item.id));
}
