/**
 * Generates 500+ realistic retail products with authentic Indian brands,
 * EAN-13 barcodes, categories, wholesale prices, selling prices, and units.
 */

const categoriesData = [
  {
    category: 'Groceries & Staples',
    unit: 'packet',
    items: [
      { name: 'Aashirvaad Shudh Chakki Atta 5kg', wp: 235, sp: 260 },
      { name: 'Aashirvaad Shudh Chakki Atta 10kg', wp: 440, sp: 485 },
      { name: 'Pillsbury Chakki Fresh Atta 5kg', wp: 228, sp: 255 },
      { name: 'Fortune Shudh Chakki Atta 5kg', wp: 220, sp: 245 },
      { name: 'India Gate Basmati Rice Classic 1kg', wp: 175, sp: 205 },
      { name: 'India Gate Basmati Rice Feast Rozzana 1kg', wp: 98, sp: 120 },
      { name: 'Daawat Rozana Gold Basmati Rice 5kg', wp: 380, sp: 445 },
      { name: 'Fortune Biryani Special Basmati Rice 1kg', wp: 145, sp: 175 },
      { name: 'Tata Sampann Unpolished Toor Dal 1kg', wp: 165, sp: 188 },
      { name: 'Tata Sampann Moong Dal Split 1kg', wp: 135, sp: 155 },
      { name: 'Tata Sampann Chana Dal 1kg', wp: 95, sp: 115 },
      { name: 'Tata Sampann Urad Dal Whole 1kg', wp: 150, sp: 175 },
      { name: 'Tata Salt Vacuum Evaporated 1kg', wp: 22, sp: 28 },
      { name: 'Tata Salt Lite 1kg', wp: 40, sp: 48 },
      { name: 'Aashirvaad Iodised Crystal Salt 1kg', wp: 18, sp: 24 },
      { name: 'Madhur Pure & Hygienic Sugar 1kg', wp: 48, sp: 55 },
      { name: 'Madhur Pure & Hygienic Sugar 5kg', wp: 230, sp: 260 },
      { name: 'Rajdhani Sooji 500g', wp: 28, sp: 35 },
      { name: 'Rajdhani Maida 500g', wp: 26, sp: 32 },
      { name: 'Rajdhani Besan 500g', wp: 52, sp: 65 },
      { name: 'Rajdhani Poha 500g', wp: 32, sp: 42 },
      { name: 'Saffola Gold Pro Healthy Lifestyle Oil 1L', wp: 148, sp: 172 },
      { name: 'Fortune Sunlite Refined Sunflower Oil 1L', wp: 126, sp: 145 },
      { name: 'Fortune Kachi Ghani Pure Mustard Oil 1L', wp: 138, sp: 160 },
      { name: 'Dhara Kachi Ghani Mustard Oil 1L', wp: 134, sp: 155 },
      { name: 'Emami Healthy & Tasty Mustard Oil 1L', wp: 132, sp: 152 },
      { name: 'Amul Pure Ghee 1L Tin', wp: 545, sp: 595 },
      { name: 'Amul Pure Ghee 500ml Pouch', wp: 275, sp: 305 },
      { name: 'Patanjali Cow Ghee 1L Cartridge', wp: 560, sp: 615 },
      { name: 'Mother Dairy Pure Ghee 1L', wp: 540, sp: 590 },
    ],
  },
  {
    category: 'Spices & Masalas',
    unit: 'packet',
    items: [
      { name: 'Everest Turmeric Powder Haldi 100g', wp: 32, sp: 40 },
      { name: 'Everest Turmeric Powder Haldi 200g', wp: 62, sp: 76 },
      { name: 'Everest Red Chilli Powder Tikhalal 100g', wp: 52, sp: 65 },
      { name: 'Everest Coriander Powder Dhaniya 100g', wp: 34, sp: 42 },
      { name: 'Everest Garam Masala 100g', wp: 78, sp: 95 },
      { name: 'Everest Chaat Masala 100g', wp: 60, sp: 72 },
      { name: 'Everest Kitchen King Masala 100g', wp: 72, sp: 88 },
      { name: 'Everest Chhole Masala 100g', wp: 68, sp: 82 },
      { name: 'Everest Pav Bhaji Masala 100g', wp: 68, sp: 82 },
      { name: 'Everest Sambhar Masala 100g', wp: 65, sp: 78 },
      { name: 'MDH Deggi Mirch 100g', wp: 75, sp: 92 },
      { name: 'MDH Chana Masala 100g', wp: 74, sp: 90 },
      { name: 'MDH Chunky Chat Masala 100g', wp: 65, sp: 80 },
      { name: 'MDH Meat Masala 100g', wp: 82, sp: 100 },
      { name: 'Catch Black Pepper Powder 100g', wp: 110, sp: 135 },
      { name: 'Catch Kasuri Methi 50g', wp: 32, sp: 42 },
      { name: 'Catch Hing Compounded Asafoetida 50g', wp: 62, sp: 75 },
    ],
  },
  {
    category: 'Snacks & Biscuits',
    unit: 'packet',
    items: [
      { name: 'Parle-G Gold Gluco Biscuits 1kg', wp: 88, sp: 105 },
      { name: 'Britannia Good Day Butter Biscuits 600g', wp: 105, sp: 130 },
      { name: 'Britannia Good Day Cashew 200g', wp: 42, sp: 52 },
      { name: 'Britannia Marie Gold 1kg', wp: 110, sp: 135 },
      { name: 'Britannia Bourbon 150g', wp: 32, sp: 40 },
      { name: 'Oreo Original Vanilla Creme 120g', wp: 30, sp: 38 },
      { name: 'Sunfeast Dark Fantasy Choco Fills 300g', wp: 125, sp: 155 },
      { name: 'Sunfeast Mom’s Magic Cashew & Almond 200g', wp: 40, sp: 50 },
      { name: 'Maggi 2-Minute Noodles Masala 4-Pack 280g', wp: 52, sp: 60 },
      { name: 'Maggi 2-Minute Special Masala 70g', wp: 16, sp: 20 },
      { name: 'Yippee Magic Masala Noodles 240g', wp: 45, sp: 54 },
      { name: 'Kurkure Masala Munch 82g', wp: 16, sp: 20 },
      { name: 'Kurkure Solid Masti Twistee 85g', wp: 16, sp: 20 },
      { name: 'Lay’s India’s Magic Masala 50g', wp: 16, sp: 20 },
      { name: 'Lay’s American Style Cream & Onion 50g', wp: 16, sp: 20 },
      { name: 'Haldiram’s Bhujia Sev 400g', wp: 98, sp: 120 },
      { name: 'Haldiram’s All in One Namkeen 400g', wp: 98, sp: 120 },
      { name: 'Haldiram’s Aloo Bhujia 400g', wp: 98, sp: 120 },
      { name: 'Haldiram’s Khatta Meetha 400g', wp: 98, sp: 120 },
      { name: 'Haldiram’s Moong Dal 200g', wp: 55, sp: 68 },
      { name: 'Haldiram’s Navrattan 400g', wp: 98, sp: 120 },
      { name: 'Bikaji Bhujia No. 1 400g', wp: 92, sp: 115 },
    ],
  },
  {
    category: 'Beverages & Dairy',
    unit: 'pcs',
    items: [
      { name: 'Tata Tea Gold 500g', wp: 275, sp: 325 },
      { name: 'Tata Tea Premium 1kg', wp: 440, sp: 510 },
      { name: 'Red Label Tea 500g', wp: 255, sp: 300 },
      { name: 'Wagh Bakri Premium Leaf Tea 500g', wp: 260, sp: 310 },
      { name: 'Taj Mahal Tea 500g', wp: 320, sp: 375 },
      { name: 'Nescafe Classic Instant Coffee Jar 50g', wp: 160, sp: 190 },
      { name: 'Nescafe Classic Instant Coffee Jar 100g', wp: 310, sp: 365 },
      { name: 'Bru Instant Coffee Jar 100g', wp: 215, sp: 255 },
      { name: 'Horlicks Classic Malt Health Drink 500g', wp: 235, sp: 275 },
      { name: 'Bournvita Chocolate Health Drink 500g', wp: 225, sp: 265 },
      { name: 'Amul Taaza Homogenised Toned Milk 1L', wp: 68, sp: 75 },
      { name: 'Amul Gold Full Cream Milk 1L', wp: 76, sp: 84 },
      { name: 'Amul Butter 500g Carton', wp: 245, sp: 275 },
      { name: 'Amul Butter 100g', wp: 52, sp: 58 },
      { name: 'Amul Processed Cheese Cubes 200g', wp: 125, sp: 145 },
      { name: 'Amul Cheese Slices 200g (10 Slices)', wp: 135, sp: 155 },
      { name: 'Coca Cola Pet Bottle 750ml', wp: 34, sp: 40 },
      { name: 'Thums Up Pet Bottle 750ml', wp: 34, sp: 40 },
      { name: 'Sprite Pet Bottle 750ml', wp: 34, sp: 40 },
      { name: 'Frooti Mango Drink 1.2L', wp: 58, sp: 70 },
      { name: 'Maaza Mango Drink 1.2L', wp: 62, sp: 75 },
      { name: 'Kinley Packaged Drinking Water 1L', wp: 14, sp: 20 },
      { name: 'Bisleri Mineral Water 1L', wp: 15, sp: 20 },
    ],
  },
  {
    category: 'Personal Care & Hygiene',
    unit: 'pcs',
    items: [
      { name: 'Dettol Original Bathing Soap 125g (Pack of 4)', wp: 185, sp: 220 },
      { name: 'Lifebuoy Total 10 Soap 125g (Pack of 4)', wp: 140, sp: 168 },
      { name: 'Dove Cream Beauty Bathing Bar 100g (Pack of 3)', wp: 195, sp: 235 },
      { name: 'Pears Pure & Gentle Bathing Bar 125g (Pack of 3)', wp: 180, sp: 215 },
      { name: 'Lux Rose & Vitamin E Soap 100g (Pack of 4)', wp: 130, sp: 155 },
      { name: 'Santoor Sandal & Turmeric Soap 125g (Pack of 4)', wp: 145, sp: 175 },
      { name: 'Colgate Strong Teeth Toothpaste 200g', wp: 110, sp: 130 },
      { name: 'Colgate MaxFresh Peppermint Ice Gel 150g', wp: 115, sp: 138 },
      { name: 'Sensodyne Fresh Mint Sensitive Toothpaste 75g', wp: 160, sp: 190 },
      { name: 'Dabur Red Ayurvedic Toothpaste 200g', wp: 105, sp: 125 },
      { name: 'Head & Shoulders Anti-Dandruff Shampoo 180ml', wp: 165, sp: 195 },
      { name: 'Clinic Plus Strong & Long Shampoo 340ml', wp: 190, sp: 225 },
      { name: 'Pantene Pro-V Hair Fall Control Shampoo 180ml', wp: 155, sp: 185 },
      { name: 'Parachute 100% Pure Coconut Oil 250ml', wp: 105, sp: 125 },
      { name: 'Parachute 100% Pure Coconut Oil 500ml', wp: 195, sp: 230 },
      { name: 'Bajaj Almond Drops Hair Oil 190ml', wp: 125, sp: 150 },
      { name: 'Dabur Amla Hair Oil 275ml', wp: 110, sp: 135 },
      { name: 'Vaseline Total Moisture Body Lotion 200ml', wp: 160, sp: 190 },
      { name: 'Nivea Soft Light Moisturiser 100ml', wp: 150, sp: 180 },
      { name: 'Boroline Antiseptic Ayurvedic Cream 40g', wp: 40, sp: 50 },
      { name: 'Whisper Ultra Clean Sanitary Pads XL+ (15 Pads)', wp: 135, sp: 160 },
      { name: 'Stayfree Secure Extra Large Cottony (18 Pads)', wp: 115, sp: 140 },
    ],
  },
  {
    category: 'Cleaning & Household',
    unit: 'packet',
    items: [
      { name: 'Surf Excel Quick Wash Detergent Powder 1kg', wp: 175, sp: 205 },
      { name: 'Surf Excel Easy Wash Detergent Powder 1kg', wp: 125, sp: 148 },
      { name: 'Ariel Matic Front Load Detergent Powder 1kg', wp: 245, sp: 285 },
      { name: 'Tide Plus Double Power Detergent Lemon 1kg', wp: 115, sp: 135 },
      { name: 'Wheel 2 in 1 Detergent Powder 1kg', wp: 62, sp: 75 },
      { name: 'Rin Advanced Detergent Bar 250g (Pack of 4)', wp: 72, sp: 88 },
      { name: 'Vim Dishwash Bar 300g (Pack of 3)', wp: 55, sp: 68 },
      { name: 'Vim Dishwash Gel Lemon 500ml', wp: 105, sp: 125 },
      { name: 'Pril Lime Dishwash Liquid 425ml', wp: 95, sp: 115 },
      { name: 'Harpic Power Plus Toilet Cleaner Original 500ml', wp: 92, sp: 110 },
      { name: 'Harpic Power Plus Toilet Cleaner 1L', wp: 175, sp: 205 },
      { name: 'Lizol Floral Surface Floor Cleaner 500ml', wp: 95, sp: 115 },
      { name: 'Lizol Citrus Floor Cleaner Disinfectant 1L', wp: 180, sp: 215 },
      { name: 'GoodKnight Gold Flash Liquid Mosquito Refill (Twin Pack)', wp: 135, sp: 160 },
      { name: 'All Out Ultra Mosquito Repellent Refill (Twin Pack)', wp: 130, sp: 155 },
      { name: 'Hit Flying Insect Killer Spray Lime 400ml', wp: 185, sp: 220 },
      { name: 'Hit Crawling Insect Killer Black Cockroach Spray 400ml', wp: 195, sp: 235 },
      { name: 'Odonil Room Air Freshener Lavender Block 50g', wp: 52, sp: 65 },
      { name: 'Scotch-Brite Sponge Wipe (Pack of 3)', wp: 120, sp: 145 },
      { name: 'Scotch-Brite Heavy Duty Scrub Pad (Pack of 5)', wp: 70, sp: 85 },
    ],
  },
  {
    category: 'Electricals & Hardware',
    unit: 'pcs',
    items: [
      { name: 'Philips 9W LED Bulb Cool Daylight B22', wp: 70, sp: 95 },
      { name: 'Philips 12W LED Bulb Cool Daylight B22', wp: 95, sp: 130 },
      { name: 'Philips 20W LED Tubelight Batten 4ft', wp: 185, sp: 240 },
      { name: 'Havells 9W Adore LED Bulb', wp: 68, sp: 90 },
      { name: 'Havells 14W LED Bulb B22', wp: 110, sp: 150 },
      { name: 'Syska 9W Smart LED Bulb B22', wp: 65, sp: 88 },
      { name: 'Crompton 9W High Lumen LED Bulb', wp: 66, sp: 90 },
      { name: 'Anchor Penta 6A 1-Way Modular Switch White', wp: 18, sp: 25 },
      { name: 'Anchor Penta 16A 1-Way Modular Switch White', wp: 42, sp: 58 },
      { name: 'Anchor Penta 6A 3-Pin Socket with Safety Shutter', wp: 38, sp: 52 },
      { name: 'Anchor Penta 16A 3-Pin Heavy Duty Socket', wp: 68, sp: 90 },
      { name: 'Anchor 6-Way Modular Surface Concealed Board', wp: 85, sp: 120 },
      { name: 'Finolex FR PVC Insulated Wire 1.0 sq mm Red (90m)', wp: 1150, sp: 1350 },
      { name: 'Finolex FR PVC Insulated Wire 1.5 sq mm Blue (90m)', wp: 1650, sp: 1920 },
      { name: 'Finolex FR PVC Insulated Wire 2.5 sq mm Green (90m)', wp: 2650, sp: 3050 },
      { name: 'Polycab Optima 1.0 sq mm Copper Wire Red (90m)', wp: 1180, sp: 1380 },
      { name: 'Polycab Optima 1.5 sq mm Copper Wire Yellow (90m)', wp: 1680, sp: 1950 },
      { name: 'Steelgrip PVC Insulation Electrical Tape Black 10m', wp: 12, sp: 18 },
      { name: 'Steelgrip PVC Insulation Electrical Tape Red 10m', wp: 12, sp: 18 },
      { name: 'Steelgrip PVC Insulation Electrical Tape Blue 10m', wp: 12, sp: 18 },
      { name: 'Anchor 3-Pin Top 6A Power Plug', wp: 22, sp: 32 },
      { name: 'Anchor 3-Pin Top 16A Heavy Duty Power Plug', wp: 48, sp: 65 },
      { name: 'Duracell Ultra Alkaline AA Batteries (Pack of 4)', wp: 140, sp: 175 },
      { name: 'Duracell Ultra Alkaline AAA Batteries (Pack of 4)', wp: 140, sp: 175 },
      { name: 'Eveready 1012 Carbon Zinc D Size Cell (Pack of 2)', wp: 40, sp: 55 },
      { name: 'Taparia Heavy Duty 8-inch Combination Plier', wp: 220, sp: 275 },
      { name: 'Taparia 814 Line Tester Neon Bulb 500V', wp: 45, sp: 60 },
      { name: 'Taparia 6-Piece Screw Driver Set', wp: 190, sp: 240 },
      { name: 'Goldmedal 4-Outlet Spike Guard Extension Board 2m', wp: 240, sp: 310 },
      { name: 'Anchor Roma 4-Socket Surge Protector Extension Cord', wp: 290, sp: 375 },
    ],
  },
];

