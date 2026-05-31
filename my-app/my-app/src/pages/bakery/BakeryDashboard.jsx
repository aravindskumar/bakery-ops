import { useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import BakeryItems from './BakeryItems'
import Ingredients from './Ingredients'
import Recipes from './Recipes'
import BulkImport from './BulkImport'
import Customers from './Customers'
import Orders from './Orders'

const tabs = [
  { id: 'orders', label: '📦 Orders' },
  { id: 'customers', label: '👥 Customers' },
  { id: 'items', label: '🥐 Bakery Items' },
  { id: 'ingredients', label: '🧂 Ingredients' },
  { id: 'recipes', label: '📋 Recipes' },
  { id: 'import', label: '⬆️ Bulk Import' },
]

export default function BakeryDashboard() {
  const { signOut } = useAuth()
  const [activeTab, setActiveTab] = useState('orders')

  return (
    <div className="min-h-screen bg-amber-50">
      <header className="bg-white border-b border-amber-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🍞</span>
            <div>
              <h1 className="text-base font-semibold text-amber-900 leading-tight">Bakery Ops</h1>
              <p className="text-xs text-amber-600">Operations Manager</p>
            </div>
          </div>
          <button onClick={signOut} className="text-sm text-amber-600 hover:text-amber-900 transition-colors">Sign out</button>
        </div>
        <div className="max-w-5xl mx-auto px-4 flex gap-1 pb-0 overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-xl transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-amber-50 text-amber-900 border border-b-0 border-amber-100'
                  : 'text-amber-600 hover:text-amber-800'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        {activeTab === 'orders' && <Orders />}
        {activeTab === 'customers' && <Customers />}
        {activeTab === 'items' && <BakeryItems />}
        {activeTab === 'ingredients' && <Ingredients />}
        {activeTab === 'recipes' && <Recipes />}
        {activeTab === 'import' && <BulkImport />}
      </main>
    </div>
  )
}
