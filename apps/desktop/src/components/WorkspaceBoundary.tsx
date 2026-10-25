import { Component, type ReactNode } from 'react';
/** A failed lazy import must leave a recoverable destination, never a blank workspace. */
export class WorkspaceBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <section role="alert" className="surface-card workspace-error"><h2>This page could not open</h2><p>Reload Cortex to try again, or choose another destination.</p><button className="button button-secondary" onClick={() => window.location.reload()}>Reload Cortex</button></section> : this.props.children;
  }
}
