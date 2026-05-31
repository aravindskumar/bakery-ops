import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const UNITS = ['gms', 'kg', 'ml', 'litre', 'nos', 'dozen', 'tbsp', 'tsp']
const empty = { name: '', unit: 'gms', sku: '', cost_per_sku: '', supplier: '' }

export default function Ingredients() {
  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(empty)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => { fetchIngredients() }, [])

  async function fetchIngredients() {
    setLoading(true)
    const { data, error } = await supabase.from('ingredients').select('id, name, unit, sku, cost_per_sku, supplier').order('name')
    if (!error) setIngredients(data)
    setLoading(false)
  }

  async function save() {
    if (!form.name) return setError('Ingredient name is required.')
    setSaving(true); setError('')
    const payload = {
      name: form.name,
      unit: form.unit,
      sku: form.sku ? parseFloat(form.sku) : null,
      cost_per_sku: form.cost_per_sku ? parseFloat(form.cost_per_sku) : null,
      supplier: form.supplier || null,
    }
    const { error } = editing
      ? await supabase.from('ingredients').update(payload).eq('id', editing)
      : await supabase.from('ingredients').insert(payload)
    setSaving(false)
    if (error) return setError(error.message)
    setShowForm(false); setForm(empty); setEditing(null)
    fetchIngredients()
  }

  async function deleteIng(id) {
    if (!confirm('Delete this ingredient? This will break any recipes using it.')) return
    await supabase.from('ingredients').delete().eq('id', id)
    fetchIngredients()
  }

  function startEdit(item) {
    setForm({
      name: item.name,
      unit: item.unit || 'gms',
      sku: item.sku || '',
      cost_per_sku: item.cost_per_sku || '',
      supplier: item.supplier || '',
    })
    setEditing(item.id); setShowForm(true)
  }

  const filtered = ingredients.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-amber-900">Ingredients</h2>
          <p className="text-sm text-amber-700 mt-0.5">{ingredients.length} raw materials</p>
        </div>
        <button onClick={() => { setShowForm(true); setForm(empty); setEditing(null) }}
          className="bg-amber-800 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-amber-700 transition-colors">
          + Add Ingredient
        </button>
      </div>

      <div className="mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ingredients..."
          className="px-3 py-2 rounded-lg border border-amber-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
      </div>

      {loading ? <div className="text-center py-12 text-amber-600">Loading...</div> : (
        <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-amber-400 text-sm">No ingredients yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-amber-50 text-amber-700 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Ingredient</th>
                  <th className="text-left px-4 py-3 font-medium">Unit</th>
                  <th className="text-right px-4 py-3 font-medium">SKU</th>
                  <th className="text-right px-4 py-3 font-medium">Cost / SKU</th>
                  <th className="text-right px-4 py-3 font-medium">Cost / Unit</th>
                  <th className="text-left px-4 py-3 font-medium">Supplier</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ing, i) => {
                  const costPerUnit = ing.sku && ing.cost_per_sku ? ing.cost_per_sku / ing.sku : null
                  return (
                    <tr key={ing.id} className={`border-t border-amber-50 ${i % 2 === 0 ? '' : 'bg-amber-50/30'}`}>
                      <td className="px-4 py-3 font-medium text-gray-800">{ing.name}</td>
                      <td className="px-4 py-3 text-gray-500">{ing.unit}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{ing.sku ? `${ing.sku} ${ing.unit}` : '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-600">{ing.cost_per_sku ? `₹${parseFloat(ing.cost_per_sku).toFixed(2)}` : '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-500 text-xs">{costPerUnit ? `₹${costPerUnit.toFixed(4)}` : '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{ing.supplier || '—'}</td>
                      <td className="px-4 py-3 text-right flex gap-3 justify-end">
                        <button onClick={() => startEdit(ing)} className="text-amber-600 hover:text-amber-800 text-xs font-medium">Edit</button>
                        <button onClick={() => deleteIng(ing.id)} className="text-red-400 hover:text-red-600 text-xs font-medium">Delete</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h3 className="font-semibold text-gray-800 mb-5">{editing ? 'Edit Ingredient' : 'New Ingredient'}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Ingredient Name *</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Apple"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Unit</label>
                  <select value={form.unit} onChange={e => setForm({...form, unit: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white">
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">SKU ({form.unit})</label>
                  <input type="number" step="0.01" value={form.sku} onChange={e => setForm({...form, sku: e.target.value})}
                    placeholder="e.g. 1000"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Cost / SKU (₹)</label>
                  <input type="number" step="0.01" value={form.cost_per_sku} onChange={e => setForm({...form, cost_per_sku: e.target.value})}
                    placeholder="e.g. 200"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
              </div>
              {form.sku && form.cost_per_sku && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  Cost per {form.unit}: ₹{(parseFloat(form.cost_per_sku) / parseFloat(form.sku)).toFixed(4)}
                </p>
              )}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Supplier</label>
                <input value={form.supplier} onChange={e => setForm({...form, supplier: e.target.value})} placeholder="e.g. Bittu"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
            </div>
            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowForm(false); setError('') }} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-amber-800 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Update' : 'Add Ingredient'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
