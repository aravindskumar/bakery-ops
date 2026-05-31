import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'

const SAMPLE_CSV = `item_name,batch_size,ingredient_name,quantity
Croissant,12,Butter,300
Croissant,12,Milk,250
Croissant,12,Maida,800
Croissant,12,Yeast,10
Croissant,12,Sugar,100
Croissant,12,Eggs,2`

function parseCSV(text) {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim())
    const row = {}
    headers.forEach((h, i) => row[h] = vals[i] || '')
    return row
  })
}

export default function BulkImport() {
  const fileRef = useRef()
  const [rows, setRows] = useState([])
  const [preview, setPreview] = useState([])
  const [warnings, setWarnings] = useState([])
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState('upload') // upload | preview | done

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'recipe_ingredients_template.csv'
    a.click()
  }

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setError(''); setWarnings([]); setPreview([])

    const text = await file.text()
    const parsed = parseCSV(text)
    if (!parsed.length) return setError('Could not parse CSV. Make sure it has headers: item_name, batch_size, ingredient_name, quantity')

    const required = ['item_name', 'batch_size', 'ingredient_name', 'quantity']
    const missing = required.filter(r => !Object.keys(parsed[0]).includes(r))
    if (missing.length) return setError(`Missing columns: ${missing.join(', ')}`)

    setRows(parsed)

    // Fetch bakery items and ingredients for matching
    const [{ data: items }, { data: ings }] = await Promise.all([
      supabase.from('bakery_items').select('id, name'),
      supabase.from('ingredients').select('id, name, unit')
    ])

    const warns = []
    const enriched = parsed.map((row, i) => {
      const item = items.find(it => it.name.toLowerCase().trim() === row.item_name.toLowerCase().trim())
      const ing = ings.find(ig => ig.name.toLowerCase().trim() === row.ingredient_name.toLowerCase().trim())
      if (!item) warns.push(`Row ${i + 2}: Item "${row.item_name}" not found in Bakery Items`)
      if (!ing) warns.push(`Row ${i + 2}: Ingredient "${row.ingredient_name}" not found in Ingredients`)
      return {
        ...row,
        item_id: item?.id,
        item_found: !!item,
        ingredient_id: ing?.id,
        ingredient_found: !!ing,
        unit: ing?.unit || '?',
        ok: !!item && !!ing
      }
    })

    setWarnings(warns)
    setPreview(enriched)
    setStep('preview')
  }

  async function runImport() {
    setImporting(true); setError('')
    const validRows = preview.filter(r => r.ok)

    // Group by item+batch to create/find recipes
    const groups = {}
    for (const row of validRows) {
      const key = row.item_id
      if (!groups[key]) groups[key] = { item_id: row.item_id, batch_size: parseInt(row.batch_size), lines: [] }
      groups[key].lines.push({ ingredient_id: row.ingredient_id, quantity: parseFloat(row.quantity), unit: row.unit })
    }

    try {
      for (const group of Object.values(groups)) {
        // Delete existing recipe for this item if any
        const { data: existing } = await supabase.from('recipes').select('id').eq('bakery_item_id', group.item_id).single()
        if (existing) {
          await supabase.from('recipe_ingredients').delete().eq('recipe_id', existing.id)
          await supabase.from('recipes').delete().eq('id', existing.id)
        }

        // Create new recipe
        const { data: recipe, error: rErr } = await supabase.from('recipes').insert({
          bakery_item_id: group.item_id,
          batch_size: group.batch_size
        }).select().single()
        if (rErr) throw rErr

        // Insert recipe ingredients
        const riPayload = group.lines.map(l => ({ recipe_id: recipe.id, ...l }))
        const { error: riErr } = await supabase.from('recipe_ingredients').insert(riPayload)
        if (riErr) throw riErr
      }

      setStep('done')
      setDone(true)
    } catch (e) {
      setError(e.message)
    }
    setImporting(false)
  }

  const okCount = preview.filter(r => r.ok).length
  const errorCount = preview.filter(r => !r.ok).length
  const itemCount = new Set(preview.filter(r => r.ok).map(r => r.item_name)).size

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-amber-900">Bulk Import Recipes</h2>
        <p className="text-sm text-amber-700 mt-0.5">Upload a CSV to populate recipe ingredients in one go</p>
      </div>

      {/* Step: Upload */}
      {step === 'upload' && (
        <div className="space-y-4">
          {/* Template download */}
          <div className="bg-white rounded-2xl border border-amber-100 p-5">
            <h3 className="font-medium text-gray-800 mb-2">Step 1 — Prepare your CSV</h3>
            <p className="text-sm text-gray-500 mb-3">Your CSV needs these 4 columns:</p>
            <div className="bg-amber-50 rounded-xl p-3 font-mono text-xs text-amber-900 mb-4 overflow-x-auto">
              item_name, batch_size, ingredient_name, quantity<br />
              Croissant, 12, Butter, 300<br />
              Croissant, 12, Milk, 250<br />
              Sourdough, 8, Flour, 600
            </div>
            <p className="text-xs text-gray-400 mb-3">
              ⚠️ Item names must exactly match your <strong>Bakery Items</strong> table.<br />
              ⚠️ Ingredient names must exactly match your <strong>Ingredients</strong> table.<br />
              ✅ Units are pulled automatically from the Ingredients table.
            </p>
            <button onClick={downloadSample} className="text-sm text-amber-700 underline underline-offset-2 hover:text-amber-900">
              ↓ Download sample template
            </button>
          </div>

          {/* File upload */}
          <div className="bg-white rounded-2xl border border-amber-100 p-5">
            <h3 className="font-medium text-gray-800 mb-3">Step 2 — Upload your CSV</h3>
            <div
              onClick={() => fileRef.current.click()}
              className="border-2 border-dashed border-amber-200 rounded-xl p-8 text-center cursor-pointer hover:border-amber-400 hover:bg-amber-50/50 transition-colors">
              <div className="text-3xl mb-2">📂</div>
              <p className="text-sm font-medium text-gray-700">Click to select CSV file</p>
              <p className="text-xs text-gray-400 mt-1">or drag and drop</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
          </div>
        </div>
      )}

      {/* Step: Preview */}
      {step === 'preview' && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl border border-amber-100 p-4 text-center">
              <div className="text-2xl font-bold text-amber-800">{itemCount}</div>
              <div className="text-xs text-gray-500 mt-1">Recipes to create</div>
            </div>
            <div className="bg-white rounded-2xl border border-green-100 p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{okCount}</div>
              <div className="text-xs text-gray-500 mt-1">Rows ready</div>
            </div>
            <div className="bg-white rounded-2xl border border-red-100 p-4 text-center">
              <div className="text-2xl font-bold text-red-500">{errorCount}</div>
              <div className="text-xs text-gray-500 mt-1">Rows with errors</div>
            </div>
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
              <p className="text-sm font-medium text-red-700 mb-2">⚠️ {warnings.length} issue{warnings.length > 1 ? 's' : ''} found — these rows will be skipped:</p>
              <ul className="space-y-1">
                {warnings.map((w, i) => <li key={i} className="text-xs text-red-600">• {w}</li>)}
              </ul>
              <p className="text-xs text-red-500 mt-2">Fix these in your CSV and re-upload, or proceed to import only the valid rows.</p>
            </div>
          )}

          {/* Preview table */}
          <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
            <div className="px-4 py-3 bg-amber-50 text-xs font-semibold text-amber-700 uppercase tracking-wide">Preview</div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                    <th className="text-left px-4 py-2 font-medium">Item</th>
                    <th className="text-left px-4 py-2 font-medium">Batch</th>
                    <th className="text-left px-4 py-2 font-medium">Ingredient</th>
                    <th className="text-right px-4 py-2 font-medium">Qty</th>
                    <th className="text-left px-4 py-2 font-medium">Unit</th>
                    <th className="text-center px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className={`border-t border-gray-50 ${row.ok ? '' : 'bg-red-50/50'}`}>
                      <td className={`px-4 py-2 ${row.item_found ? 'text-gray-700' : 'text-red-500 line-through'}`}>{row.item_name}</td>
                      <td className="px-4 py-2 text-gray-500">{row.batch_size}</td>
                      <td className={`px-4 py-2 ${row.ingredient_found ? 'text-gray-700' : 'text-red-500 line-through'}`}>{row.ingredient_name}</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-600">{row.quantity}</td>
                      <td className="px-4 py-2 text-gray-400">{row.unit}</td>
                      <td className="px-4 py-2 text-center">
                        {row.ok
                          ? <span className="text-green-500 text-xs font-medium">✓ Ready</span>
                          : <span className="text-red-400 text-xs font-medium">✗ Skip</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex gap-3">
            <button onClick={() => { setStep('upload'); fileRef.current && (fileRef.current.value = '') }}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
              ← Re-upload
            </button>
            <button onClick={runImport} disabled={importing || okCount === 0}
              className="flex-1 py-3 rounded-xl bg-amber-800 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
              {importing ? 'Importing...' : `Import ${okCount} rows into ${itemCount} recipes`}
            </button>
          </div>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && (
        <div className="bg-white rounded-2xl border border-green-100 p-10 text-center">
          <div className="text-5xl mb-4">✅</div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Import Complete!</h3>
          <p className="text-sm text-gray-500 mb-6">
            {itemCount} recipe{itemCount > 1 ? 's' : ''} created with {okCount} ingredient line{okCount > 1 ? 's' : ''}.
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => { setStep('upload'); setPreview([]); setWarnings([]); setRows([]) }}
              className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
              Import more
            </button>
            <button onClick={() => window.location.href = '/'}
              className="px-5 py-2.5 rounded-xl bg-amber-800 text-white text-sm font-medium hover:bg-amber-700">
              Go to Recipes →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
