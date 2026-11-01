import { Component, Suspense, type ReactNode } from "react";
import { useLocation } from "react-router";

class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <section role="alert" className="rounded-2xl border border-red-500/25 bg-gym-card p-6">
      <h1 className="text-xl font-black">This page could not be opened</h1>
      <p className="mt-3 text-sm leading-6 text-gym-muted">Check your connection and reload the page. You can also choose another section from the navigation.</p>
      <button onClick={() => window.location.reload()} className="mt-5 min-h-11 rounded-xl bg-gym-orange px-5 font-bold">Reload page</button>
    </section>;
    return this.props.children;
  }
}

// Keep the shell and authorization guards outside the page boundary. A denied
// route never renders its lazy child or starts downloading that page's code.
export default function AsyncPage({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <PageErrorBoundary key={location.pathname}><Suspense fallback={<div role="status" aria-label="Loading page" className="space-y-4 rounded-2xl border border-white/10 bg-gym-card p-6"><p className="text-sm font-semibold text-gym-muted">Opening page…</p><div aria-hidden="true" className="h-8 w-48 rounded-lg bg-white/5" /><div aria-hidden="true" className="h-40 rounded-xl bg-white/5" /></div>}>{children}</Suspense></PageErrorBoundary>;
}
