export default function ChipGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
  display,
  disabled = false,
}: {
  disabled?: boolean;
  label: string;
  options: T[];
  value: T | '';
  onChange: (v: T) => void;
  display?: (v: T) => string;
}) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="chips">
        {options.map((v) => (
          <button
            disabled={disabled}
            type="button"
            className="chip"
            aria-pressed={value === v}
            key={v}
            onClick={() => onChange(v)}
          >
            {display ? display(v) : v}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
