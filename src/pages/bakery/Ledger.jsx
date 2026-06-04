import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const BAKERY_NAME = 'Sunil Homemade Bakery'
const BAKERY_GST = '02EDSPK0630R3Z4'
const BAKERY_ADDRESS = 'Village Naddi, P.O. Dal Lake, Tehsil Dharamshala, Kangra, Himachal Pradesh - 176216'

function formatDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function ddmmyy(d) {
  if (!d) return ''
  const dt = new Date(d + 'T00:00:00')
  return String(dt.getDate()).padStart(2, '0') + String(dt.getMonth() + 1).padStart(2, '0') + String(dt.getFullYear()).slice(-2)
}

function invoiceNumber(customerName, date) {
  const clean = customerName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
  return `${clean}-${ddmmyy(date)}`
}

function statusBadge(status) {
  if (status === 'paid') return 'bg-green-100 text-green-700'
  if (status === 'part_paid') return 'bg-amber-100 text-amber-700'
  return 'bg-red-100 text-red-600'
}

function statusLabel(status) {
  if (status === 'paid') return 'Paid'
  if (status === 'part_paid') return 'Part Paid'
  return 'Unpaid'
}

export default function Ledger() {
  const [customers, setCustomers] = useState([])
  const [outstanding, setOutstanding] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [orders, setOrders] = useState([])
  const [invoices, setInvoices] = useState([])
  const [payments, setPayments] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_date: new Date().toISOString().split('T')[0], notes: '' })
  const [savingPayment, setSavingPayment] = useState(false)
  const [paymentError, setPaymentError] = useState('')

  useEffect(() => { fetchCustomers() }, [])

  async function fetchCustomers() {
    setLoading(true)
    const [{ data: c }, { data: o }] = await Promise.all([
      supabase.from('customers').select('*').eq('is_active', true).order('name'),
      supabase.from('customer_outstanding').select('*')
    ])
    if (c) setCustomers(c)
    if (o) setOutstanding(o)
    setLoading(false)
  }

  function getOutstanding(customerId) {
    return outstanding.find(o => o.customer_id === customerId) || {
      total_sales: 0, total_invoiced: 0, total_uninvoiced: 0,
      total_paid: 0, invoice_balance: 0, total_balance: 0
    }
  }

  async function openCustomer(customer) {
    setSelectedCustomer(customer)
    setDetailLoading(true)
    await refreshCustomerData(customer.id)
    setDetailLoading(false)
  }

  async function refreshCustomerData(customerId) {
    const id = customerId || selectedCustomer?.id
    const [{ data: o }, { data: inv }, { data: pay }] = await Promise.all([
      supabase.from('orders')
        .select('*, order_items(*, bakery_items(name, unit))')
        .eq('customer_id', id)
        .order('order_date', { ascending: false }),
      supabase.from('invoices')
        .select('*, payment_allocations(*)')
        .eq('customer_id', id)
        .order('invoice_date', { ascending: false }),
      supabase.from('payments')
        .select('*, payment_allocations(*, invoices(invoice_number))')
        .eq('customer_id', id)
        .order('payment_date', { ascending: false })
    ])
    if (o) setOrders(o)
    if (inv) setInvoices(inv)
    if (pay) setPayments(pay)
    fetchCustomers() // refresh outstanding
  }

  async function generateInvoice() {
    if (!selectedCustomer) return

    // Block invoice for 0 and 1 day payment term customers
    const payDays = selectedCustomer.payment_days || 0
    if (payDays === 0 || payDays === 1) {
      alert(`Invoices are not generated for customers with ${payDays === 0 ? 'Cash on Delivery' : '1 day'} payment terms. Cash is collected directly on delivery.`)
      return
    }

    const uninvoiced = orders.filter(o => !o.invoice_id && o.status === 'delivered')
    if (uninvoiced.length === 0) return alert('No uninvoiced delivered orders for this customer.')
    if (!confirm(`Generate invoice for ${uninvoiced.length} order(s)?`)) return
    setGenerating(true)

    const total = uninvoiced.reduce((sum, o) => {
      return sum + o.order_items.reduce((s, oi) => s + (oi.delivered_qty ?? oi.quantity) * oi.unit_price, 0)
    }, 0)
    const today = new Date().toISOString().split('T')[0]
    const invNumber = invoiceNumber(selectedCustomer.name, today)

    // Check for existing unallocated payments from delivery runs
    const { data: existingPayments } = await supabase
      .from('payments')
      .select('*, payment_allocations(allocated_amount)')
      .eq('customer_id', selectedCustomer.id)
      .order('payment_date', { ascending: true })

    // Calculate total unallocated amount
    let unallocated = 0
    for (const pay of (existingPayments || [])) {
      const allocated = pay.payment_allocations?.reduce((s, a) => s + parseFloat(a.allocated_amount || 0), 0) || 0
      unallocated += Math.max(0, parseFloat(pay.amount) - allocated)
    }

    const paidAmount = Math.min(unallocated, total)
    const status = paidAmount >= total ? 'paid' : paidAmount > 0 ? 'part_paid' : 'unpaid'

    const { data: inv, error } = await supabase.from('invoices').insert({
      invoice_number: invNumber,
      customer_id: selectedCustomer.id,
      invoice_date: today,
      total_amount: total,
      paid_amount: paidAmount,
      status
    }).select().single()

    if (error) { alert('Error: ' + error.message); setGenerating(false); return }

    // Link orders to invoice
    await supabase.from('orders')
      .update({ invoice_id: inv.id, invoiced_at: new Date().toISOString() })
      .in('id', uninvoiced.map(o => o.id))

    // Allocate existing unallocated payments to this invoice
    let remaining = paidAmount
    for (const pay of (existingPayments || [])) {
      if (remaining <= 0) break
      const allocated = pay.payment_allocations?.reduce((s, a) => s + parseFloat(a.allocated_amount || 0), 0) || 0
      const available = Math.max(0, parseFloat(pay.amount) - allocated)
      if (available <= 0) continue
      const allocate = Math.min(remaining, available)
      await supabase.from('payment_allocations').insert({
        payment_id: pay.id,
        invoice_id: inv.id,
        allocated_amount: allocate
      })
      remaining -= allocate
    }

    await refreshCustomerData()
    setGenerating(false)
    printInvoice(inv, uninvoiced)
  }

  function printInvoice(inv, invoiceOrders) {
    const rows = []
    for (const order of invoiceOrders) {
      for (const oi of order.order_items) {
        rows.push({
          date: order.order_date,
          item: oi.bakery_items?.name,
          unit: oi.bakery_items?.unit,
          qty: oi.quantity,
          price: oi.unit_price,
          total: oi.quantity * oi.unit_price
        })
      }
    }

    // Calculate due date from customer payment_days
    const paymentDays = selectedCustomer.payment_days || 0
    const invDate = new Date(inv.invoice_date + 'T00:00:00')
    const dueDate = new Date(invDate)
    dueDate.setDate(dueDate.getDate() + paymentDays)
    const dueDateStr = dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    const paymentTermsStr = paymentDays === 0 ? 'Cash on Delivery' : `Net ${paymentDays} Days`

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${inv.invoice_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #1a1a1a; padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 2px solid #fde68a; }
    .bakery-name { font-size: 22px; font-weight: 700; color: #92400e; }
    .bakery-address { font-size: 11px; color: #666; margin-top: 5px; line-height: 1.6; }
    .bakery-gst { font-size: 11px; color: #444; margin-top: 6px; font-weight: 600; }
    .invoice-title { text-align: right; }
    .invoice-title h1 { font-size: 28px; font-weight: 800; color: #92400e; letter-spacing: 0.05em; }
    .invoice-title .inv-num { font-size: 12px; color: #666; margin-top: 4px; font-family: monospace; }
    .invoice-meta { display: flex; justify-content: space-between; margin-bottom: 24px; }
    .invoice-to .label { font-size: 10px; color: #999; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
    .invoice-to .name { font-size: 15px; font-weight: 600; }
    .invoice-to .detail { font-size: 11px; color: #666; margin-top: 2px; line-height: 1.5; }
    .invoice-dates { text-align: right; }
    .invoice-dates table { width: auto; margin-bottom: 0; margin-left: auto; }
    .invoice-dates td { padding: 3px 8px; border-bottom: none; font-size: 12px; }
    .invoice-dates td:first-child { color: #999; text-align: right; }
    .invoice-dates td:last-child { font-weight: 600; color: #1a1a1a; }
    .due-date td { color: #c05621 !important; font-weight: 700 !important; }
    table.items { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    table.items th { background: #fef3c7; text-align: left; padding: 8px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #92400e; }
    table.items td { padding: 8px 12px; border-bottom: 1px solid #f5f5f5; }
    table.items tr:last-child td { border-bottom: none; }
    .text-right { text-align: right; }
    .total-row td { font-weight: 700; font-size: 14px; border-top: 2px solid #fde68a !important; padding-top: 12px !important; }
    .payment-terms { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 14px; margin-bottom: 24px; font-size: 12px; }
    .payment-terms strong { color: #92400e; }
    .footer { margin-top: 32px; font-size: 11px; color: #999; text-align: center; border-top: 1px solid #f0f0f0; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="bakery-name">${BAKERY_NAME}</div>
      <div class="bakery-address">${BAKERY_ADDRESS}</div>
      <div class="bakery-gst">GSTIN: ${BAKERY_GST}</div>
    </div>
    <div class="invoice-title">
      <h1>INVOICE</h1>
      <div class="inv-num">${inv.invoice_number}</div>
    </div>
  </div>

  <div class="invoice-meta">
    <div class="invoice-to">
      <div class="label">Bill To</div>
      <div class="name">${selectedCustomer.name}</div>
      ${selectedCustomer.address ? `<div class="detail">${selectedCustomer.address}</div>` : ''}
      ${selectedCustomer.phone ? `<div class="detail">${selectedCustomer.phone}</div>` : ''}
    </div>
    <div class="invoice-dates">
      <table>
        <tr><td>Invoice Date</td><td>${formatDate(inv.invoice_date)}</td></tr>
        <tr><td>Payment Terms</td><td>${paymentTermsStr}</td></tr>
        <tr class="due-date"><td>Due Date</td><td>${dueDateStr}</td></tr>
      </table>
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th>Date</th>
        <th>Item</th>
        <th class="text-right">Qty</th>
        <th class="text-right">Rate</th>
        <th class="text-right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(r => `
        <tr>
          <td>${formatDate(r.date)}</td>
          <td>${r.item}</td>
          <td class="text-right">${r.qty} ${r.unit}</td>
          <td class="text-right">₹${parseFloat(r.price).toFixed(2)}</td>
          <td class="text-right">₹${parseFloat(r.total).toFixed(2)}</td>
        </tr>
      `).join('')}
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="4" class="text-right">Total Amount Due</td>
        <td class="text-right">₹${parseFloat(inv.total_amount).toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="payment-terms">
    <strong>Payment Terms:</strong> ${paymentTermsStr} &nbsp;·&nbsp; <strong>Due Date:</strong> ${dueDateStr}
  </div>

  <div class="footer">${BAKERY_NAME} &nbsp;·&nbsp; ${BAKERY_ADDRESS} &nbsp;·&nbsp; GSTIN: ${BAKERY_GST}<br>Thank you for your business!</div>
</body>
</html>`

    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
    w.print()
  }

  async function printExistingInvoice(inv) {
    // fetch orders for this invoice
    const { data: invOrders } = await supabase
      .from('orders')
      .select('*, order_items(*, bakery_items(name, unit))')
      .eq('invoice_id', inv.id)
    printInvoice(inv, invOrders || [])
  }

  async function savePayment() {
    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) return setPaymentError('Enter a valid amount.')
    setSavingPayment(true); setPaymentError('')

    const amount = parseFloat(paymentForm.amount)

    // Insert payment
    const { data: payment, error } = await supabase.from('payments').insert({
      customer_id: selectedCustomer.id,
      payment_date: paymentForm.payment_date,
      amount,
      notes: paymentForm.notes || null
    }).select().single()

    if (error) { setPaymentError(error.message); setSavingPayment(false); return }

    // Get unpaid/part-paid invoices ordered by date
    const { data: openInvoices } = await supabase
      .from('invoices')
      .select('*')
      .eq('customer_id', selectedCustomer.id)
      .neq('status', 'paid')
      .order('invoice_date', { ascending: true })

    // Allocate payment sequentially
    let remaining = amount
    for (const inv of (openInvoices || [])) {
      if (remaining <= 0) break
      const balance = parseFloat(inv.total_amount) - parseFloat(inv.paid_amount)
      const allocate = Math.min(remaining, balance)
      const newPaid = parseFloat(inv.paid_amount) + allocate
      const newStatus = newPaid >= parseFloat(inv.total_amount) ? 'paid' : 'part_paid'

      await supabase.from('payment_allocations').insert({
        payment_id: payment.id,
        invoice_id: inv.id,
        allocated_amount: allocate
      })

      await supabase.from('invoices').update({
        paid_amount: newPaid,
        status: newStatus
      }).eq('id', inv.id)

      remaining -= allocate
    }

    setSavingPayment(false)
    setShowPaymentForm(false)
    setPaymentForm({ amount: '', payment_date: new Date().toISOString().split('T')[0], notes: '' })
    refreshCustomerData()
  }

  const uninvoicedOrders = orders.filter(o => !o.invoice_id && o.status === 'delivered')
  const uninvoicedTotal = uninvoicedOrders.reduce((sum, o) => {
    return sum + (o.order_items || []).reduce((s, oi) => s + (oi.delivered_qty ?? oi.quantity) * oi.unit_price, 0)
  }, 0)

  if (selectedCustomer) {
    const out = getOutstanding(selectedCustomer.id)
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setSelectedCustomer(null)} className="text-amber-600 hover:text-amber-800 text-sm font-medium">← Back</button>
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-amber-900">{selectedCustomer.name}</h2>
            <p className="text-sm text-amber-700">{selectedCustomer.type} · {selectedCustomer.phone || 'No phone'}</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">Total Balance</div>
            <div className={`font-mono font-bold text-lg ${parseFloat(out.total_balance) > 0 ? 'text-red-600' : 'text-green-600'}`}>
              ₹{parseFloat(out.total_balance || 0).toFixed(2)}
            </div>
            {parseFloat(out.total_uninvoiced || 0) > 0 && (
              <div className="text-xs text-amber-600 mt-0.5">₹{parseFloat(out.total_uninvoiced).toFixed(0)} uninvoiced</div>
            )}
          </div>
        </div>

        {detailLoading ? <div className="text-center py-12 text-amber-600">Loading...</div> : (
          <div className="space-y-4">

            {/* Action buttons */}
            <div className="flex gap-3">
              {(selectedCustomer.payment_days || 0) <= 1 ? (
                <div className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-400 text-sm text-center">
                  No invoicing — {(selectedCustomer.payment_days || 0) === 0 ? 'Cash on Delivery' : '1 day terms'}
                </div>
              ) : (
                <button onClick={generateInvoice} disabled={generating || uninvoicedOrders.length === 0}
                  className="flex-1 py-2.5 rounded-xl bg-amber-800 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-40 transition-colors">
                  {generating ? 'Generating...' : `🧾 Generate Invoice${uninvoicedOrders.length > 0 ? ` (${uninvoicedOrders.length} orders · ₹${uninvoicedTotal.toFixed(2)})` : ' — nothing to invoice'}`}
                </button>
              )}
              <button onClick={() => setShowPaymentForm(true)}
                className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors">
                💰 Record Payment
              </button>
            </div>

            {/* Invoices */}
            {invoices.length > 0 && (
              <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
                <div className="px-4 py-3 bg-amber-50 text-xs font-semibold text-amber-700 uppercase tracking-wide">Invoices</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                      <th className="text-left px-4 py-2 font-medium">Invoice #</th>
                      <th className="text-left px-4 py-2 font-medium">Date</th>
                      <th className="text-right px-4 py-2 font-medium">Amount</th>
                      <th className="text-right px-4 py-2 font-medium">Paid</th>
                      <th className="text-right px-4 py-2 font-medium">Balance</th>
                      <th className="text-center px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv, i) => (
                      <tr key={inv.id} className={`border-t border-gray-50 ${i % 2 === 0 ? '' : 'bg-amber-50/20'}`}>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{inv.invoice_number}</td>
                        <td className="px-4 py-2.5 text-gray-600">{formatDate(inv.invoice_date)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-800">₹{parseFloat(inv.total_amount).toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-green-600">₹{parseFloat(inv.paid_amount).toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-red-500">
                          {parseFloat(inv.total_amount) - parseFloat(inv.paid_amount) > 0
                            ? `₹${(parseFloat(inv.total_amount) - parseFloat(inv.paid_amount)).toFixed(2)}`
                            : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(inv.status)}`}>{statusLabel(inv.status)}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={() => printExistingInvoice(inv)} className="text-amber-600 hover:text-amber-800 text-xs font-medium">🖨 Print</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Payments */}
            {payments.length > 0 && (
              <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
                <div className="px-4 py-3 bg-green-50 text-xs font-semibold text-green-700 uppercase tracking-wide">Payments Received</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase border-b border-gray-100">
                      <th className="text-left px-4 py-2 font-medium">Date</th>
                      <th className="text-right px-4 py-2 font-medium">Amount</th>
                      <th className="text-left px-4 py-2 font-medium">Applied To</th>
                      <th className="text-left px-4 py-2 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((pay, i) => (
                      <tr key={pay.id} className={`border-t border-gray-50 ${i % 2 === 0 ? '' : 'bg-green-50/20'}`}>
                        <td className="px-4 py-2.5 text-gray-600">{formatDate(pay.payment_date)}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-green-700">₹{parseFloat(pay.amount).toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-400">
                          {pay.payment_allocations?.map(a => a.invoices?.invoice_number).join(', ') || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs">{pay.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Order History */}
            {orders.length > 0 && (
              <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
                <div className="px-4 py-3 bg-amber-50 text-xs font-semibold text-amber-700 uppercase tracking-wide">Order History</div>
                {orders.map((order, i) => (
                  <div key={order.id} className={`border-t border-amber-50 px-4 py-3 ${i === 0 ? 'border-t-0' : ''}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">{formatDate(order.order_date)}</span>
                        {order.invoice_id
                          ? <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">Invoiced</span>
                          : order.status === 'delivered'
                            ? <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full">Pending Invoice</span>
                            : <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full capitalize">{order.status}</span>
                        }
                      </div>
                      <span className="font-mono font-semibold text-gray-800 text-sm">
                        ₹{(order.order_items || []).reduce((s, oi) => s + (oi.delivered_qty ?? oi.quantity) * oi.unit_price, 0).toFixed(2)}
                        {order.status === 'delivered' && parseFloat(order.total_amount) !== (order.order_items || []).reduce((s, oi) => s + (oi.delivered_qty ?? oi.quantity) * oi.unit_price, 0) && (
                          <span className="text-xs text-gray-400 ml-1">(ordered ₹{parseFloat(order.total_amount).toFixed(0)})</span>
                        )}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">
                      {order.order_items?.map(oi => `${oi.quantity} ${oi.bakery_items?.name}`).join(' · ')}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {orders.length === 0 && invoices.length === 0 && (
              <div className="text-center py-12 text-amber-400 text-sm bg-white rounded-2xl border border-amber-100">
                No orders yet for this customer.
              </div>
            )}
          </div>
        )}

        {/* Payment Modal */}
        {showPaymentForm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
              <h3 className="font-semibold text-gray-800 mb-1">Record Payment</h3>
              <p className="text-xs text-gray-400 mb-5">{selectedCustomer.name} · Outstanding: ₹{parseFloat(getOutstanding(selectedCustomer.id).balance_due).toFixed(2)}</p>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Amount (₹) *</label>
                  <input type="number" step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})}
                    placeholder="0.00" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Payment Date *</label>
                  <input type="date" value={paymentForm.payment_date} onChange={e => setPaymentForm({...paymentForm, payment_date: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Notes</label>
                  <input value={paymentForm.notes} onChange={e => setPaymentForm({...paymentForm, notes: e.target.value})}
                    placeholder="e.g. UPI from Rahul" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                </div>
              </div>
              {paymentError && <p className="text-red-500 text-sm mt-3">{paymentError}</p>}
              <div className="flex gap-3 mt-6">
                <button onClick={() => { setShowPaymentForm(false); setPaymentError('') }} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                <button onClick={savePayment} disabled={savingPayment} className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  {savingPayment ? 'Saving...' : 'Save Payment'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Customer list view
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-amber-900">Customer Ledger</h2>
        <p className="text-sm text-amber-700 mt-0.5">Sales, invoicing and payment balances</p>
      </div>

      {loading ? <div className="text-center py-12 text-amber-600">Loading...</div> : (
        <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-amber-50 text-amber-700 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Customer</th>
                  <th className="text-right px-4 py-3 font-medium">Total Sales</th>
                  <th className="text-right px-4 py-3 font-medium">Invoiced</th>
                  <th className="text-right px-4 py-3 font-medium">Uninvoiced</th>
                  <th className="text-right px-4 py-3 font-medium">Cash Collected</th>
                  <th className="text-right px-4 py-3 font-medium">Invoice Balance</th>
                  <th className="text-right px-4 py-3 font-medium">Total Balance</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c, i) => {
                  const out = getOutstanding(c.id)
                  const totalSales = parseFloat(out.total_sales || 0)
                  const invoiced = parseFloat(out.total_invoiced || 0)
                  const uninvoiced = parseFloat(out.total_uninvoiced || 0)
                  const paid = parseFloat(out.total_paid || 0)
                  const invBalance = parseFloat(out.invoice_balance || 0)
                  const totalBalance = parseFloat(out.total_balance || 0)
                  return (
                    <tr key={c.id} className={`border-t border-amber-50 ${i % 2 === 0 ? '' : 'bg-amber-50/30'}`}>
                      <td className="px-4 py-3 font-medium text-gray-800">{c.name}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">{totalSales > 0 ? `₹${totalSales.toFixed(0)}` : '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-600">{invoiced > 0 ? `₹${invoiced.toFixed(0)}` : '—'}</td>
                      <td className={`px-4 py-3 text-right font-mono ${uninvoiced > 0 ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>
                        {uninvoiced > 0 ? `₹${uninvoiced.toFixed(0)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-green-600">{paid > 0 ? `₹${paid.toFixed(0)}` : '—'}</td>
                      <td className={`px-4 py-3 text-right font-mono font-semibold ${invBalance > 0 ? 'text-red-500' : invBalance < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                        {invBalance !== 0 ? `₹${invBalance.toFixed(0)}` : '—'}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-semibold ${totalBalance > 0 ? 'text-red-600' : totalBalance < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                        {totalBalance !== 0 ? `₹${totalBalance.toFixed(0)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openCustomer(c)} className="text-amber-600 hover:text-amber-800 text-xs font-medium whitespace-nowrap">View →</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {customers.length > 0 && (() => {
                const totals = customers.reduce((acc, c) => {
                  const out = getOutstanding(c.id)
                  acc.sales += parseFloat(out.total_sales || 0)
                  acc.invoiced += parseFloat(out.total_invoiced || 0)
                  acc.uninvoiced += parseFloat(out.total_uninvoiced || 0)
                  acc.paid += parseFloat(out.total_paid || 0)
                  acc.invBalance += parseFloat(out.invoice_balance || 0)
                  acc.totalBalance += parseFloat(out.total_balance || 0)
                  return acc
                }, { sales: 0, invoiced: 0, uninvoiced: 0, paid: 0, invBalance: 0, totalBalance: 0 })
                return (
                  <tfoot>
                    <tr className="border-t-2 border-amber-200 bg-amber-50 font-semibold text-amber-900">
                      <td className="px-4 py-3 text-xs uppercase tracking-wide">Total</td>
                      <td className="px-4 py-3 text-right font-mono">₹{totals.sales.toFixed(0)}</td>
                      <td className="px-4 py-3 text-right font-mono">₹{totals.invoiced.toFixed(0)}</td>
                      <td className="px-4 py-3 text-right font-mono text-amber-700">₹{totals.uninvoiced.toFixed(0)}</td>
                      <td className="px-4 py-3 text-right font-mono text-green-700">₹{totals.paid.toFixed(0)}</td>
                      <td className="px-4 py-3 text-right font-mono text-red-600">₹{totals.invBalance.toFixed(0)}</td>
                      <td className="px-4 py-3 text-right font-mono text-red-700">₹{totals.totalBalance.toFixed(0)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )
              })()}
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
