import { useAuth } from '../lib/AuthContext'

export default function Dashboard() {
  const { user, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">My App</h1>
        <button
          onClick={signOut}
          className="text-sm text-gray-500 hover:text-black transition-colors"
        >
          Sign out
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <p className="text-sm text-gray-400 mb-1">Signed in as</p>
          <p className="font-medium">{user?.email}</p>
        </div>

        <div className="mt-6 bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="font-medium mb-3">Getting started</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            <li>✅ React + Vite set up</li>
            <li>✅ Tailwind CSS configured</li>
            <li>✅ Supabase auth working</li>
            <li>✅ Protected routes ready</li>
            <li className="text-gray-400">⬜ Build your features here</li>
          </ul>
        </div>
      </main>
    </div>
  )
}
