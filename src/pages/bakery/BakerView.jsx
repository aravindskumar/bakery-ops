import { useState, useEffect } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'

function getToday() {
  return new Date().toISOString().split('T')[0]
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function BakerView({ standalone }) {
  const { signOut } = useAuth()
  const [items, setItems] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [quantities, setQuantities] = useState({})
  const [completed, setCompleted] = useState({})
  const [saving, setSaving] = useState({})
  const today = getToday()

  useEffect(() => { fetchBakeList() }, [])

  async function fetchBakeList() {
    setLoading(true)
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*, bakery_items(id, name, unit, category))')
      .eq('order_date', today)
      .eq('status', 'sent_to_baker')
      .not('baking_started_at', 'is', null)

    if (error) { console.error(error); setLoading(false); return }

    const orderList = data || []
    setOrders(orderList)

    const map = {}
    for (const order of orderList) {
      for (const oi of order.order_items) {
        const id = oi.bakery_item_id
        if (!map[id]) map[id] = {
          id,
          name: oi.bakery_items?.name,
          unit: oi.bakery_items?.unit,
          category: oi.bakery_items?.category,
          ordered: 0,
        }
        map[id].ordered += oi.quantity
      }
    }

    const aggregated = Object.values(map).sort((a, b) =>
      (a.category || '').localeCompare(b.category || '') ||
      (a.name || '').localeCompare(b.name || '')
    )
    setItems(aggregated)

    const initQty = {}
    aggregated.forEach(item => { initQty[item.id] = item.ordered })
    setQuantities(initQty)
    setLoading(false)
  }

  async function markCompleted(item) {
    const baked = parseInt(quantities[item.id]) || 0
    setSaving(prev => ({ ...prev, [item.id]: true }))

    const affectedOrderIds = orders
      .filter(o => o.order_items.some(oi => oi.bakery_item_id === item.id))
      .map(o => o.id)

    if (affectedOrderIds.length > 0) {
      await supabase.from('orders')
        .update({ status: 'bake_completed', bake_completed_at: new Date().toISOString() })
        .in('id', affectedOrderIds)
    }

    setSaving(prev => ({ ...prev, [item.id]: false }))
    setCompleted(prev => ({ ...prev, [item.id]: true }))
  }

  const completedCount = Object.values(completed).filter(Boolean).length
  const allDone = items.length > 0 && completedCount === items.length
  const categories = [...new Set(items.map(i => i.category).filter(Boolean))]

  const content = (
    <div className="max-w-2xl mx-auto px-4 pb-10 pt-6">

      {/* Progress bar */}
      {items.length > 0 && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>{completedCount} of {items.length} items completed</span>
            <span>{Math.round((completedCount / items.length) * 100)}%</span>
          </div>
          <div className="h-2 bg-amber-100 rounded-full overflow-hidden">
            <div
              className="h-2 bg-amber-600 rounded-full transition-all duration-500"
              style={{ width: `${(completedCount / items.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-amber-600">Loading bake list...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-amber-100">
          <div className="text-4xl mb-3">👨‍🍳</div>
          <p className="text-gray-600 font-medium">No orders to bake today</p>
          <p className="text-sm text-gray-400 mt-1">Orders will appear once sent from admin</p>
        </div>
      ) : allDone ? (
        <div className="bg-green-50 border border-green-100 rounded-2xl p-10 text-center">
          <div className="text-5xl mb-3">🎉</div>
          <p className="text-lg font-semibold text-green-800">All done!</p>
          <p className="text-sm text-green-600 mt-1">All items baked and confirmed</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-amber-50 text-amber-700 text-xs uppercase tracking-wide border-b border-amber-100">
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
                  <tr key={item.id} className={`border-t border-amber-50 ${isDone ? 'bg-green-50/40' : i % 2 === 0 ? '' : 'bg-amber-50/20'}`}>
                    <td className="px-4 py-3 text-gray-800">
                      {item.name}
                      {isDone && <span className="ml-2 text-green-500 text-xs">✓</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-800">{item.ordered}</td>
                    <td className="px-4 py-3 text-center">
                      {isDone ? (
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-green-700">{quantities[item.id]}</span>
                          <button onClick={() => setCompleted(prev => ({ ...prev, [item.id]: false }))}
                            className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2">edit</button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            value={quantities[item.id] ?? item.ordered}
                            onChange={e => setQuantities(q => ({ ...q, [item.id]: e.target.value }))}
                            className={`w-20 text-center px-2 py-1.5 rounded-lg border text-sm focus:outline-none focus:ring-2 ${
                              isShort ? 'border-red-300 focus:ring-red-300 bg-red-50' : 'border-gray-200 focus:ring-amber-400'
                            }`}
                          />
                          {isShort && <span className="text-xs text-red-500">⚠ Short by {item.ordered - baked}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!isDone && (
                        <button
                          onClick={() => markCompleted(item)}
                          disabled={isSaving}
                          className="px-4 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-40 transition-colors">
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
            <h1 className="text-base font-semibold text-amber-900">Baker View</h1>
            <p className="text-xs text-amber-600">{formatDate(today)}</p>
          </div>
        </div>
        <button onClick={signOut} className="text-sm text-amber-600 hover:text-amber-900 transition-colors">Sign out</button>
      </header>
      {content}
    </div>
  )
}
