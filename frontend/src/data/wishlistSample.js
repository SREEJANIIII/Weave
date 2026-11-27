// Sample wishlist items, brand-specific size charts, and upcoming calendar occasions.
// All measurements in BRAND_SIZE_CHARTS and DEFAULT_SIZE_PROFILE are stored canonically in centimetres (cm).

export const CATEGORIES = ['Tops', 'Dresses', 'Trousers', 'Ethnic', 'Footwear', 'Outerwear'];

const CATEGORY_TO_UI = {
  top: 'Tops',
  tops: 'Tops',
  shirt: 'Tops',
  blouse: 'Tops',
  dress: 'Dresses',
  dresses: 'Dresses',
  trouser: 'Trousers',
  trousers: 'Trousers',
  pants: 'Trousers',
  jeans: 'Trousers',
  saree: 'Ethnic',
  sarees: 'Ethnic',
  kurta: 'Ethnic',
  ethnic: 'Ethnic',
  footwear: 'Footwear',
  shoes: 'Footwear',
  outerwear: 'Outerwear',
  coat: 'Outerwear',
  jacket: 'Outerwear',
};

const CATEGORY_TO_BACKEND = {
  Tops: 'tops',
  Dresses: 'dress',
  Trousers: 'trousers',
  Ethnic: 'saree',
  Footwear: 'footwear',
  Outerwear: 'outerwear',
};

export function normalizeCategoryLabel(category = '') {
  const key = String(category ?? '').trim().toLowerCase();
  return CATEGORY_TO_UI[key] || (category ? category.charAt(0).toUpperCase() + category.slice(1) : 'Dresses');
}

export function toBackendCategory(category = '') {
  return CATEGORY_TO_BACKEND[category] || String(category || 'dress').trim().toLowerCase();
}

export function resolveWishlistImage(item) {
  const url = item?.image_url ?? item?.image ?? '';
  if (url && !/https?:\/\/([^/]*\.)?example\.test\b/i.test(url)) return url;
  const pid = item?.product_id ?? '';
  if (pid === 'saanvi-blue-saree' || /saree/i.test(item?.product_name ?? item?.name ?? '')) return '/wishlist/saree-diwali.svg';
  if (pid === 'northline-black-wrap' || /black/i.test(item?.product_name ?? item?.name ?? '')) return '/wishlist/dress-noir.svg';
  if (pid === 'mira-block-heels') return '/wishlist/footwear-juttis.svg';
  const cat = normalizeCategoryLabel(item?.category);
  if (cat === 'Ethnic') return '/wishlist/saree-diwali.svg';
  if (cat === 'Trousers') return '/wishlist/trousers-linen.svg';
  if (cat === 'Tops') return '/wishlist/top-silk.svg';
  if (cat === 'Footwear') return '/wishlist/footwear-juttis.svg';
  return '/wishlist/dress-cobalt.svg';
}

export const OCCASION_SUGGESTIONS = ['Diwali', 'Wedding', 'Birthday', 'Party', 'Casual', 'Vacation', 'Festival'];

export const SAMPLE_IMAGE_PRESETS = [
  { label: 'Festive Saree / Ethnic', value: '/wishlist/saree-diwali.svg' },
  { label: 'Cobalt Wrap Dress', value: '/wishlist/dress-cobalt.svg' },
  { label: 'Noir Column Dress', value: '/wishlist/dress-noir.svg' },
  { label: 'Tailored Linen Trousers', value: '/wishlist/trousers-linen.svg' },
  { label: 'Ivory Silk Top', value: '/wishlist/top-silk.svg' },
  { label: 'Handwoven Juttis', value: '/wishlist/footwear-juttis.svg' },
];

export const DEFAULT_SIZE_PROFILE = {
  bust: 92,
  waist: 74,
  hips: 99,
  shoulder: 39,
  inseam: 76,
  height: 166,
  fit: 'regular', // 'slim' | 'regular' | 'oversized'
  unit: 'cm',     // 'cm' | 'in'
  preferredCategories: ['Dresses', 'Tops'],
  masked: false,
  encrypted: false,
  isSample: true,
};

export const DEFAULT_REMINDER_PREFS = {
  leadDays: [30, 14, 7],
  customDays: null,
  dismissedIds: [],
  approvedEventIds: [],
};

