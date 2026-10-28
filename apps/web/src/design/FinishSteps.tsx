import { MAX_FINISH_STEPS } from "@opencutplan/core";
import { useEffect, useRef, useState } from "react";
import { TextInput } from "../components/fields.tsx";

interface FinishStepsProps {
  steps: readonly string[];
  disabled: boolean;
  onChange(steps: string[]): void;
}

export function FinishSteps({ steps, disabled, onChange }: FinishStepsProps) {
  const [adding, setAdding] = useState(false);
  const added = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (adding) added.current?.querySelector("input")?.focus();
  }, [adding]);
  const replace = (index: number, text: string) => onChange(steps.map((step, at) => (at === index ? text : step)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...steps];
    [next[index], next[index + by]] = [next[index + by]!, next[index]!];
    onChange(next);
  };

  return (
    <fieldset disabled={disabled} className="finish-steps">
      <legend>Finish steps</legend>
      <ol>
        {steps.map((step, index) => (
          <li key={index}>
            <TextInput aria-label={`Finish step ${index + 1}`} value={step} onChange={(text) => replace(index, text)} />
            <button type="button" disabled={index === 0} aria-label={`Move finish step ${index + 1} up`} onClick={() => move(index, -1)}>
              ↑
            </button>
            <button type="button" disabled={index === steps.length - 1} aria-label={`Move finish step ${index + 1} down`} onClick={() => move(index, 1)}>
              ↓
            </button>
            <button type="button" aria-label={`Remove finish step ${index + 1}`} onClick={() => onChange(steps.filter((_, at) => at !== index))}>
              ✕
            </button>
          </li>
        ))}
        {adding && (
          <li ref={added}>
            <TextInput
              aria-label={`Finish step ${steps.length + 1}`}
              value=""
              onChange={(text) => {
                setAdding(false);
                onChange([...steps, text]);
              }}
              onBlur={() => setAdding(false)}
            />
          </li>
        )}
      </ol>
      <button type="button" disabled={adding || steps.length >= MAX_FINISH_STEPS} onClick={() => setAdding(true)}>
        Add a finish step
      </button>
      <p className="muted">These steps come after the assembly steps. They do not change the parts or the cut plan.</p>
    </fieldset>
  );
}
