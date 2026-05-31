import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const UNITS = ['g', 'kg', 'ml', 'litre', 'pcs', 'dozen', 'tbsp', 'tsp']

export default function Recipes() {
  const [recipes, setRecipes] = useState([])
  const [bakeryItems, setBakeryItems] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [costing, setCosting] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [expandedRecipe, setExpandedRecipe] = useState(null)

  // Form state
  const [form, setForm] = useState({ bakery_item_id: '', batch_size: 1, notes: '' })
  const [lines, setLines] = useState([{ ingredient_id: '', quantity: '', unit: 'g' }])

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [r, b, i, c] = await Promise.all([
      supabase.from('recipes').select('*, bakery_items(name, category, selling_price), recipe_ingredients(*, ingredients(name, unit, cost_per_unit))').order('created_at', { ascending: false }),
      supabase.from('bakery_items').select('*').eq('is_active', true).order('name'),
      supabase.from('ingredients').select('*').order('name'),
      supabase.from('item_costing').select('*')
    ])
    if (!r.error) setRecipes(r.data)
    if (!b.error) setBakeryItems(b.data)
    if (!i.error) setIngredients(i.data)
    if (!c.error) setCosting(c.data)
    setLoading(false)
  }

  function getCost(bakeryItemId) {
    return costing.find(c => c.bakery_item_id === bakeryItemId)
  }

  function addLine() {
    setLines([...lines, { ingredient_id: '', quantity: '', unit: 'g' }])
  }

  function removeLine(idx) {
    setLines(lines.filter((_, i) => i !== idx))
  }

  function updateLine(idx, field, value) {
    const updated = [...lines]
    updated[idx] = { ...updated[idx], [field]: value }
    // auto-fill unit from ingredient
    if (field === 'ingredient_id') {
      const ing = ingredients.find(i => i.id === value)
      if (ing) updated[idx].unit = ing.unit
    }
    setLines(updated)
  }

  function calcPreviewCost() {
    let total = 0
    for (const line of lines) {
      const ing = ingredients.find(i => i.id === line.ingredient_id)
      if (ing && line.quantity) total += parseFloat(line.quantity) * parseFloat(ing.cost_per_unit)
    }
    return form.batch_size > 0 ? total / form.batch_size : 0
  }

  async function save() {
    if (!form.bakery_item_id) return setError('Please select a bakery item.')
    if (lines.some(l => !l.ingredient_id || !l.quantity)) return setError('Fill in all ingredient lines.')
    setSaving(true); setError('')

    try {
      let recipeId = editing

      if (editing) {
        await supabase.from('recipes').update({ batch_size: parseInt(form.batch_size), notes: form.notes }).eq('id', editing)
        await supabase.from('recipe_ingredients').delete().eq('recipe_id', editing)
      } else {
        const { data, error } = await supabase.from('recipes').insert({
          bakery_item_id: form.bakery_item_id,
          batch_size: parseInt(form.batch_size),
          notes: form.notes
        }).select().single()
        if (error) throw error
        recipeId = data.id
      }

      const riPayload = lines.map(l => ({
        recipe_id: recipeId,
        ingredient_id: l.ingredient_id,
        quantity: parseFloat(l.quantity),
        unit: l.unit
      }))
      const { error: riError } = await supabase.from('recipe_ingredients').insert(riPayload)
      if (riError) throw riError

      setShowForm(false); setEditing(null)
      setForm({ bakery_item_id: '', batch_size: 1, notes: '' })
      setLines([{ ingredient_id: '', quantity: '', unit: 'g' }])
      fetchAll()
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
  }

  function startEdit(recipe) {
    setForm({ bakery_item_id: recipe.bakery_item_id, batch_size: recipe.batch_size, notes: recipe.notes || '' })
    setLines(recipe.recipe_ingredients.map(ri => ({
      ingredient_id: ri.ingredient_id,
      quantity: ri.quantity,
      unit: ri.unit
    })))
    setEditing(recipe.id); setShowForm(true)
  }

  async function deleteRecipe(id) {
    if (!confirm('Delete this recipe?')) return
    await supabase.from('recipes').delete().eq('id', id)
    fetchAll()
  }

  const previewCost = calcPreviewCost()
  const selectedItem = bakeryItems.find(b => b.id === form.bakery_item_id)
  const previewMargin = selectedItem ? selectedItem.selling_price - previewCost : null

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-amber-900">Recipes & Costing</h2>
          <p className="text-sm text-amber-700 mt-0.5">{recipes.length} recipes configured</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditing(null); setForm({ bakery_item_id: '', batch_size: 1, notes: '' }); setLines([{ ingredient_id: '', quantity: '', unit: 'g' }]) }}
          className="bg-amber-800 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-amber-700 transition-colors">
          + New Recipe
        </button>
      </div>

      {loading ? <div className="text-center py-12 text-amber-600">Loading...</div> : (
        <div className="space-y-3">
          {recipes.length === 0 && (
            <div className="text-center py-12 text-amber-400 text-sm bg-white rounded-2xl border border-amber-100">
              No recipes yet. Add ingredients and bakery items first, then create recipes!
            </div>
          )}
          {recipes.map(recipe => {
            const cost = getCost(recipe.bakery_item_id)
            const expanded = expandedRecipe === recipe.id
            return (
              <div key={recipe.id} className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-4 cursor-pointer hover:bg-amber-50/50" onClick={() => setExpandedRecipe(expanded ? null : recipe.id)}>
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{expanded ? '▼' : '▶'}</span>
                    <div>
                      <div className="font-medium text-gray-800">{recipe.bakery_items?.name}</div>
                      <div className="text-xs text-gray-400">{recipe.bakery_items?.category} · Batch of {recipe.batch_size}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    {cost ? (
                      <>
                        <div>
                          <div className="text-xs text-gray-400">Cost/unit</div>
                          <div className="font-mono font-medium text-gray-700">₹{parseFloat(cost.cost_per_unit).toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400">Price</div>
                          <div className="font-mono font-medium text-gray-700">₹{parseFloat(recipe.bakery_items?.selling_price).toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400">Margin</div>
                          <div className={`font-mono font-semibold ${parseFloat(cost.margin_pct) > 40 ? 'text-green-600' : parseFloat(cost.margin_pct) > 20 ? 'text-amber-600' : 'text-red-500'}`}>
                            {parseFloat(cost.margin_pct).toFixed(1)}%
                          </div>
                        </div>
                      </>
                    ) : <span className="text-xs text-gray-400">Costing unavailable</span>}
                    <div className="flex gap-2 ml-2" onClick={e => e.stopPropagation()}>
                      <button onClick={() => startEdit(recipe)} className="text-amber-600 hover:text-amber-800 text-xs font-medium">Edit</button>
                      <button onClick={() => deleteRecipe(recipe.id)} className="text-red-400 hover:text-red-600 text-xs font-medium">Delete</button>
                    </div>
                  </div>
                </div>
                {expanded && (
                  <div className="border-t border-amber-50 px-4 py-4">
                    {recipe.notes && <p className="text-sm text-gray-500 mb-3 italic">"{recipe.notes}"</p>}
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400 uppercase">
                          <th className="text-left pb-2 font-medium">Ingredient</th>
                          <th className="text-right pb-2 font-medium">Quantity</th>
                          <th className="text-right pb-2 font-medium">Unit Cost</th>
                          <th className="text-right pb-2 font-medium">Line Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recipe.recipe_ingredients.map(ri => (
                          <tr key={ri.id} className="border-t border-gray-50">
                            <td className="py-1.5 text-gray-700">{ri.ingredients?.name}</td>
                            <td className="py-1.5 text-right text-gray-500">{ri.quantity} {ri.unit}</td>
                            <td className="py-1.5 text-right text-gray-400 font-mono text-xs">₹{parseFloat(ri.ingredients?.cost_per_unit).toFixed(4)}/{ri.ingredients?.unit}</td>
                            <td className="py-1.5 text-right font-mono text-gray-700">₹{(ri.quantity * ri.ingredients?.cost_per_unit).toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                      {cost && (
                        <tfoot>
                          <tr className="border-t-2 border-amber-100">
                            <td colSpan="3" className="pt-2 text-xs font-medium text-gray-500">Total batch cost ÷ {recipe.batch_size} = cost per unit</td>
                            <td className="pt-2 text-right font-mono font-semibold text-amber-800">₹{parseFloat(cost.cost_per_unit).toFixed(2)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Recipe Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 px-4 py-8 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl">
            <h3 className="font-semibold text-gray-800 mb-5">{editing ? 'Edit Recipe' : 'New Recipe'}</h3>

            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Bakery Item *</label>
                  <select value={form.bakery_item_id} onChange={e => setForm({...form, bakery_item_id: e.target.value})}
                    disabled={!!editing}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white disabled:bg-gray-50">
                    <option value="">Select item...</option>
                    {bakeryItems.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Batch Size (units produced)</label>
                  <input type="number" min="1" value={form.batch_size} onChange={e => setForm({...form, batch_size: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Notes / Instructions</label>
                <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Baking temp, timing, tips..."
                  rows={2} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Ingredients</label>
                <button onClick={addLine} className="text-amber-700 text-xs font-medium hover:text-amber-900">+ Add ingredient</button>
              </div>
              <div className="space-y-2">
                {lines.map((line, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <select value={line.ingredient_id} onChange={e => updateLine(idx, 'ingredient_id', e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white">
                      <option value="">Select ingredient...</option>
                      {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                    </select>
                    <input type="number" step="0.01" value={line.quantity} onChange={e => updateLine(idx, 'quantity', e.target.value)}
                      placeholder="Qty" className="w-20 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                    <select value={line.unit} onChange={e => updateLine(idx, 'unit', e.target.value)}
                      className="w-20 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white">
                      {UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                    {lines.length > 1 && (
                      <button onClick={() => removeLine(idx)} className="text-red-400 hover:text-red-600 text-lg leading-none px-1">×</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Live cost preview */}
            {previewCost > 0 && (
              <div className="bg-amber-50 rounded-xl p-3 mb-4 flex justify-between text-sm">
                <span className="text-amber-700">Estimated cost per unit:</span>
                <div className="text-right">
                  <span className="font-mono font-semibold text-amber-900">₹{previewCost.toFixed(2)}</span>
                  {previewMargin !== null && (
                    <span className={`ml-3 font-medium ${previewMargin > 0 ? 'text-green-600' : 'text-red-500'}`}>
                      Margin: ₹{previewMargin.toFixed(2)} ({selectedItem ? ((previewMargin / selectedItem.selling_price) * 100).toFixed(1) : 0}%)
                    </span>
                  )}
                </div>
              </div>
            )}

            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => { setShowForm(false); setError('') }} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-amber-800 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Update Recipe' : 'Save Recipe'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
