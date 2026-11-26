import { Chip } from './Chip';
import s from './ui.module.css';
export default function ChipGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
  display,
  disabled = false,
  hideLegend = false,
}: {
  disabled?: boolean;
  label: string;
  options: T[];
  value: T | '';
  onChange: (v: T) => void;
  display?: (v: T) => string;
  hideLegend?: boolean;
}) {
  return (
    <fieldset>
      <legend className={hideLegend ? 'sr-only' : s.legend}>{label}</legend>
      <div className={s.chipWrap}>
        {options.map((v) => (
          <Chip disabled={disabled} pressed={value === v} key={v} onClick={() => onChange(v)}>
            {display ? display(v) : v}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}
