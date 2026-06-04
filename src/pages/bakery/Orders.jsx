import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { buildBakeList } from '../../lib/bakeList'
import BakeListDisplay from '../../components/BakeListDisplay'

function getTomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

function getToday() {
  return new Date().toISOString().split('T')[0]
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Auto delivery date: same day if 12am-3am, next day otherwise
function getAutoDeliveryDate() {
  const now = new Date()
  const hour = now.getHours()
  if (hour >= 0 && hour < 3) return getToday()
  return getTomorrow()
}

const STATUS_CONFIG = {
  draft:          { label: 'Draft',           color: 'bg-gray-100 text-gray-500' },
  sent_to_baker:  { label: 'In Production',   color: 'bg-blue-100 text-blue-700' },
  bake_completed: { label: 'Bake Completed',  color: 'bg-amber-100 text-amber-700' },
  delivered:      { label: 'Delivered',       color: 'bg-green-100 text-green-700' },
}

export default function Orders() {
  const [customers, setCustomers] = useState([])
  const [bakeryItems, setBakeryItems] = useState([])
  const [orders, setOrders] = useState([])
  const [futureOrders, setFutureOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [isFutureOrder, setIsFutureOrder] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [orderLines, setOrderLines] = useState([])
  const [orderNotes, setOrderNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [orderDate] = useState(getToday())
  const [deliveryDate, setDeliveryDate] = useState(getTomorrow())
  const [futureDeliveryDate, setFutureDeliveryDate] = useState('')
  const [deliveryDateManual, setDeliveryDateManual] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const [advancing, setAdvancing] = useState(null)
  const [startingBake, setStartingBake] = useState(false)
  const [showFutureCustomerPicker, setShowFutureCustomerPicker] = useState(false)

  useEffect(() => { fetchAll() }, [orderDate])

  async function fetchAll() {
    setLoading(true)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]

    const [{ data: c }, { data: b }, { data: o }, { data: f }] = await Promise.all([
      supabase.from('customers').select('*, customer_prices(*)').eq('is_active', true).order('name'),
      supabase.from('bakery_items').select('*').eq('is_active', true).order('category').order('name'),
      // Today's regular orders + future orders whose bake date is today (delivery_date = tomorrow)
      supabase.from('orders')
        .select('*, customers(name, type), order_items(*, bakery_items(name, unit, category))')
        .or(`order_date.eq.${orderDate},and(order_type.eq.future,order_date.eq.${orderDate})`)
        .order('created_at'),
      // Future orders not yet due for baking (delivery_date > tomorrow)
      supabase.from('orders')
        .select('*, customers(name, type), order_items(*, bakery_items(name, unit, category))')
        .eq('order_type', 'future')
        .eq('status', 'draft')
        .gt('delivery_date', getTomorrow())
        .order('delivery_date')
    ])
    if (c) setCustomers(c)
    if (b) setBakeryItems(b)
    if (o) setOrders(o)
    if (f) setFutureOrders(f)
    setLoading(false)
  }

  function getPriceForCustomer(customer, itemId, standardPrice) {
    if (!customer.has_custom_pricing) return standardPrice
    const cp = customer.customer_prices?.find(p => p.bakery_item_id === itemId)
    return cp ? cp.custom_price : standardPrice
  }

  function openNewOrder(customer, future = false) {
    setSelectedCustomer(customer)
    setIsFutureOrder(future)
    if (future) {
      // Default future delivery to 2 days from now
      const d = new Date(); d.setDate(d.getDate() + 2)
      setFutureDeliveryDate(d.toISOString().split('T')[0])
    }
    setOrderLines(bakeryItems.map(item => ({
      bakery_item_id: item.id, name: item.name, unit: item.unit, category: item.category,
      unit_price: getPriceForCustomer(customer, item.id, item.selling_price), quantity: 0
    })))
    setOrderNotes(''); setEditingOrder(null); setShowForm(true)
  }

  async function openEditOrder(order) {
    const customer = customers.find(c => c.id === order.customer_id)
    setSelectedCustomer(customer)
    setOrderNotes(order.notes || '')
    setEditingOrder(order.id)
    const lines = bakeryItems.map(item => {
      const existing = order.order_items.find(oi => oi.bakery_item_id === item.id)
      return {
        bakery_item_id: item.id, name: item.name, unit: item.unit, category: item.category,
        unit_price: existing ? existing.unit_price : getPriceForCustomer(customer, item.id, item.selling_price),
        quantity: existing ? existing.quantity : 0
      }
    })
    setOrderLines(lines); setShowForm(true)
  }

  function updateQty(idx, val) {
    const updated = [...orderLines]
    updated[idx].quantity = Math.max(0, parseInt(val) || 0)
    setOrderLines(updated)
  }

  const activeLines = orderLines.filter(l => l.quantity > 0)
  const orderTotal = activeLines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0)

  async function saveOrder() {
    if (!selectedCustomer) return
    if (activeLines.length === 0) return setError('Add at least one item.')
    if (isFutureOrder && !futureDeliveryDate) return setError('Please set a delivery date.')
    setSaving(true); setError('')

    // For future orders: order_date = day before delivery (bake date)
    const bakeDate = isFutureOrder
      ? (() => { const d = new Date(futureDeliveryDate + 'T00:00:00'); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0] })()
      : orderDate
    const finalDeliveryDate = isFutureOrder ? futureDeliveryDate : deliveryDate

    try {
      let orderId = editingOrder
      if (editingOrder) {
        await supabase.from('order_items').delete().eq('order_id', editingOrder)
        await supabase.from('orders').update({
          notes: orderNotes, total_amount: orderTotal, delivery_date: finalDeliveryDate
        }).eq('id', editingOrder)
      } else {
        const { data, error } = await supabase.from('orders').insert({
          customer_id: selectedCustomer.id,
          order_date: bakeDate,
          delivery_date: finalDeliveryDate,
          total_amount: orderTotal,
          notes: orderNotes,
          status: 'draft',
          order_type: isFutureOrder ? 'future' : 'regular'
        }).select().single()
        if (error) throw error
        orderId = data.id
      }
      const { error: iErr } = await supabase.from('order_items').insert(
        activeLines.map(l => ({ order_id: orderId, bakery_item_id: l.bakery_item_id, quantity: l.quantity, unit_price: l.unit_price }))
      )
      if (iErr) throw iErr
      setShowForm(false); fetchAll()
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  async function deleteOrder(id) {
    if (!confirm('Delete this order?')) return
    await supabase.from('orders').delete().eq('id', id)
    fetchAll()
  }

  async function changeStatus(order, newStatus) {
    const update = { status: newStatus }
    if (newStatus === 'sent_to_baker' && !order.sent_to_baker_at) update.sent_to_baker_at = new Date().toISOString()
    if (newStatus === 'bake_completed' && !order.bake_completed_at) update.bake_completed_at = new Date().toISOString()
    if (newStatus === 'delivered' && !order.delivered_at) update.delivered_at = new Date().toISOString()
    await supabase.from('orders').update(update).eq('id', order.id)
    fetchAll()
  }

  // Start Baking — sends all drafts to baker, sets delivery date, activates baker view
  async function startBaking() {
    const draftOrders = orders.filter(o => o.status === 'draft')
    if (draftOrders.length === 0) return alert('No draft orders to send to baker.')
    const autoDelivery = deliveryDateManual ? deliveryDate : getAutoDeliveryDate()
    if (!confirm(`Start baking ${draftOrders.length} order(s) for delivery on ${formatDate(autoDelivery)}? Baker will see the bake list now.`)) return
    setStartingBake(true)
    if (!deliveryDateManual) setDeliveryDate(autoDelivery)
    await supabase.from('orders')
      .update({
        status: 'sent_to_baker',
        sent_to_baker_at: new Date().toISOString(),
        baking_started_at: new Date().toISOString(),
        delivery_date: autoDelivery
      })
      .in('id', draftOrders.map(o => o.id))
    setStartingBake(false)
    fetchAll()
  }

  // Groupings
  const draftOrders = orders.filter(o => o.status === 'draft')
  const bakingStarted = orders.some(o => o.status === 'sent_to_baker' && o.baking_started_at)
  const sentOrders = orders.filter(o => o.status === 'sent_to_baker')
  const postBakingOrders = orders.filter(o => ['bake_completed', 'delivered'].includes(o.status))
  const orderedCustomerIds = new Set(orders.map(o => o.customer_id))
  const pendingCustomers = customers.filter(c => !orderedCustomerIds.has(c.id))
  const dayTotal = orders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0)

  // Bake summary — all draft orders
  const newItemSummary = {}
  for (const order of draftOrders) {
    for (const oi of order.order_items) {
      const key = oi.bakery_items?.name
      if (!key) continue
      if (!newItemSummary[key]) newItemSummary[key] = { name: key, unit: oi.bakery_items?.unit, category: oi.bakery_items?.category, total: 0 }
      newItemSummary[key].total += oi.quantity
    }
  }
  const itemQtyMap = {}
  Object.values(newItemSummary).forEach(r => { itemQtyMap[r.name] = r.total })
  const { groups: bakeGroups, cookieSurplus } = buildBakeList(itemQtyMap)

  const categories = [...new Set(orderLines.map(l => l.category))]

  // Pipeline counts
  const pipeline = [
    { label: 'Draft', count: draftOrders.length, color: 'text-gray-500' },
    { label: 'Sent to Baker', count: sentOrders.length, color: 'text-blue-600' },
    { label: 'Baked', count: orders.filter(o => o.status === 'bake_completed').length, color: 'text-amber-600' },
    { label: 'Delivered', count: orders.filter(o => o.status === 'delivered').length, color: 'text-green-600' },
  ]

  function renderOrderRow(order, i, editable) {
    const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.draft
    return (
      <div key={order.id} className={`border-t border-amber-50 ${i === 0 ? 'border-t-0' : ''}`}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-800">{order.customers?.name}</span>
              <select value={order.status} onChange={e => changeStatus(order, e.target.value)}
                className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:outline-none ${cfg.color}`}
                style={{ background: 'transparent' }}>
                <option value="draft">Draft</option>
                <option value="sent_to_baker">Sent to Baker</option>
                <option value="bake_completed">Bake Completed</option>
                <option value="delivered">Delivered</option>
              </select>
            </div>
            <div className="text-xs text-gray-400 mt-0.5 truncate">
              {order.order_items.map(oi => `${oi.quantity} ${oi.bakery_items?.name}`).join(' · ')}
            </div>
            {order.notes && <div className="text-xs text-gray-400 italic mt-0.5">"{order.notes}"</div>}
          </div>
          <div className="flex items-center gap-3 ml-3 shrink-0">
            <div className="font-mono font-semibold text-gray-800 text-sm">₹{parseFloat(order.total_amount).toFixed(2)}</div>
            <div className="flex gap-2 items-center">
              {editable && <button onClick={() => openEditOrder(order)} className="text-amber-600 hover:text-amber-800 text-xs font-medium">Edit</button>}
              <button onClick={() => deleteOrder(order.id)} className="text-red-400 hover:text-red-600 text-xs font-medium">Delete</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-amber-900">Orders</h2>
          <div className="flex gap-4 mt-1">
            {pipeline.map(p => p.count > 0 && (
              <span key={p.label} className={`text-xs font-medium ${p.color}`}>{p.count} {p.label}</span>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-xs">Order date</span>
            <span className="font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded-lg text-xs">{formatDate(orderDate)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-xs">Delivery date</span>
            <input type="date" value={deliveryDate} onChange={e => { setDeliveryDate(e.target.value); setDeliveryDateManual(true) }}
              className="px-2 py-1 rounded-lg border border-amber-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white font-medium text-amber-800" />
          </div>
          {deliveryDateManual && <button onClick={() => { setDeliveryDateManual(false); setDeliveryDate(getTomorrow()) }} className="text-xs text-gray-400 underline">reset to auto</button>}
        </div>
      </div>

      {loading ? <div className="text-center py-12 text-amber-600">Loading...</div> : (
        <div className="space-y-4">

          {/* Pending customers — blocked after baking started */}
          {pendingCustomers.length > 0 && (
            <div className="bg-white rounded-2xl border border-amber-100 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Awaiting orders ({pendingCustomers.length})</p>
              {bakingStarted ? (
                <div className="bg-amber-50 rounded-xl px-4 py-3 text-sm text-amber-700 font-medium">
                  🔒 Baking has started — no new orders can be added for today.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {pendingCustomers.map(c => (
                    <button key={c.id} onClick={() => openNewOrder(c)}
                      className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800 hover:bg-amber-100 transition-colors">
                      + {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Future special orders */}
          {!bakingStarted && (
            <div className="bg-white rounded-2xl border border-purple-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Future Special Orders</p>
                  <p className="text-xs text-gray-400 mt-0.5">Birthday cakes, special occasions, advance orders</p>
                </div>
                <button onClick={() => { setShowFutureCustomerPicker(true) }}
                  className="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition-colors">
                  + Future Order
                </button>
              </div>
              {futureOrders.length > 0 && (
                <div className="space-y-2">
                  {futureOrders.map(order => (
                    <div key={order.id} className="flex items-center justify-between bg-purple-50 rounded-xl px-3 py-2">
                      <div>
                        <span className="text-sm font-medium text-purple-800">{order.customers?.name}</span>
                        <span className="text-xs text-purple-500 ml-2">Delivery: {formatDate(order.delivery_date)}</span>
                        <div className="text-xs text-gray-400 mt-0.5">{order.order_items.map(oi => `${oi.quantity} ${oi.bakery_items?.name}`).join(' · ')}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-sm text-purple-700">₹{parseFloat(order.total_amount).toFixed(0)}</span>
                        <button onClick={() => deleteOrder(order.id)} className="text-red-400 hover:text-red-600 text-xs">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Customer picker for future orders */}
          {showFutureCustomerPicker && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
              <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
                <h3 className="font-semibold text-gray-800 mb-4">Select Customer for Future Order</h3>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {customers.map(c => (
                    <button key={c.id} onClick={() => { setShowFutureCustomerPicker(false); openNewOrder(c, true) }}
                      className="w-full text-left px-4 py-3 rounded-xl border border-gray-100 hover:bg-purple-50 hover:border-purple-200 transition-colors text-sm text-gray-700">
                      {c.name}
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowFutureCustomerPicker(false)}
                  className="w-full mt-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Draft orders + bake summary + Start Baking */}
          {draftOrders.length > 0 && !bakingStarted && (
            <>
              <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
                <div className="px-4 py-3 bg-amber-50 text-xs font-semibold text-amber-700 uppercase tracking-wide">
                  Draft Orders ({draftOrders.length})
                </div>
                {draftOrders.map((order, i) => renderOrderRow(order, i, true))}
              </div>

              {/* Bake summary */}
              {bakeGroups.length > 0 && (
                <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
                  <div className="px-4 py-3 bg-amber-50 text-xs font-semibold text-amber-700 uppercase tracking-wide">Bake Summary</div>
                  <div className="p-3">
                    <BakeListDisplay groups={bakeGroups} cookieSurplus={cookieSurplus} />
                  </div>
                  <div className="px-4 py-4 border-t border-amber-100">
                    <button onClick={startBaking} disabled={startingBake}
                      className="w-full py-3 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors">
                      {startingBake ? 'Starting...' : `🔥 Start Baking — Delivery on ${formatDate(deliveryDateManual ? deliveryDate : getAutoDeliveryDate())}`}
                    </button>
                    <p className="text-xs text-gray-400 text-center mt-2">
                      {deliveryDateManual ? 'Using manually set delivery date' : 'Delivery date auto-set based on current time'}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Sent to Baker orders */}
          {sentOrders.length > 0 && (
            <div className="bg-white rounded-2xl border border-blue-100 overflow-hidden">
              <div className="px-4 py-3 bg-blue-50 text-xs font-semibold text-blue-700 uppercase tracking-wide">
                Sent to Baker ({sentOrders.length}) · Baking Started ✓
              </div>
              {sentOrders.map((order, i) => renderOrderRow(order, i, false))}
            </div>
          )}

          {/* Post-baking orders */}
          {postBakingOrders.length > 0 && (
            <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
              <div className="px-4 py-3 bg-amber-50 text-xs font-semibold text-amber-700 uppercase tracking-wide">Baked / Delivered</div>
              {postBakingOrders.map((order, i) => renderOrderRow(order, i, false))}
              <div className="border-t-2 border-amber-100 px-4 py-3 flex justify-between bg-amber-50/50">
                <span className="text-sm font-semibold text-amber-800">Day Total</span>
                <span className="font-mono font-bold text-amber-900">₹{dayTotal.toFixed(2)}</span>
              </div>
            </div>
          )}

          {orders.length === 0 && pendingCustomers.length === 0 && (
            <div className="text-center py-12 text-amber-400 text-sm bg-white rounded-2xl border border-amber-100">
              No customers yet. Add customers first!
            </div>
          )}
        </div>
      )}

      {/* Order Entry Modal */}
      {showForm && selectedCustomer && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 px-4 py-6 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-gray-800">{selectedCustomer.name}</h3>
              {isFutureOrder ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-purple-500 font-medium">🗓 Future Order</span>
                </div>
              ) : (
                <span className="text-xs text-gray-400">Delivery: {formatDate(deliveryDate)}</span>
              )}
            </div>
            {isFutureOrder && (
              <div className="mb-4">
                <label className="text-xs font-medium text-gray-500 mb-1 block">Delivery Date *</label>
                <input type="date" value={futureDeliveryDate}
                  min={(() => { const d = new Date(); d.setDate(d.getDate() + 2); return d.toISOString().split('T')[0] })()}
                  onChange={e => setFutureDeliveryDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-purple-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white text-purple-800" />
                {futureDeliveryDate && <p className="text-xs text-purple-700 font-medium mt-2 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">🗓 Will appear in bake list on {formatDate((() => { const d = new Date(futureDeliveryDate + 'T00:00:00'); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0] })())}</p>}
              </div>
            )}
            <p className="text-xs text-gray-400 mb-5">Enter quantities for each item</p>
            <div className="space-y-5 mb-4">
              {categories.map(cat => {
                const catLines = orderLines.map((l, idx) => ({...l, idx})).filter(l => l.category === cat)
                return (
                  <div key={cat}>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{cat}</p>
                    <div className="space-y-2">
                      {catLines.map(({ idx, ...line }) => (
                        <div key={line.bakery_item_id} className="flex items-center justify-between gap-3">
                          <div className="flex-1">
                            <div className="text-sm text-gray-700">{line.name}</div>
                            <div className="text-xs text-gray-400">₹{parseFloat(line.unit_price).toFixed(2)} / {line.unit}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => updateQty(idx, line.quantity - 1)}
                              className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium text-sm flex items-center justify-center">−</button>
                            <input type="number" min="0" value={line.quantity || ''} placeholder="0"
                              onChange={e => updateQty(idx, e.target.value)}
                              className="w-14 text-center px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                            <button onClick={() => updateQty(idx, line.quantity + 1)}
                              className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium text-sm flex items-center justify-center">+</button>
                          </div>
                          <div className="w-16 text-right font-mono text-sm text-gray-600">
                            {line.quantity > 0 ? `₹${(line.quantity * line.unit_price).toFixed(0)}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Notes</label>
              <input value={orderNotes} onChange={e => setOrderNotes(e.target.value)} placeholder="Any special instructions..."
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </div>
            {activeLines.length > 0 && (
              <div className="mt-4 bg-amber-50 rounded-xl p-3 flex justify-between text-sm">
                <span className="text-amber-700">{activeLines.length} item{activeLines.length > 1 ? 's' : ''}</span>
                <span className="font-mono font-semibold text-amber-900">₹{orderTotal.toFixed(2)}</span>
              </div>
            )}
            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            <div className="flex gap-3 mt-5">
              <button onClick={() => { setShowForm(false); setError('') }} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={saveOrder} disabled={saving || activeLines.length === 0}
                className="flex-1 py-2.5 rounded-xl bg-amber-800 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
                {saving ? 'Saving...' : editingOrder ? 'Update Order' : isFutureOrder ? 'Save Future Order' : 'Save Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