// Distinct brand size charts demonstrating real cross-brand size differences (in cm).
export const BRAND_SIZE_CHARTS = {
  'aurelia loom': {
    brand: 'Aurelia Studio',
    note: 'Sample chart — tailored European-inspired block; tends to run slightly fitted.',
    categories: {
      Dresses: {
        unit: 'cm',
        sizes: [
          { size: 'S', bust: [82, 86], waist: [64, 68], hips: [88, 92] },
          { size: 'M', bust: [87, 90], waist: [69, 72], hips: [93, 96] },
          { size: 'L', bust: [91, 95], waist: [73, 77], hips: [97, 101] },
          { size: 'XL', bust: [96, 101], waist: [78, 83], hips: [102, 107] },
        ],
      },
      Tops: {
        unit: 'cm',
        sizes: [
          { size: 'S', bust: [82, 86], shoulder: [36, 37.5], waist: [64, 68] },
          { size: 'M', bust: [87, 90], shoulder: [38, 39.5], waist: [69, 72] },
          { size: 'L', bust: [91, 95], shoulder: [40, 41.5], waist: [73, 77] },
          { size: 'XL', bust: [96, 101], shoulder: [42, 43.5], waist: [78, 83] },
        ],
      },
    },
  },
  'soraia': {
    brand: 'Soraia',
    note: 'Sample chart — relaxed contemporary drape; size M aligns with larger measurements.',
    categories: {
      Dresses: {
        unit: 'cm',
        sizes: [
          { size: 'XS', bust: [81, 85], waist: [63, 67], hips: [87, 91] },
          { size: 'S', bust: [86, 90], waist: [68, 72], hips: [92, 96] },
          { size: 'M', bust: [91, 96], waist: [73, 78], hips: [97, 102] },
          { size: 'L', bust: [97, 103], waist: [79, 85], hips: [103, 109] },
        ],
      },
      Tops: {
        unit: 'cm',
        sizes: [
          { size: 'XS', bust: [81, 85], shoulder: [35.5, 37], waist: [63, 67] },
          { size: 'S', bust: [86, 90], shoulder: [37.5, 39], waist: [68, 72] },
          { size: 'M', bust: [91, 96], shoulder: [39.5, 41], waist: [73, 78] },
          { size: 'L', bust: [97, 103], shoulder: [41.5, 43], waist: [79, 85] },
        ],
      },
    },
  },
  'kora atelier': {
    brand: 'Kora Atelier',
    note: 'Sample chart — Indian festive & ethnic wear block with balanced shoulder ease.',
    categories: {
      Ethnic: {
        unit: 'cm',
        sizes: [
          { size: 'S', bust: [84, 88], waist: [66, 70], hips: [90, 94], shoulder: [36, 37.5] },
          { size: 'M', bust: [89, 93], waist: [71, 75], hips: [95, 100], shoulder: [38, 39.5] },
          { size: 'L', bust: [94, 99], waist: [76, 81], hips: [101, 106], shoulder: [40, 41.5] },
          { size: 'XL', bust: [100, 106], waist: [82, 88], hips: [107, 113], shoulder: [42, 43.5] },
        ],
      },
    },
  },
  'warp & line': {
    brand: 'Warp & Line',
    note: 'Sample chart — numeric waist tailoring in cm.',
    categories: {
      Trousers: {
        unit: 'cm',
        sizes: [
          { size: '28', waist: [68, 71], hips: [92, 95], inseam: [74, 76] },
          { size: '30', waist: [72, 76], hips: [96, 100], inseam: [75, 78] },
          { size: '32', waist: [77, 81], hips: [101, 105], inseam: [76, 79] },
          { size: '34', waist: [82, 86], hips: [106, 110], inseam: [77, 80] },
        ],
      },
    },
  },
  'veda basics': {
    brand: 'Veda Basics',
    note: 'Sample chart — relaxed everyday shirting.',
    categories: {
      Tops: {
        unit: 'cm',
        sizes: [
          { size: 'S', bust: [84, 88], shoulder: [36, 37.5], waist: [66, 70] },
          { size: 'M', bust: [89, 94], shoulder: [38, 39.5], waist: [71, 76] },
          { size: 'L', bust: [95, 100], shoulder: [40, 41.5], waist: [77, 82] },
        ],
      },
    },
  },
  northline: {
    brand: 'Northline',
    note: 'Synthetic sample chart for Northline dresses (IN, cm).',
    categories: {
      Dresses: {
        unit: 'cm',
        sizes: [
          { size: 'S', bust: [80, 86], waist: [62, 68], hips: [86, 92] },
          { size: 'M', bust: [86, 92], waist: [68, 74], hips: [92, 98] },
          { size: 'L', bust: [92, 98], waist: [74, 80], hips: [98, 104] },
        ],
      },
    },
  },
  'saanvi studio': {
    brand: 'Saanvi Studio',
    note: 'Synthetic sample chart for Saanvi Studio ethnic & saree sets (IN, cm).',
    categories: {
      Ethnic: {
        unit: 'cm',
        sizes: [
          { size: 'S', bust: [82, 88], waist: [64, 70], hips: [88, 94] },
          { size: 'M', bust: [88, 94], waist: [70, 76], hips: [94, 100] },
          { size: 'L', bust: [94, 100], waist: [76, 82], hips: [100, 106] },
        ],
      },
    },
  },
};

