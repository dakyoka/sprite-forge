"use client";
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** エラー時に表示するフォールバック(関数なら reset を受け取れる)。 */
  fallback?: ReactNode | ((reset: () => void) => ReactNode);
}

interface State {
  hasError: boolean;
}

/**
 * 描画/マウント時の例外を捕捉する汎用 ErrorBoundary。
 * 主用途: iPad Safari など WebGL/ポストプロセスが失敗しうる環境で 3D <Canvas> を
 * 包み、WebGL 失敗が React ツリー全体を巻き込んで「何もタップできない」状態に
 * なるのを防ぐ。失敗してもフォールバックを出し、周囲の UI は生かす。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // 開発時の手掛かりとして残す(本番でも害はない)。
    console.error("[ErrorBoundary]", error);
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      const { fallback } = this.props;
      if (typeof fallback === "function") return fallback(this.reset);
      return fallback ?? null;
    }
    return this.props.children;
  }
}
