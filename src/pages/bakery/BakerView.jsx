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

    // Baking cycle: before 11am show today's delivery orders, 11am+ show tomorrow's
    const hour = new Date().getHours()
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]
    const bakingDeliveryDate = hour < 11 ? today : tomorrowStr

    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*, bakery_items(id, name, unit, category))')
      .eq('delivery_date', bakingDeliveryDate)
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

    // Sort by route order priority — first customer gets full allocation
    const sorted = [...allOrderItems].sort((a, b) => {
      const orderA = affectedOrders.find(o => o.order_items.some(oi => oi.id === a.id))
      const orderB = affectedOrders.find(o => o.order_items.some(oi => oi.id === b.id))
      const custA = customers.find(c => c.id === orderA?.customer_id)
      const custB = customers.find(c => c.id === orderB?.customer_id)
      return (custA?.route_order || 99) - (custB?.route_order || 99)
    })

    // Allocate baked qty — fill each order fully before moving to next
    let remaining = baked
    const allocations = {}
    for (const oi of sorted) {
      const allocate = Math.min(oi.quantity, remaining)
      allocations[oi.id] = allocate
      remaining -= allocate
    }

    // Save all baked_qty in parallel
    await Promise.all(sorted.map(oi =>
      supabase.from('order_items').update({ baked_qty: allocations[oi.id] }).eq('id', oi.id)
    ))

    // Mark orders as bake_completed if ALL their items now have baked_qty set
    const ordersToComplete = []
    for (const order of affectedOrders) {
      const { data: allItems } = await supabase
        .from('order_items').select('baked_qty').eq('order_id', order.id)
      const allBaked = allItems && allItems.every(oi => oi.baked_qty != null)
      if (allBaked) ordersToComplete.push(order.id)
    }

    if (ordersToComplete.length > 0) {
      await supabase.from('orders')
        .update({ status: 'bake_completed', bake_completed_at: new Date().toISOString() })
        .in('id', ordersToComplete)
    }

    setSaving(prev => ({ ...prev, [item.id]: false }))
    setCompleted(prev => ({ ...prev, [item.id]: true }))
  }

  const [showBakingComplete, setShowBakingComplete] = useState(false)

  async function markAllBaked() {
    // Save all quantities first
    const ids = orders.map(o => o.id)
    if (ids.length > 0) {
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
        // Item list for marking baked — grouped by category
        <div>
          {(() => {
            const categoryMap = {}
            for (const item of items) {
              const cat = item.category || 'Other'
              if (!categoryMap[cat]) categoryMap[cat] = []
              categoryMap[cat].push(item)
            }
            const CATEGORY_ORDER = ['Bread', 'Pastry', 'Dry Cake', 'Wet Cake', 'Cookie', 'Pie', 'Other']
            const sortedCats = Object.keys(categoryMap).sort((a, b) => {
              const ai = CATEGORY_ORDER.indexOf(a); const bi = CATEGORY_ORDER.indexOf(b)
              return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
            })
            return sortedCats.map(cat => (
              <div key={cat} className="bg-white rounded-2xl border border-amber-100 overflow-hidden mb-3">
                <div className="px-4 py-2 bg-amber-50 text-xs font-bold text-amber-700 uppercase tracking-wide">{cat}</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase border-b border-amber-50">
                      <th className="text-left px-4 py-2 font-medium">Item</th>
                      <th className="text-center px-4 py-2 font-medium">Ordered</th>
                      <th className="text-center px-4 py-2 font-medium">Baked</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryMap[cat].map((item, i) => {
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
            ))
          })()}
          <button onClick={() => setShowBakingComplete(true)}
            className="w-full py-4 rounded-xl bg-green-600 text-white text-base font-bold hover:bg-green-700 transition-colors">
            ✅ Baking Complete
          </button>

          {/* Baking Complete confirmation modal */}
          {showBakingComplete && (() => {
            const unbaked = items.filter(item => {
              const baked = parseInt(quantities[item.id]) || 0
              return baked === 0
            })
            const short = items.filter(item => {
              const baked = parseInt(quantities[item.id]) || 0
              return baked > 0 && baked < item.ordered
            })
            return (
              <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 px-0">
                <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 pb-10 shadow-2xl">
                  <h3 className="text-lg font-bold text-gray-800 mb-1">Confirm Baking Complete</h3>
                  <p className="text-sm text-gray-500 mb-5">Review before sending to delivery</p>

                  {unbaked.length === 0 && short.length === 0 ? (
                    <div className="bg-green-50 rounded-2xl p-4 text-center mb-5">
                      <div className="text-2xl mb-1">🎉</div>
                      <p className="text-green-700 font-semibold text-sm">All items baked as ordered!</p>
                    </div>
                  ) : (
                    <div className="space-y-3 mb-5">
                      {unbaked.length > 0 && (
                        <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                          <p className="text-xs font-bold text-red-700 uppercase tracking-wide mb-2">⚠️ Not Baked (qty = 0)</p>
                          {unbaked.map(item => (
                            <div key={item.id} className="flex justify-between text-sm py-1">
                              <span className="text-red-800">{item.name}</span>
                              <span className="text-red-600 font-semibold">0 / {item.ordered} ordered</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {short.length > 0 && (
                        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                          <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">Short Baked</p>
                          {short.map(item => {
                            const baked = parseInt(quantities[item.id]) || 0
                            return (
                              <div key={item.id} className="flex justify-between text-sm py-1">
                                <span className="text-amber-800">{item.name}</span>
                                <span className="text-amber-700 font-semibold">{baked} / {item.ordered} ordered</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button onClick={() => setShowBakingComplete(false)}
                      className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50">
                      ← Edit Quantities
                    </button>
                    <button onClick={() => { setShowBakingComplete(false); markAllBaked() }}
                      className="flex-1 py-3 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700">
                      Confirm & Complete
                    </button>
                  </div>
                </div>
              </div>
            )
          })()}
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
