import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const CATEGORIES = ['Bread', 'Pastry', 'Cake', 'Cookie', 'Muffin', 'Tart', 'Other']
const UNITS = ['piece', 'loaf', 'dozen', 'slice', 'roll', 'tray']

const empty = { name: '', category: 'Bread', unit: 'piece', selling_price: '', is_active: true }

export default function BakeryItems() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(empty)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('All')

  useEffect(() => { fetchItems() }, [])

  async function fetchItems() {
    setLoading(true)
    const { data, error } = await supabase.from('bakery_items').select('*').order('category').order('name')
    if (!error) setItems(data)
    setLoading(false)
  }

  async function save() {
    if (!form.name || !form.selling_price) return setError('Name and price are required.')
    setSaving(true); setError('')
    const payload = { ...form, selling_price: parseFloat(form.selling_price) }
    const { error } = editing
      ? await supabase.from('bakery_items').update(payload).eq('id', editing)
      : await supabase.from('bakery_items').insert(payload)
    setSaving(false)
    if (error) return setError(error.message)
    setShowForm(false); setForm(empty); setEditing(null)
    fetchItems()
  }

  async function toggleActive(item) {
    await supabase.from('bakery_items').update({ is_active: !item.is_active }).eq('id', item.id)
    fetchItems()
  }

  function startEdit(item) {
    setForm({ name: item.name, category: item.category, unit: item.unit, selling_price: item.selling_price, is_active: item.is_active })
    setEditing(item.id); setShowForm(true)
  }

  const filtered = items.filter(i =>
    (filterCat === 'All' || i.category === filterCat) &&
    i.name.toLowerCase().includes(search.toLowerCase())
  )

  const cats = ['All', ...CATEGORIES]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-amber-900">Bakery Items</h2>
          <p className="text-sm text-amber-700 mt-0.5">{items.filter(i=>i.is_active).length} active products</p>
        </div>
        <button onClick={() => { setShowForm(true); setForm(empty); setEditing(null) }}
          className="bg-amber-800 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-amber-700 transition-colors">
          + Add Item
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items..."
          className="px-3 py-2 rounded-lg border border-amber-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
        <div className="flex gap-1 flex-wrap">
          {cats.map(c => (
            <button key={c} onClick={() => setFilterCat(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterCat === c ? 'bg-amber-800 text-white' : 'bg-amber-100 text-amber-800 hover:bg-amber-200'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? <div className="text-center py-12 text-amber-600">Loading...</div> : (
        <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-amber-400 text-sm">No items found. Add your first bakery item!</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-amber-50 text-amber-700 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Category</th>
                  <th className="text-left px-4 py-3 font-medium">Unit</th>
                  <th className="text-right px-4 py-3 font-medium">Price</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, i) => (
                  <tr key={item.id} className={`border-t border-amber-50 ${i % 2 === 0 ? '' : 'bg-amber-50/30'}`}>
                    <td className="px-4 py-3 font-medium text-gray-800">{item.name}</td>
                    <td className="px-4 py-3 text-gray-500">{item.category}</td>
                    <td className="px-4 py-3 text-gray-500">{item.unit}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-gray-800">₹{parseFloat(item.selling_price).toFixed(2)}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleActive(item)}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                        {item.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => startEdit(item)} className="text-amber-600 hover:text-amber-800 text-xs font-medium">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h3 className="font-semibold text-gray-800 mb-5">{editing ? 'Edit Item' : 'New Bakery Item'}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Item Name *</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Sourdough Loaf"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Category *</label>
                  <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white">
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Unit *</label>
                  <select value={form.unit} onChange={e => setForm({...form, unit: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white">
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Selling Price (₹) *</label>
                <input type="number" step="0.01" value={form.selling_price} onChange={e => setForm({...form, selling_price: e.target.value})} placeholder="0.00"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} className="rounded" />
                Active (visible in orders)
              </label>
            </div>
            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowForm(false); setError('') }} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-amber-800 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Update' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
