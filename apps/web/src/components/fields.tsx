import { formatExactLength, parseLength, parsePlainNumber, type Units } from "@opencutplan/core";
import { useId, useState, type InputHTMLAttributes, type KeyboardEvent } from "react";

type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "defaultValue">;

interface DraftInputProps extends BaseProps {
  value: string;
  /**
   * Returns false to reject the text, or a message that says how to fix it; the message shows under the field. Enter
   * keeps rejected text so it can be fixed; leaving the field puts the old value back.
   */
  onCommit(text: string): boolean | string;
}

export function DraftInput({ value, onCommit, onKeyDown, onBlur, "aria-describedby": describedBy, ...rest }: DraftInputProps) {
  const messageId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const reset = () => {
    setDraft(null);
    setInvalid(false);
    setMessage(null);
  };
  const commit = (keepInvalid: boolean) => {
    const result = draft === null || draft === value || onCommit(draft);
    if (result === true) reset();
    else if (keepInvalid) {
      setInvalid(true);
      setMessage(result === false ? null : result);
    } else reset();
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") commit(true);
    else if (event.key === "Escape") reset();
    onKeyDown?.(event);
  };
  return (
    <>
      <input
        {...rest}
        value={draft ?? value}
        aria-invalid={invalid || undefined}
        aria-describedby={[describedBy, message === null ? undefined : messageId].filter(Boolean).join(" ") || undefined}
        onChange={(event) => {
          setDraft(event.target.value);
          setInvalid(false);
          setMessage(null);
        }}
        onKeyDown={keyDown}
        onBlur={(event) => {
          commit(false);
          onBlur?.(event);
        }}
      />
      {message !== null && (
        // aria-hidden keeps the message out of the name of a label around the field; aria-describedby still reads it.
        <span id={messageId} className="field-error" aria-hidden="true">
          {message}
        </span>
      )}
    </>
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
  onChange: Change<number | undefined>;
  /** Blank clears the value. */
  optional?: boolean;
  allowZero?: boolean;
}

const LENGTH_EXAMPLES: Readonly<Record<Units, string>> = {
  in: `24 1/2, 2' 3", or 600 mm`,
  mm: `600, 600 mm, or 24 1/2"`,
};

export function LengthInput({ value, units, onChange, optional, allowZero, ...rest }: LengthInputProps) {
  return (
    <DraftInput
      {...rest}
      type="text"
      inputMode="decimal"
      value={value === undefined ? "" : formatExactLength(value, units)}
      onCommit={(text) => {
        if (text.trim() === "") {
          if (!optional) return "Type a length.";
          return value === undefined || onChange(undefined) !== false;
        }
        const parsed = parseLength(text, units);
        if (parsed === null) return `Type a length, for example ${LENGTH_EXAMPLES[units]}.`;
        if (parsed < 0 || (parsed === 0 && !allowZero)) return allowZero ? "Type a length of 0 or more." : "Type a length of more than 0.";
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
  const kind = integer ? "whole number" : "number";
  const wanted = maximum === Number.MAX_SAFE_INTEGER ? `Type a ${kind} of ${minimum} or more.` : `Type a ${kind} from ${minimum} to ${maximum}.`;
  return (
    <DraftInput
      {...rest}
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      value={value === undefined ? "" : String(value)}
      onCommit={(text) => {
        if (text.trim() === "") {
          if (!optional) return wanted;
          return value === undefined || onChange(undefined) !== false;
        }
        const parsed = parsePlainNumber(text);
        if (parsed === null || parsed < minimum || parsed > maximum || (integer && !Number.isSafeInteger(parsed))) return wanted;
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
