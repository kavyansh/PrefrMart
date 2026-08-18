/**
 * Word banks the seed composes into plausible product listings.
 * Kept apart from seed.ts so the generation logic stays readable.
 */

export type CategoryVocabulary = {
  brands: readonly string[];
  /** Product nouns. `%s` is never used — titles are assembled structurally. */
  types: readonly string[];
  /** Leading adjectives / model qualifiers. */
  qualifiers: readonly string[];
  /** Trailing model or variant tokens. */
  variants: readonly string[];
  /** Feature bullets; the seed samples 4-5 per product. */
  features: readonly string[];
  /** Spec keys mapped to candidate values. */
  specs: Readonly<Record<string, readonly string[]>>;
};

export const VOCABULARY: Readonly<Record<string, CategoryVocabulary>> = {
  electronics: {
    brands: ['Aurex', 'Nimbus', 'Voltaco', 'Kestrel', 'Lumeo', 'Tessra', 'Borne', 'Highfield'],
    types: [
      'Wireless Headphones',
      'Bluetooth Speaker',
      'Smartwatch',
      'Mechanical Keyboard',
      'USB-C Hub',
      'Noise Cancelling Earbuds',
      'Portable Power Bank',
      '4K Monitor',
      'Webcam',
      'Gaming Mouse',
      'Soundbar',
      'Tablet',
    ],
    qualifiers: ['Pro', 'Studio', 'Everyday', 'Compact', 'Ultra', 'Essential', 'Signature'],
    variants: ['X1', 'M2', 'Air', 'Max', 'Lite', 'SE', 'Plus', 'Gen 3'],
    features: [
      'Up to 40 hours of playback on a single charge',
      'Hybrid active noise cancellation with transparency mode',
      'USB-C fast charge — 10 minutes for 4 hours of use',
      'Bluetooth 5.3 with multipoint pairing to two devices',
      'IPX5 water resistance for workouts and light rain',
      'Low-latency mode tuned for mobile gaming',
      'Recycled aluminium chassis with a two-year warranty',
      'Companion app with a five-band custom EQ',
    ],
    specs: {
      Connectivity: ['Bluetooth 5.3', 'Bluetooth 5.2 + USB-C', 'Wi-Fi 6 + Bluetooth 5.1'],
      'Battery life': ['Up to 24 hours', 'Up to 40 hours', 'Up to 60 hours'],
      Weight: ['186 g', '242 g', '310 g', '54 g'],
      Warranty: ['1 year', '2 years'],
      'In the box': ['Device, USB-C cable, pouch', 'Device, cable, quick-start guide'],
    },
  },

  'home-kitchen': {
    brands: ['Hearthly', 'Copperleaf', 'Nordvik', 'Sagegrove', 'Ironwood', 'Marbleaux'],
    types: [
      'Non-Stick Frying Pan',
      'Stainless Steel Cookware Set',
      'Electric Kettle',
      'Cast Iron Skillet',
      'Air Fryer',
      'Ceramic Dinner Set',
      'Chef Knife',
      'Storage Container Set',
      'Coffee Press',
      'Blender',
    ],
    qualifiers: ['Classic', 'Everyday', 'Chef-Grade', 'Heritage', 'Compact', 'Family'],
    variants: ['24 cm', '5 L', '4-Piece', '12-Piece', '1.7 L', 'Duo'],
    features: [
      'Triple-layer non-stick coating, free of PFOA',
      'Induction, gas and electric compatible',
      'Stay-cool riveted handle',
      'Dishwasher safe and oven safe to 220°C',
      'Even heat distribution from an encapsulated base',
      'Nests for compact cupboard storage',
    ],
    specs: {
      Material: ['Stainless steel', 'Cast iron', 'Borosilicate glass', 'Anodised aluminium'],
      'Dishwasher safe': ['Yes', 'No — hand wash'],
      Capacity: ['1.7 L', '2.5 L', '5 L', '900 ml'],
      Warranty: ['1 year', '5 years', 'Lifetime'],
    },
  },

  fashion: {
    brands: ['Ridgeline', 'Atlas Made', 'Wovenly', 'Kinfolk Denim', 'Solstice', 'Grainline'],
    types: [
      'Running Shoes',
      'Cotton T-Shirt',
      'Denim Jacket',
      'Leather Belt',
      'Chino Trousers',
      'Wool Sweater',
      'Canvas Backpack',
      'Linen Shirt',
      'Sneakers',
      'Rain Shell',
    ],
    qualifiers: ['Everyday', 'Slim Fit', 'Relaxed', 'Heavyweight', 'Lightweight', 'Selvedge'],
    variants: ['Unisex', "Men's", "Women's", 'Cream', 'Charcoal', 'Indigo'],
    features: [
      'Breathable knit upper with a cushioned midsole',
      '100% organic cotton, garment washed for softness',
      'Reinforced stitching at every stress point',
      'YKK hardware throughout',
      'Machine washable at 30°C',
      'Responsibly sourced materials with a traceable supply chain',
    ],
    specs: {
      Material: ['100% organic cotton', '80% wool / 20% nylon', 'Full-grain leather', 'Recycled polyester'],
      Fit: ['Slim', 'Regular', 'Relaxed'],
      Care: ['Machine wash cold', 'Dry clean only', 'Hand wash'],
      'Country of origin': ['India', 'Portugal', 'Vietnam'],
    },
  },

  books: {
    brands: ['Fernwood Press', 'Blue Harbour', 'Orchard House', 'Marginalia', 'Tessellate Books'],
    types: [
      'Paperback Novel',
      'Hardcover Biography',
      'Cookbook',
      'Field Guide',
      'Poetry Collection',
      'Illustrated History',
      'Programming Handbook',
      'Graphic Novel',
    ],
    qualifiers: ['Collected', 'Annotated', 'Illustrated', 'Revised', 'Pocket'],
    variants: ['2nd Edition', 'Deluxe', 'Boxed Set', 'Anniversary Edition'],
    features: [
      'Sewn binding that lies flat when open',
      'Printed on FSC-certified uncoated stock',
      'Includes a 16-page colour plate section',
      'Fully revised with a new afterword',
      'Extensive index and further-reading notes',
    ],
    specs: {
      Format: ['Paperback', 'Hardcover', 'Boxed set'],
      Pages: ['248', '384', '512', '672'],
      Language: ['English'],
      Publisher: ['Fernwood Press', 'Blue Harbour', 'Orchard House'],
    },
  },

  'sports-fitness': {
    brands: ['Ironbark', 'Peakform', 'Northline', 'Vantage', 'Corebound'],
    types: [
      'Adjustable Dumbbell',
      'Yoga Mat',
      'Resistance Band Set',
      'Kettlebell',
      'Skipping Rope',
      'Foam Roller',
      'Cycling Helmet',
      'Insulated Water Bottle',
      'Pull-Up Bar',
    ],
    qualifiers: ['Pro', 'Studio', 'Home', 'Competition', 'Everyday'],
    variants: ['10 kg', '20 kg', '6 mm', 'Set of 5', '750 ml'],
    features: [
      'Knurled handle for a secure grip when hands are damp',
      'Non-slip textured surface on both faces',
      'Rubber-coated to protect flooring and reduce noise',
      'Compact enough to store under a bed',
      'Progressive resistance levels from light to heavy',
    ],
    specs: {
      Material: ['Cast iron with vinyl coating', 'TPE foam', 'Natural rubber', 'Stainless steel'],
      Weight: ['6 kg', '10 kg', '16 kg', '20 kg'],
      Thickness: ['4 mm', '6 mm', '8 mm'],
      Warranty: ['1 year', '3 years'],
    },
  },

  beauty: {
    brands: ['Saltwater', 'Lumen Ritual', 'Petal & Clay', 'Northbloom', 'Verdant'],
    types: [
      'Vitamin C Serum',
      'Hydrating Moisturiser',
      'Gentle Cleanser',
      'Mineral Sunscreen',
      'Repair Hair Mask',
      'Lip Balm Trio',
      'Retinol Night Cream',
      'Body Lotion',
    ],
    qualifiers: ['Daily', 'Overnight', 'Sensitive', 'Barrier', 'Brightening'],
    variants: ['30 ml', '50 ml', '100 ml', 'SPF 50', 'Fragrance Free'],
    features: [
      'Fragrance free and formulated for sensitive skin',
      'Dermatologist tested, non-comedogenic',
      'Airless pump keeps actives stable to the last drop',
      'No added alcohol, sulfates or essential oils',
      'Cruelty free and vegan',
    ],
    specs: {
      Volume: ['30 ml', '50 ml', '100 ml', '200 ml'],
      'Skin type': ['All skin types', 'Dry to normal', 'Oily to combination', 'Sensitive'],
      'Key ingredient': ['15% Vitamin C', 'Niacinamide', 'Hyaluronic acid', 'Zinc oxide'],
      'Shelf life': ['12 months after opening', '24 months unopened'],
    },
  },

  'toys-games': {
    brands: ['Brightwood', 'Puzzleworks', 'Tinker Lane', 'Meadowmoss', 'Roundhouse Games'],
    types: [
      'Wooden Building Blocks',
      'Jigsaw Puzzle',
      'Strategy Board Game',
      'Plush Toy',
      'Science Kit',
      'Card Game',
      'Ride-On Car',
      'Magnetic Tiles',
    ],
    qualifiers: ['Classic', 'Family', 'Beginner', 'Deluxe', 'Travel'],
    variants: ['1000 Pieces', '500 Pieces', 'Ages 3+', 'Ages 8+', 'Set of 60'],
    features: [
      'FSC-certified beech wood with water-based paint',
      'Plays in 30-45 minutes, 2-4 players',
      'No small parts — safe for toddlers',
      'Storage bag included for tidy-up time',
      'Encourages spatial reasoning and pattern recognition',
    ],
    specs: {
      'Age range': ['18 months+', '3 years+', '6 years+', '8 years+'],
      Players: ['1', '2-4', '2-6', '3-8'],
      'Piece count': ['24', '60', '500', '1000'],
      Material: ['Beech wood', 'Recycled cardboard', 'ABS plastic'],
    },
  },

  grocery: {
    brands: ['Millstone', 'Harvest Row', 'Two Rivers', 'Golden Field', 'Cedar & Sage'],
    types: [
      'Single Origin Coffee',
      'Extra Virgin Olive Oil',
      'Raw Honey',
      'Basmati Rice',
      'Dark Chocolate Bar',
      'Green Tea',
      'Almond Butter',
      'Rolled Oats',
      'Masala Blend',
    ],
    qualifiers: ['Organic', 'Cold Pressed', 'Stone Ground', 'Small Batch', 'Single Estate'],
    variants: ['250 g', '500 g', '1 kg', '500 ml', 'Pack of 3'],
    features: [
      'Sourced directly from growers at a published price',
      'Roasted to order and shipped within 48 hours',
      'No added sugar, preservatives or palm oil',
      'Resealable pouch keeps it fresh after opening',
      'Certified organic by a third-party auditor',
    ],
    specs: {
      Weight: ['250 g', '500 g', '1 kg'],
      Origin: ['Coorg, India', 'Andalusia, Spain', 'Assam, India', 'Sicily, Italy'],
      Certification: ['Organic', 'Fair trade', 'Organic + Fair trade'],
      Storage: ['Cool, dry place', 'Refrigerate after opening'],
    },
  },
};

