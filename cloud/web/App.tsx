import {
  ClerkFailed,
  ClerkLoaded,
  ClerkLoading,
  Show,
  SignInButton,
  SignOutButton,
  SignUpButton,
  UserButton,
  useAuth,
  useUser,
} from "@clerk/react";
import { type ReactNode, useEffect, useState } from "react";
import { type Session, sessionSchema } from "../shared/contracts.ts";

export function Page({ children }: { readonly children: ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-18 max-w-5xl items-center justify-between px-6">
          <a
            className="flex items-center gap-3 font-semibold tracking-tight"
            href="/"
            aria-label="Mobius Cloud home"
          >
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-xl bg-zinc-900 text-2xl text-white"
            >
              ∞
            </span>
            Mobius Cloud
          </a>
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
            Your agents. Connected.
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-6 py-16 sm:py-24">{children}</main>
    </div>
  );
}

const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg px-5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-600";

type AccountState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly session: Session }
  | { readonly kind: "error" };

function Account() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [state, setState] = useState<AccountState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(10_000),
    ]);
    function onAbort() {
      if (!controller.signal.aborted) setState({ kind: "error" });
    }
    signal.addEventListener("abort", onAbort, { once: true });
    async function load() {
      try {
        const token = await getToken();
        signal.throwIfAborted();
        if (token === null) {
          setState({ kind: "error" });
          return;
        }
        const response = await fetch("/api/session", {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        });
        if (!response.ok) {
          throw new Error("Session verification failed.");
        }
        const body: unknown = await response.json();
        const session = sessionSchema.parse(body);
        signal.throwIfAborted();
        setState({ kind: "ready", session });
      } catch {
        if (!controller.signal.aborted) setState({ kind: "error" });
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
    }
    void load();
    return () => {
      controller.abort();
      signal.removeEventListener("abort", onAbort);
    };
  }, [getToken]);

  let content: ReactNode;
  switch (state.kind) {
    case "loading":
      content = (
        <p role="status" className="text-zinc-600">
          Verifying your account…
        </p>
      );
      break;
    case "error":
      content = (
        <p role="alert" className="text-red-700">
          We couldn't verify your session. Please reload or sign in again.
        </p>
      );
      break;
    case "ready":
      content = (
        <>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-violet-700">
            Account connected
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            You're signed in.
          </h1>
          <p className="mt-4 break-words text-zinc-600">
            {user?.primaryEmailAddress?.emailAddress ??
              user?.username ??
              state.session.userId}
          </p>
          <p className="mt-6 text-sm leading-6 text-zinc-500">
            Welcome to Mobius Cloud. You can manage your profile and account
            from the menu above.
          </p>
        </>
      );
      break;
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
      <div className="mb-8 flex justify-end">
        <UserButton />
      </div>
      {content}
      <div className="mt-8 border-t border-zinc-100 pt-6">
        <SignOutButton redirectUrl="/">
          <button
            type="button"
            className={`${buttonClass} border border-zinc-300 bg-white hover:bg-zinc-50`}
          >
            Sign out
          </button>
        </SignOutButton>
      </div>
    </section>
  );
}

export function App() {
  const { userId } = useAuth();
  return (
    <Page>
      <ClerkLoading>
        <p role="status" className="text-zinc-600">
          Loading sign-in…
        </p>
      </ClerkLoading>
      <ClerkFailed>
        <p role="alert" className="text-red-700">
          Sign-in is temporarily unavailable. Please try again later.
        </p>
      </ClerkFailed>
      <ClerkLoaded>
        <Show when="signed-out">
          <section className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-violet-700">
              A place for your agents
            </p>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight">
              Welcome to Mobius Cloud
            </h1>
            <p className="mt-4 leading-7 text-zinc-600">
              Sign in to your account, or create one to get started.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <SignInButton mode="modal">
                <button
                  type="button"
                  className={`${buttonClass} bg-violet-700 text-white hover:bg-violet-800`}
                >
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button
                  type="button"
                  className={`${buttonClass} border border-zinc-300 bg-white hover:bg-zinc-50`}
                >
                  Create account
                </button>
              </SignUpButton>
            </div>
          </section>
        </Show>
        <Show when="signed-in">
          <Account key={userId} />
        </Show>
      </ClerkLoaded>
    </Page>
  );
}
