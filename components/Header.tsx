'use client'

import { Heart, Shuffle } from 'lucide-react'

interface HeaderProps {
  onHeartClick: () => void
  onShuffleClick: () => void
  onLanguageChange: (lang: string) => void
  currentLang: string
  accentColor: string
}

export default function Header({ 
  onHeartClick, 
  onShuffleClick, 
  onLanguageChange,
  currentLang,
  accentColor 
}: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 flex justify-between items-center p-4 text-white">
      <button 
        onClick={onHeartClick} 
        className="p-2 bg-white rounded-lg hover:scale-110 transition-transform"
      >
        <Heart size={24} fill={accentColor} color={accentColor} />
      </button>
      
      <button 
        onClick={onShuffleClick} 
        className="p-2 bg-white rounded-lg hover:scale-110 transition-transform"
      >
        <Shuffle size={24} color="black" />
      </button>
      
      <div className="flex items-center gap-2">
        <span className="text-sm font-black">V 0.1</span>
        <select 
          value={currentLang}
          onChange={(e) => onLanguageChange(e.target.value)}
          className="bg-white text-black rounded px-2 py-1 text-xs font-bold"
        >
          <option value="en">🇬🇧</option>
          <option value="fr">🇫🇷</option>
          <option value="de">🇩🇪</option>
          <option value="jp">🇯🇵</option>
        </select>
      </div>
    </header>
  )
}