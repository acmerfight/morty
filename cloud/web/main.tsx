import { ClerkProvider } from "@clerk/react";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { publicConfigSchema } from "../shared/contracts.ts";
import { App, Page } from "./App.tsx";
import "./style.css";

type ConfigurationState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly publishableKey: string }
  | { readonly kind: "error" };

function Bootstrap() {
  const [state, setState] = useState<ConfigurationState>({ kind: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(10_000),
    ]);
    async function load() {
      try {
        const response = await fetch("/api/config", { signal });
        if (!response.ok)
          throw new Error("Sign-in configuration is unavailable.");
        const body: unknown = await response.json();
        const configuration = publicConfigSchema.parse(body);
        signal.throwIfAborted();
        setState({
          kind: "ready",
          publishableKey: configuration.publishableKey,
        });
      } catch {
        if (!controller.signal.aborted) setState({ kind: "error" });
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  switch (state.kind) {
    case "loading":
      return (
        <Page>
          <p role="status" className="text-zinc-600">
            Loading Mobius Cloud…
          </p>
        </Page>
      );
    case "error":
      return (
        <Page>
          <p role="alert" className="text-red-700">
            Sign-in is temporarily unavailable. Please try again later.
          </p>
        </Page>
      );
    case "ready":
      return (
        <ClerkProvider
          publishableKey={state.publishableKey}
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
        >
          <App />
        </ClerkProvider>
      );
  }
}

const root = document.getElementById("root");
if (root === null) throw new Error("Missing application root.");
createRoot(root).render(
  <StrictMode>
    <Bootstrap />
  </StrictMode>,
);
