import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

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

const STATUS_CONFIG = {
  draft:           { label: 'Draft',            color: 'bg-gray-100 text-gray-500',    next: 'sent_to_baker', nextLabel: '📤 Send to Baker' },
  sent_to_baker:   { label: 'Sent to Baker',     color: 'bg-blue-100 text-blue-700',    next: 'bake_completed', nextLabel: '✅ Mark Baked' },
  bake_completed:  { label: 'Bake Completed',    color: 'bg-amber-100 text-amber-700',  next: 'delivered', nextLabel: '🚚 Mark Delivered' },
  delivered:       { label: 'Delivered',         color: 'bg-green-100 text-green-700',  next: null, nextLabel: null },
}

export default function Orders() {
  const [customers, setCustomers] = useState([])
  const [bakeryItems, setBakeryItems] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [orderLines, setOrderLines] = useState([])
  const [orderNotes, setOrderNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [orderDate] = useState(getToday())
  const [deliveryDate, setDeliveryDate] = useState(getTomorrow())
  const [editingOrder, setEditingOrder] = useState(null)
  const [advancing, setAdvancing] = useState(null)

  useEffect(() => { fetchAll() }, [orderDate])

  async function fetchAll() {
    setLoading(true)
    const [{ data: c }, { data: b }, { data: o }] = await Promise.all([
      supabase.from('customers').select('*, customer_prices(*)').eq('is_active', true).order('name'),
      supabase.from('bakery_items').select('*').eq('is_active', true).order('category').order('name'),
      supabase.from('orders').select('*, customers(name, type), order_items(*, bakery_items(name, unit, category))').eq('order_date', orderDate).order('created_at')
    ])
    if (c) setCustomers(c)
    if (b) setBakeryItems(b)
    if (o) setOrders(o)
    setLoading(false)
  }

  function getPriceForCustomer(customer, itemId, standardPrice) {
    if (!customer.has_custom_pricing) return standardPrice
    const cp = customer.customer_prices?.find(p => p.bakery_item_id === itemId)
    return cp ? cp.custom_price : standardPrice
  }

  function openNewOrder(customer) {
    setSelectedCustomer(customer)
    setOrderLines(bakeryItems.map(item => ({
      bakery_item_id: item.id,
      name: item.name,
      unit: item.unit,
      category: item.category,
      unit_price: getPriceForCustomer(customer, item.id, item.selling_price),
      quantity: 0
    })))
    setOrderNotes('')
    setEditingOrder(null)
    setShowForm(true)
  }

  async function openEditOrder(order) {
    const customer = customers.find(c => c.id === order.customer_id)
    setSelectedCustomer(customer)
    setOrderNotes(order.notes || '')
    setEditingOrder(order.id)
    const lines = bakeryItems.map(item => {
      const existing = order.order_items.find(oi => oi.bakery_item_id === item.id)
      return {
        bakery_item_id: item.id,
        name: item.name,
        unit: item.unit,
        category: item.category,
        unit_price: existing ? existing.unit_price : getPriceForCustomer(customer, item.id, item.selling_price),
        quantity: existing ? existing.quantity : 0
      }
    })
    setOrderLines(lines)
    setShowForm(true)
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
    setSaving(true); setError('')
    try {
      let orderId = editingOrder
      if (editingOrder) {
        await supabase.from('order_items').delete().eq('order_id', editingOrder)
        await supabase.from('orders').update({ notes: orderNotes, total_amount: orderTotal, delivery_date: deliveryDate }).eq('id', editingOrder)
      } else {
        const { data, error } = await supabase.from('orders').insert({
          customer_id: selectedCustomer.id,
          order_date: orderDate,
          delivery_date: deliveryDate,
          total_amount: orderTotal,
          notes: orderNotes,
          status: 'draft'
        }).select().single()
        if (error) throw error
        orderId = data.id
      }
      const itemsPayload = activeLines.map(l => ({
        order_id: orderId,
        bakery_item_id: l.bakery_item_id,
        quantity: l.quantity,
        unit_price: l.unit_price
      }))
      const { error: iErr } = await supabase.from('order_items').insert(itemsPayload)
      if (iErr) throw iErr
      setShowForm(false)
      fetchAll()
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
  }

  async function deleteOrder(id) {
    if (!confirm('Delete this order?')) return
    await supabase.from('orders').delete().eq('id', id)
    fetchAll()
  }

  // Advance ALL draft orders to sent_to_baker at once
  async function sendAllToBaker() {
    const draftOrders = orders.filter(o => o.status === 'draft')
    if (draftOrders.length === 0) return
    if (!confirm(`Send ${draftOrders.length} order(s) to baker for delivery on ${formatDate(deliveryDate)}?`)) return
    setAdvancing('sending')
    await supabase.from('orders')
      .update({ status: 'sent_to_baker', sent_to_baker_at: new Date().toISOString() })
      .in('id', draftOrders.map(o => o.id))
    setAdvancing(null)
    fetchAll()
  }

  // Advance a single order to next status
  async function advanceOrder(order) {
    const next = STATUS_CONFIG[order.status]?.next
    if (!next) return
    setAdvancing(order.id)
    const update = { status: next }
    if (next === 'sent_to_baker') update.sent_to_baker_at = new Date().toISOString()
    if (next === 'bake_completed') update.bake_completed_at = new Date().toISOString()
    if (next === 'delivered') update.delivered_at = new Date().toISOString()
    await supabase.from('orders').update(update).eq('id', order.id)
    setAdvancing(null)
    fetchAll()
  }

  // Summary: total qty per bakery item across all orders today
  const itemSummary = {}
  for (const order of orders) {
    for (const oi of order.order_items) {
      const key = oi.bakery_item_id
      if (!itemSummary[key]) itemSummary[key] = { name: oi.bakery_items?.name, unit: oi.bakery_items?.unit, category: oi.bakery_items?.category, total: 0, revenue: 0 }
      itemSummary[key].total += oi.quantity
      itemSummary[key].revenue += oi.quantity * oi.unit_price
    }
  }
  const summaryRows = Object.values(itemSummary).sort((a, b) => a.category?.localeCompare(b.category) || a.name?.localeCompare(b.name))

  const orderedCustomerIds = new Set(orders.map(o => o.customer_id))
  const pendingCustomers = customers.filter(c => !orderedCustomerIds.has(c.id))
  const draftOrders = orders.filter(o => o.status === 'draft')
  const sentOrders = orders.filter(o => o.status === 'sent_to_baker')
  const bakedOrders = orders.filter(o => o.status === 'bake_completed')
  const deliveredOrders = orders.filter(o => o.status === 'delivered')
  const dayTotal = orders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0)
  const categories = [...new Set(orderLines.map(l => l.category))]

  // Pipeline counts for header bar
  const pipeline = [
    { label: 'Draft', count: draftOrders.length, color: 'text-gray-500' },
    { label: 'Sent to Baker', count: sentOrders.length, color: 'text-blue-600' },
    { label: 'Baked', count: bakedOrders.length, color: 'text-amber-600' },
    { label: 'Delivered', count: deliveredOrders.length, color: 'text-green-600' },
  ]

  async function changeStatus(order, newStatus) {
    const update = { status: newStatus }
    if (newStatus === 'sent_to_baker' && !order.sent_to_baker_at) update.sent_to_baker_at = new Date().toISOString()
    if (newStatus === 'bake_completed' && !order.bake_completed_at) update.bake_completed_at = new Date().toISOString()
    if (newStatus === 'delivered' && !order.delivered_at) update.delivered_at = new Date().toISOString()
    await supabase.from('orders').update(update).eq('id', order.id)
    fetchAll()
  }

  function renderOrderRow(order, i) {
    const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.draft
    const isDraft = order.status === 'draft'
    return (
      <div key={order.id} className={`border-t border-amber-50 ${i === 0 ? 'border-t-0' : ''}`}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-800">{order.customers?.name}</span>
              <select
                value={order.status}
                onChange={e => changeStatus(order, e.target.value)}
                className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-400 ${cfg.color}`}
                style={{background: 'transparent'}}>
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
              {isDraft && (
                <button onClick={() => openEditOrder(order)} className="text-amber-600 hover:text-amber-800 text-xs font-medium">Edit</button>
              )}
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
            <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
              className="px-2 py-1 rounded-lg border border-amber-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white font-medium text-amber-800" />
          </div>
        </div>
      </div>

      {loading ? <div className="text-center py-12 text-amber-600">Loading...</div> : (
        <div className="space-y-4">

          {/* Pending customers */}
          {pendingCustomers.length > 0 && (
            <div className="bg-white rounded-2xl border border-amber-100 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Awaiting orders ({pendingCustomers.length})</p>
              <div className="flex flex-wrap gap-2">
                {pendingCustomers.map(c => (
                  <button key={c.id} onClick={() => openNewOrder(c)}
                    className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800 hover:bg-amber-100 transition-colors">
                    + {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Orders list */}
          {orders.length > 0 && (
            <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
              <div className="px-4 py-3 bg-amber-50">
                <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Orders ({orders.length})</span>
              </div>
              {orders.map((order, i) => renderOrderRow(order, i))}
              <div className="border-t-2 border-amber-100 px-4 py-3 flex justify-between bg-amber-50/50">
                <span className="text-sm font-semibold text-amber-800">Day Total</span>
                <span className="font-mono font-bold text-amber-900">₹{dayTotal.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Bake Summary */}
          {summaryRows.length > 0 && (
            <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
              <div className="px-4 py-3 bg-green-50 text-xs font-semibold text-green-700 uppercase tracking-wide">
                Bake Summary — Delivery {formatDate(deliveryDate)}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                    <th className="text-left px-4 py-2 font-medium">Item</th>
                    <th className="text-left px-4 py-2 font-medium">Category</th>
                    <th className="text-right px-4 py-2 font-medium">Total Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((row, i) => (
                    <tr key={i} className={`border-t border-gray-50 ${i % 2 === 0 ? '' : 'bg-green-50/30'}`}>
                      <td className="px-4 py-2.5 font-medium text-gray-800">{row.name}</td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{row.category}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-800">{row.total} <span className="text-xs text-gray-400">{row.unit}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {draftOrders.length > 0 && (
                <div className="px-4 py-4 border-t border-green-100">
                  <button onClick={sendAllToBaker} disabled={advancing === 'sending'}
                    className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {advancing === 'sending' ? 'Sending...' : `📤 Send to Baker — ${draftOrders.length} order${draftOrders.length > 1 ? 's' : ''} for delivery on ${formatDate(deliveryDate)}`}
                  </button>
                </div>
              )}
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
              <span className="text-xs text-gray-400">Delivery: {formatDate(deliveryDate)}</span>
            </div>
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
                {saving ? 'Saving...' : editingOrder ? 'Update Order' : 'Save Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
