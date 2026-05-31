import { useAuth } from '../../lib/AuthContext'

export default function CustomerView({ standalone }) {
  const { signOut } = useAuth()
  return (
    <div className="min-h-screen bg-green-50">
      {standalone && (
        <header className="bg-white border-b border-green-100 px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🛍️</span>
            <div>
              <h1 className="text-base font-semibold text-green-900">My Orders</h1>
              <p className="text-xs text-green-600">Sunil Homemade Bakery</p>
            </div>
          </div>
          <button onClick={signOut} className="text-sm text-green-600 hover:text-green-900">Sign out</button>
        </header>
      )}
      <main className="max-w-2xl mx-auto px-4 py-10 text-center">
        <div className="text-4xl mb-3">🛍️</div>
        <p className="text-gray-500 font-medium">Customer View</p>
        <p className="text-sm text-gray-400 mt-1">Coming soon — being built next</p>
      </main>
    </div>
  )
}
