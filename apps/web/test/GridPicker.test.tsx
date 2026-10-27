import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GridPicker } from "../src/design/GridPicker.tsx";

const cell = (container: HTMLElement, column: number, row: number) => container.querySelector<HTMLElement>(`[data-cell="${column}-${row}"]`)!;

function renderPicker(overrides: Partial<Parameters<typeof GridPicker>[0]> = {}) {
  const onHover = vi.fn();
  const onChange = vi.fn();
  const { container } = render(
    <GridPicker columns={{ min: 1, max: 6 }} rows={{ min: 1, max: 6 }} value={{ columns: 3, rows: 2 }} onHover={onHover} onChange={onChange} {...overrides} />,
  );
  return { container, onHover, onChange, grid: screen.getByRole("grid", { name: /^Grid: / }) };
}

describe("GridPicker", () => {
  it("draws the maximum cells, and marks the cells up to the value", () => {
    const { container } = renderPicker();
    expect(container.querySelectorAll(".grid-picker-cell")).toHaveLength(36);
    const marked = [...container.querySelectorAll<HTMLElement>(".grid-picker-cell.on")].map((node) => node.dataset.cell);
    expect(marked).toEqual(["1-1", "2-1", "3-1", "1-2", "2-2", "3-2"]);
    expect(screen.getByText("3 × 2")).toBeTruthy();
  });

  it("reports the pointer, marks the cells under it, and shows the value again when it leaves", async () => {
    const { container, onHover, grid } = renderPicker();
    await userEvent.hover(cell(container, 5, 4));
    expect(onHover).toHaveBeenLastCalledWith({ columns: 5, rows: 4 });
    expect(screen.getByText("5 × 4")).toBeTruthy();
    expect(container.querySelectorAll(".grid-picker-cell.on")).toHaveLength(20);
    await userEvent.unhover(grid);
    expect(onHover).toHaveBeenLastCalledWith(null);
    expect(screen.getByText("3 × 2")).toBeTruthy();
    expect(container.querySelectorAll(".grid-picker-cell.on")).toHaveLength(6);
  });

  it("sets the size on a click, and never goes below the minimum", async () => {
    const { container, onChange } = renderPicker({ rows: { min: 2, max: 3 }, columns: { min: 2, max: 6 } });
    await userEvent.click(cell(container, 4, 3));
    expect(onChange).toHaveBeenLastCalledWith({ columns: 4, rows: 3 });
    await userEvent.click(cell(container, 1, 1));
    expect(onChange).toHaveBeenLastCalledWith({ columns: 2, rows: 2 });
  });

  it("gives the minimum for a click below it in a one-row grid", async () => {
    const { container, onChange, onHover } = renderPicker({ columns: { min: 2, max: 6 }, rows: { min: 1, max: 1 }, value: { columns: 2, rows: 1 } });
    expect(container.querySelectorAll(".grid-picker-cell")).toHaveLength(6);
    await userEvent.hover(cell(container, 1, 1));
    expect(onHover).toHaveBeenLastCalledWith({ columns: 2, rows: 1 });
    await userEvent.click(cell(container, 1, 1));
    expect(onChange).toHaveBeenLastCalledWith({ columns: 2, rows: 1 });
  });

  it("is one focusable element with the size in its name", () => {
    const { grid } = renderPicker();
    expect(grid.getAttribute("aria-label")).toBe("Grid: 3 columns, 2 rows");
    expect(grid.tabIndex).toBe(0);
    expect(screen.getAllByRole("grid")).toHaveLength(1);
  });

  it("names a single column or row in the singular", () => {
    const { grid } = renderPicker({ value: { columns: 1, rows: 1 } });
    expect(grid.getAttribute("aria-label")).toBe("Grid: 1 column, 1 row");
  });

  it("moves the size with the arrow keys, and stops at the limits", () => {
    const { grid, onChange } = renderPicker();
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith({ columns: 3, rows: 3 });
    fireEvent.keyDown(grid, { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith({ columns: 3, rows: 1 });
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith({ columns: 4, rows: 2 });
    fireEvent.keyDown(grid, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith({ columns: 2, rows: 2 });
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it("makes no change at the edge of the range", () => {
    const wide = renderPicker({ value: { columns: 6, rows: 2 } });
    fireEvent.keyDown(wide.grid, { key: "ArrowRight" });
    expect(wide.onChange).not.toHaveBeenCalled();
    wide.container.remove();
    const narrow = renderPicker({ value: { columns: 1, rows: 2 } });
    fireEvent.keyDown(narrow.grid, { key: "ArrowLeft" });
    expect(narrow.onChange).not.toHaveBeenCalled();
  });

  it("ignores other keys", () => {
    const { grid, onChange } = renderPicker();
    fireEvent.keyDown(grid, { key: "a" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
