import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

function getToday() { return new Date().toISOString().split('T')[0] }
function formatDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CashCollected() {
  const [date, setDate] = useState(getToday())
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchPayments(date) }, [date])

  async function fetchPayments(d) {
    setLoading(true)
    const { data, error } = await supabase
      .from('payments')
      .select('*, customers(name, type, payment_days)')
      .eq('payment_date', d)
      .order('created_at')
    if (!error) setPayments(data || [])
    setLoading(false)
  }

  const total = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-amber-900">Cash Collected</h2>
          <p className="text-sm text-amber-700 mt-0.5">
            {loading ? 'Loading...' : `${payments.length} payment${payments.length !== 1 ? 's' : ''} · ₹${total.toFixed(2)} total`}
          </p>
        </div>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="px-3 py-2 rounded-xl border border-amber-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white font-medium text-amber-800" />
      </div>

      {loading ? (
        <div className="text-center py-12 text-amber-600">Loading...</div>
      ) : payments.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-amber-100 text-amber-400 text-sm">
          No cash collected on {formatDate(date)}.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-amber-50 text-amber-700 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-medium">Customer</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Payment Terms</th>
                <th className="text-right px-4 py-3 font-medium">Amount</th>
                <th className="text-left px-4 py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p, i) => (
                <tr key={p.id} className={`border-t border-amber-50 ${i % 2 === 0 ? '' : 'bg-amber-50/30'}`}>
                  <td className="px-4 py-3 font-medium text-gray-800">{p.customers?.name}</td>
                  <td className="px-4 py-3 text-gray-500 capitalize">{p.customers?.type}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {p.customers?.payment_days === 0 ? 'COD' : `${p.customers?.payment_days} days`}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-green-700">₹{parseFloat(p.amount).toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{p.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-amber-100 bg-amber-50/50">
                <td colSpan="3" className="px-4 py-3 text-sm font-semibold text-amber-800">Total Cash Collected</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-green-700">₹{total.toFixed(2)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
