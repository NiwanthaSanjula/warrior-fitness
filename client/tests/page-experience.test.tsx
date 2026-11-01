import { lazy, useState } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Link, Route, Routes } from "react-router";
import AsyncPage from "../src/components/AsyncPage";
import AppLayout from "../src/components/AppLayout";
import { PermissionRoute } from "../src/components/ProtectedRoute";
import { useWorkflowAnchor } from "../src/hooks/useWorkflowAnchor";
import { authState, receptionist, renderWithAuth } from "./helpers/auth";

describe("page-level loading and recovery", () => {
  it("preserves in-page form state when a query or workflow fragment changes", () => {
    function Editable() {
      const [value, setValue] = useState("");
      return <><input aria-label="Unsaved search" value={value} onChange={event => setValue(event.target.value)} /><Link to="?product=example#retail-restock">Select a workflow</Link></>;
    }
    renderWithAuth(<AsyncPage><Editable /></AsyncPage>, authState("ADMIN"), "/retail/products");
    fireEvent.change(screen.getByRole("textbox", { name: "Unsaved search" }), { target: { value: "Keep this search" } });
    fireEvent.click(screen.getByRole("link", { name: "Select a workflow" }));
    expect(screen.getByRole("textbox", { name: "Unsaved search" })).toHaveValue("Keep this search");
  });
  it("keeps navigation available while a route chunk is pending", async () => {
    let resolve!: (module: { default: () => React.JSX.Element }) => void;
    const Page = lazy(() => new Promise<{ default: () => React.JSX.Element }>(done => { resolve = done; }));
    renderWithAuth(<Routes><Route element={<AppLayout />}><Route path="/dashboard" element={<AsyncPage><Page /></AsyncPage>} /></Route></Routes>, authState("ADMIN"));
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading page" })).toBeInTheDocument();
    await act(async () => resolve({ default: () => <h1>Loaded module</h1> }));
    expect(screen.getByRole("heading", { name: "Loaded module" })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading page" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Skip to page content" })).toHaveAttribute("href", "#main-content");
  });
  it("provides safe recovery on a failed chunk and resets the boundary on navigation", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Page = lazy(() => Promise.reject(new Error("Fictional module fetch failure")));
    renderWithAuth(<><Link to="/members">Choose another page</Link><Routes><Route path="/dashboard" element={<AsyncPage><Page /></AsyncPage>} /><Route path="/members" element={<AsyncPage><h1>Members remain available</h1></AsyncPage>} /></Routes></>, authState("ADMIN"));
    expect(await screen.findByRole("heading", { name: "This page could not be opened" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload page" })).toBeInTheDocument();
    expect(screen.queryByText("Fictional module fetch failure")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Choose another page" }));
    expect(await screen.findByRole("heading", { name: "Members remain available" })).toBeInTheDocument();
  });
  it("does not invoke a lazy page loader when its permission guard denies access", async () => {
    const loader = vi.fn(async () => ({ default: () => <h1>Private module</h1> })), Page = lazy(loader);
    renderWithAuth(<Routes><Route path="/members" element={<PermissionRoute permissions={["members.read"]}><AsyncPage><Page /></AsyncPage></PermissionRoute>} /><Route path="/dashboard" element={<h1>Permitted overview</h1>} /></Routes>, authState("RECEPTIONIST", { staff: { ...receptionist, permissions: [] } }), "/members");
    expect(await screen.findByRole("heading", { name: "Permitted overview" })).toBeInTheDocument();
    expect(loader).not.toHaveBeenCalled();
  });
});

function Workflow({ initiallyReady = false }: { initiallyReady?: boolean }) {
  const [ready, setReady] = useState(initiallyReady);
  useWorkflowAnchor(ready, ["retail-restock"]);
  return <><button onClick={() => setReady(!ready)}>Toggle readiness</button><button>Ordinary control</button><Link to="?product=other#retail-restock">Another product</Link>{ready && <section id="retail-restock" tabIndex={-1}>Permitted stock workflow</section>}</>;
}
describe("contextual workflow navigation", () => {
  it("waits for permitted asynchronous content before focusing the target", () => {
    renderWithAuth(<Workflow />, authState("ADMIN"), "/retail/products?product=example#retail-restock");
    expect(document.activeElement?.id).not.toBe("retail-restock");
    fireEvent.click(screen.getByRole("button", { name: "Toggle readiness" }));
    expect(document.activeElement?.id).toBe("retail-restock");
  });
  it("does not steal focus on refresh but handles another workflow navigation", () => {
    renderWithAuth(<Workflow initiallyReady />, authState("ADMIN"), "/retail/products#retail-restock");
    screen.getByRole("button", { name: "Ordinary control" }).focus();
    fireEvent.click(screen.getByRole("button", { name: "Toggle readiness" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle readiness" }));
    expect(screen.getByRole("button", { name: "Ordinary control" })).toHaveFocus();
    fireEvent.click(screen.getByRole("link", { name: "Another product" }));
    expect(document.activeElement?.id).toBe("retail-restock");
  });
  it("ignores unknown fragments instead of focusing arbitrary content", () => {
    renderWithAuth(<Workflow initiallyReady />, authState("ADMIN"), "/retail/products#untrusted-target");
    expect(document.activeElement?.id).not.toBe("retail-restock");
  });
});
