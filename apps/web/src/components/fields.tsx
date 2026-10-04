import { formatLength, parseLength, parsePlainNumber, type DisplayPrecision, type Units } from "@opencutplan/core";
import { useState, type InputHTMLAttributes, type KeyboardEvent } from "react";

type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "defaultValue">;

interface DraftInputProps extends BaseProps {
  value: string;
  /** Returns false to reject the text. Enter keeps rejected text so it can be fixed; leaving the field puts the old value back. */
  onCommit(text: string): boolean;
}

export function DraftInput({ value, onCommit, onKeyDown, onBlur, ...rest }: DraftInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const reset = () => {
    setDraft(null);
    setInvalid(false);
  };
  const commit = (keepInvalid: boolean) => {
    if (draft === null || draft === value || onCommit(draft)) reset();
    else if (keepInvalid) setInvalid(true);
    else reset();
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") commit(true);
    else if (event.key === "Escape") reset();
    onKeyDown?.(event);
  };
  return (
    <input
      {...rest}
      value={draft ?? value}
      aria-invalid={invalid || undefined}
      onChange={(event) => {
        setDraft(event.target.value);
        setInvalid(false);
      }}
      onKeyDown={keyDown}
      onBlur={(event) => {
        commit(false);
        onBlur?.(event);
      }}
    />
  );
}

/** An onChange that returns false refuses the value: the field keeps the text and marks it, as for text it cannot read. */
type Change<T> = (value: T) => boolean | void;

interface TextInputProps extends BaseProps {
  value: string;
  onChange: Change<string>;
  /** Rejects text that fails; the text is trimmed first. */
  valid?: (value: string) => boolean;
}

export function TextInput({ value, onChange, required, valid, ...rest }: TextInputProps) {
  return (
    <DraftInput
      {...rest}
      type="text"
      value={value}
      required={required}
      onCommit={(text) => {
        const trimmed = text.trim();
        if ((required && trimmed === "") || (valid && !valid(trimmed))) return false;
        return trimmed === value || onChange(trimmed) !== false;
      }}
    />
  );
}

interface LengthInputProps extends BaseProps {
  value: number | undefined;
  units: Units;
  display: DisplayPrecision;
  onChange: Change<number | undefined>;
  /** Blank clears the value. */
  optional?: boolean;
  allowZero?: boolean;
}

export function LengthInput({ value, units, display, onChange, optional, allowZero, ...rest }: LengthInputProps) {
  return (
    <DraftInput
      {...rest}
      type="text"
      inputMode="decimal"
      value={value === undefined ? "" : formatLength(value, units, display)}
      onCommit={(text) => {
        if (text.trim() === "") {
          if (!optional) return false;
          return value === undefined || onChange(undefined) !== false;
        }
        const parsed = parseLength(text, units);
        if (parsed === null || parsed < 0 || (parsed === 0 && !allowZero)) return false;
        return parsed === value || onChange(parsed) !== false;
      }}
    />
  );
}

interface NumberInputProps extends BaseProps {
  value: number | undefined;
  onChange: Change<number | undefined>;
  optional?: boolean;
  integer?: boolean;
  minimum?: number;
  maximum?: number;
}

export function NumberInput({ value, onChange, optional, integer, minimum = 0, maximum = Number.MAX_SAFE_INTEGER, ...rest }: NumberInputProps) {
  return (
    <DraftInput
      {...rest}
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      value={value === undefined ? "" : String(value)}
      onCommit={(text) => {
        if (text.trim() === "") {
          if (!optional) return false;
          return value === undefined || onChange(undefined) !== false;
        }
        const parsed = parsePlainNumber(text);
        if (parsed === null || parsed < minimum || parsed > maximum || (integer && !Number.isSafeInteger(parsed))) return false;
        return parsed === value || onChange(parsed) !== false;
      }}
    />
  );
}

interface ColorChoiceProps {
  /** What the colour is for, such as "Hall KALLAX 2 of 3". */
  label: string;
  color: string;
  chosen: boolean;
  disabled?: boolean;
  /** null makes the colour automatic again. */
  onChange(color: string | null): void;
}

export function ColorChoice({ label, color, chosen, disabled, onChange }: ColorChoiceProps) {
  return (
    <span className="color-choice">
      <input type="color" aria-label={`Colour of ${label}`} value={color} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
      <span>{label}</span>
      <button type="button" aria-label={`Automatic colour for ${label}`} title="Use the automatic colour again." disabled={disabled || !chosen} onClick={() => onChange(null)}>
        Automatic
      </button>
    </span>
  );
}
