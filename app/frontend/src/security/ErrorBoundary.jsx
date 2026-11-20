import { Component } from 'react';

// A rendering error should never leave a blank page or show internals to the user.
export default class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* intentionally silent: no stack traces in the browser console of a public build */ }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="notfound"><div>
      <div className="notfound__code" aria-hidden="true">!</div>
      <h1>Something went wrong</h1>
      <p>The page could not be displayed. Your data is safe. Reload to continue; if this keeps happening, contact the administrator.</p>
      <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>Reload the portal</button>
    </div></main>;
  }
}
