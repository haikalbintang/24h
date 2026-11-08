import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ColourRadioGroup from "./ColourRadioGroup";
import { LABEL_COLOURS } from "@/domain/labels";

describe("ColourRadioGroup", () => {
  it("renders a fieldset with legend and all label colour options", () => {
    render(
      <ColourRadioGroup name="test-colour" value="blue" onChange={() => {}} />,
    );

    expect(screen.getByRole("group", { name: "Colour" })).toBeInTheDocument();

    for (const colour of LABEL_COLOURS) {
      const radio = screen.getByRole("radio", { name: colour.name });
      expect(radio).toBeInTheDocument();
      if (colour.id === "blue") {
        expect(radio).toBeChecked();
      } else {
        expect(radio).not.toBeChecked();
      }
    }
  });

  it("calls onChange when a different colour option is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ColourRadioGroup name="test-colour" value="blue" onChange={onChange} />,
    );

    const amberRadio = screen.getByRole("radio", { name: "Amber" });
    await user.click(amberRadio);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("amber");
  });
});
