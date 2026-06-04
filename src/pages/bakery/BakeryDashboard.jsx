import { useState, useEffect } from 'react'
import { useAuth } from '../../lib/AuthContext'
import BakeryItems from './BakeryItems'
import Ingredients from './Ingredients'
import Recipes from './Recipes'
import BulkImport from './BulkImport'
import Customers from './Customers'
import Orders from './Orders'
import Ledger from './Ledger'
import BakerView from './BakerView'
import UserManagement from './UserManagement'
import OpsView from './OpsView'
import CashCollected from './CashCollected'

const tabs = [
  { id: 'orders',      label: 'Orders',       icon: '📦' },
  { id: 'ops',         label: 'Operations',   icon: '📊' },
  { id: 'ledger',      label: 'Ledger',       icon: '🧾' },
  { id: 'cash',        label: 'Cash',         icon: '💵' },
  { id: 'baker',       label: 'Baker',        icon: '🧑‍🍳' },
  { id: 'customers',   label: 'Customers',    icon: '👥' },
  { id: 'items',       label: 'Bakery Items', icon: '🥐' },
  { id: 'ingredients', label: 'Ingredients',  icon: '🧂' },
  { id: 'recipes',     label: 'Recipes',      icon: '📋' },
  { id: 'import',      label: 'Bulk Import',  icon: '⬆️' },
  { id: 'users',       label: 'Users',        icon: '👤' },
]

export default function BakeryDashboard() {
  const { signOut } = useAuth()
  const [activeTab, setActiveTab] = useState('orders')
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Close drawer on back button press
  useEffect(() => {
    if (!drawerOpen) return
    window.history.pushState({ drawer: true }, '')
    function handlePopState() { setDrawerOpen(false) }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [drawerOpen])

  function selectTab(id) {
    setActiveTab(id)
    setDrawerOpen(false)
  }

  const activeLabel = tabs.find(t => t.id === activeTab)

  return (
    <div className="min-h-screen bg-amber-50">

      {/* Header */}
      <header className="bg-white border-b border-amber-100 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Hamburger — mobile only */}
            <button
              className="md:hidden p-1.5 rounded-lg hover:bg-amber-50 transition-colors"
              onClick={() => setDrawerOpen(true)}>
              <svg className="w-5 h-5 text-amber-800" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-xl">🍞</span>
            <div>
              <h1 className="text-sm font-semibold text-amber-900 leading-tight">Sunil Homemade Bakery</h1>
              {/* Show active tab name on mobile */}
              <p className="text-xs text-amber-600 md:hidden">{activeLabel?.icon} {activeLabel?.label}</p>
              <p className="text-xs text-amber-600 hidden md:block">Operations Manager</p>
            </div>
          </div>
          <button onClick={signOut} className="text-sm text-amber-600 hover:text-amber-900 transition-colors">Sign out</button>
        </div>

        {/* Desktop tabs — hidden on mobile */}
        <div className="hidden md:flex max-w-5xl mx-auto px-4 gap-1 pb-0 overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => selectTab(tab.id)}
              className={`px-3 py-2.5 text-sm font-medium rounded-t-xl transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-amber-50 text-amber-900 border border-b-0 border-amber-100'
                  : 'text-amber-600 hover:text-amber-800'
              }`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Mobile Drawer Overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-30 md:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          {/* Drawer */}
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-4 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <span className="text-xl">🍞</span>
                <span className="font-semibold text-amber-900">Sunil Homemade Bakery</span>
              </div>
              <button onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-2">
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => selectTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'bg-amber-50 text-amber-900 font-semibold border-r-2 border-amber-600'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}>
                  <span className="text-lg w-7 text-center">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>
            <div className="px-4 py-4 border-t border-amber-100">
              <button onClick={signOut} className="w-full text-sm text-amber-600 hover:text-amber-900 text-left">
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {activeTab === 'orders'      && <Orders />}
        {activeTab === 'ops'         && <OpsView />}
        {activeTab === 'ledger'      && <Ledger />}
        {activeTab === 'cash'        && <CashCollected />}
        {activeTab === 'baker'       && <BakerView />}
        {activeTab === 'customers'   && <Customers />}
        {activeTab === 'items'       && <BakeryItems />}
        {activeTab === 'ingredients' && <Ingredients />}
        {activeTab === 'recipes'     && <Recipes />}
        {activeTab === 'import'      && <BulkImport />}
        {activeTab === 'users'       && <UserManagement />}
      </main>
    </div>
  )
}