/** Sentences composed into product descriptions. */
export const DESCRIPTION_OPENERS: readonly string[] = [
  'Built for daily use and designed to stay out of your way.',
  'A straightforward take on an everyday essential, without the markup.',
  'Made to last longer than the thing it replaces.',
  'Thoughtfully specified, honestly priced.',
  'The version we wanted and could not find, so we made it.',
];

export const DESCRIPTION_CLOSERS: readonly string[] = [
  'Free returns within 30 days if it is not right for you.',
  'Backed by our two-year support promise.',
  'Ships in plastic-free packaging.',
  'Rated highly for value by our customers.',
];

/**
 * Name bank for the seeded reviewer pool. Real listings show dozens of distinct
 * reviewers, and the `(productId, userId)` unique constraint means review volume is
 * capped by the number of accounts — so the pool needs to be reasonably large.
 */
export const FIRST_NAMES: readonly string[] = [
  'Aarav', 'Aditi', 'Ananya', 'Arjun', 'Bhavna', 'Chetan', 'Damini', 'Deepak',
  'Divya', 'Farhan', 'Gaurav', 'Harini', 'Imran', 'Ishaan', 'Jaya', 'Kabir',
  'Kavya', 'Lakshmi', 'Manish', 'Naina', 'Nikhil', 'Pooja', 'Pranav', 'Priya',
  'Rahul', 'Rhea', 'Rohan', 'Sanjay', 'Shreya', 'Siddharth', 'Tara', 'Varun',
  'Vikram', 'Yamini', 'Zoya', 'Elena', 'Marcus', 'Nadia', 'Oscar', 'Thomas',
];