// Generates 500-1000 items deterministically with unique barcodes
export function generateStressTestProducts(count = 600) {
  const result = [];
  let barcodeCounter = 8901000000001n;

  // Flatten the curated catalog
  const catalog = [];
  categoriesData.forEach((catGroup) => {
    catGroup.items.forEach((item) => {
      catalog.push({
        name: item.name,
        category: catGroup.category,
        unit: catGroup.unit,
        wholesalePrice: item.wp,
        sellingPrice: item.sp,
      });
    });
  });

  const variants = [
    { suffix: '', wpMul: 1, spMul: 1 },
    { suffix: '(Economy Pack)', wpMul: 0.95, spMul: 0.96 },
    { suffix: '(Jumbo Offer Pack)', wpMul: 1.85, spMul: 1.9 },
    { suffix: '(Family Saver)', wpMul: 1.45, spMul: 1.5 },
    { suffix: '(Special Festive Edition)', wpMul: 1.05, spMul: 1.1 },
    { suffix: '(Wholesale Carton)', wpMul: 3.6, spMul: 3.8 },
  ];

  let i = 0;
  while (result.length < count) {
    const base = catalog[i % catalog.length];
    const variant = variants[Math.floor(i / catalog.length) % variants.length];
    i++;

    const name = variant.suffix ? `${base.name} ${variant.suffix}` : base.name;
    const wp = Math.round(base.wholesalePrice * variant.wpMul * 100) / 100;
    const sp = Math.round(base.sellingPrice * variant.spMul * 100) / 100;
    const stockQuantity = Math.floor(10 + Math.random() * 85);
    const lowStockThreshold = Math.floor(5 + Math.random() * 15);
    const barcode = String(barcodeCounter);
    barcodeCounter += 1n;

    result.push({
      name,
      barcode,
      category: base.category,
      unit: base.unit,
      wholesalePrice: wp,
      sellingPrice: sp,
      stockQuantity,
      lowStockThreshold,
      lastSoldAt: new Date(Date.now() - Math.floor(Math.random() * 30) * 86_400_000),
      isDeadStock: false,
    });
  }

  return result;
}
