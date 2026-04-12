import React from "react"
import styles from "./Select.module.css"

export interface SelectOption {
  label: string
  value: string
  disabled?: boolean
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children" | "onChange"> {
  label?: string
  hint?: string
  error?: string
  fullWidth?: boolean
  options: SelectOption[]
  placeholder?: string
  value: string
  onChange?: (value: string, event: React.ChangeEvent<HTMLSelectElement>) => void
}

export const Select: React.FC<SelectProps> = ({
  label,
  hint,
  error,
  fullWidth = false,
  options,
  placeholder,
  value,
  onChange,
  disabled,
  className,
  id,
  ...props
}) => {
  const generatedId = React.useId()
  const selectId = id || `select-${generatedId}`
  const hintId = hint ? `${selectId}-hint` : undefined
  const errorId = error ? `${selectId}-error` : undefined

  const selectClasses = [
    styles.base,
    error && styles.error,
    fullWidth && styles.fullWidth,
    className,
  ]
    .filter(Boolean)
    .join(" ")

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onChange?.(event.target.value, event)
  }

  return (
    <div className={`${styles.wrapper} ${fullWidth ? styles.fullWidth : ""}`}>
      {label && (
        <label htmlFor={selectId} className={styles.label}>
          {label}
        </label>
      )}

      <div className={styles.selectRow}>
        <select
          id={selectId}
          className={selectClasses}
          disabled={disabled}
          value={value}
          onChange={handleChange}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          aria-invalid={error ? true : undefined}
          {...props}
        >
          {placeholder ? (
            <option key="__placeholder__" value="" disabled={value !== ""}>
              {placeholder}
            </option>
          ) : null}
          {options.map(option => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <span className={styles.chevron} aria-hidden="true">
          ▾
        </span>
      </div>

      {error ? (
        <p id={errorId} className={styles.errorText} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className={styles.hintText}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}