export const LAST_NAMES: readonly string[] = [
  'Agarwal', 'Bhatt', 'Chandra', 'Desai', 'Fernandes', 'Gupta', 'Hegde', 'Iyer',
  'Joshi', 'Kulkarni', 'Lal', 'Mehta', 'Nair', 'Oberoi', 'Pillai', 'Rao',
  'Reddy', 'Sharma', 'Shetty', 'Trivedi', 'Varma', 'Verma', 'Kowalski', 'Okafor',
];

/** Review titles paired loosely with a rating band. */
export const REVIEW_TITLES: Readonly<Record<'high' | 'mid' | 'low', readonly string[]>> = {
  high: [
    'Exactly what I hoped for',
    'Worth every rupee',
    'Better than the brand I replaced',
    'Excellent quality',
    'Would buy again without hesitating',
    'Superb build',
  ],
  mid: [
    'Good, with a couple of caveats',
    'Solid for the price',
    'Does the job',
    'Decent but not remarkable',
    'Fine once you get used to it',
  ],
  low: [
    'Not for me',
    'Disappointed after two weeks',
    'Feels cheaper than it looks',
    'Stopped working quickly',
    'Returned it',
  ],
};

export const REVIEW_BODIES: Readonly<Record<'high' | 'mid' | 'low', readonly string[]>> = {
  high: [
    'Arrived a day early and felt substantial straight out of the box. Two months in and there is no sign of wear.',
    'I compared three options in this price band and this was clearly the best made. The finish is genuinely nice.',
    'Does precisely what it claims with no fuss. I have already recommended it to two colleagues.',
    'Setup took under five minutes. The instructions were actually clear, which is rarer than it should be.',
    'Replaced a much more expensive one that failed. This has been better in every way that matters to me.',
  ],
  mid: [
    'Perfectly serviceable. The finish is a little rougher than the photos suggest, but nothing that affects use.',
    'Works well for what I need. I would have liked a longer cable in the box, so factor that in.',
    'Good value. It is not luxurious, but at this price I did not expect it to be.',
    'Took a couple of days to get used to. Now that I have, I use it most days without thinking about it.',
    'Solid, though slightly heavier than I expected from the listing.',
  ],
  low: [
    'Looked right but felt flimsy in the hand. It started showing wear within a fortnight of light use.',
    'Mine had a defect out of the box. Support were polite and refunded quickly, but I did not want to gamble twice.',
    'The listing oversells it. It is usable, but not at this price when better options exist.',
    'Stopped holding a charge after about three weeks. Returned it without much trouble.',
  ],
};
