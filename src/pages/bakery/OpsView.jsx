import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

function fmt(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function getToday() { return new Date().toISOString().split('T')[0] }
function get7DaysAgo() {
  const d = new Date(); d.setDate(d.getDate() - 7)
  return d.toISOString().split('T')[0]
}

export default function OpsView() {
  const [fromDate, setFromDate] = useState(get7DaysAgo())
  const [toDate, setToDate] = useState(getToday())
  const [loading, setLoading] = useState(false)
  const [orders, setOrders] = useState([])
  const [expandedCustomer, setExpandedCustomer] = useState(null)

  useEffect(() => { fetchData() }, [fromDate, toDate])

  async function fetchData() {
    setLoading(true)
    const { data, error } = await supabase
      .from('orders')
      .select('*, customers(name, type), order_items(*, bakery_items(id, name, unit, category))')
      .gte('order_date', fromDate)
      .lte('order_date', toDate)
      .order('order_date', { ascending: false })
    if (!error) setOrders(data || [])
    setLoading(false)
  }

  // ── Item Summary ──────────────────────────────────────────────
  const itemMap = {}
  for (const order of orders) {
    for (const oi of order.order_items) {
      const id = oi.bakery_item_id
      if (!itemMap[id]) itemMap[id] = {
        name: oi.bakery_items?.name,
        unit: oi.bakery_items?.unit,
        ordered: 0, baked: 0, loaded: 0, delivered: 0,
        revenueOrdered: 0, revenueDelivered: 0,
      }
      const qty = oi.quantity
      const rev = qty * oi.unit_price
      itemMap[id].ordered += qty
      itemMap[id].revenueOrdered += rev
      if (oi.baked_qty != null) {
        itemMap[id].baked += oi.baked_qty
      } else if (['bake_completed','delivered'].includes(order.status)) {
        itemMap[id].baked += qty // fallback for old orders
      }
      if (oi.loaded_qty != null) {
        itemMap[id].loaded += oi.loaded_qty
      }
      if (order.status === 'delivered') {
        itemMap[id].delivered += (oi.delivered_qty ?? qty)
        itemMap[id].revenueDelivered += rev
      }
    }
  }
  const itemRows = Object.values(itemMap).sort((a,b) => a.name.localeCompare(b.name))

  // ── Customer Summary ──────────────────────────────────────────
  const custMap = {}
  for (const order of orders) {
    const id = order.customer_id
    if (!custMap[id]) custMap[id] = {
      name: order.customers?.name,
      type: order.customers?.type,
      orders: [],
      ordered: 0, delivered: 0,
      revenueOrdered: 0, revenueDelivered: 0,
    }
    const orderTotal = order.order_items.reduce((s, oi) => s + oi.quantity * oi.unit_price, 0)
    custMap[id].orders.push(order)
    custMap[id].revenueOrdered += orderTotal
    if (order.status === 'delivered') custMap[id].revenueDelivered += orderTotal
    for (const oi of order.order_items) {
      custMap[id].ordered += oi.quantity
      if (order.status === 'delivered') custMap[id].delivered += oi.quantity
    }
  }
  const custRows = Object.values(custMap).sort((a,b) => b.revenueOrdered - a.revenueOrdered)

  // ── Totals ────────────────────────────────────────────────────
  const totalOrdered = itemRows.reduce((s,r) => s + r.revenueOrdered, 0)
  const totalDelivered = itemRows.reduce((s,r) => s + r.revenueDelivered, 0)
  const totalLeakage = totalOrdered - totalDelivered
  const orderCount = orders.length
  const deliveredCount = orders.filter(o => o.status === 'delivered').length

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-amber-900">Operations View</h2>
          <p className="text-sm text-amber-700 mt-0.5">Ordered → Baked → Delivered · Revenue leakage tracker</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-amber-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
          <span className="text-gray-400 text-xs">to</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-amber-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
        </div>
      </div>

      {loading ? <div className="text-center py-12 text-amber-600">Loading...</div> : orders.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-amber-100 text-amber-400 text-sm">No orders in this date range.</div>
      ) : (
        <div className="space-y-6">

          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Orders', value: orderCount, sub: `${deliveredCount} delivered`, color: 'border-amber-100' },
              { label: 'Revenue Ordered', value: `₹${totalOrdered.toFixed(0)}`, sub: 'total billed', color: 'border-blue-100' },
              { label: 'Revenue Delivered', value: `₹${totalDelivered.toFixed(0)}`, sub: 'confirmed', color: 'border-green-100' },
              { label: 'Leakage', value: `₹${totalLeakage.toFixed(0)}`, sub: 'not yet delivered', color: totalLeakage > 0 ? 'border-red-200' : 'border-green-100' },
            ].map(k => (
              <div key={k.label} className={`bg-white rounded-2xl border ${k.color} p-4`}>
                <div className="text-xs text-gray-400 mb-1">{k.label}</div>
                <div className="font-bold text-lg text-gray-800">{k.value}</div>
                <div className="text-xs text-gray-400 mt-0.5">{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Item Summary Table */}
          <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
            <div className="px-4 py-3 bg-amber-50 text-xs font-semibold text-amber-700 uppercase tracking-wide">Item Summary</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                    <th className="text-left px-4 py-2 font-medium">Item</th>
                    <th className="text-center px-3 py-2 font-medium">Ordered</th>
                    <th className="text-center px-3 py-2 font-medium">Baked</th>
                    <th className="text-center px-3 py-2 font-medium">Loaded</th>
                    <th className="text-center px-3 py-2 font-medium">Delivered</th>
                    <th className="text-center px-3 py-2 font-medium">Bake Short</th>
                    <th className="text-center px-3 py-2 font-medium">Load Short</th>
                    <th className="text-center px-3 py-2 font-medium">Delivery Short</th>
                    <th className="text-right px-4 py-2 font-medium">Rev. Ordered</th>
                    <th className="text-right px-4 py-2 font-medium">Rev. Delivered</th>
                    <th className="text-right px-4 py-2 font-medium">Leakage</th>
                  </tr>
                </thead>
                <tbody>
                  {itemRows.map((row, i) => {
                    const bakeShort = row.ordered - row.baked
                    const loadShort = row.loaded > 0 ? row.ordered - row.loaded : null
                    const deliveryShort = row.ordered - row.delivered
                    const leakage = row.revenueOrdered - row.revenueDelivered
                    return (
                      <tr key={i} className={`border-t border-gray-50 ${i % 2 === 0 ? '' : 'bg-amber-50/20'}`}>
                        <td className="px-4 py-2.5 text-gray-800">{row.name}</td>
                        <td className="px-3 py-2.5 text-center text-gray-700">{row.ordered}</td>
                        <td className="px-3 py-2.5 text-center text-gray-700">{row.baked}</td>
                        <td className="px-3 py-2.5 text-center text-gray-700">{row.loaded > 0 ? row.loaded : '—'}</td>
                        <td className="px-3 py-2.5 text-center text-gray-700">{row.delivered}</td>
                        <td className={`px-3 py-2.5 text-center font-medium ${bakeShort > 0 ? 'text-orange-500' : 'text-gray-300'}`}>
                          {bakeShort > 0 ? bakeShort : '—'}
                        </td>
                        <td className={`px-3 py-2.5 text-center font-medium ${loadShort != null && loadShort > 0 ? 'text-orange-500' : 'text-gray-300'}`}>
                          {loadShort != null && loadShort > 0 ? loadShort : '—'}
                        </td>
                        <td className={`px-3 py-2.5 text-center font-medium ${deliveryShort > 0 ? 'text-red-500' : 'text-gray-300'}`}>
                          {deliveryShort > 0 ? deliveryShort : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-700">₹{row.revenueOrdered.toFixed(0)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-700">₹{row.revenueDelivered.toFixed(0)}</td>
                        <td className={`px-4 py-2.5 text-right font-mono font-semibold ${leakage > 0 ? 'text-red-500' : 'text-gray-300'}`}>
                          {leakage > 0 ? `₹${leakage.toFixed(0)}` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-amber-100 bg-amber-50/50 font-semibold">
                    <td className="px-4 py-2.5 text-amber-800">Total</td>
                    <td className="px-3 py-2.5 text-center text-amber-800">{itemRows.reduce((s,r)=>s+r.ordered,0)}</td>
                    <td className="px-3 py-2.5 text-center text-amber-800">{itemRows.reduce((s,r)=>s+r.baked,0)}</td>
                    <td className="px-3 py-2.5 text-center text-amber-800">{itemRows.reduce((s,r)=>s+r.loaded,0) || '—'}</td>
                    <td className="px-3 py-2.5 text-center text-amber-800">{itemRows.reduce((s,r)=>s+r.delivered,0)}</td>
                    <td className="px-3 py-2.5 text-center text-orange-500">{itemRows.reduce((s,r)=>s+(r.ordered-r.baked),0) || '—'}</td>
                    <td className="px-3 py-2.5 text-center text-orange-500">{itemRows.filter(r=>r.loaded>0).reduce((s,r)=>s+(r.ordered-r.loaded),0) || '—'}</td>
                    <td className="px-3 py-2.5 text-center text-red-500">{itemRows.reduce((s,r)=>s+(r.ordered-r.delivered),0) || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-amber-800">₹{totalOrdered.toFixed(0)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-amber-800">₹{totalDelivered.toFixed(0)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-red-500">₹{totalLeakage.toFixed(0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Customer Breakdown */}
          <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
            <div className="px-4 py-3 bg-amber-50 text-xs font-semibold text-amber-700 uppercase tracking-wide">Customer Breakdown</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                  <th className="text-left px-4 py-2 font-medium">Customer</th>
                  <th className="text-left px-4 py-2 font-medium">Type</th>
                  <th className="text-center px-4 py-2 font-medium">Orders</th>
                  <th className="text-right px-4 py-2 font-medium">Rev. Ordered</th>
                  <th className="text-right px-4 py-2 font-medium">Rev. Delivered</th>
                  <th className="text-right px-4 py-2 font-medium">Leakage</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {custRows.map((cust, i) => {
                  const leakage = cust.revenueOrdered - cust.revenueDelivered
                  const isExpanded = expandedCustomer === cust.name
                  return (
                    <>
                      <tr key={i} className={`border-t border-gray-50 ${i % 2 === 0 ? '' : 'bg-amber-50/20'} cursor-pointer hover:bg-amber-50/40`}
                        onClick={() => setExpandedCustomer(isExpanded ? null : cust.name)}>
                        <td className="px-4 py-2.5 font-medium text-gray-800">{cust.name}</td>
                        <td className="px-4 py-2.5 text-gray-500 capitalize">{cust.type}</td>
                        <td className="px-4 py-2.5 text-center text-gray-600">{cust.orders.length}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-700">₹{cust.revenueOrdered.toFixed(0)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-700">₹{cust.revenueDelivered.toFixed(0)}</td>
                        <td className={`px-4 py-2.5 text-right font-mono font-semibold ${leakage > 0 ? 'text-red-500' : 'text-gray-300'}`}>
                          {leakage > 0 ? `₹${leakage.toFixed(0)}` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs text-amber-500">{isExpanded ? '▲' : '▼'}</td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${i}-exp`}>
                          <td colSpan="7" className="px-6 py-3 bg-amber-50/30">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-400 uppercase">
                                  <th className="text-left py-1 font-medium">Date</th>
                                  <th className="text-left py-1 font-medium">Items</th>
                                  <th className="text-center py-1 font-medium">Status</th>
                                  <th className="text-right py-1 font-medium">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {cust.orders.map(order => {
                                  const STATUS = {
                                    draft: { label: 'Draft', color: 'text-gray-400' },
                                    sent_to_baker: { label: 'Sent to Baker', color: 'text-blue-500' },
                                    bake_completed: { label: 'Baked', color: 'text-amber-600' },
                                    delivered: { label: 'Delivered', color: 'text-green-600' },
                                  }
                                  const s = STATUS[order.status] || STATUS.draft
                                  return (
                                    <tr key={order.id} className="border-t border-amber-100">
                                      <td className="py-1.5 text-gray-600">{fmt(order.order_date)}</td>
                                      <td className="py-1.5 text-gray-500">{order.order_items.map(oi => `${oi.quantity} ${oi.bakery_items?.name}`).join(', ')}</td>
                                      <td className={`py-1.5 text-center font-medium ${s.color}`}>{s.label}</td>
                                      <td className="py-1.5 text-right font-mono text-gray-700">₹{parseFloat(order.total_amount).toFixed(0)}</td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>

        </div>
      )}
    </div>
  )
}
