import { Component, type ReactNode } from 'react';
import { Button } from './ui/Button.tsx';

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Catches a render crash in a page and offers a reload instead of a blank screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <h1 className="font-serif text-[28px] text-ink">Something went wrong</h1>
        <p className="mt-3 text-[16px] text-muted">{error.message}</p>
        <Button className="mt-6" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    );
  }
}
