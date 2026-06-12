import React from 'react';
import { Grid, FlaskConical, Sparkles, Leaf, Package } from 'lucide-react';
import { useCategories } from '../hooks/useCategories';

interface SubNavProps {
  selectedCategory: string;
  onCategoryClick: (categoryId: string) => void;
}

const iconMap: { [key: string]: React.ReactElement } = {
  Grid: <Grid className="w-5 h-5" />,
  FlaskConical: <FlaskConical className="w-5 h-5" />,
  Sparkles: <Sparkles className="w-5 h-5" />,
  Leaf: <Leaf className="w-5 h-5" />,
  Package: <Package className="w-5 h-5" />,
};

const SubNav: React.FC<SubNavProps> = ({ selectedCategory, onCategoryClick }) => {
  const { categories, loading } = useCategories();

  if (loading) {
    return (
      <div className="hidden md:block mx-7 mt-3.5">
        <div className="frost-soft rounded-[var(--r-md)] p-2.5">
          <div className="flex gap-2.5 overflow-x-auto">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="animate-pulse bg-white/40 h-10 w-32 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <nav className="hidden md:block sticky top-[100px] z-40 mx-7 mt-3.5">
      <div className="frost-soft rounded-[var(--r-md)] px-2.5">
        <div className="flex items-center gap-2.5 py-2.5 overflow-x-auto scrollbar-hide">
          {categories.map((category) => {
            const isSelected = selectedCategory === category.id;

            return (
              <button
                key={category.id}
                onClick={() => onCategoryClick(category.id)}
                className={`
                  flex items-center gap-2 px-[18px] py-[11px] rounded-xl font-semibold whitespace-nowrap
                  transition-all duration-200 text-[14.5px] border
                  ${isSelected
                    ? 'text-white bg-gradient-to-b from-theme-blue to-theme-secondary border-transparent shadow-[0_12px_24px_-12px_var(--ice-deep)]'
                    : 'bg-transparent text-theme-text/65 hover:text-theme-text border-transparent hover:bg-white/50'
                  }
                `}
              >
                <span>
                  {React.cloneElement(iconMap[category.icon] || <Grid className="w-4 h-4" />, {
                    className: `w-[17px] h-[17px] ${isSelected ? 'text-white' : 'text-theme-text/45'}`
                  })}
                </span>
                <span>{category.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Hide scrollbar for better aesthetics */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </nav>
  );
};

export default SubNav;
