import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useNavigate } from "react-router";
import AppLayout from "../src/components/AppLayout";
import type { Permission } from "../src/auth/permissions";
import { authState, receptionist, renderWithAuth } from "./helpers/auth";

function RouteControls() {
  const navigate = useNavigate();
  return <><button onClick={() => navigate("/payments/invoices/example/receipts/payment")}>Go to receipt</button><button onClick={() => navigate(-1)}>Back</button></>;
}

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
    fireEvent.click(navigation.getByRole("button", { name: "Finance" }));
    for (const [name, path] of [
      ["Dashboard", "/dashboard"], ["Manage Members", "/members"],
      ["Membership Plans", "/plans"], ["Payments & Invoices", "/payments"],
      ["Attendance", "/attendance"], ["Attention Center", "/attention"],
    ]) {
      expect(navigation.getByRole("link", { name })).toHaveAttribute("href", path);
    }
  });
});

describe("Finance navigation disclosure", () => {
  it("starts collapsed outside financial routes and nests each Admin link exactly once", () => {
    renderWithAuth(<AppLayout />, authState("ADMIN"));
    const toggle = screen.getByRole("button", { name: "Finance" });
    expect(toggle).toHaveAttribute("type", "button");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const controlled = document.getElementById(toggle.getAttribute("aria-controls")!);
    expect(controlled).toHaveAttribute("hidden");
    expect(screen.queryByRole("link", { name: "Payments & Invoices" })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const finance = screen.getByRole("list", { name: "Finance pages" });
    for (const [name, path] of [["Payments & Invoices", "/payments"], ["Expense Management", "/expenses"], ["Daily Cash Closing", "/cash-closing"], ["Closing History", "/closing-history"]]) {
      const links = screen.getAllByRole("link", { name });
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAttribute("href", path);
      expect(links[0].closest("ul")).toBe(finance);
    }
    expect(screen.queryByRole("link", { name: "Payments" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Expenses" })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(controlled).toHaveAttribute("hidden");
  });

  it("shows only Payments & Invoices to an explicitly permitted Receptionist", () => {
    renderWithAuth(<AppLayout />, authState("RECEPTIONIST", { staff: { ...receptionist, permissions: ["invoices.read", "expenses.manage", "cash-closings.manage"] } }));
    fireEvent.click(screen.getByRole("button", { name: "Finance" }));
    const finance = within(screen.getByRole("list", { name: "Finance pages" }));
    expect(finance.getAllByRole("link")).toHaveLength(1);
    expect(finance.getByRole("link", { name: "Payments & Invoices" })).toHaveAttribute("href", "/payments");
    // Unauthorized links must be absent from the DOM, rather than just collapsed.
    for (const label of ["Expense Management", "Daily Cash Closing", "Closing History"]) expect(screen.queryByText(label)).not.toBeInTheDocument();
  });

  it.each<Permission[]>([[], ["payments.read"], ["payments.record"], ["members.read"], ["expenses.manage", "cash-closings.manage"]])("omits Finance when no child is permitted (%j)", (...permissions) => {
    renderWithAuth(<AppLayout />, authState("RECEPTIONIST", { staff: { ...receptionist, permissions } }));
    expect(screen.queryByRole("button", { name: "Finance" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Finance pages", hidden: true })).not.toBeInTheDocument();
  });

  it.each([
    ["/payments", "Payments & Invoices"],
    ["/payments/invoices/example", "Payments & Invoices"],
    ["/payments/invoices/example/receipts/payment", "Payments & Invoices"],
    ["/expenses/", "Expense Management"],
    ["/cash-closing?date=2026-01-15", "Daily Cash Closing"],
    ["/closing-history", "Closing History"],
  ])("expands and highlights the correct child on direct %s navigation", (path, label) => {
    renderWithAuth(<AppLayout />, authState("ADMIN"), path);
    expect(screen.getByRole("button", { name: "Finance" })).toHaveAttribute("aria-expanded", "true");
    const finance = within(screen.getByRole("list", { name: "Finance pages" }));
    const active = finance.getByRole("link", { name: label });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active).toHaveClass("bg-gym-orange");
    expect(finance.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page")).toHaveLength(1);
  });

  it("does not treat a similar path prefix as an active financial route", () => {
    renderWithAuth(<AppLayout />, authState("ADMIN"), "/payments-archive");
    expect(screen.getByRole("button", { name: "Finance" })).toHaveAttribute("aria-expanded", "false");
  });

  it("re-expands after navigation and browser Back even after manual collapse", () => {
    renderWithAuth(<><AppLayout /><RouteControls /></>, authState("ADMIN"), "/payments/invoices/example");
    fireEvent.click(screen.getByRole("button", { name: "Finance" }));
    expect(screen.getByRole("button", { name: "Finance" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Go to receipt" }));
    expect(screen.getByRole("button", { name: "Finance" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Finance" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Finance" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Payments & Invoices" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps keyboard focus on a child after desktop navigation", () => {
    renderWithAuth(<AppLayout />, authState("ADMIN"));
    fireEvent.click(screen.getByRole("button", { name: "Finance" }));
    const link = screen.getByRole("link", { name: "Expense Management" });
    link.focus(); fireEvent.click(link);
    expect(link).toHaveFocus(); expect(link).toHaveAttribute("aria-current", "page");
  });

  it("collapses with Escape and returns keyboard focus to the Finance button", () => {
    renderWithAuth(<AppLayout />, authState("ADMIN"), "/payments");
    const link = screen.getByRole("link", { name: "Payments & Invoices" });
    link.focus(); fireEvent.keyDown(link, { key: "Escape" });
    const toggle = screen.getByRole("button", { name: "Finance" });
    expect(toggle).toHaveFocus(); expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Payments & Invoices" })).not.toBeInTheDocument();
  });

  it("opens mobile navigation with focus and closes it after selecting a financial child", () => {
    renderWithAuth(<AppLayout />, authState("ADMIN"));
    const open = screen.getByRole("button", { name: "Open navigation" });
    expect(open).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(open.getAttribute("aria-controls")!)).toHaveClass("invisible", "lg:visible");
    fireEvent.click(open);
    expect(open).toHaveAttribute("aria-expanded", "true"); expect(screen.getByRole("button", { name: "Close menu" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Finance" }));
    fireEvent.click(screen.getByRole("link", { name: "Payments & Invoices" }));
    expect(open).toHaveAttribute("aria-expanded", "false"); expect(open).toHaveFocus();
    expect(screen.getByRole("button", { name: "Finance" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Payments & Invoices" })).toHaveAttribute("aria-current", "page");
  });

  it("uses Escape first for Finance, then for the mobile drawer", () => {
    renderWithAuth(<AppLayout />, authState("ADMIN"), "/payments");
    const open = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(open);
    const link = screen.getByRole("link", { name: "Payments & Invoices" });
    link.focus(); fireEvent.keyDown(link, { key: "Escape" });
    const finance = screen.getByRole("button", { name: "Finance" });
    expect(finance).toHaveFocus(); expect(open).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(finance, { key: "Escape" });
    expect(open).toHaveAttribute("aria-expanded", "false"); expect(open).toHaveFocus();
  });
});
