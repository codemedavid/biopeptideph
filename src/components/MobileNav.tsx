import React from 'react';
import { useCategories } from '../hooks/useCategories';

interface MobileNavProps {
  activeCategory: string;
  onCategoryClick: (categoryId: string) => void;
}

const MobileNav: React.FC<MobileNavProps> = ({ activeCategory, onCategoryClick }) => {
  const { categories } = useCategories();

  return (
    <div className="sticky top-[84px] z-40 mx-3 mt-3 frost-soft rounded-[var(--r-md)] md:hidden">
      <div className="flex overflow-x-auto scrollbar-hide px-3 py-2.5 gap-2">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => onCategoryClick(category.id)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all border ${activeCategory === category.id
                ? 'bg-gradient-to-b from-theme-blue to-theme-secondary text-white border-transparent shadow-[0_10px_22px_-12px_var(--ice-deep)]'
                : 'bg-white/50 text-theme-text/65 border-[var(--frost-line)] hover:text-theme-text'
              }`}
          >
            {category.name}
          </button>
        ))}
      </div>
    </div>
  );
};

export default MobileNav;
