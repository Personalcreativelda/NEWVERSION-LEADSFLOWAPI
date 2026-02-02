import { useState } from 'react';

interface SatisfactionRatingProps {
  onRate: (rating: number) => void;
}

const emojis = [
  { rating: 5, emoji: '😀', label: 'Excelente' },
  { rating: 4, emoji: '😊', label: 'Bom' },
  { rating: 3, emoji: '😐', label: 'Regular' },
  { rating: 2, emoji: '😕', label: 'Ruim' },
  { rating: 1, emoji: '😞', label: 'Péssimo' }
];

export function SatisfactionRating({ onRate }: SatisfactionRatingProps) {
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);

  const handleRate = (rating: number) => {
    setSelectedRating(rating);
    setTimeout(() => {
      onRate(rating);
    }, 500);
  };

  if (selectedRating) {
    return (
      <div className="flex justify-center animate-fadeIn">
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl px-6 py-4 text-center">
          <p className="text-sm text-green-800 dark:text-green-200">
            ✓ Obrigado pelo feedback!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center animate-fadeIn">
      <div className="bg-card border border-border rounded-2xl px-6 py-4 max-w-sm">
        <p className="text-sm text-gray-900 dark:text-gray-100 font-medium text-center mb-4">
          Como foi o atendimento?
        </p>
        
        <div className="flex justify-center gap-3">
          {emojis.map(({ rating, emoji, label }) => (
            <button
              key={rating}
              onClick={() => handleRate(rating)}
              onMouseEnter={() => setHoveredRating(rating)}
              onMouseLeave={() => setHoveredRating(null)}
              className="group relative"
              aria-label={label}
              title={label}
            >
              <div
                className={`text-3xl transition-transform ${
                  hoveredRating === rating ? 'scale-125' : 'scale-100'
                }`}
              >
                {emoji}
              </div>
              
              {/* Label on hover */}
              {hoveredRating === rating && (
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-900 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded">
                  {label}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

