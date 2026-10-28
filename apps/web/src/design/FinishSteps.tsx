import { MAX_FINISH_STEPS } from "@opencutplan/core";
import { useEffect, useRef, useState } from "react";
import { TextInput } from "../components/fields.tsx";

interface FinishStepsProps {
  steps: readonly string[];
  disabled: boolean;
  /** Returns false when the change is refused. */
  onChange(steps: string[]): boolean;
}

export function FinishSteps({ steps, disabled, onChange }: FinishStepsProps) {
  const [adding, setAdding] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const refocus = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (adding) list.current?.lastElementChild?.querySelector("input")?.focus();
  }, [adding]);
  useEffect(() => {
    const focus = refocus.current;
    refocus.current = null;
    focus?.();
  }, [steps]);
  const rowAt = (index: number) => list.current?.children[index];
  const change = (next: string[], focus: () => void): boolean => {
    const applied = onChange(next);
    if (applied) refocus.current = focus;
    return applied;
  };
  const replace = (index: number, text: string) => onChange(steps.map((step, at) => (at === index ? text : step)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...steps];
    [next[index], next[index + by]] = [next[index + by]!, next[index]!];
    change(next, () => {
      const row = rowAt(index + by);
      const wanted = by < 0 ? "up" : "down";
      const button = row?.querySelector<HTMLButtonElement>(`button[aria-label$=" ${wanted}"]`);
      const other = row?.querySelector<HTMLButtonElement>(`button[aria-label$=" ${by < 0 ? "down" : "up"}"]`);
      (button && !button.disabled ? button : other)?.focus();
    });
  };
  const remove = (index: number) => {
    const next = steps.filter((_, at) => at !== index);
    change(next, () => {
      const row = rowAt(index < next.length ? index : index - 1);
      if (row) row.querySelector("input")?.focus();
      else addButton.current?.focus();
    });
  };

  return (
    <fieldset disabled={disabled} className="finish-steps">
      <legend>Finish steps</legend>
      <ol ref={list}>
        {steps.map((step, index) => (
          <li key={index}>
            <TextInput aria-label={`Finish step ${index + 1}`} value={step} onChange={(text) => replace(index, text)} />
            <button type="button" disabled={index === 0} aria-label={`Move finish step ${index + 1} up`} onClick={() => move(index, -1)}>
              ↑
            </button>
            <button type="button" disabled={index === steps.length - 1} aria-label={`Move finish step ${index + 1} down`} onClick={() => move(index, 1)}>
              ↓
            </button>
            <button type="button" aria-label={`Remove finish step ${index + 1}`} onClick={() => remove(index)}>
              ✕
            </button>
          </li>
        ))}
        {adding && (
          <li>
            <TextInput
              aria-label={`Finish step ${steps.length + 1}`}
              value=""
              onChange={(text) => {
                const typing = list.current?.lastElementChild?.contains(document.activeElement) ?? false;
                const applied = change([...steps, text], () => {
                  if (typing) addButton.current?.focus();
                });
                if (applied) setAdding(false);
                return applied;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
              onBlur={() => setAdding(false)}
            />
          </li>
        )}
      </ol>
      <button ref={addButton} type="button" disabled={adding || steps.length >= MAX_FINISH_STEPS} onClick={() => setAdding(true)}>
        Add a finish step
      </button>
      <p className="muted">These steps come after the assembly steps. They do not change the parts or the cut plan.</p>
    </fieldset>
  );
}
