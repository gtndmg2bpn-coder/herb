// lib/siteCopy.js
// Words the public site uses in more than one place. Every claim here has to be
// true of the product today. Anything still being built says so.

export const FAQS = [
  {
    id: 'diet',
    q: 'Is Herb a diet?',
    a: 'No. Herb is a food platform. It plans what you eat around your weight goal and your week, and keeps track of what it costs. The recipes are high in protein and low in carbs because that is what keeps people full while they lose weight, but it is real food: curries, stews, a full English, a Sunday roast.',
  },
  {
    id: 'keto',
    q: 'Do I have to follow keto?',
    a: 'You don’t have to count anything. Most dishes come in under 12 g of carbs a portion, so if you eat the plan you’re eating low-carb without thinking about it. Every recipe also lists its carbs, so you can see exactly where you stand.',
  },
  {
    id: 'cost',
    q: 'How is the cost worked out?',
    a: 'Every ingredient carries a real UK supermarket price and pack size, from Tesco, Lidl, Aldi and Sainsbury’s. Herb costs the portion from what actually goes on the plate. Store-cupboard basics (salt, pepper, herbs, spices, oil, stock, garlic) are covered by a small fixed monthly pantry allowance rather than being added to every dish, because that is how people actually buy them.',
  },
  {
    id: 'sized',
    q: 'Why does it say “sized for an 80 kg adult”?',
    a: 'Because a portion depends on the person. Until you sign up, every recipe is shown for an 80 kg adult losing weight at a steady pace. Once Herb knows your weight and goal, the meat, fish, fats and veg are sized to you, and eggs and sausages in whole numbers. Herbs and spices stay as written: a thumb of ginger is the same whoever is eating.',
  },
  {
    id: 'shopping',
    q: 'How does the shopping work?',
    a: 'Most people do one big shop and small top-ups. Herb plans around that: whole packs, listed by aisle, and a plan that uses up what you open, so half a tin doesn’t sit in the fridge going off. You pick your shop days.',
  },
  {
    id: 'out',
    q: 'What if I eat out or go off plan?',
    a: 'Tell Herb. It doesn’t tell you off and it doesn’t start the week again. It rebalances the next few days so the week still lands where it should.',
  },
  {
    id: 'figures',
    q: 'Where do the nutrition figures come from?',
    a: 'From UK pack labels and the UK government’s food composition data (CoFID), with branded items cross-checked against Open Food Facts. Carbs are counted as UK labels count them, with fibre already excluded; nothing is subtracted on top. Each dish’s totals are added up line by line from its ingredients.',
  },
  {
    id: 'allergens',
    q: 'What about allergens?',
    a: 'Every recipe lists the UK’s 14 allergens it contains, and flags where an ingredient may contain one depending on the brand, for example stock cubes and gluten. Always check the label on what you buy.',
  },
  {
    id: 'gain',
    q: 'Can I use it to build muscle instead?',
    a: 'Herb is built for losing weight first. Building muscle uses the same engine with portions sized up and protein still first. That’s next on the list, not live yet.',
  },
];

export const STEPS = [
  {
    title: 'Tell Herb about you',
    body: 'Your weight, your goal and how fast you want to get there. Herb works out your calories and protein from that.',
  },
  {
    title: 'Get a week of proper food',
    body: 'Herb picks the dishes and sizes every portion to you: protein first, carbs low, a steady deficit. Batch-cook what freezes, eat fresh what doesn’t.',
  },
  {
    title: 'Shop once, top up as you go',
    body: 'One stock-up list, by aisle, in whole packs, then small fresh top-ups. Every portion is costed, so you know the week’s spend before you leave the house.',
  },
  {
    title: 'Life happens. The plan bends',
    body: 'Out for dinner, working late, a birthday? Tell Herb and it rebalances the next few days instead of starting again on Monday.',
  },
];
