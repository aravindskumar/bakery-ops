export function buildBakeList(itemQtyMap, cookieSurplusFromYesterday = 0) {
  const get = (name) => itemQtyMap[name] || 0
  const groups = []

  // ── BREAD ──────────────────────────────────────────────────
  const bigBread = get('Big Bread')
  const smallBread = get('Small Bread')
  if (bigBread > 0 || smallBread > 0) {
    groups.push({
      group: 'Bread Total',
      total: bigBread * 4 + smallBread,
      unit: 'small loaf equiv',
      showTotal: true,
      items: [
        { name: 'Big Bread', qty: bigBread, note: '×4' },
        { name: 'Small Bread', qty: smallBread },
      ].filter(i => i.qty > 0)
    })
  }

  // ── BHAGSU CAKE ───────────────────────────────────────────
  const bhagsu = get('Bhagsu Cake')
  if (bhagsu > 0) groups.push({ group: 'Bhagsu Cake', total: bhagsu, items: [] })

  // ── PANINI ────────────────────────────────────────────────
  const panini = get('Panini')
  if (panini > 0) groups.push({ group: 'Panini', total: panini, items: [] })

  // ── HOT DOG ───────────────────────────────────────────────
  const burger = get('Burger Bun')
  const sandwich = get('Sandwich')
  if (burger > 0 || sandwich > 0) {
    groups.push({
      group: 'Hot Dog Total',
      total: burger + sandwich,
      showTotal: true,
      items: [
        { name: 'Burger Bun', qty: burger },
        { name: 'Sandwich', qty: sandwich },
      ].filter(i => i.qty > 0)
    })
  }

  // ── COOKIES ───────────────────────────────────────────────
  const muesli = get('Muesli Cookie')
  const chocCookie = get('Chocolate Cookie')
  const rawCookieTotal = muesli + chocCookie - cookieSurplusFromYesterday
  const adjustedCookieTotal = Math.max(0, rawCookieTotal)
  const cookieRounded = adjustedCookieTotal > 0 ? Math.ceil(adjustedCookieTotal / 8) * 8 : 0
  const cookieSurplus = cookieRounded - adjustedCookieTotal
  const cookieBatches = cookieRounded / 8
  if (muesli > 0 || chocCookie > 0) {
    groups.push({
      group: 'Cookie Total',
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

  // ── CINNAMON ROLL ─────────────────────────────────────────
  const cinnamonRoll = get('Cinnamon Roll')
  if (cinnamonRoll > 0) groups.push({ group: 'Cinnamon Roll', total: cinnamonRoll, items: [] })

  // ── DRY CAKE SECTION ──────────────────────────────────────

  // Carrot Cake Total
  const carrotBig = get('Carrot Cake Big')
  const carrotSmall = get('Carrot Cake Small')
  if (carrotBig > 0 || carrotSmall > 0) {
    const total = carrotBig + (carrotSmall / 2)
    groups.push({
      group: 'Carrot Cake Total',
      total, totalDisplay: `${total % 1 === 0 ? total : total.toFixed(1)}`,
      showTotal: true,
      items: [
        { name: 'Carrot Cake Big', qty: carrotBig },
        { name: 'Carrot Cake Small', qty: carrotSmall },
      ].filter(i => i.qty > 0)
    })
  }

  // Brownie Total (includes White Choc)
  const brownieBig = get('Brownie Big')
  const brownieSmall = get('Brownie Small')
  const wcBig = get('White Chocolate Brownie Big')
  const wcSmall = get('White Chocolate Brownie Small')
  if (brownieBig > 0 || brownieSmall > 0 || wcBig > 0 || wcSmall > 0) {
    const total = brownieBig + (brownieSmall / 2) + wcBig + (wcSmall / 2)
    groups.push({
      group: 'Brownie Total',
      total, totalDisplay: `${total % 1 === 0 ? total : total.toFixed(1)}`,
      showTotal: true,
      items: [
        { name: 'Brownie Big', qty: brownieBig },
        { name: 'Brownie Small', qty: brownieSmall },
        { name: 'White Chocolate Brownie Big', qty: wcBig },
        { name: 'White Chocolate Brownie Small', qty: wcSmall },
      ].filter(i => i.qty > 0)
    })
  }

  // Vegan Banana Cake
  const veganBig = get('Vegan Banana Cake Big')
  const veganSmall = get('Vegan Banana Cake Small')
  if (veganBig > 0 || veganSmall > 0) {
    const total = veganBig + (veganSmall / 2)
    groups.push({
      group: 'Vegan Banana Cake Total',
      total, totalDisplay: `${total % 1 === 0 ? total : total.toFixed(1)}`,
      showTotal: true,
      items: [
        { name: 'Vegan Banana Cake Big', qty: veganBig },
        { name: 'Vegan Banana Cake Small', qty: veganSmall },
      ].filter(i => i.qty > 0)
    })
  }

  // Banana Chocolate
  const bananaChocBig = get('Banana Chocolate Big')
  const bananaChocSmall = get('Banana Chocolate Small')
  if (bananaChocBig > 0 || bananaChocSmall > 0) {
    const total = bananaChocBig + (bananaChocSmall / 2)
    groups.push({
      group: 'Banana Chocolate Total',
      total, totalDisplay: `${total % 1 === 0 ? total : total.toFixed(1)}`,
      showTotal: true,
      items: [
        { name: 'Banana Chocolate Big', qty: bananaChocBig },
        { name: 'Banana Chocolate Small', qty: bananaChocSmall },
      ].filter(i => i.qty > 0)
    })
  }

  // Chocolate Cake
  const chocCake = get('Chocolate Cake')
  if (chocCake > 0) groups.push({ group: 'Chocolate Cake', total: chocCake, items: [] })

  // ── WET CAKE SECTION ──────────────────────────────────────

  // Banoffee
  const banoffee = get('Banoffee')
  if (banoffee > 0) groups.push({ group: 'Banoffee', total: banoffee, items: [] })

  // Blueberry Cheesecake
  const blueberryBig = get('Blueberry Cheesecake Big')
  const blueberrySmall = get('Blueberry Cheesecake Small')
  if (blueberryBig > 0 || blueberrySmall > 0) {
    const total = blueberryBig + (blueberrySmall / 2)
    groups.push({
      group: 'Blueberry Cheesecake Total',
      total, totalDisplay: `${total % 1 === 0 ? total : total.toFixed(1)}`,
      showTotal: true,
      items: [
        { name: 'Blueberry Cheesecake Big', qty: blueberryBig },
        { name: 'Blueberry Cheesecake Small', qty: blueberrySmall },
      ].filter(i => i.qty > 0)
    })
  }

  // Mango Cheesecake
  const mangoBig = get('Mango Cheesecake Big')
  const mangoSmall = get('Mango Cheesecake Small')
  if (mangoBig > 0 || mangoSmall > 0) {
    const total = mangoBig + (mangoSmall / 2)
    groups.push({
      group: 'Mango Cheesecake Total',
      total, totalDisplay: `${total % 1 === 0 ? total : total.toFixed(1)}`,
      showTotal: true,
      items: [
        { name: 'Mango Cheesecake Big', qty: mangoBig },
        { name: 'Mango Cheesecake Small', qty: mangoSmall },
      ].filter(i => i.qty > 0)
    })
  }

  // Lotus Biscoff
  const biscoff = get('Lotus Biscoff Cheesecake Small')
  if (biscoff > 0) groups.push({ group: 'Lotus Biscoff Cheesecake', total: biscoff, items: [] })

  // Oreo Cheesecake
  const oreoBig = get('Oreo Cheesecake Big')
  const oreoSmall = get('Oreo Cheesecake Small')
  if (oreoBig > 0 || oreoSmall > 0) {
    const total = oreoBig + (oreoSmall / 2)
    groups.push({
      group: 'Oreo Cheesecake Total',
      total, totalDisplay: `${total % 1 === 0 ? total : total.toFixed(1)}`,
      showTotal: true,
      items: [
        { name: 'Oreo Cheesecake Big', qty: oreoBig },
        { name: 'Oreo Cheesecake Small', qty: oreoSmall },
      ].filter(i => i.qty > 0)
    })
  }

  // Apple Pie
  const applePie = get('Apple Pie')
  if (applePie > 0) groups.push({ group: 'Apple Pie', total: applePie, items: [] })

  // ── FRENCH PASTRY ─────────────────────────────────────────
  const croissantRaw = get('Croissant')
  const chocCroissantRaw = get('Chocolate Croissant')
  const danishRaw = get('Danish')
  const pastryRawTotal = croissantRaw + chocCroissantRaw + danishRaw
  let pastryAlert = null
  if (pastryRawTotal > 0 && pastryRawTotal < 12) {
    pastryAlert = `Total is ${pastryRawTotal} — below minimum of 12. Consider not baking or adding to reach 12.`
  } else if (pastryRawTotal >= 12 && pastryRawTotal % 6 !== 0) {
    const lower = Math.floor(pastryRawTotal / 6) * 6
    const upper = lower + 6
    pastryAlert = `Total is ${pastryRawTotal} — not a multiple of 6. Bake ${lower} or ${upper}?`
  }
  if (pastryRawTotal > 0) {
    groups.push({
      group: 'French Pastry Total',
      total: pastryRawTotal,
      showTotal: true,
      pastryAlert,
      items: [
        { name: 'Croissant', qty: croissantRaw },
        { name: 'Chocolate Croissant', qty: chocCroissantRaw },
        { name: 'Danish', qty: danishRaw },
      ].filter(i => i.qty > 0)
    })
  }

  return { groups, cookieSurplus }
}
