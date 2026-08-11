import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface ContentErrorBoundaryProps {
  children: ReactNode;
  /** Rendered instead of a broken block; receives the caught error message. */
  fallback: (message: string) => ReactNode;
}

interface ContentErrorBoundaryState {
  error: Error | null;
}

/**
 * Isolates a single rich-content block (Mermaid/SVG/Artifact) so a render
 * exception there doesn't blank the rest of the message.
 */
export class ContentErrorBoundary extends Component<
  ContentErrorBoundaryProps,
  ContentErrorBoundaryState
> {
  state: ContentErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ContentErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[rich-content] block render failed:", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return this.props.fallback(this.state.error.message || "Render failed");
    }
    return this.props.children;
  }
}
