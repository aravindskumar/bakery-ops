// ─────────────────────────────────────────────────────────────
// Bake List Logic
// Takes a map of { itemName -> qty } and returns structured groups
// ─────────────────────────────────────────────────────────────

export function buildBakeList(itemQtyMap, cookieSurplusFromYesterday = 0) {
  const get = (name) => itemQtyMap[name] || 0

  const groups = []

  // ── BREAD ──────────────────────────────────────────────────
  const bigBread = get('Big Bread')
  const smallBread = get('Small Bread')
  const totalBread = bigBread * 4 + smallBread
  if (bigBread > 0 || smallBread > 0) {
    groups.push({
      group: 'Total Bread',
      total: totalBread,
      unit: 'small loaf equiv',
      showTotal: true,
      items: [
        { name: 'Big Bread', qty: bigBread, note: '×4' },
        { name: 'Small Bread', qty: smallBread },
      ].filter(i => i.qty > 0)
    })
  }

  // ── BHAGSU CAKE ───────────────────────────────────────────
  const bhagsuu = get('Bhagsu Cake')
  if (bhagsuu > 0) groups.push({ group: 'Bhagsu Cake', total: bhagsuu, items: [] })

  // ── PANINI ────────────────────────────────────────────────
  const panini = get('Panini')
  if (panini > 0) groups.push({ group: 'Panini', total: panini, items: [] })

  // ── COOKIES ───────────────────────────────────────────────
  const muesli = get('Muesli Cookie')
  const chocCookie = get('Chocolate Cookie')
  const rawCookieTotal = muesli + chocCookie - cookieSurplusFromYesterday
  const adjustedCookieTotal = Math.max(0, rawCookieTotal)
  const cookieRounded = adjustedCookieTotal > 0
    ? Math.ceil(adjustedCookieTotal / 8) * 8
    : 0
  const cookieSurplus = cookieRounded - adjustedCookieTotal
  const cookieBatches = cookieRounded / 8

  if (muesli > 0 || chocCookie > 0) {
    groups.push({
      group: 'Cookies',
      total: cookieBatches,
      unit: 'batches of 8',
      totalDisplay: `${cookieRounded} (${cookieBatches} batch${cookieBatches !== 1 ? 'es' : ''} of 8)`,
      surplus: cookieSurplus,
      items: [
        { name: 'Muesli Cookie', qty: muesli },
        { name: 'Chocolate Cookie', qty: chocCookie },
      ].filter(i => i.qty > 0)
    })
  }

  // ── CHOCOLATE CAKE ────────────────────────────────────────
  const chocCake = get('Choco Banana Cake')
  if (chocCake > 0) groups.push({ group: 'Choco Banana Cake', total: chocCake, items: [] })

  // ── CINNAMON ROLL ─────────────────────────────────────────
  const cinnamonRoll = get('Cinnamon Roll')
  if (cinnamonRoll > 0) groups.push({ group: 'Cinnamon Roll', total: cinnamonRoll, items: [] })

  // ── HOT DOG ───────────────────────────────────────────────
  const sandwich = get('Sandwich')
  const burger = get('Burger Bun')
  if (sandwich > 0 || burger > 0) {
    groups.push({
      group: 'Total Hot Dog Buns',
      total: sandwich + burger,
      showTotal: true,
      items: [
        { name: 'Sandwich', qty: sandwich },
        { name: 'Burger Bun', qty: burger },
      ].filter(i => i.qty > 0)
    })
  }

  // ── CAKE GROUPS (big + small, grouped for display) ────────
  const cakeGroups = [
    { label: 'Carrot Cake', big: 'Carrot Cake Big', small: 'Carrot Cake Small' },
    { label: 'Brownie', big: 'Brownie Big', small: 'Brownie Small' },
    { label: 'Banana Cake', big: 'Banana Cake Big', small: 'Banana Cake Small' },
    { label: 'Vegan Banana Cake', big: 'Vegan Banana Cake Big', small: 'Vegan Banana Cake Small' },
    { label: 'Oreo Cheesecake', big: 'Oreo Cheesecake Big', small: 'Oreo Cheesecake Small' },
    { label: 'Mango Cheesecake', big: 'Mango Cheesecake Big', small: 'Mango Cheesecake Small' },
    { label: 'Blueberry Cheesecake', big: 'Blueberry Cheesecake Big', small: 'Blueberry Cheesecake Small' },
    { label: 'White Chocolate Brownie', big: 'White Chocolate Brownie Big', small: 'White Chocolate Brownie Small' },
  ]

  for (const cg of cakeGroups) {
    const bigQty = get(cg.big)
    const smallQty = get(cg.small)
    if (bigQty > 0 || smallQty > 0) {
      const total = bigQty + (smallQty / 2)
      groups.push({
        group: `${cg.label} Total`,
        total,
        totalDisplay: `${total % 1 === 0 ? total : total.toFixed(1)}`,
        showTotal: true,
        items: [
          { name: cg.big, qty: bigQty },
          { name: cg.small, qty: smallQty },
        ].filter(i => i.qty > 0)
      })
    }
  }

  // ── STANDALONE ITEMS ─────────────────────────────────────
  const standalones = [
    'Chocolate Cookie', // already in cookies group, skip if grouped
    'Lotus Biscoff Cheesecake Small',
    'Banoffee',
    'Apple Pie',
    'Bhagsu Cake',
  ]
  // Chocolate Big
  const chocBig = get('Chocolate Cake Big') || get('Chocolate Big')
  if (chocBig > 0) groups.push({ group: 'Chocolate Big', total: chocBig, items: [] })

  const biscoff = get('Lotus Biscoff Cheesecake Small')
  if (biscoff > 0) groups.push({ group: 'Biscoff', total: biscoff, items: [] })

  const banoffee = get('Banoffee')
  if (banoffee > 0) groups.push({ group: 'Banoffee', total: banoffee, items: [] })

  const applePie = get('Apple Pie')
  if (applePie > 0) groups.push({ group: 'Apple Pie', total: applePie, items: [] })

  // ── MUFFINS ───────────────────────────────────────────────
  const bananaMuffin = get('Banana Muffin')
  const chocMuffin = get('Chocolate Muffin')
  if (bananaMuffin > 0) groups.push({ group: 'Banana Muffin', total: bananaMuffin, items: [] })
  if (chocMuffin > 0) groups.push({ group: 'Chocolate Muffin', total: chocMuffin, items: [] })

  // ── FRENCH PASTRY ─────────────────────────────────────────
  const croissant = get('Croissant')
  const chocCroissant = get('Chocolate Croissant')
  const danish = get('Danish')
  if (croissant > 0 || chocCroissant > 0 || danish > 0) {
    groups.push({
      group: 'French Pastry Total',
      total: croissant + chocCroissant + danish,
      showTotal: true,
      items: [
        { name: 'Croissant', qty: croissant },
        { name: 'Chocolate Croissant', qty: chocCroissant },
        { name: 'Danish', qty: danish },
      ].filter(i => i.qty > 0)
    })
  }

  return { groups, cookieSurplus }
}
