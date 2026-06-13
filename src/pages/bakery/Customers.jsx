import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const TYPES = ['cafe', 'retail', 'restaurant', 'other']
const empty = { name: '', contact_name: '', phone: '', address: '', type: 'cafe', has_custom_pricing: false, is_active: true, notes: '', payment_days: 0, route_order: 99, deliveryType: 'pickup', afterCustomer: '' }

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [bakeryItems, setBakeryItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showPricing, setShowPricing] = useState(null) // customer id
  const [form, setForm] = useState(empty)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [customPrices, setCustomPrices] = useState({}) // itemId -> price

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: c }, { data: b }] = await Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('bakery_items').select('*').eq('is_active', true).order('category').order('name')
    ])
    if (c) setCustomers(c)
    if (b) setBakeryItems(b)
    setLoading(false)
  }

  async function save() {
    if (!form.name) return setError('Customer name is required.')
    if (saving) return
    if (!editing && form.deliveryType === 'delivery' && !form.afterCustomer) {
      return setError('Please select a position in the delivery route.')
    }
    setSaving(true); setError('')

    let saveData = { ...form }
    delete saveData.deliveryType
    delete saveData.afterCustomer

    if (!editing) {
      // New customer — handle route order
      if (form.deliveryType === 'pickup') {
        saveData.route_order = 99
      } else {
        // Delivery — shift existing customers down and insert at correct position
        let newRouteOrder
        if (form.afterCustomer === 'start') {
          newRouteOrder = 1
        } else {
          const afterCust = customers.find(c => c.id === form.afterCustomer)
          newRouteOrder = (afterCust?.route_order || 1) + 1
        }
        // Shift all delivery customers at or after newRouteOrder down by 1
        const toShift = customers.filter(c => (c.route_order || 99) >= newRouteOrder && (c.route_order || 99) < 99)
        for (const c of toShift) {
          await supabase.from('customers').update({ route_order: c.route_order + 1 }).eq('id', c.id)
        }
        saveData.route_order = newRouteOrder
      }
    }

    const { error } = editing
      ? await supabase.from('customers').update(saveData).eq('id', editing)
      : await supabase.from('customers').insert(saveData)
    setSaving(false)
    if (error) return setError(error.message)
    setShowForm(false); setForm(empty); setEditing(null)
    fetchAll()
  }

  async function openPricing(customer) {
    const { data } = await supabase.from('customer_prices').select('*').eq('customer_id', customer.id)
    const map = {}
    if (data) data.forEach(p => map[p.bakery_item_id] = p.custom_price)
    setCustomPrices(map)
    setShowPricing(customer)
  }

  async function savePricing() {
    setSaving(true)
    for (const [itemId, price] of Object.entries(customPrices)) {
      if (!price) {
        await supabase.from('customer_prices').delete().match({ customer_id: showPricing.id, bakery_item_id: itemId })
      } else {
        await supabase.from('customer_prices').upsert({ customer_id: showPricing.id, bakery_item_id: itemId, custom_price: parseFloat(price) }, { onConflict: 'customer_id,bakery_item_id' })
      }
    }
    setSaving(false)
    setShowPricing(null)
  }

  function startEdit(c) {
    setForm({ name: c.name, contact_name: c.contact_name || '', phone: c.phone || '', address: c.address || '', type: c.type, has_custom_pricing: c.has_custom_pricing, is_active: c.is_active, notes: c.notes || '', payment_days: c.payment_days || 0 })
    setEditing(c.id); setShowForm(true)
  }

  async function toggleActive(c) {
    await supabase.from('customers').update({ is_active: !c.is_active }).eq('id', c.id)
    fetchAll()
  }

  const filtered = customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-amber-900">Customers</h2>
          <p className="text-sm text-amber-700 mt-0.5">{customers.filter(c => c.is_active).length} active accounts</p>
        </div>
        <button onClick={() => { setShowForm(true); setForm(empty); setEditing(null) }}
          className="bg-amber-800 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-amber-700 transition-colors">
          + Add Customer
        </button>
      </div>

      <div className="mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customers..."
          className="px-3 py-2 rounded-lg border border-amber-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
      </div>

      {loading ? <div className="text-center py-12 text-amber-600">Loading...</div> : (
        <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-amber-400 text-sm">No customers yet. Add your wholesale accounts!</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-amber-50 text-amber-700 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Contact</th>
                  <th className="text-left px-4 py-3 font-medium">Phone</th>
                  <th className="text-center px-4 py-3 font-medium">Payment</th>
                  <th className="text-center px-4 py-3 font-medium">Pricing</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={c.id} className={`border-t border-amber-50 ${i % 2 === 0 ? '' : 'bg-amber-50/30'}`}>
                    <td className="px-4 py-3 font-medium text-gray-800">{c.name}</td>
                    <td className="px-4 py-3"><span className="capitalize text-gray-500">{c.type}</span></td>
                    <td className="px-4 py-3 text-gray-500">{c.contact_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{c.phone || '—'}</td>
                    <td className="px-4 py-3 text-center text-gray-500 text-xs">
                      {c.payment_days === 0 ? 'COD' : `${c.payment_days} days`}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {c.has_custom_pricing
                        ? <button onClick={() => openPricing(c)} className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium hover:bg-purple-200">Custom ✎</button>
                        : <span className="text-xs text-gray-400">Standard</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleActive(c)}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => startEdit(c)} className="text-amber-600 hover:text-amber-800 text-xs font-medium">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Add/Edit Customer Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h3 className="font-semibold text-gray-800 mb-5">{editing ? 'Edit Customer' : 'New Customer'}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Business Name *</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Blue Tokai Coffee"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Contact Person</label>
                  <input value={form.contact_name} onChange={e => setForm({...form, contact_name: e.target.value})} placeholder="Name"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">WhatsApp / Phone</label>
                  <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+91 98765 43210"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Type</label>
                  <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white">
                    {TYPES.map(t => <option key={t} className="capitalize">{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Address</label>
                  <input value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="Area / locality"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Notes</label>
                <input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Any special instructions..."
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Payment Terms (days)</label>
                <div className="flex items-center gap-3">
                  <input type="number" min="0" value={form.payment_days} onChange={e => setForm({...form, payment_days: parseInt(e.target.value) || 0})}
                    className="w-28 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                  <span className="text-sm text-gray-400">{form.payment_days === 0 ? 'Cash on delivery' : `${form.payment_days} days credit`}</span>
                </div>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={form.has_custom_pricing} onChange={e => setForm({...form, has_custom_pricing: e.target.checked})} className="rounded" />
                  Has custom pricing
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} className="rounded" />
                  Active
                </label>
              </div>
              {!editing && (
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-2 block">Delivery Type</label>
                  <div className="flex gap-3 mb-3">
                    <button onClick={() => setForm({...form, deliveryType: 'pickup', route_order: 99})}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${form.deliveryType === 'pickup' ? 'bg-amber-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      Self Pick-up
                    </button>
                    <button onClick={() => setForm({...form, deliveryType: 'delivery', afterCustomer: ''})}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${form.deliveryType === 'delivery' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      Delivery Route
                    </button>
                  </div>
                  {form.deliveryType === 'delivery' && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Position in Route — After</label>
                      <select value={form.afterCustomer} onChange={e => setForm({...form, afterCustomer: e.target.value})}
                        className="w-full px-3 py-2.5 rounded-xl border border-blue-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                        <option value="">Select position...</option>
                        <option value="start">— Start of route (position 1)</option>
                        {customers.filter(c => c.route_order && c.route_order < 99 && c.is_active)
                          .sort((a, b) => a.route_order - b.route_order)
                          .map(c => <option key={c.id} value={c.id}>After {c.name} (#{c.route_order})</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowForm(false); setError('') }} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-amber-800 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Update' : 'Add Customer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Pricing Modal */}
      {showPricing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl max-h-[80vh] flex flex-col">
            <h3 className="font-semibold text-gray-800 mb-1">Custom Prices — {showPricing.name}</h3>
            <p className="text-xs text-gray-400 mb-4">Leave blank to use standard price</p>
            <div className="overflow-y-auto flex-1 space-y-2 pr-1">
              {bakeryItems.map(item => (
                <div key={item.id} className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-700 truncate">{item.name}</div>
                    <div className="text-xs text-gray-400">Standard: ₹{parseFloat(item.selling_price).toFixed(2)}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-gray-400">₹</span>
                    <input type="number" step="0.01" placeholder={item.selling_price}
                      value={customPrices[item.id] || ''}
                      onChange={e => setCustomPrices({...customPrices, [item.id]: e.target.value})}
                      className="w-24 px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 text-right" />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5 pt-4 border-t border-gray-100">
              <button onClick={() => setShowPricing(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={savePricing} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-amber-800 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Prices'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