function offsetIsoDate(daysFromToday) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + daysFromToday);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function createSampleWishlist() {
  return [
    {
      id: 'wl_diwali_saree',
      name: 'Chanderi Silk Kurta & Organza Saree Set',
      brand: 'Kora Atelier',
      category: 'Ethnic',
      occasion: 'Diwali',
      url: 'https://example.com/kora-atelier/chanderi-saree-set',
      image: '/wishlist/saree-diwali.svg',
      notes: 'Warm marigold zari border — check blouse fit before ordering.',
      savedAt: offsetIsoDate(-5),
      isSample: true,
    },
    {
      id: 'wl_blue_dress',
      name: 'Cobalt Structured Wrap Dress',
      brand: 'Aurelia Studio',
      category: 'Dresses',
      occasion: 'Wedding',
      url: 'https://example.com/aurelia-studio/cobalt-wrap-dress',
      image: '/wishlist/dress-cobalt.svg',
      notes: 'For the evening sangeet or friend’s wedding reception.',
      savedAt: offsetIsoDate(-9),
      isSample: true,
    },
    {
      id: 'wl_black_dress',
      name: 'Noir Draped Column Dress',
      brand: 'Soraia',
      category: 'Dresses',
      occasion: 'Birthday',
      url: 'https://example.com/soraia/noir-column-dress',
      image: '/wishlist/dress-noir.svg',
      notes: 'Compare with Aurelia Studio — Soraia runs a size more generous.',
      savedAt: offsetIsoDate(-3),
      isSample: true,
    },
    {
      id: 'wl_linen_trousers',
      name: 'Pleated Wide-Leg Linen Trousers',
      brand: 'Warp & Line',
      category: 'Trousers',
      occasion: 'Vacation',
      url: 'https://example.com/warp-and-line/pleated-linen-trousers',
      image: '/wishlist/trousers-linen.svg',
      notes: 'Sage linen for coastal trip dinners and travel days.',
      savedAt: offsetIsoDate(-12),
      isSample: true,
    },
    {
      id: 'wl_silk_top',
      name: 'Ivory Raw Silk Shell Blouse',
      brand: 'Veda Basics',
      category: 'Tops',
      occasion: 'Party',
      url: 'https://example.com/veda-basics/ivory-silk-blouse',
      image: '/wishlist/top-silk.svg',
      notes: 'Pairs cleanly with tailored trousers or a pleated skirt.',
      savedAt: offsetIsoDate(-2),
      isSample: true,
    },
    {
      id: 'wl_festive_juttis',
      name: 'Zardozi Handwoven Velvet Juttis',
      brand: 'Artisan Craft',
      category: 'Footwear',
      occasion: 'Diwali',
      url: 'https://example.com/artisan-craft/velvet-juttis',
      image: '/wishlist/footwear-juttis.svg',
      notes: 'No brand size chart published yet — confirm foot length before buying.',
      savedAt: offsetIsoDate(-4),
      isSample: true,
    },
  ];
}

export function createSampleOccasionEvents() {
  return [
    {
      id: 'occ_birthday',
      title: "Maya's birthday dinner",
      occasion: 'Birthday',
      date: offsetIsoDate(6),
      location: 'Olive Bistro',
      source: 'Sample Calendar',
    },
    {
      id: 'occ_diwali',
      title: 'Diwali celebration & card evening',
      occasion: 'Diwali',
      date: offsetIsoDate(14),
      location: 'Family home',
      source: 'Sample Calendar',
    },
    {
      id: 'occ_wedding',
      title: "Ananya & Dev's wedding reception",
      occasion: 'Wedding',
      date: offsetIsoDate(26),
      location: 'Lakeview Pavilion',
      source: 'Sample Calendar',
    },
    {
      id: 'occ_party',
      title: 'Studio winter mixer',
      occasion: 'Party',
      date: offsetIsoDate(11),
      location: 'Indiranagar',
      source: 'Sample Calendar',
    },
    {
      id: 'occ_vacation',
      title: 'Goa coastal weekend',
      occasion: 'Vacation',
      date: offsetIsoDate(42),
      location: 'South Goa',
      source: 'Sample Calendar',
    },
  ];
}

export function lookupBrandChart(brandName, category) {
  if (!brandName || !category) return null;
  const normalized = brandName.trim().toLowerCase();
  const normalizedCategory = normalizeCategoryLabel(category);
  // Match exact or partial alias (e.g. "Aurelia Studio" -> "aurelia loom")
  const aliasMap = {
    'aurelia studio': 'aurelia loom',
    'aurelia': 'aurelia loom',
    'brand a': 'aurelia loom',
    'brand b': 'soraia',
    'soraia studio': 'soraia',
    'kora': 'kora atelier',
    'warp and line': 'warp & line',
    'veda': 'veda basics',
    'saanvi': 'saanvi studio',
  };
  const key = BRAND_SIZE_CHARTS[normalized] ? normalized : aliasMap[normalized];
  const entry = key ? BRAND_SIZE_CHARTS[key] : null;
  if (!entry) return null;
  const catChart = entry.categories[normalizedCategory] || entry.categories[category];
  if (!catChart) return null;
  return {
    brand: entry.brand,
    note: entry.note,
    category: normalizedCategory,
    ...catChart,
  };
}

