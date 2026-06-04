// Shared bake list display component used in BakerView and Orders bake summary

export default function BakeListDisplay({ groups, cookieSurplus, date }) {
  if (!groups || groups.length === 0) return null

  return (
    <div className="space-y-2">
      {groups.map((group, i) => (
        <div key={i} className={`rounded-xl overflow-hidden border ${group.items?.length > 0 ? 'border-amber-100' : 'border-transparent'}`}>
          {/* Group header */}
          <div className={`flex items-center justify-between px-4 py-2.5 ${group.items?.length > 0 ? 'bg-amber-50' : 'bg-white border border-amber-100 rounded-xl'}`}>
            <span className={`font-semibold text-gray-800 text-sm ${group.items?.length > 0 ? '' : ''}`}>
              {group.group}
            </span>
            <span className="font-mono font-bold text-amber-900 text-sm">
              {group.totalDisplay || group.total}
              {group.unit && <span className="text-xs text-gray-400 ml-1">{group.unit}</span>}
            </span>
          </div>

          {/* Sub-items */}
          {group.items?.length > 0 && (
            <div className="bg-white">
              {group.items.map((item, j) => (
                <div key={j} className={`flex items-center justify-between px-6 py-2 ${j < group.items.length - 1 ? 'border-b border-amber-50' : ''}`}>
                  <span className="text-sm text-gray-600">
                    {item.name}
                    {item.note && <span className="text-xs text-gray-400 ml-1">{item.note}</span>}
                  </span>
                  <span className="font-mono text-gray-700 text-sm">{item.qty}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Cookie surplus note */}
      {cookieSurplus > 0 && (
        <div className="bg-purple-50 border border-purple-100 rounded-xl px-4 py-3 text-sm text-purple-700">
          <span className="font-semibold">Cookie surplus: {cookieSurplus}</span> cookies will be deducted from tomorrow's bake list
        </div>
      )}
    </div>
  )
}
