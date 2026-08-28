"use client";

type Props = {
  id: string;
  name: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
};

export function Toggle({ id, name, checked, onChange, label, hint, disabled }: Props) {
  return (
    <div className={`toggle-row${disabled ? " is-disabled" : ""}`}>
      <div className="toggle-copy">
        <label htmlFor={id} className="toggle-label">
          {label}
        </label>
        {hint ? <p className="toggle-hint">{hint}</p> : null}
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`toggle-switch${checked ? " is-on" : ""}`}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
      >
        <span className="toggle-knob" aria-hidden />
      </button>
      <input type="hidden" name={name} value={checked ? "true" : "false"} />
    </div>
  );
}
