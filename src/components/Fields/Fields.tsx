import React, { ReactNode, useId } from 'react';

interface SliderProps {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  digits?: number;
  hint?: ReactNode;
  onChange: (value: number) => void;
}

export const Slider: React.FC<SliderProps> = ({ label, value, min, max, step, unit, digits = 1, hint, onChange }) => {
  const id = useId();
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className='field'>
      <div className='field-row'>
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>
          {value.toFixed(digits)}
          {unit && <small>{unit}</small>}
        </output>
      </div>
      <input
        id={id}
        className='slider'
        type='range'
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--fill': `${fill}%` } as React.CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint && <p className='field-hint'>{hint}</p>}
    </div>
  );
};

interface NumFieldProps {
  label: string;
  value: number | '';
  step?: number;
  min?: number;
  placeholder?: string;
  onChange: (value: number | '') => void;
}

export const NumField: React.FC<NumFieldProps> = ({ label, value, step = 0.1, min = 0, placeholder, onChange }) => {
  const id = useId();
  return (
    <div className='field'>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className='inp mono'
        type='number'
        inputMode='decimal'
        step={step}
        min={min}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
      />
    </div>
  );
};

interface TextFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  onChange: (value: string) => void;
}

export const TextField: React.FC<TextFieldProps> = ({ label, value, placeholder, type = 'text', required, onChange }) => {
  const id = useId();
  return (
    <div className='field'>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className='inp'
        type={type}
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
};

interface SelectProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

export const Select = <T extends string>({ label, value, options, onChange }: SelectProps<T>) => {
  const id = useId();
  return (
    <div className='field'>
      <label htmlFor={id}>{label}</label>
      <select id={id} className='sel' value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

interface SegProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  label: string;
  onChange: (value: T) => void;
}

export const Seg = <T extends string>({ value, options, label, onChange }: SegProps<T>) => (
  <div className='seg' role='group' aria-label={label}>
    {options.map((option) => (
      <button key={option.value} type='button' aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
        {option.label}
      </button>
    ))}
  </div>
);

interface PageHeadProps {
  num: string;
  kicker: string;
  title: ReactNode;
  children?: ReactNode;
}

export const PageHead: React.FC<PageHeadProps> = ({ num, kicker, title, children }) => (
  <section className='hero'>
    <div className='wrap' style={{ paddingBlock: 'clamp(36px, 5vw, 72px)' }}>
      <div className='hero-copy'>
        <p className='kicker'>
          <b>{num}</b> · {kicker}
        </p>
        <h1 className='hero-h' style={{ maxWidth: '16em', fontSize: 'clamp(30px, 4vw, 62px)' }}>
          {title}
        </h1>
        {children && <p className='hero-sub'>{children}</p>}
      </div>
    </div>
  </section>
);
