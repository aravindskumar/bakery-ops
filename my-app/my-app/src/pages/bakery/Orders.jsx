import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function Orders() {
  const [customers, setCustomers] = useState([])
  const [bakeryItems, setBakeryItems] = useState([])
  const [orders, setOrders] = useState([]) // today's orders
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [orderLines, setOrderLines] = useState([])
  const [orderNotes, setOrderNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0])
  const [editingOrder, setEditingOrder] = useState(null)

  useEffect(() => { fetchAll() }, [orderDate])

  async function fetchAll() {
    setLoading(true)
    const [{ data: c }, { data: b }, { data: o }] = await Promise.all([
      supabase.from('customers').select('*, customer_prices(*)').eq('is_active', true).order('name'),
      supabase.from('bakery_items').select('*').eq('is_active', true).order('category').order('name'),
      supabase.from('orders').select('*, customers(name, type), order_items(*, bakery_items(name, unit))').eq('order_date', orderDate).order('created_at')
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
        await supabase.from('orders').update({ notes: orderNotes, total_amount: orderTotal }).eq('id', editingOrder)
      } else {
        const { data, error } = await supabase.from('orders').insert({
          customer_id: selectedCustomer.id,
          order_date: orderDate,
          total_amount: orderTotal,
          notes: orderNotes
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

  const orderedCustomerIds = new Set(orders.map(o => o.customer_id))
  const pendingCustomers = customers.filter(c => !orderedCustomerIds.has(c.id))
  const dayTotal = orders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0)

  // Group lines by category for the form
  const categories = [...new Set(orderLines.map(l => l.category))]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-amber-900">Orders</h2>
          <p className="text-sm text-amber-700 mt-0.5">{orders.length} orders · ₹{dayTotal.toFixed(2)} total</p>
        </div>
        <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
          className="px-3 py-2 rounded-xl border border-amber-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
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

          {/* Orders received */}
          {orders.length > 0 && (
            <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
              <div className="px-4 py-3 bg-amber-50 text-xs font-semibold text-amber-700 uppercase tracking-wide">
                Orders received ({orders.length})
              </div>
              {orders.map((order, i) => (
                <div key={order.id} className={`border-t border-amber-50 ${i === 0 ? 'border-t-0' : ''}`}>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="font-medium text-gray-800">{order.customers?.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {order.order_items.map(oi => `${oi.quantity} ${oi.bakery_items?.name}`).join(' · ')}
                      </div>
                      {order.notes && <div className="text-xs text-gray-400 italic mt-0.5">"{order.notes}"</div>}
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div className="font-mono font-semibold text-gray-800">₹{parseFloat(order.total_amount).toFixed(2)}</div>
                      <div className="flex gap-2">
                        <button onClick={() => openEditOrder(order)} className="text-amber-600 hover:text-amber-800 text-xs font-medium">Edit</button>
                        <button onClick={() => deleteOrder(order.id)} className="text-red-400 hover:text-red-600 text-xs font-medium">Delete</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
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
              <span className="text-sm text-gray-400">{new Date(orderDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
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
