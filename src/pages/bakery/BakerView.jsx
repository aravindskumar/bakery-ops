import { useState, useEffect } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import { buildBakeList } from '../../lib/bakeList'
import BakeListDisplay from '../../components/BakeListDisplay'

function getToday() { return new Date().toISOString().split('T')[0] }
function getTomorrow() {
  const d = new Date(); d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}
function formatDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function BakerView({ standalone }) {
  const { signOut } = useAuth()
  const [items, setItems] = useState([]) // aggregated flat list for baking input
  const [orders, setOrders] = useState([])
  const [bakeGroups, setBakeGroups] = useState([])
  const [cookieSurplus, setCookieSurplus] = useState(0)
  const [loading, setLoading] = useState(true)
  const [quantities, setQuantities] = useState({})
  const [completed, setCompleted] = useState({})
  const [saving, setSaving] = useState({})
  const [view, setView] = useState('list') // 'list' | 'grouped'
  const today = getToday()
  const tomorrow = getTomorrow()

  useEffect(() => { fetchBakeList() }, [])

  async function fetchBakeList() {
    setLoading(true)

    // Get yesterday's cookie surplus to deduct
    const { data: adjustments } = await supabase
      .from('bake_adjustments')
      .select('adjustment_qty')
      .eq('item_category', 'cookies')
      .eq('apply_date', today)

    const surplusToDeduct = adjustments?.reduce((s, a) => s + a.adjustment_qty, 0) || 0

    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*, bakery_items(id, name, unit, category))')
      .eq('order_date', today)
      .eq('status', 'sent_to_baker')
      .not('baking_started_at', 'is', null)

    if (error) { console.error(error); setLoading(false); return }

    const orderList = data || []
    setOrders(orderList)

    // Aggregate by item name
    const map = {}
    for (const order of orderList) {
      for (const oi of order.order_items) {
        const name = oi.bakery_items?.name
        if (!map[name]) map[name] = {
          id: oi.bakery_item_id,
          name,
          unit: oi.bakery_items?.unit,
          category: oi.bakery_items?.category,
          ordered: 0,
          orderItems: []
        }
        map[name].ordered += oi.quantity
        map[name].orderItems.push(oi)
      }
    }

    const aggregated = Object.values(map).sort((a, b) => a.name.localeCompare(b.name))
    setItems(aggregated)

    const initQty = {}
    aggregated.forEach(item => { initQty[item.id] = item.ordered })
    setQuantities(initQty)

    // Build grouped bake list
    const itemQtyMap = {}
    aggregated.forEach(item => { itemQtyMap[item.name] = item.ordered })
    const { groups, cookieSurplus: surplus } = buildBakeList(itemQtyMap, surplusToDeduct)
    setBakeGroups(groups)
    setCookieSurplus(surplus)

    setLoading(false)
  }

  async function markCompleted(item) {
    const baked = parseInt(quantities[item.id]) || 0
    setSaving(prev => ({ ...prev, [item.id]: true }))

    const affectedOrders = orders.filter(o => o.order_items.some(oi => oi.bakery_item_id === item.id))
    const allOrderItems = affectedOrders.flatMap(o => o.order_items.filter(oi => oi.bakery_item_id === item.id))
    const totalOrdered = allOrderItems.reduce((s, oi) => s + oi.quantity, 0)
    let remaining = baked

    for (const oi of allOrderItems) {
      const proportion = totalOrdered > 0 ? oi.quantity / totalOrdered : 0
      const itemBaked = Math.min(oi.quantity, Math.round(proportion * baked))
      remaining -= itemBaked
      await supabase.from('order_items').update({ baked_qty: itemBaked }).eq('id', oi.id)
    }

    if (remaining !== 0 && allOrderItems.length > 0) {
      const lastOi = allOrderItems[allOrderItems.length - 1]
      const { data } = await supabase.from('order_items').select('baked_qty').eq('id', lastOi.id).single()
      if (data) await supabase.from('order_items').update({ baked_qty: (data.baked_qty || 0) + remaining }).eq('id', lastOi.id)
    }

    await supabase.from('orders')
      .update({ status: 'bake_completed', bake_completed_at: new Date().toISOString() })
      .in('id', affectedOrders.map(o => o.id))

    setSaving(prev => ({ ...prev, [item.id]: false }))
    setCompleted(prev => ({ ...prev, [item.id]: true }))
  }

  async function markAllBaked() {
    if (!confirm('Mark all orders as Bake Completed?')) return
    const ids = orders.map(o => o.id)
    if (ids.length > 0) {
      // Save all quantities
      for (const item of items) {
        const baked = parseInt(quantities[item.id]) || 0
        for (const oi of item.orderItems) {
          await supabase.from('order_items').update({ baked_qty: baked }).eq('id', oi.id)
        }
      }
      await supabase.from('orders')
        .update({ status: 'bake_completed', bake_completed_at: new Date().toISOString() })
        .in('id', ids)
    }

    // Save cookie surplus for tomorrow
    if (cookieSurplus > 0) {
      await supabase.from('bake_adjustments').insert({
        item_category: 'cookies',
        adjustment_qty: cookieSurplus,
        apply_date: tomorrow,
        reason: `Cookie surplus from ${today}`
      })
    }

    const allSavedMap = {}
    items.forEach(i => allSavedMap[i.id] = true)
    setCompleted(allSavedMap)
    fetchBakeList()
  }

  const allDone = items.length > 0 && items.every(i => completed[i.id])
  const completedCount = Object.values(completed).filter(Boolean).length

  const content = (
    <div className="px-4 pb-10 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-5 pt-6">
        <div>
          <h2 className="text-xl font-semibold text-amber-900">🧑‍🍳 Bake List</h2>
          <p className="text-sm text-amber-700 mt-0.5">{formatDate(today)}</p>
        </div>
        {items.length > 0 && !allDone && (
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl overflow-hidden border border-amber-200 text-xs">
              <button onClick={() => setView('grouped')}
                className={`px-3 py-1.5 font-medium ${view === 'grouped' ? 'bg-amber-800 text-white' : 'bg-white text-amber-700'}`}>
                Bake View
              </button>
              <button onClick={() => setView('list')}
                className={`px-3 py-1.5 font-medium ${view === 'list' ? 'bg-amber-800 text-white' : 'bg-white text-amber-700'}`}>
                Item List
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Progress */}
      {items.length > 0 && (
        <div className="mb-5">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>{completedCount} of {items.length} items confirmed</span>
            <span>{Math.round((completedCount / items.length) * 100)}%</span>
          </div>
          <div className="h-2 bg-amber-100 rounded-full overflow-hidden">
            <div className="h-2 bg-amber-600 rounded-full transition-all duration-500"
              style={{ width: `${(completedCount / items.length) * 100}%` }} />
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-amber-600">Loading bake list...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-amber-100">
          <div className="text-4xl mb-3">👨‍🍳</div>
          <p className="text-gray-500 font-medium">No orders to bake today</p>
          <p className="text-sm text-gray-400 mt-1">Orders will appear once sent from admin</p>
        </div>
      ) : allDone ? (
        <div className="bg-green-50 border border-green-100 rounded-2xl p-10 text-center">
          <div className="text-5xl mb-3">🎉</div>
          <p className="text-lg font-semibold text-green-800">All done!</p>
          <p className="text-sm text-green-600 mt-1">All items baked and confirmed</p>
          {cookieSurplus > 0 && (
            <p className="text-xs text-purple-600 mt-2 bg-purple-50 rounded-lg px-3 py-2">
              {cookieSurplus} cookies surplus saved for tomorrow
            </p>
          )}
        </div>
      ) : view === 'grouped' ? (
        // Grouped bake view
        <div>
          <BakeListDisplay groups={bakeGroups} cookieSurplus={cookieSurplus} />
          <button onClick={() => setView('list')}
            className="w-full mt-4 py-3 rounded-xl bg-amber-800 text-white text-sm font-semibold hover:bg-amber-700">
            Start Marking Items as Baked →
          </button>
        </div>
      ) : (
        // Item list for marking baked
        <div>
          <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-amber-50 text-amber-700 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Item</th>
                  <th className="text-center px-4 py-3 font-medium">Ordered</th>
                  <th className="text-center px-4 py-3 font-medium">Baked</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => {
                  const baked = parseInt(quantities[item.id]) || 0
                  const isShort = quantities[item.id] !== '' && baked < item.ordered
                  const isDone = completed[item.id]
                  const isSaving = saving[item.id]
                  return (
                    <tr key={item.id} className={`border-t border-amber-50 ${isDone ? 'bg-green-50/40' : ''}`}>
                      <td className="px-4 py-3 text-gray-800">
                        {item.name}
                        {isDone && <span className="ml-2 text-green-500 text-xs">✓</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700">{item.ordered}</td>
                      <td className="px-4 py-3 text-center">
                        {isDone ? (
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-green-700 font-semibold">{quantities[item.id]}</span>
                            <button onClick={() => setCompleted(prev => ({ ...prev, [item.id]: false }))}
                              className="text-xs text-gray-400 underline">edit</button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <input type="number" min="0"
                              value={quantities[item.id] ?? item.ordered}
                              onChange={e => setQuantities(q => ({ ...q, [item.id]: e.target.value }))}
                              className={`w-20 text-center px-2 py-1.5 rounded-lg border text-sm focus:outline-none focus:ring-2 ${
                                isShort ? 'border-red-300 focus:ring-red-300 bg-red-50' : 'border-gray-200 focus:ring-amber-400'
                              }`} />
                            {isShort && <span className="text-xs text-red-500">⚠ Short by {item.ordered - baked}</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!isDone && (
                          <button onClick={() => markCompleted(item)} disabled={isSaving}
                            className="px-4 py-1.5 rounded-xl bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50">
                            {isSaving ? '...' : 'Baked'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button onClick={markAllBaked}
            className="w-full py-3 rounded-xl bg-amber-100 text-amber-800 text-sm font-semibold hover:bg-amber-200">
            ✅ Mark All as Baked
          </button>
        </div>
      )}
    </div>
  )

  if (!standalone) return content

  return (
    <div className="min-h-screen bg-amber-50">
      <header className="bg-white border-b border-amber-100 px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🧑‍🍳</span>
          <div>
            <h1 className="text-base font-semibold text-amber-900">Sunil Homemade Bakery</h1>
            <p className="text-xs text-amber-600">{formatDate(today)}</p>
          </div>
        </div>
        <button onClick={signOut} className="text-sm text-amber-600 hover:text-amber-900 transition-colors">Sign out</button>
      </header>
      {content}
    </div>
  )
}
