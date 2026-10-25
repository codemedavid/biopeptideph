/**
 * The tick-boxes the owner uses to choose which dashboard sections a staff
 * account can open. Presentational: the parent owns the selection.
 */
import { ADMIN_FEATURE_INFO, type AdminFeature } from '../../lib/adminFeatures';

type Props = {
  idPrefix: string;
  selected: AdminFeature[];
  onChange: (next: AdminFeature[]) => void;
  isDisabled?: boolean;
};

export default function StaffFeatureChecklist({ idPrefix, selected, onChange, isDisabled = false }: Props) {
  const chosen = new Set(selected);
  const allKeys = ADMIN_FEATURE_INFO.map((f) => f.key);

  const toggle = (key: AdminFeature) => {
    const next = chosen.has(key) ? selected.filter((k) => k !== key) : [...selected, key];
    // Keep the canonical order so saved permission lists are stable.
    onChange(allKeys.filter((k) => next.includes(k)));
  };

  return (
    <fieldset disabled={isDisabled} className="disabled:opacity-60">
      <div className="flex items-center justify-between gap-3 mb-2">
        <legend className="text-sm font-semibold text-gray-800">
          Sections this staff can see{' '}
          <span className="font-normal text-gray-500">
            ({selected.length} of {allKeys.length})
          </span>
        </legend>
        <div className="flex gap-3 text-xs font-medium">
          <button type="button" onClick={() => onChange(allKeys)} className="text-theme-accent hover:underline">
            Select all
          </button>
          <button type="button" onClick={() => onChange([])} className="text-gray-500 hover:underline">
            Clear
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {ADMIN_FEATURE_INFO.map((feature) => {
          const id = `${idPrefix}-${feature.key}`;
          const isChecked = chosen.has(feature.key);
          return (
            <label
              key={feature.key}
              htmlFor={id}
              className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-theme-accent/40 ${
                isChecked
                  ? 'border-theme-accent/60 bg-theme-accent/5'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <input
                id={id}
                type="checkbox"
                checked={isChecked}
                onChange={() => toggle(feature.key)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-theme-accent focus:ring-theme-accent"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-900">{feature.label}</span>
                <span className="block text-xs text-gray-500">{feature.description}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
