import { useState, useEffect } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'

function getToday() { return new Date().toISOString().split('T')[0] }
function getYesterday(fromDate) {
  const d = new Date(fromDate + 'T00:00:00'); d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}
function fmt(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// Screens: 'loading' | 'delivery' | 'customer'
export default function DeliveryView({ standalone }) {
  const { signOut } = useAuth()
  const [screen, setScreen] = useState('start') // start | loading | delivery | customer
  const [selectedDate, setSelectedDate] = useState(getToday())
  const [orders, setOrders] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [loadedQtys, setLoadedQtys] = useState({}) // orderItemId -> qty
  const [loadedItems, setLoadedItems] = useState({}) // orderItemId -> bool
  const [deliveredQtys, setDeliveredQtys] = useState({}) // orderItemId -> qty
  const [savingLoad, setSavingLoad] = useState(false)
  const [savingDelivery, setSavingDelivery] = useState(false)
  const [cashAmount, setCashAmount] = useState('')
  const [deliveredCustomers, setDeliveredCustomers] = useState({}) // customerId -> bool
  const [cashSaved, setCashSaved] = useState({}) // customerId -> bool
  const today = getToday()
  const yesterday = getYesterday(selectedDate)

  useEffect(() => { fetchData(selectedDate) }, [selectedDate])

  async function fetchData(date) {
    const fetchDate = date || getToday()
    setLoading(true)

    const [{ data: o }, { data: c }] = await Promise.all([
      supabase.from('orders')
        .select('*, order_items(*, bakery_items(name, unit, category))')
        .eq('delivery_date', fetchDate)
        .in('status', ['bake_completed', 'delivered'])
        .order('created_at'),
      supabase.from('customers').select('*').eq('is_active', true).order('route_order').order('name')
    ])

    if (o && c) {
      // Manually join customers to orders
      const custMap = {}
      c.forEach(cust => custMap[cust.id] = cust)
      const enriched = o.map(order => ({ ...order, customers: custMap[order.customer_id] || null }))
      setOrders(enriched)

      const lq = {}, dq = {}
      for (const order of enriched) {
        for (const oi of order.order_items) {
          lq[oi.id] = oi.loaded_qty ?? oi.quantity
          dq[oi.id] = oi.delivered_qty ?? oi.quantity
        }
      }
      setLoadedQtys(lq)
      setDeliveredQtys(dq)

      const dc = {}
      for (const order of enriched) {
        if (order.status === 'delivered') dc[order.customer_id] = true
      }
      setDeliveredCustomers(dc)
    }
    if (c) setCustomers(c)
    setLoading(false)
  }

  // ── Loading Step ─────────────────────────────────────────────
  // Aggregate all items across all orders for loading
  const loadingSummary = {}
  for (const order of orders) {
    for (const oi of order.order_items) {
      const key = oi.bakery_item_id
      if (!loadingSummary[key]) loadingSummary[key] = {
        name: oi.bakery_items?.name, unit: oi.bakery_items?.unit,
        category: oi.bakery_items?.category, items: [], totalOrdered: 0
      }
      loadingSummary[key].items.push(oi)
      loadingSummary[key].totalOrdered += oi.quantity
    }
  }
  const loadingRows = Object.values(loadingSummary).sort((a, b) => a.name.localeCompare(b.name))
  const allLoaded = loadingRows.every(row => row.items.every(oi => loadedItems[oi.id]))
  const loadedCount = loadingRows.filter(row => row.items.every(oi => loadedItems[oi.id])).length

  async function confirmLoaded(row) {
    const total = row.items.reduce((s, oi) => s + (parseInt(loadedQtys[oi.id]) || 0), 0)
    const newLoaded = { ...loadedItems }
    row.items.forEach(oi => newLoaded[oi.id] = true)
    setLoadedItems(newLoaded)
    // Save loaded_qty to DB
    for (const oi of row.items) {
      await supabase.from('order_items').update({ loaded_qty: parseInt(loadedQtys[oi.id]) || oi.quantity }).eq('id', oi.id)
    }
  }

  async function completeLoading() {
    setSavingLoad(true)
    // Save all loaded qtys
    for (const order of orders) {
      for (const oi of order.order_items) {
        await supabase.from('order_items').update({ loaded_qty: parseInt(loadedQtys[oi.id]) || oi.quantity }).eq('id', oi.id)
      }
    }
    setSavingLoad(false)
    setScreen('delivery')
  }

  // ── Delivery Route ────────────────────────────────────────────
  // Only customers with orders today
  const ordersCustomerIds = new Set(orders.map(o => o.customer_id))
  const routeCustomers = customers
    .filter(c => ordersCustomerIds.has(c.id))
    .sort((a, b) => (a.route_order || 99) - (b.route_order || 99))

  function getOrderForCustomer(customerId) {
    return orders.find(o => o.customer_id === customerId)
  }

  // ── Customer Delivery ─────────────────────────────────────────
  function openCustomer(customer) {
    const order = getOrderForCustomer(customer.id)
    if (!order) return
    // Init delivered qtys from loaded qtys
    const dq = { ...deliveredQtys }
    for (const oi of order.order_items) {
      if (!dq[oi.id]) dq[oi.id] = loadedQtys[oi.id] ?? oi.quantity
    }
    setDeliveredQtys(dq)
    setCashAmount(getAutoPaymentAmount(customer, order))
    setSelectedCustomer(customer)
    setScreen('customer')
  }

  function getAutoPaymentAmount(customer, order) {
    const days = customer.payment_days || 0
    if (days === 0) return parseFloat(order?.total_amount || 0).toFixed(2)
    if (days === 1) {
      // Find yesterday's order
      const yOrder = orders.find(o => o.customer_id === customer.id && o.order_date === yesterday)
      return yOrder ? parseFloat(yOrder.total_amount || 0).toFixed(2) : ''
    }
    return '' // longer terms — open
  }

  async function markDelivered() {
    const order = getOrderForCustomer(selectedCustomer.id)
    if (!order) return
    setSavingDelivery(true)

    // Save delivered qtys
    for (const oi of order.order_items) {
      await supabase.from('order_items')
        .update({ delivered_qty: parseInt(deliveredQtys[oi.id]) || oi.quantity })
        .eq('id', oi.id)
    }

    // Mark order as delivered
    await supabase.from('orders').update({
      status: 'delivered',
      delivered_at: new Date().toISOString()
    }).eq('id', order.id)

    setDeliveredCustomers(prev => ({ ...prev, [selectedCustomer.id]: true }))
    setSavingDelivery(false)
  }

  async function saveCash() {
    const amount = parseFloat(cashAmount)
    if (!amount || amount <= 0) return
    const order = getOrderForCustomer(selectedCustomer.id)

    const { data: payment, error } = await supabase.from('payments').insert({
      customer_id: selectedCustomer.id,
      payment_date: selectedDate,
      amount,
      notes: `Cash collected on delivery — Order ${order?.id?.slice(0, 8)}`
    }).select().single()

    if (error || !payment) return

    // Auto-allocate to oldest unpaid invoices
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
  }

  const deliveredCount = Object.values(deliveredCustomers).filter(Boolean).length
  const selectedOrder = selectedCustomer ? getOrderForCustomer(selectedCustomer.id) : null
  const isDelivered = selectedCustomer ? deliveredCustomers[selectedCustomer.id] : false

  // ── Render ────────────────────────────────────────────────────
  const header = standalone ? (
    <header className="bg-white border-b border-blue-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-3">
        {screen !== 'start' && screen !== 'delivery' && (
          <button onClick={() => setScreen(screen === 'customer' ? 'delivery' : 'start')}
            className="p-1 text-blue-600 hover:text-blue-800">←</button>
        )}
        <span className="text-xl">🚚</span>
        <div>
          <h1 className="text-sm font-semibold text-blue-900">Delivery</h1>
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

  // START SCREEN
  if (screen === 'start') return (
    <div className={standalone ? 'min-h-screen bg-blue-50' : ''}>
      {header}
      <div className="max-w-md mx-auto px-4 py-10">
        <div className="bg-white rounded-2xl border border-blue-100 p-6">
          <div className="text-center mb-5">
            <div className="text-5xl mb-3">🚚</div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Ready for delivery?</h2>
          </div>
          <div className="mb-5">
            <label className="text-xs font-medium text-gray-500 mb-1 block">Delivery Date</label>
            <input type="date" value={selectedDate}
              onChange={e => { setSelectedDate(e.target.value); fetchData(e.target.value) }}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          {loading ? (
            <p className="text-center text-blue-500 text-sm">Loading...</p>
          ) : orders.length === 0 ? (
            <p className="text-center text-amber-600 text-sm">No baked orders found for {fmt(selectedDate)}.</p>
          ) : (
            <>
              <p className="text-center text-sm text-gray-400 mb-4">{orders.length} orders for {fmt(selectedDate)}</p>
              <button onClick={() => setScreen('loading')}
                className="w-full py-4 rounded-2xl bg-blue-600 text-white font-semibold text-base hover:bg-blue-700 transition-colors">
                🏁 Start Loading Operations
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )

  // LOADING SCREEN
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
            <div className="h-2 bg-blue-500 rounded-full transition-all" style={{ width: `${(loadedCount / loadingRows.length) * 100}%` }} />
          </div>
        </div>

        <div className="space-y-3 mb-4">
          {loadingRows.map((row, i) => {
            const totalLoaded = row.items.reduce((s, oi) => s + (parseInt(loadedQtys[oi.id]) || 0), 0)
            const isLoaded = row.items.every(oi => loadedItems[oi.id])
            const isShort = totalLoaded < row.totalOrdered

            function updateTotal(newVal) {
              const val = Math.max(0, newVal)
              const newQtys = { ...loadedQtys }
              row.items.forEach((oi, idx) => { newQtys[oi.id] = idx === 0 ? val : 0 })
              setLoadedQtys(newQtys)
            }

            return (
              <div key={i} className={`bg-white rounded-2xl border px-4 py-4 ${isLoaded ? 'border-green-200 bg-green-50/30' : 'border-blue-100'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-semibold text-gray-800">{row.name}</span>
                    {isLoaded && <span className="ml-2 text-green-500 text-sm">✓ Loaded</span>}
                  </div>
                  <span className="text-xs text-gray-400">To load: <span className="font-semibold text-gray-700">{row.totalOrdered}</span></span>
                </div>

                {isLoaded ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-green-700 font-semibold">{totalLoaded} loaded{isShort ? ` (short by ${row.totalOrdered - totalLoaded})` : ''}</span>
                    <button onClick={() => setLoadedItems(prev => { const n = {...prev}; row.items.forEach(oi => delete n[oi.id]); return n })}
                      className="text-xs text-gray-400 underline underline-offset-2">edit</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button onClick={() => updateTotal(totalLoaded - 1)}
                      className="w-12 h-12 rounded-xl bg-gray-100 text-gray-700 text-2xl font-light hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center transition-colors">−</button>
                    <div className="flex-1 text-center">
                      <div className="text-3xl font-bold text-gray-800">{totalLoaded}</div>
                      {isShort && <div className="text-xs text-orange-500 mt-0.5">short by {row.totalOrdered - totalLoaded}</div>}
                    </div>
                    <button onClick={() => updateTotal(totalLoaded + 1)}
                      className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 text-2xl font-light hover:bg-blue-200 active:bg-blue-300 flex items-center justify-center transition-colors">+</button>
                    <button onClick={() => confirmLoaded(row)}
                      className="w-20 h-12 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors">
                      Loaded
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <button onClick={completeLoading} disabled={savingLoad}
          className="w-full py-4 rounded-2xl bg-green-600 text-white font-semibold text-base hover:bg-green-700 disabled:opacity-50 transition-colors">
          {savingLoad ? 'Saving...' : '✅ Loading Complete — Start Delivery'}
        </button>
      </div>
    </div>
  )

  // DELIVERY ROUTE SCREEN
  if (screen === 'delivery') return (
    <div className={standalone ? 'min-h-screen bg-blue-50' : ''}>
      {header}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-blue-900">Delivery Route</h2>
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
            const isDelivered = deliveredCustomers[customer.id]
            const hasCash = cashSaved[customer.id]
            return (
              <div key={customer.id} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-blue-50' : ''} ${isDelivered ? 'bg-green-50/30' : ''}`}>
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
                  {isDelivered && <span className="text-xs text-green-600 font-medium">✓ {hasCash ? '+ Cash' : ''}</span>}
                  <button onClick={() => openCustomer(customer)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                      isDelivered ? 'bg-gray-100 text-gray-500 hover:bg-gray-200' : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}>
                    {isDelivered ? 'View' : 'Deliver →'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  // CUSTOMER DELIVERY SCREEN
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

        {/* Items to deliver */}
        <div className="bg-white rounded-2xl border border-blue-100 overflow-hidden mb-4">
          <div className="px-4 py-3 bg-blue-50 text-xs font-semibold text-blue-700 uppercase tracking-wide">Items</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                <th className="text-left px-4 py-2 font-medium">Item</th>
                <th className="text-center px-3 py-2 font-medium">Ordered</th>
                <th className="text-center px-3 py-2 font-medium">Deliver</th>
              </tr>
            </thead>
            <tbody>
              {selectedOrder.order_items.map((oi, i) => (
                <tr key={oi.id} className={`border-t border-gray-50 ${i % 2 === 0 ? '' : 'bg-blue-50/20'}`}>
                  <td className="px-4 py-2.5 text-gray-800">{oi.bakery_items?.name}</td>
                  <td className="px-4 py-2.5 text-center text-gray-600">{oi.quantity}</td>
                  <td className="px-4 py-2.5 text-center">
                    {isDelivered ? (
                      <span className="font-semibold text-green-700">{deliveredQtys[oi.id] ?? oi.quantity}</span>
                    ) : (
                      <input type="number" min="0"
                        value={deliveredQtys[oi.id] ?? oi.quantity}
                        onChange={e => setDeliveredQtys(q => ({ ...q, [oi.id]: e.target.value }))}
                        className="w-16 text-center px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

        </div>

        {/* Delivered button */}
        {!isDelivered && (
          <button onClick={markDelivered} disabled={savingDelivery}
            className="w-full py-4 rounded-2xl bg-green-600 text-white font-semibold text-base hover:bg-green-700 disabled:opacity-50 transition-colors mb-4">
            {savingDelivery ? 'Saving...' : '✅ Mark as Delivered'}
          </button>
        )}

        {/* Cash collection — shown after delivery */}
        {isDelivered && (
          <div className="bg-white rounded-2xl border border-green-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-green-500 text-lg">✓</span>
              <span className="font-semibold text-green-800">Delivered</span>
            </div>

            {cashSaved[selectedCustomer.id] ? (
              <div className="bg-green-50 rounded-xl px-4 py-3 text-sm text-green-700 font-medium text-center">
                ✓ Cash ₹{cashAmount} recorded
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-3">
                  {selectedCustomer.payment_days === 0
                    ? 'Cash on delivery — amount auto-filled'
                    : selectedCustomer.payment_days === 1
                      ? 'Collect payment for yesterday\'s order'
                      : `Payment terms: ${selectedCustomer.payment_days} days — enter amount collected`}
                </p>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 mb-1 block">Cash collected (₹)</label>
                    <input type="number" step="0.01" value={cashAmount}
                      onChange={e => setCashAmount(e.target.value)}
                      placeholder={selectedCustomer.payment_days > 1 ? 'Enter amount' : ''}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                  </div>
                  <button onClick={saveCash} disabled={!cashAmount || parseFloat(cashAmount) <= 0}
                    className="self-end px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-40 transition-colors">
                    Save
                  </button>
                </div>
                <button onClick={() => setScreen('delivery')} className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-gray-600">
                  Skip — no cash today
                </button>
              </>
            )}

            {cashSaved[selectedCustomer.id] && (
              <button onClick={() => setScreen('delivery')} className="w-full mt-3 py-2.5 rounded-xl bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100">
                ← Back to Route
              </button>
            )}
          </div>
        )}

        {isDelivered && !cashSaved[selectedCustomer.id] && (
          <div className="mt-2 text-center">
            <button onClick={() => setScreen('delivery')} className="text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2">
              Back to route
            </button>
          </div>
        )}
      </div>
    </div>
  )

  return null
}
