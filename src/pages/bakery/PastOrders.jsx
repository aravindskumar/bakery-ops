import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
function getToday() { return new Date().toISOString().split('T')[0] }
function formatDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS_CONFIG = {
  draft:          { label: 'Draft',         color: 'bg-gray-100 text-gray-500' },
  sent_to_baker:  { label: 'Sent to Baker', color: 'bg-blue-100 text-blue-700' },
  bake_completed: { label: 'Bake Completed',color: 'bg-amber-100 text-amber-700' },
  delivered:      { label: 'Delivered',     color: 'bg-green-100 text-green-700' },
}

export default function PastOrders() {
  const [date, setDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  })
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [markingDelivered, setMarkingDelivered] = useState({})

  async function markDelivered(order) {
    setMarkingDelivered(prev => ({ ...prev, [order.id]: true }))
    await supabase.from('orders').update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('id', order.id)
    await supabase.from('order_items')
      .update({ delivered_qty: null })
      .eq('order_id', order.id)
    // Set delivered_qty = quantity for all items
    for (const oi of order.order_items) {
      if (oi.delivered_qty == null) {
        await supabase.from('order_items').update({ delivered_qty: oi.quantity }).eq('id', oi.id)
      }
    }
    setMarkingDelivered(prev => ({ ...prev, [order.id]: false }))
    fetchOrders(date)
  }

  useEffect(() => { fetchOrders(date) }, [date])

  async function fetchOrders(d) {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('*, customers(name, type, payment_days), order_items(*, bakery_items(name, unit, category))')
      .eq('order_date', d)
      .order('customers(name)')
    setOrders(data || [])
    setLoading(false)
  }

  const totalOrdered = orders.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0)
  const totalDelivered = orders.reduce((s, o) => {
    return s + (o.order_items || []).reduce((ss, oi) => ss + (oi.delivered_qty ?? oi.quantity) * oi.unit_price, 0)
  }, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-semibold text-amber-900">Past Orders</h2>
          {!loading && orders.length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">{orders.length} orders · ₹{totalDelivered.toFixed(0)} delivered</p>
          )}
        </div>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="px-3 py-2 rounded-xl border border-amber-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white font-medium text-amber-800" />
      </div>

      {loading ? (
        <div className="text-center py-12 text-amber-600">Loading...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-amber-100 text-amber-400 text-sm">
          No orders for {formatDate(date)}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
          {orders.map((order, i) => {
            const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.draft
            const deliveredAmt = order.status === 'delivered'
          ? (order.order_items || []).reduce((s, oi) => s + (oi.delivered_qty ?? oi.quantity) * oi.unit_price, 0)
          : 0
            const orderedAmt = parseFloat(order.total_amount || 0)
            const isExpanded = expandedOrder === order.id
            return (
              <div key={order.id} className={`border-t border-amber-50 ${i === 0 ? 'border-t-0' : ''}`}>
                <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-amber-50/30"
                  onClick={() => setExpandedOrder(isExpanded ? null : order.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800">{order.customers?.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 truncate">
                      {order.order_items.map(oi => `${oi.quantity} ${oi.bakery_items?.name}`).join(' · ')}
                    </div>
                  </div>
                  <div className="ml-3 text-right shrink-0">
                    <div className="font-mono text-sm font-semibold text-gray-800">₹{deliveredAmt > 0 ? deliveredAmt.toFixed(0) : orderedAmt.toFixed(0)}</div>
                    {deliveredAmt > 0 && deliveredAmt !== orderedAmt && (
                      <div className="text-xs text-gray-400">ordered ₹{orderedAmt.toFixed(0)}</div>
                    )}
                    <div className="flex items-center gap-2 justify-end mt-1">
                      {order.status !== 'delivered' && (
                        <button onClick={e => { e.stopPropagation(); markDelivered(order) }}
                          disabled={markingDelivered[order.id]}
                          className="text-xs px-2 py-1 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50">
                          {markingDelivered[order.id] ? '...' : '✓ Deliver'}
                        </button>
                      )}
                      <div className="text-xs text-gray-400">{isExpanded ? '▲' : '▼'}</div>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-amber-50 bg-amber-50/20 px-4 py-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-400 uppercase tracking-wide">
                          <th className="text-left py-1 font-medium">Item</th>
                          <th className="text-center px-2 py-1 font-medium">Ordered</th>
                          <th className="text-center px-2 py-1 font-medium">Baked</th>
                          <th className="text-center px-2 py-1 font-medium">Loaded</th>
                          <th className="text-center px-2 py-1 font-medium">Delivered</th>
                          <th className="text-right py-1 font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.order_items.map(oi => {
                          const delivQty = order.status === 'delivered' ? (oi.delivered_qty ?? oi.quantity) : oi.delivered_qty
                          return (
                            <tr key={oi.id} className="border-t border-amber-100">
                              <td className="py-1.5 text-gray-700">{oi.bakery_items?.name}</td>
                              <td className="px-2 py-1.5 text-center text-gray-600">{oi.quantity}</td>
                              <td className={`px-2 py-1.5 text-center ${oi.baked_qty != null && oi.baked_qty < oi.quantity ? 'text-orange-500' : 'text-gray-600'}`}>
                                {oi.baked_qty ?? '—'}
                              </td>
                              <td className={`px-2 py-1.5 text-center ${oi.loaded_qty != null && oi.loaded_qty < (oi.baked_qty ?? oi.quantity) ? 'text-orange-500' : 'text-gray-600'}`}>
                                {oi.loaded_qty ?? '—'}
                              </td>
                              <td className={`px-2 py-1.5 text-center font-medium ${delivQty == null ? 'text-gray-300' : delivQty < oi.quantity ? 'text-red-500' : 'text-green-600'}`}>
                                {delivQty ?? '—'}
                              </td>
                              <td className="py-1.5 text-right font-mono text-gray-700">₹{((delivQty ?? 0) * oi.unit_price).toFixed(0)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-amber-200">
                          <td colSpan="5" className="py-2 font-semibold text-amber-800 text-xs">Total</td>
                          <td className="py-2 text-right font-mono font-bold text-amber-900">₹{deliveredAmt.toFixed(0)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
          <div className="border-t-2 border-amber-100 px-4 py-3 flex justify-between bg-amber-50/50">
            <span className="text-sm font-semibold text-amber-800">Day Total (Delivered)</span>
            <span className="font-mono font-bold text-amber-900">₹{totalDelivered.toFixed(0)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
