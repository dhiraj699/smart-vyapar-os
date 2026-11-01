import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error(`[${this.props.name || 'ErrorBoundary'}]`, error, info?.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
    return (
      <div role="alert" className="m-4 rounded-xl border border-chilli/30 bg-chilli-light p-5">
        <h2 className="text-lg font-bold text-chilli-dark">This section stopped working</h2>
        <p className="mt-1 text-sm text-ink">{this.state.error.message || 'Something unexpected happened.'}</p>
        <p className="mt-1 text-sm text-ink/70">Your cart and other sections are not affected.</p>
        <button type="button" onClick={this.reset} className="btn-ghost mt-3">Reload this section</button>
      </div>
    );
  }
}
