import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; fallbackTitle?: string };
type State = { error: Error | null };

export class HermesPageErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[HermesPage]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="hermes-page-error" role="alert">
          <p className="hermes-page-error__title">
            {this.props.fallbackTitle ?? "页面加载失败"}
          </p>
          <p className="hermes-page-error__message">{this.state.error.message}</p>
          <button
            type="button"
            className="hermes-btn-primary"
            onClick={() => this.setState({ error: null })}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
