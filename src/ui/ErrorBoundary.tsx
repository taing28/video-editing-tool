/**
 * ui/ErrorBoundary — never show the user a blank screen.
 *
 * If any render throws, we catch it and render the message + stack instead of
 * letting React unmount the whole tree (which leaves only the dark body).
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
  info: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App crashed:', error, info.componentStack);
    this.setState({ info: info.componentStack ?? '' });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        style={{
          padding: 24,
          color: '#ffd2d2',
          background: '#1a0f12',
          height: '100vh',
          overflow: 'auto',
          font: '13px/1.5 ui-monospace, monospace',
        }}
      >
        <h2 style={{ color: '#ff6b6b' }}>Something crashed while rendering</h2>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{error.message}</pre>
        <pre style={{ whiteSpace: 'pre-wrap', opacity: 0.7 }}>{error.stack}</pre>
        <pre style={{ whiteSpace: 'pre-wrap', opacity: 0.5 }}>{info}</pre>
      </div>
    );
  }
}
