import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AppLayout from "../src/components/AppLayout";
import { authState, renderWithAuth } from "./helpers/auth";

describe("real AppLayout navigation authorization", () => {
  it("shows Reports and existing Admin-only Settings to Admins", () => {
    renderWithAuth(<AppLayout />, authState("ADMIN"));
    const navigation = within(screen.getByRole("navigation"));
    expect(navigation.getByRole("link", { name: "Reports" })).toHaveAttribute("href", "/reports");
    expect(navigation.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });

  it("hides Admin navigation while retaining Receptionist operational links", () => {
    renderWithAuth(<AppLayout />, authState("RECEPTIONIST"));
    const navigation = within(screen.getByRole("navigation"));
    expect(navigation.queryByRole("link", { name: "Reports" })).not.toBeInTheDocument();
    expect(navigation.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
    for (const [name, path] of [
      ["Dashboard", "/dashboard"], ["Manage Members", "/members"],
      ["Membership Plans", "/plans"], ["Payments", "/payments"],
      ["Attendance", "/attendance"], ["Attention Center", "/attention"],
    ]) {
      expect(navigation.getByRole("link", { name })).toHaveAttribute("href", path);
    }
  });
});
