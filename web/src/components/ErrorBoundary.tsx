import { Component, type ReactNode } from "react";

/** Keeps a failure in one page from blanking the whole application. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  componentDidCatch(error: Error) {
    console.error("[Artha] view error:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card p-8">
        <div className="font-display text-2xl">This view could not be rendered</div>
        <p className="mt-2 text-xs text-ink2">{this.state.error.message}</p>
        <button className="btn mt-4" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
