import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LengthInput, NumberInput, TextInput } from "../src/components/fields.tsx";
import { description } from "./helpers.ts";

describe("LengthInput", () => {
  it("shows the exact value and commits a parsed length on Enter", async () => {
    const onChange = vi.fn();
    render(<LengthInput aria-label="Length" value={15.375} units="in" onChange={onChange} />);
    const input = screen.getByLabelText("Length");
    expect(input).toHaveProperty("value", '15 3/8"');
    await userEvent.clear(input);
    await userEvent.type(input, "1' 2 1/2{Enter}");
    expect(onChange).toHaveBeenCalledWith(14.5);
  });

  it("does not call onChange for a value that shows with ~, when the text stays as it was", async () => {
    const onChange = vi.fn();
    render(<LengthInput aria-label="Length" value={335 / 25.4} units="in" onChange={onChange} />);
    const input = screen.getByLabelText("Length");
    expect(input).toHaveProperty("value", '~13.189"');
    await userEvent.click(input);
    await userEvent.tab();
    await userEvent.click(input);
    await userEvent.keyboard("{Enter}");
    await userEvent.type(input, "5{Backspace}{Enter}");
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveProperty("value", '~13.189"');
  });

  it("keeps rejected text marked on Enter and puts the old value back on blur", async () => {
    const onChange = vi.fn();
    render(<LengthInput aria-label="Length" value={10} units="mm" onChange={onChange} />);
    const input = screen.getByLabelText("Length");
    await userEvent.clear(input);
    await userEvent.type(input, "abc{Enter}");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input).toHaveProperty("value", "abc");
    await userEvent.tab();
    expect(input).toHaveProperty("value", "10 mm");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("says under the field why it cannot read the text, and removes the message when the focus leaves", async () => {
    render(<LengthInput aria-label="Length" value={10} units="in" onChange={vi.fn()} />);
    const input = screen.getByLabelText("Length");
    expect(input.getAttribute("aria-describedby")).toBeNull();
    await userEvent.clear(input);
    await userEvent.type(input, "abc{Enter}");
    const message = 'Type a length, for example 24 1/2, 2\' 3", or 600 mm.';
    expect(description(input)).toBe(message);
    expect(screen.getByText(message).className).toBe("field-error");
    await userEvent.clear(input);
    await userEvent.type(input, "0{Enter}");
    expect(description(input)).toBe("Type a length of more than 0.");
    await userEvent.type(input, "1");
    expect(screen.queryByText("Type a length of more than 0.")).toBeNull();
    await userEvent.clear(input);
    await userEvent.type(input, "{Enter}");
    expect(description(input)).toBe("Type a length.");
    await userEvent.tab();
    expect(input.getAttribute("aria-describedby")).toBeNull();
    expect(screen.queryByText("Type a length.")).toBeNull();
  });

  it("gives millimetre examples in a millimetre project, and keeps its own description", async () => {
    render(
      <>
        <LengthInput aria-label="Length" aria-describedby="hint" value={10} units="mm" onChange={vi.fn()} />
        <span id="hint">The inside size.</span>
      </>,
    );
    const input = screen.getByLabelText("Length");
    await userEvent.clear(input);
    await userEvent.type(input, "0{Enter}");
    expect(description(input)).toBe("The inside size. Type a length of more than 0.");
    await userEvent.clear(input);
    await userEvent.type(input, "x{Enter}");
    expect(description(input)).toBe('The inside size. Type a length, for example 600, 600 mm, or 24 1/2".');
  });

  it("keeps the text marked when onChange refuses the value", async () => {
    const onChange = vi.fn(() => false);
    render(<LengthInput aria-label="Width" value={700} units="mm" onChange={onChange} />);
    const input = screen.getByLabelText("Width");
    await userEvent.clear(input);
    await userEvent.type(input, "20{Enter}");
    expect(onChange).toHaveBeenCalledWith(20);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBeNull();
    expect(input).toHaveProperty("value", "20");
    await userEvent.tab();
    expect(input).toHaveProperty("value", "700 mm");
  });

  it("clears an optional value with blank text, and Escape cancels an edit", async () => {
    const onChange = vi.fn();
    render(<LengthInput aria-label="Trim" value={6} units="mm" optional allowZero onChange={onChange} />);
    const input = screen.getByLabelText("Trim");
    await userEvent.type(input, "9{Escape}");
    expect(input).toHaveProperty("value", "6 mm");
    await userEvent.clear(input);
    await userEvent.tab();
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

describe("NumberInput and TextInput", () => {
  it("accepts only whole numbers at or above the minimum", async () => {
    const onChange = vi.fn();
    render(<NumberInput aria-label="Qty" value={2} integer minimum={1} onChange={onChange} />);
    const input = screen.getByLabelText("Qty");
    await userEvent.clear(input);
    await userEvent.type(input, "0{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    expect(description(input)).toBe("Type a whole number of 1 or more.");
    await userEvent.clear(input);
    await userEvent.type(input, "4{Enter}");
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("refuses whole numbers that are not safe integers and values above the maximum", async () => {
    const onChange = vi.fn();
    render(<NumberInput aria-label="Qty" value={2} integer minimum={1} maximum={100} onChange={onChange} />);
    const input = screen.getByLabelText("Qty");
    for (const text of ["10000000000000000", "9".repeat(400), "101"]) {
      await userEvent.clear(input);
      await userEvent.type(input, `${text}{Enter}`);
    }
    expect(onChange).not.toHaveBeenCalled();
    expect(description(input)).toBe("Type a whole number from 1 to 100.");
    await userEvent.clear(input);
    await userEvent.type(input, "100{Enter}");
    expect(onChange).toHaveBeenCalledWith(100);
  });

  it("trims text and refuses a blank required value", async () => {
    const onChange = vi.fn();
    render(<TextInput aria-label="Name" value="Side" required onChange={onChange} />);
    const input = screen.getByLabelText("Name");
    await userEvent.clear(input);
    await userEvent.tab();
    expect(input).toHaveProperty("value", "Side");
    await userEvent.clear(input);
    await userEvent.type(input, "  Top  {Enter}");
    expect(onChange).toHaveBeenCalledWith("Top");
  });

  it("does not commit a value that equals the current one", async () => {
    const onLength = vi.fn();
    const onNumber = vi.fn();
    const onText = vi.fn();
    render(
      <>
        <LengthInput aria-label="Length" value={30} units="in" onChange={onLength} />
        <NumberInput aria-label="Qty" value={2} onChange={onNumber} />
        <TextInput aria-label="Name" value="Side" onChange={onText} />
      </>,
    );
    await userEvent.clear(screen.getByLabelText("Length"));
    await userEvent.type(screen.getByLabelText("Length"), "30{Enter}");
    await userEvent.clear(screen.getByLabelText("Qty"));
    await userEvent.type(screen.getByLabelText("Qty"), "2.0{Enter}");
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), " Side {Enter}");
    expect(onLength).not.toHaveBeenCalled();
    expect(onNumber).not.toHaveBeenCalled();
    expect(onText).not.toHaveBeenCalled();
  });
});
