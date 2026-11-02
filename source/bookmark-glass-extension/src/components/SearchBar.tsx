import { Search } from 'lucide-react'

export function SearchBar({ value, onChange, placeholder = 'Search bookmarks...' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="search-bar">
      <Search size={17} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      <span className="search-hint">⌘ K</span>
    </label>
  )
}
