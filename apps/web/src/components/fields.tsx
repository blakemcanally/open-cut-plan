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

interface TextInputProps extends BaseProps {
  value: string;
  onChange(value: string): void;
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
        if (trimmed !== value) onChange(trimmed);
        return true;
      }}
    />
  );
}

interface LengthInputProps extends BaseProps {
  value: number | undefined;
  units: Units;
  display: DisplayPrecision;
  onChange(value: number | undefined): void;
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
          if (value !== undefined) onChange(undefined);
          return true;
        }
        const parsed = parseLength(text, units);
        if (parsed === null || parsed < 0 || (parsed === 0 && !allowZero)) return false;
        if (parsed !== value) onChange(parsed);
        return true;
      }}
    />
  );
}

interface NumberInputProps extends BaseProps {
  value: number | undefined;
  onChange(value: number | undefined): void;
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
          if (value !== undefined) onChange(undefined);
          return true;
        }
        const parsed = parsePlainNumber(text);
        if (parsed === null || parsed < minimum || parsed > maximum || (integer && !Number.isSafeInteger(parsed))) return false;
        if (parsed !== value) onChange(parsed);
        return true;
      }}
    />
  );
}
