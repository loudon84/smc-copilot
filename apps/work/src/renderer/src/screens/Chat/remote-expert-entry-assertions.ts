import { screen } from "@testing-library/react";

/** Shared oracle for Remote Expert Entry visibility in Chat integration tests. */
export function expectRemoteExpertEntryVisible(): void {
  const control = screen.getByRole("combobox");
  if (!control) {
    throw new Error("Remote Expert entry combobox is missing");
  }
}
