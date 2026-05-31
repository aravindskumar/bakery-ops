import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

const ROLES = ['admin', 'baker', 'delivery', 'customer']
const ROLE_COLORS = {
  admin: 'bg-purple-100 text-purple-700',
  baker: 'bg-amber-100 text-amber-700',
  delivery: 'bg-blue-100 text-blue-700',
  customer: 'bg-green-100 text-green-700',
}

const empty = { email: '', password: '', full_name: '', role: 'baker' }

export default function UserManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => { fetchUsers() }, [])

  async function fetchUsers() {
    setLoading(true)
    const { data, error } = await supabase.from('profiles').select('*').order('role').order('full_name')
    if (!error) setUsers(data)
    setLoading(false)
  }

  async function assignRole() {
    if (!form.email || !form.full_name) return setError('Email and name are required.')
    setSaving(true); setError(''); setSuccess('')

    // Find the user by email in profiles (they must already exist in Supabase Auth)
    const { data: existing } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', form.email)
      .single()

    if (existing) {
      // Update existing profile
      const { error } = await supabase.from('profiles')
        .update({ full_name: form.full_name, role: form.role })
        .eq('email', form.email)
      if (error) { setError(error.message); setSaving(false); return }
    } else {
      setError('User not found. Create them in Supabase Auth first, then assign role here.')
      setSaving(false)
      return
    }

    setSaving(false)
    setSuccess(`Role assigned to ${form.email} as ${form.role}.`)
    setForm(empty)
    fetchUsers()
  }

  async function updateRole(userId, newRole) {
    await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
    fetchUsers()
  }

  const roleURLs = {
    baker: `${window.location.origin}/baker`,
    delivery: `${window.location.origin}/delivery`,
    customer: `${window.location.origin}/customer`,
    admin: `${window.location.origin}/`,
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-amber-900">User Management</h2>
          <p className="text-sm text-amber-700 mt-0.5">{users.length} accounts</p>
        </div>
        <button onClick={() => { setShowForm(true); setForm(empty); setError(''); setSuccess('') }}
          className="bg-amber-800 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-amber-700 transition-colors">
          + Assign Role
        </button>
      </div>

      {/* Role URLs reference */}
      <div className="bg-white rounded-2xl border border-amber-100 p-4 mb-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Login URLs by Role</p>
        <div className="space-y-2">
          {Object.entries(roleURLs).map(([role, url]) => (
            <div key={role} className="flex items-center gap-3">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize w-20 text-center ${ROLE_COLORS[role]}`}>{role}</span>
              <span className="font-mono text-xs text-gray-500 flex-1">{url}</span>
              <button onClick={() => { navigator.clipboard.writeText(url) }}
                className="text-xs text-amber-600 hover:text-amber-800 font-medium">Copy</button>
            </div>
          ))}
        </div>
      </div>

      {loading ? <div className="text-center py-12 text-amber-600">Loading...</div> : (
        <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
          {users.length === 0 ? (
            <div className="text-center py-12 text-amber-400 text-sm">No users yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-amber-50 text-amber-700 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-center px-4 py-3 font-medium">Role</th>
                  <th className="text-left px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, i) => (
                  <tr key={user.id} className={`border-t border-amber-50 ${i % 2 === 0 ? '' : 'bg-amber-50/30'}`}>
                    <td className="px-4 py-3 font-medium text-gray-800">{user.full_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{user.email}</td>
                    <td className="px-4 py-3 text-center">
                      <select value={user.role} onChange={e => updateRole(user.id, e.target.value)}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:outline-none capitalize ${ROLE_COLORS[user.role]}`}
                        style={{ background: 'transparent' }}>
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(user.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Create User Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <h3 className="font-semibold text-gray-800 mb-3">Assign Role to User</h3>
            <div className="bg-amber-50 rounded-xl p-3 mb-2">
                <p className="text-xs text-amber-700 font-medium">Step 1 — Create the account in Supabase:</p>
                <p className="text-xs text-amber-600 mt-1">Authentication → Users → Add user → Create new user</p>
                <p className="text-xs text-amber-700 font-medium mt-2">Step 2 — Assign their role below:</p>
              </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Email * (must match Supabase Auth)</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="e.g. baker@sunilbakery.com"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Full Name *</label>
                <input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Role *</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white capitalize">
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">Login URL: <span className="font-mono">{roleURLs[form.role]}</span></p>
              </div>
            </div>
            {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
            {success && (
              <div className="mt-3 bg-green-50 border border-green-100 rounded-xl p-3">
                <p className="text-green-700 text-sm font-medium">✅ {success}</p>
                <p className="text-green-600 text-xs mt-1">Login URL: <span className="font-mono">{roleURLs[form.role]}</span></p>
              </div>
            )}
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowForm(false); setError(''); setSuccess('') }}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Close</button>
              <button onClick={assignRole} disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-amber-800 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Assign Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
