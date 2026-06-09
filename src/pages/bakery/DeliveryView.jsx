import { useState, useEffect } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'

function getToday() { return new Date().toISOString().split('T')[0] }
function getYesterday(d) {
  const dt = new Date(d + 'T00:00:00'); dt.setDate(dt.getDate() - 1)
  return dt.toISOString().split('T')[0]
}
function fmt(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

const RETURN_CUSTOMERS = ['Himalayan Tea Stall', 'Krishna General Store', 'UK Shoppe']
const CAT_ORDER = ['Bread', 'Bhagsu', 'Panini', 'Hot Dog', 'Cookie', 'Cinnamon Roll', 'Dry Cake', 'Wet Cake', 'French Pastry', 'Other']

export default function DeliveryView({ standalone }) {
  const { signOut } = useAuth()
  const [screen, setScreen] = useState('start')
  const [selectedDate, setSelectedDate] = useState(getToday())
  const [selectedRun, setSelectedRun] = useState(1)
  const [orders, setOrders] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [loadedQtys, setLoadedQtys] = useState({})
  const [loadedItems, setLoadedItems] = useState({})
  const [deliveredQtys, setDeliveredQtys] = useState({})
  const [savingLoad, setSavingLoad] = useState(false)
  const [savingDelivery, setSavingDelivery] = useState(false)
  const [cashAmount, setCashAmount] = useState('')
  const [deliveredCustomers, setDeliveredCustomers] = useState({})
  const [cashSaved, setCashSaved] = useState({})
  const [savingCash, setSavingCash] = useState(false)
  const [editingDelivery, setEditingDelivery] = useState({})
  const [returnScreen, setReturnScreen] = useState(null)
  const [returnItems, setReturnItems] = useState([])
  const [returnQtys, setReturnQtys] = useState({})
  const [savingReturns, setSavingReturns] = useState(false)

  useEffect(() => { fetchData(selectedDate) }, [selectedDate])

  // Back button handling per screen
  useEffect(() => {
    if (screen === 'start') return
    window.history.pushState({ screen }, '')
    function onPop() {
      if (screen === 'customer') setScreen('delivery')
      else if (screen === 'delivery') setScreen('start')
      else if (screen === 'loading') setScreen('start')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [screen])

  async function fetchData(date) {
    const fetchDate = date || getToday()
    setLoading(true)
    const [{ data: o }, { data: c }] = await Promise.all([
      supabase.from('orders')
        .select('*, order_items(*, bakery_items(name, unit, category))')
        .eq('delivery_date', fetchDate)
        .in('status', ['sent_to_baker', 'bake_completed', 'delivered'])
        .order('created_at'),
      supabase.from('customers').select('*').eq('is_active', true).order('route_order').order('name')
    ])
    if (o && c) {
      const custMap = {}
      c.forEach(cu => { custMap[cu.id] = cu })
      const enriched = o.map(ord => ({ ...ord, customers: custMap[ord.customer_id] || null }))
      setOrders(enriched)
      setCustomers(c)
      // Init qtys
      const lq = {}, dq = {}
      for (const ord of enriched) {
        for (const oi of ord.order_items) {
          const bakedMax = oi.baked_qty != null ? oi.baked_qty : (oi.loaded_qty != null ? oi.loaded_qty : oi.quantity)
          const alreadyDel = oi.delivered_qty ?? 0
          const remaining = Math.max(0, bakedMax - alreadyDel)
          lq[oi.id] = oi.loaded_qty != null ? Math.min(oi.loaded_qty, remaining) : remaining
          dq[oi.id] = oi.delivered_qty ?? lq[oi.id]
        }
      }
      setLoadedQtys(lq)
      setDeliveredQtys(dq)
      // Delivered customers
      const dc = {}
      for (const ord of enriched) {
        if (ord.status === 'delivered') dc[ord.customer_id] = true
      }
      setDeliveredCustomers(dc)
      // Auto-derive screen
      const runOrds = enriched.filter(ord => (ord.delivery_run || 1) === selectedRun)
      if (runOrds.some(ord => ord.status === 'delivered')) {
        setScreen('delivery')
      } else if (runOrds.length > 0 && runOrds.every(ord => ord.order_items.every(oi => oi.loaded_qty != null))) {
        setScreen('delivery')
      }
    }
    setLoading(false)
  }

  // ── Loading ──────────────────────────────────────────────────
  const undeliveredOrders = orders.filter(o => o.status !== 'delivered' && (o.delivery_run || 1) === selectedRun)
  const loadingSummary = {}
  for (const ord of undeliveredOrders) {
    for (const oi of ord.order_items) {
      const key = oi.bakery_item_id
      const bakedMax = oi.baked_qty != null ? oi.baked_qty : oi.quantity
      const alreadyDel = oi.delivered_qty ?? 0
      const remaining = Math.max(0, bakedMax - alreadyDel)
      if (remaining === 0) continue
      if (!loadingSummary[key]) loadingSummary[key] = {
        name: oi.bakery_items?.name, category: oi.bakery_items?.category,
        items: [], totalOrdered: 0, totalBakedAll: 0
      }
      loadingSummary[key].items.push({ ...oi, remaining })
      loadingSummary[key].totalOrdered += oi.quantity
      loadingSummary[key].totalBakedAll += bakedMax
    }
  }
  const loadingRows = Object.values(loadingSummary).sort((a, b) => a.name.localeCompare(b.name))
  const loadedCount = loadingRows.filter(row => row.items.every(oi => loadedItems[oi.id])).length

  function allocateByRoute(row, total) {
    const sorted = [...row.items].sort((a, b) => {
      const ordA = orders.find(o => o.order_items.some(x => x.id === a.id))
      const ordB = orders.find(o => o.order_items.some(x => x.id === b.id))
      const cA = customers.find(c => c.id === ordA?.customer_id)
      const cB = customers.find(c => c.id === ordB?.customer_id)
      return (cA?.route_order || 99) - (cB?.route_order || 99)
    })
    let rem = total
    const alloc = {}
    for (const oi of sorted) {
      const give = Math.min(oi.quantity, rem)
      alloc[oi.id] = give
      rem -= give
    }
    return alloc
  }

  async function confirmLoaded(row) {
    const total = row.items.reduce((s, oi) => s + (parseInt(loadedQtys[oi.id]) || 0), 0)
    const alloc = allocateByRoute(row, total)
    setLoadedQtys(q => ({ ...q, ...alloc }))
    setLoadedItems(li => { const n = { ...li }; row.items.forEach(oi => { n[oi.id] = true }); return n })
    for (const oi of row.items) {
      const loadedQty = alloc[oi.id] ?? 0
      const upd = { loaded_qty: loadedQty }
      if (oi.baked_qty == null) upd.baked_qty = loadedQty
      await supabase.from('order_items').update(upd).eq('id', oi.id)
    }
  }

  async function completeLoading() {
    setSavingLoad(true)
    for (const row of loadingRows) {
      const total = row.items.reduce((s, oi) => s + (parseInt(loadedQtys[oi.id]) || 0), 0)
      const alloc = allocateByRoute(row, total)
      for (const oi of row.items) {
        const loadedQty = alloc[oi.id] ?? 0
        const upd = { loaded_qty: loadedQty }
        if (oi.baked_qty == null) upd.baked_qty = loadedQty
        await supabase.from('order_items').update(upd).eq('id', oi.id)
      }
    }
    setSavingLoad(false)
    setScreen('delivery')
  }

  // ── Delivery Route ───────────────────────────────────────────
  const runOrders = orders.filter(o => (o.delivery_run || 1) === selectedRun)
  const ordersCustomerIds = new Set(runOrders.map(o => o.customer_id))
  const routeCustomers = customers
    .filter(c => ordersCustomerIds.has(c.id) && (c.route_order || 99) < 99)
    .sort((a, b) => (a.route_order || 99) - (b.route_order || 99))
  const deliveredCount = Object.values(deliveredCustomers).filter(Boolean).length

  function getOrderForCustomer(customerId) {
    return runOrders.find(o => o.customer_id === customerId)
  }

  function openCustomer(customer) {
    const order = getOrderForCustomer(customer.id)
    if (!order) return
    setReturnScreen(null)
    setReturnItems([])
    setReturnQtys({})
    setCashAmount(getAutoPaymentAmount(customer, order, deliveredQtys))
    setSelectedCustomer(customer)
    setScreen('customer')
  }

  // ── Customer Delivery ────────────────────────────────────────
  function calcDeliveredAmount(order, dQtys) {
    return order.order_items.reduce((sum, oi) => {
      const qty = parseInt(dQtys[oi.id] ?? oi.quantity) || 0
      return sum + qty * parseFloat(oi.unit_price)
    }, 0).toFixed(2)
  }

  function getAutoPaymentAmount(customer, order, dQtys) {
    const days = customer.payment_days || 0
    if (days === 0) return calcDeliveredAmount(order, dQtys)
    if (days === 1) {
      const yOrder = orders.find(o => o.customer_id === customer.id && o.order_date === getYesterday(selectedDate))
      return yOrder ? calcDeliveredAmount(yOrder, dQtys) : ''
    }
    return ''
  }

  async function markDelivered() {
    const order = getOrderForCustomer(selectedCustomer.id)
    if (!order) return
    setSavingDelivery(true)
    try {
      await Promise.all(order.order_items.map(oi =>
        supabase.from('order_items')
          .update({ delivered_qty: parseInt(deliveredQtys[oi.id] ?? oi.quantity) || 0 })
          .eq('id', oi.id)
      ))
      const { error } = await supabase.from('orders').update({
        status: 'delivered', delivered_at: new Date().toISOString()
      }).eq('id', order.id)
      if (error) throw error
      const autoAmount = getAutoPaymentAmount(selectedCustomer, order, deliveredQtys)
      setCashAmount(autoAmount)
      setDeliveredCustomers(prev => ({ ...prev, [selectedCustomer.id]: true }))
      if (RETURN_CUSTOMERS.includes(selectedCustomer.name)) {
        const prevItems = order.order_items.map(oi => ({
          bakery_item_id: oi.bakery_item_id, name: oi.bakery_items?.name, unit_price: oi.unit_price
        })).sort((a, b) => a.name.localeCompare(b.name))
        setReturnItems(prevItems)
        setReturnScreen('ask')
      }
    } catch (e) {
      alert('Error saving delivery. Please try again.')
    }
    setSavingDelivery(false)
  }

  async function saveEditedDelivery() {
    if (!selectedCustomer || !selectedOrder) return
    setSavingDelivery(true)
    try {
      await Promise.all(selectedOrder.order_items.map(oi =>
        supabase.from('order_items')
          .update({ delivered_qty: parseInt(deliveredQtys[oi.id] ?? oi.quantity) || 0 })
          .eq('id', oi.id)
      ))
      setEditingDelivery(prev => ({ ...prev, [selectedCustomer.id]: false }))
    } catch (e) {
      alert('Error saving. Please try again.')
    }
    setSavingDelivery(false)
  }

  async function saveCash() {
    const amount = parseFloat(cashAmount)
    if (!amount || amount <= 0 || savingCash) return
    setSavingCash(true)
    const order = getOrderForCustomer(selectedCustomer.id)
    const { data: payment, error } = await supabase.from('payments').insert({
      customer_id: selectedCustomer.id,
      payment_date: selectedDate,
      amount,
      notes: `Cash collected on delivery — Order ${order?.id?.slice(0, 8)}`
    }).select().single()
    if (error || !payment) { setSavingCash(false); return }
    const { data: openInvoices } = await supabase.from('invoices')
      .select('*').eq('customer_id', selectedCustomer.id)
      .neq('status', 'paid').order('invoice_date', { ascending: true })
    let remaining = amount
    for (const inv of (openInvoices || [])) {
      if (remaining <= 0) break
      const balance = parseFloat(inv.total_amount) - parseFloat(inv.paid_amount)
      const allocate = Math.min(remaining, balance)
      const newPaid = parseFloat(inv.paid_amount) + allocate
      await supabase.from('payment_allocations').insert({ payment_id: payment.id, invoice_id: inv.id, allocated_amount: allocate })
      await supabase.from('invoices').update({ paid_amount: newPaid, status: newPaid >= parseFloat(inv.total_amount) ? 'paid' : 'part_paid' }).eq('id', inv.id)
      remaining -= allocate
    }
    setCashSaved(prev => ({ ...prev, [selectedCustomer.id]: true }))
    setSavingCash(false)
  }

  async function saveReturns() {
    if (!selectedCustomer) return
    setSavingReturns(true)
    const isLedgerCredit = selectedCustomer.name === 'Himalayan Tea Stall'
    const creditType = isLedgerCredit ? 'ledger_credit' : 'cash_deduction'
    const entries = returnItems
      .filter(item => parseInt(returnQtys[item.bakery_item_id] || 0) > 0)
      .map(item => ({
        customer_id: selectedCustomer.id, return_date: selectedDate,
        bakery_item_id: item.bakery_item_id,
        quantity: parseInt(returnQtys[item.bakery_item_id]),
        unit_price: item.unit_price,
        credit_amount: parseInt(returnQtys[item.bakery_item_id]) * item.unit_price,
        credit_type: creditType,
        notes: `Return on delivery - ${selectedCustomer.name}`
      }))
    if (entries.length > 0) {
      await supabase.from('returns').insert(entries)
      if (isLedgerCredit) {
        const totalCredit = entries.reduce((s, r) => s + r.credit_amount, 0)
        await supabase.from('payments').insert({
          customer_id: selectedCustomer.id, payment_date: selectedDate,
          amount: -totalCredit,
          notes: `Returns credit — ${entries.map(r => r.quantity + ' ' + returnItems.find(i => i.bakery_item_id === r.bakery_item_id)?.name).join(', ')}`
        })
      } else {
        const totalDeduction = entries.reduce((s, r) => s + r.credit_amount, 0)
        setCashAmount(prev => Math.max(0, parseFloat(prev || 0) - totalDeduction).toFixed(2))
      }
    }
    setReturnScreen('done')
    setSavingReturns(false)
  }

  const selectedOrder = selectedCustomer ? getOrderForCustomer(selectedCustomer.id) : null
  const isDelivered = selectedCustomer ? !!deliveredCustomers[selectedCustomer.id] : false

  // ── Header ───────────────────────────────────────────────────
  const header = standalone ? (
    <header className="bg-white border-b border-blue-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-3">
        {screen !== 'start' && screen !== 'delivery' && (
          <button onClick={() => setScreen(screen === 'customer' ? 'delivery' : 'start')}
            className="p-1 text-blue-600 hover:text-blue-800">←</button>
        )}
        <span className="text-xl">🚚</span>
        <div>
          <h1 className="text-sm font-semibold text-blue-900">Sunil Homemade Bakery</h1>
          <p className="text-xs text-blue-500">{fmt(selectedDate)}</p>
        </div>
      </div>
      <button onClick={signOut} className="text-sm text-blue-500 hover:text-blue-800">Sign out</button>
    </header>
  ) : null

  if (loading) return (
    <div className={standalone ? 'min-h-screen bg-blue-50' : ''}>
      {header}
      <div className="text-center py-16 text-blue-600">Loading delivery data...</div>
    </div>
  )

  // ── START SCREEN ─────────────────────────────────────────────
  if (screen === 'start') return (
    <div className={standalone ? 'min-h-screen bg-blue-50' : ''}>
      {header}
      <div className="max-w-md mx-auto px-4 py-10">
        <div className="bg-white rounded-2xl border border-blue-100 p-6">
          <div className="text-center mb-5">
            <div className="text-5xl mb-3">🚚</div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Ready for delivery?</h2>
          </div>
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-500 mb-1 block">Delivery Date</label>
            <input type="date" value={selectedDate}
              onChange={e => { setSelectedDate(e.target.value); setScreen('start') }}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div className="mb-5">
            <label className="text-xs font-medium text-gray-500 mb-1 block">Delivery Run</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map(run => {
                const cnt = orders.filter(o => (o.delivery_run || 1) === run && o.status !== 'delivered').length
                if (run > 1 && cnt === 0) return null
                return (
                  <button key={run} onClick={() => setSelectedRun(run)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${selectedRun === run ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>
                    Run {run}{cnt > 0 ? ` (${cnt})` : ''}
                  </button>
                )
              })}
            </div>
          </div>
          {runOrders.filter(o => o.status !== 'delivered').length === 0 ? (
            <p className="text-center text-amber-600 text-sm">No orders for Run {selectedRun} on {fmt(selectedDate)}.</p>
          ) : (
            <>
              <p className="text-center text-sm text-gray-400 mb-4">{runOrders.filter(o => o.status !== 'delivered').length} orders in Run {selectedRun}</p>
              <button onClick={() => setScreen('loading')}
                className="w-full py-4 rounded-2xl bg-blue-600 text-white font-semibold text-base hover:bg-blue-700 transition-colors">
                🏁 Start Loading — Run {selectedRun}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )

  // ── LOADING SCREEN ───────────────────────────────────────────
  if (screen === 'loading') return (
    <div className={standalone ? 'min-h-screen bg-blue-50' : ''}>
      {header}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-blue-900">Vehicle Loading</h2>
            <p className="text-sm text-blue-600 mt-0.5">{loadedCount} of {loadingRows.length} items loaded</p>
          </div>
          <div className="h-2 w-24 bg-blue-100 rounded-full overflow-hidden">
            <div className="h-2 bg-blue-500 rounded-full transition-all"
              style={{ width: loadingRows.length > 0 ? `${(loadedCount / loadingRows.length) * 100}%` : '0%' }} />
          </div>
        </div>
        {(() => {
          const catMap = {}
          for (const row of loadingRows) {
            const cat = row.category || 'Other'
            if (!catMap[cat]) catMap[cat] = []
            catMap[cat].push(row)
          }
          const sortedCats = Object.keys(catMap).sort((a, b) => {
            const ai = CAT_ORDER.indexOf(a); const bi = CAT_ORDER.indexOf(b)
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
          })
          const updateTotal = (row, maxLoad, newVal) => {
            const val = Math.max(0, Math.min(newVal, maxLoad))
            const newQtys = { ...loadedQtys }
            row.items.forEach((oi, idx) => { newQtys[oi.id] = idx === 0 ? val : 0 })
            setLoadedQtys(newQtys)
          }
          return sortedCats.map(cat => (
            <div key={cat} className="mb-4">
              <div className="px-1 py-1.5 text-xs font-bold text-blue-700 uppercase tracking-wide mb-2">{cat}</div>
              <div className="space-y-3">
                {catMap[cat].map((row, i) => {
                  const total = row.items.reduce((s, oi) => s + (parseInt(loadedQtys[oi.id]) || 0), 0)
                  const isLoaded = row.items.every(oi => loadedItems[oi.id])
                  const maxLoad = row.totalBakedAll
                  const isShort = row.totalBakedAll < row.totalOrdered
                  return (
                    <div key={i} className={`bg-white rounded-2xl border px-4 py-4 ${isLoaded ? 'border-green-200 bg-green-50/30' : 'border-blue-100'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <span className="font-semibold text-gray-800">{row.name}</span>
                          {isLoaded && <span className="ml-2 text-green-500 text-sm">✓ Loaded</span>}
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-400">Ordered: <span className="font-semibold text-gray-700">{row.totalOrdered}</span></div>
                          <div className={`text-xs ${isShort ? 'text-orange-500 font-semibold' : 'text-gray-400'}`}>
                            Baked: <span className="font-semibold">{row.totalBakedAll}</span>
                            {isShort && <span className="ml-1">(short {row.totalOrdered - row.totalBakedAll})</span>}
                          </div>
                        </div>
                      </div>
                      {isLoaded ? (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-green-700 font-semibold">{total} loaded</span>
                          <button onClick={() => setLoadedItems(li => { const n = { ...li }; row.items.forEach(oi => { delete n[oi.id] }); return n })}
                            className="text-xs text-gray-400 underline">edit</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <button onClick={() => updateTotal(row, maxLoad, total - 1)}
                            className="w-12 h-12 rounded-xl bg-gray-100 text-gray-700 text-2xl font-light hover:bg-gray-200 flex items-center justify-center">−</button>
                          <div className="flex-1 text-center">
                            <div className="text-3xl font-bold text-gray-800">{total}</div>
                            {total > maxLoad && <div className="text-xs text-red-500 mt-0.5">max {maxLoad}</div>}
                          </div>
                          <button onClick={() => updateTotal(row, maxLoad, total + 1)}
                            className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 text-2xl font-light hover:bg-blue-200 flex items-center justify-center">+</button>
                          <button onClick={() => confirmLoaded(row)}
                            className="w-20 h-12 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">Loaded</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        })()}
        <button onClick={completeLoading} disabled={savingLoad}
          className="w-full py-4 rounded-2xl bg-green-600 text-white font-semibold text-base hover:bg-green-700 disabled:opacity-50 transition-colors mt-2">
          {savingLoad ? 'Saving...' : '✅ Loading Complete — Start Delivery'}
        </button>
      </div>
    </div>
  )

  // ── DELIVERY ROUTE ───────────────────────────────────────────
  if (screen === 'delivery') return (
    <div className={standalone ? 'min-h-screen bg-blue-50' : ''}>
      {header}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-blue-900">Delivery Route — Run {selectedRun}</h2>
            <p className="text-sm text-blue-600 mt-0.5">{deliveredCount} of {routeCustomers.length} delivered</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">{fmt(selectedDate)}</div>
            {deliveredCount === routeCustomers.length && routeCustomers.length > 0 && (
              <span className="text-xs text-green-600 font-semibold">All delivered! 🎉</span>
            )}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-blue-100 overflow-hidden">
          {routeCustomers.map((customer, i) => {
            const order = getOrderForCustomer(customer.id)
            const isDel = !!deliveredCustomers[customer.id]
            const hasCash = cashSaved[customer.id]
            return (
              <div key={customer.id} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-blue-50' : ''} ${isDel ? 'bg-green-50/30' : ''}`}>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-5 text-center font-mono">{customer.route_order || i + 1}</span>
                  <div>
                    <div className="font-medium text-gray-800">{customer.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {order?.order_items?.map(oi => `${oi.quantity} ${oi.bakery_items?.name}`).join(' · ')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isDel && <span className="text-xs text-green-600 font-medium">✓{hasCash ? ' +Cash' : ''}</span>}
                  <button onClick={() => openCustomer(customer)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${isDel ? 'bg-gray-100 text-gray-500 hover:bg-gray-200' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                    {isDel ? 'View' : 'Deliver →'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        {deliveredCount === routeCustomers.length && routeCustomers.length > 0 && (
          <div className="mt-4 bg-green-50 border border-green-100 rounded-2xl p-5 text-center">
            <div className="text-3xl mb-2">🎉</div>
            <p className="font-semibold text-green-800 mb-1">All {deliveredCount} deliveries done!</p>
            <p className="text-sm text-green-600 mb-4">Great work today.</p>
            <button onClick={() => setScreen('start')}
              className="w-full py-3 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors">
              🏁 End of Delivery Run
            </button>
          </div>
        )}
      </div>
    </div>
  )

  // ── CUSTOMER SCREEN ──────────────────────────────────────────
  if (screen === 'customer' && selectedCustomer && selectedOrder) return (
    <div className={standalone ? 'min-h-screen bg-blue-50' : ''}>
      {header}
      <div className="max-w-md mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => setScreen('delivery')} className="text-blue-500 hover:text-blue-700 text-sm font-medium">← Route</button>
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{selectedCustomer.name}</h2>
            <p className="text-xs text-gray-400">{selectedCustomer.type} · {selectedCustomer.phone || ''}</p>
          </div>
        </div>

        {/* Items grouped by category */}
        <div className="bg-white rounded-2xl border border-blue-100 overflow-hidden mb-4">
          <div className="px-4 py-3 bg-blue-50 text-xs font-semibold text-blue-700 uppercase tracking-wide">Items</div>
          {(() => {
            const catMap = {}
            for (const oi of selectedOrder.order_items) {
              const cat = oi.bakery_items?.category || 'Other'
              if (!catMap[cat]) catMap[cat] = []
              catMap[cat].push(oi)
            }
            const sortedCats = Object.keys(catMap).sort((a, b) => {
              const ai = CAT_ORDER.indexOf(a); const bi = CAT_ORDER.indexOf(b)
              return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
            })
            return sortedCats.map(cat => (
              <div key={cat}>
                <div className="px-4 py-1.5 bg-gray-50 text-xs font-semibold text-gray-400 uppercase tracking-wide border-t border-gray-100">{cat}</div>
                {catMap[cat].map(oi => {
                  const bakedMax = oi.baked_qty != null ? oi.baked_qty : oi.quantity
                  const maxDel = oi.loaded_qty != null ? Math.min(oi.loaded_qty, bakedMax) : bakedMax
                  const curVal = parseInt(deliveredQtys[oi.id] ?? maxDel) || 0
                  const opts = Array.from({ length: maxDel + 1 }, (_, n) => n)
                  return (
                    <div key={oi.id} className="flex items-center justify-between px-4 py-3 border-t border-gray-50">
                      <div className="flex-1">
                        <div className="text-sm text-gray-800">{oi.bakery_items?.name}</div>
                        {(bakedMax < oi.quantity || (oi.loaded_qty != null && oi.loaded_qty < bakedMax)) && (
                          <div className="text-xs text-orange-500 mt-0.5">
                            {bakedMax < oi.quantity ? `baked: ${bakedMax}` : ''}
                            {oi.loaded_qty != null && oi.loaded_qty < bakedMax ? ` loaded: ${oi.loaded_qty}` : ''}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-gray-400">of {oi.quantity}</span>
                        {isDelivered && !editingDelivery[selectedCustomer.id] ? (
                          <span className="font-semibold text-green-700 w-12 text-center">{deliveredQtys[oi.id] ?? oi.quantity}</span>
                        ) : (
                          <select value={curVal}
                            onChange={e => setDeliveredQtys(q => ({ ...q, [oi.id]: parseInt(e.target.value) }))}
                            className="w-16 text-center px-1 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                            {opts.map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))
          })()}
        </div>

        {/* Delivered / Edit button */}
        {!isDelivered ? (
          <button onClick={markDelivered} disabled={savingDelivery}
            className="w-full py-4 rounded-2xl bg-green-600 text-white font-semibold text-base hover:bg-green-700 disabled:opacity-50 transition-colors mb-4">
            {savingDelivery ? 'Saving...' : '✅ Mark as Delivered'}
          </button>
        ) : editingDelivery[selectedCustomer.id] ? (
          <button onClick={saveEditedDelivery} disabled={savingDelivery}
            className="w-full py-4 rounded-2xl bg-blue-600 text-white font-semibold text-base hover:bg-blue-700 disabled:opacity-50 transition-colors mb-4">
            {savingDelivery ? 'Saving...' : '💾 Save Updated Quantities'}
          </button>
        ) : (
          <button onClick={() => setEditingDelivery(prev => ({ ...prev, [selectedCustomer.id]: true }))}
            className="w-full py-3 rounded-2xl bg-gray-100 text-gray-600 font-semibold text-sm hover:bg-gray-200 transition-colors mb-4">
            ✏️ Edit Delivered Quantities
          </button>
        )}

        {/* Returns */}
        {isDelivered && RETURN_CUSTOMERS.includes(selectedCustomer.name) && returnScreen !== null && (
          <div className="bg-white rounded-2xl border border-orange-100 p-4 mb-4">
            {returnScreen === 'ask' && (
              <>
                <p className="text-sm font-semibold text-gray-700 mb-1">Any returns today?</p>
                <p className="text-xs text-gray-400 mb-4">
                  {selectedCustomer.name === 'Himalayan Tea Stall' ? 'Returns credited to account' : 'Returns deducted from cash'}
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setReturnScreen('entry')}
                    className="flex-1 py-3 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors">
                    📦 Yes — Enter Returns
                  </button>
                  <button onClick={() => setReturnScreen('done')}
                    className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition-colors">
                    No Returns
                  </button>
                </div>
              </>
            )}
            {returnScreen === 'entry' && (
              <>
                <p className="text-sm font-semibold text-gray-700 mb-3">Enter return quantities</p>
                <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
                  {returnItems.map(item => (
                    <div key={item.bakery_item_id} className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-sm text-gray-800">{item.name}</div>
                        <div className="text-xs text-gray-400">₹{item.unit_price} each</div>
                      </div>
                      <input type="number" min="0"
                        value={returnQtys[item.bakery_item_id] || 0}
                        onChange={e => setReturnQtys(q => ({ ...q, [item.bakery_item_id]: parseInt(e.target.value) || 0 }))}
                        className="w-16 text-center px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ml-3" />
                    </div>
                  ))}
                </div>
                {returnItems.reduce((s, item) => s + (parseInt(returnQtys[item.bakery_item_id] || 0) * item.unit_price), 0) > 0 && (
                  <div className="bg-orange-50 rounded-xl px-4 py-2 mb-4 flex justify-between">
                    <span className="text-sm text-orange-700">Return credit</span>
                    <span className="font-mono font-semibold text-orange-700">
                      ₹{returnItems.reduce((s, item) => s + (parseInt(returnQtys[item.bakery_item_id] || 0) * item.unit_price), 0).toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={() => setReturnScreen('ask')}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold">← Back</button>
                  <button onClick={saveReturns} disabled={savingReturns}
                    className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50">
                    {savingReturns ? 'Saving...' : 'Save Returns'}
                  </button>
                </div>
              </>
            )}
            {returnScreen === 'done' && (
              <div className="flex items-center gap-2">
                <span className="text-orange-400">✓</span>
                <span className="text-sm text-gray-600">
                  {returnItems.some(i => parseInt(returnQtys[i.bakery_item_id] || 0) > 0)
                    ? `Returns recorded — ${selectedCustomer.name === 'Himalayan Tea Stall' ? 'credited to account' : 'deducted from cash'}`
                    : 'No returns today'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Cash collection */}
        {isDelivered && (selectedCustomer.payment_days === 0 || selectedCustomer.payment_days === 1) && (
          <div className="bg-white rounded-2xl border border-green-100 p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-green-500 text-lg">✓</span>
              <span className="font-semibold text-green-800">Delivered</span>
            </div>
            {cashSaved[selectedCustomer.id] ? (
              <div className="bg-green-50 rounded-xl px-4 py-3 text-center mb-3">
                <p className="text-xs text-green-600 mb-0.5">Cash collected</p>
                <p className="text-xl font-bold text-green-700">₹{cashAmount}</p>
              </div>
            ) : (
              <>
                <div className="bg-amber-50 rounded-xl px-4 py-3 text-center mb-4">
                  <p className="text-xs text-amber-600 mb-0.5">
                    {selectedCustomer.payment_days === 0 ? 'Amount to collect today' : "Yesterday's order"}
                  </p>
                  <p className="text-2xl font-bold text-amber-800">₹{cashAmount || '0.00'}</p>
                </div>
                <div className="flex gap-3 mb-3">
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 mb-1 block">Edit if different (₹)</label>
                    <input type="number" step="0.01" value={cashAmount}
                      onChange={e => setCashAmount(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                  </div>
                  <button onClick={saveCash} disabled={!cashAmount || parseFloat(cashAmount) <= 0 || savingCash}
                    className="self-end px-5 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-40 transition-colors">
                    {savingCash ? '...' : 'Save'}
                  </button>
                </div>
                <button onClick={() => setScreen('delivery')}
                  className="w-full py-3 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition-colors">
                  Skip — No Cash Today
                </button>
              </>
            )}
            {cashSaved[selectedCustomer.id] && (
              <button onClick={() => setScreen('delivery')}
                className="w-full mt-3 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
                ← Back to Delivery Route
              </button>
            )}
          </div>
        )}

        {/* Back to route */}
        {isDelivered && (selectedCustomer.payment_days > 1 || cashSaved[selectedCustomer.id]) && (
          <button onClick={() => setScreen('delivery')}
            className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors mb-4">
            ← Back to Delivery Route
          </button>
        )}
      </div>
    </div>
  )

  return null
}
