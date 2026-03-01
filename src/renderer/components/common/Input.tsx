import React from 'react';
import styles from './Input.module.css';

export type InputSize = 'small' | 'medium' | 'large';

export type InputType = 'text' | 'password' | 'email' | 'number' | 'tel' | 'url';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  /**
   * Input type
   * @default 'text'
   */
  type?: InputType;

  /**
   * Input size
   * @default 'medium'
   */
  size?: InputSize;

  /**
   * Label for the input
   */
  label?: string;

  /**
   * Hint text displayed below the input
   */
  hint?: string;

  /**
   * Error message
   */
  error?: string;

  /**
   * Whether the input should take full width
   */
  fullWidth?: boolean;

  /**
   * Optional trailing content rendered inside the input row
   */
  endAdornment?: React.ReactNode;
}

/**
 * Input component with support for label, hint, and error states
 */
export const Input: React.FC<InputProps> = ({
  type = 'text',
  size = 'medium',
  label,
  hint,
  error,
  fullWidth = false,
  endAdornment,
  disabled,
  className,
  id,
  ...props
}) => {
  const inputId = id || `input-${React.useId()}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  const inputClasses = [
    styles.base,
    endAdornment && styles.withEndAdornment,
    size !== 'medium' && styles[size],
    error && styles.error,
    fullWidth && styles.fullWidth,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={`${styles.wrapper} ${fullWidth ? styles.fullWidth : ''}`}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}

      <div className={styles.inputRow}>
        <input
          id={inputId}
          type={type}
          className={inputClasses}
          disabled={disabled}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          aria-invalid={error ? true : undefined}
          {...props}
        />
        {endAdornment && (
          <div className={styles.endAdornment}>
            {endAdornment}
          </div>
        )}
      </div>

      {error && (
        <p id={errorId} className={styles.errorText} role="alert">
          {error}
        </p>
      )}

      {!error && hint && (
        <p id={hintId} className={styles.hintText}>
          {hint}
        </p>
      )}
    </div>
  );
};

export default Input;
