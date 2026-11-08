import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AccountScreen from "./AccountScreen";
import { createFakeAuthAdapter } from "@/testing/auth";

describe("AccountScreen", () => {
  it("offers magic-link sign-in and reports success message", async () => {
    const user = userEvent.setup();
    const auth = createFakeAuthAdapter();

    render(
      <AccountScreen
        session={null}
        auth={auth}
        onClose={() => {}}
        onSignOut={() => {}}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Account" });
    expect(dialog).toBeInTheDocument();

    const emailInput = within(dialog).getByRole("textbox", { name: "Email" });
    await user.type(emailInput, "alex@example.com");
    await user.click(within(dialog).getByRole("button", { name: "Send magic link" }));

    expect(auth.calls).toContainEqual({
      method: "signInWithMagicLink",
      email: "alex@example.com",
    });
    expect(within(dialog).getByText(/Check your email/i)).toBeInTheDocument();
  });

  it("shows error message if magic link sign-in fails", async () => {
    const user = userEvent.setup();
    const auth = createFakeAuthAdapter({
      magicLinkError: "Network error sending magic link.",
    });

    render(
      <AccountScreen
        session={null}
        auth={auth}
        onClose={() => {}}
        onSignOut={() => {}}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Account" });
    const emailInput = within(dialog).getByRole("textbox", { name: "Email" });
    await user.type(emailInput, "alex@example.com");
    await user.click(within(dialog).getByRole("button", { name: "Send magic link" }));

    expect(
      within(dialog).getByText("Network error sending magic link."),
    ).toBeInTheDocument();
  });

  it("only offers Google sign-in when configured", () => {
    const unconfigured = createFakeAuthAdapter({ isGoogleConfigured: false });
    const { unmount } = render(
      <AccountScreen
        session={null}
        auth={unconfigured}
        onClose={() => {}}
        onSignOut={() => {}}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /Google/i }),
    ).not.toBeInTheDocument();

    unmount();

    const configured = createFakeAuthAdapter({ isGoogleConfigured: true });
    render(
      <AccountScreen
        session={null}
        auth={configured}
        onClose={() => {}}
        onSignOut={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Google/i }),
    ).toBeInTheDocument();
  });

  it("closes dialog on Close button click and Escape key", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const auth = createFakeAuthAdapter();

    const { rerender } = render(
      <AccountScreen
        session={null}
        auth={auth}
        onClose={onClose}
        onSignOut={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <AccountScreen
        session={null}
        auth={auth}
        onClose={onClose}
        onSignOut={() => {}}
      />,
    );

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("shows session email and handles sign out when signed in", async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    const auth = createFakeAuthAdapter();
    const session = {
      accountId: "acc-1",
      userId: "user-1",
      email: "alex@example.com",
      accessToken: "token",
      refreshToken: "refresh",
      expiresAt: Date.now() + 3600000,
    };

    render(
      <AccountScreen
        session={session}
        auth={auth}
        onClose={() => {}}
        onSignOut={onSignOut}
      />,
    );

    expect(screen.getByText("alex@example.com")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("disables Device handoff while initial sync is pending and enables it once handoffReady is true", async () => {
    const auth = createFakeAuthAdapter({
      handoffUrl: "https://daylabels.app/?handoff=token-123",
    });
    const session = {
      accountId: "acc-1",
      userId: "user-1",
      email: "alex@example.com",
      accessToken: "token",
      refreshToken: "refresh",
      expiresAt: Date.now() + 3600000,
    };

    const { rerender } = render(
      <AccountScreen
        session={session}
        handoffReady={false}
        auth={auth}
        onClose={() => {}}
        onSignOut={() => {}}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Account" });
    const handoffBtn = within(dialog).getByRole("button", {
      name: /Completing initial sync/i,
    });
    expect(handoffBtn).toBeDisabled();
    expect(
      within(dialog).queryByRole("img", { name: /Device handoff QR code/i }),
    ).not.toBeInTheDocument();

    rerender(
      <AccountScreen
        session={session}
        handoffReady={true}
        auth={auth}
        onClose={() => {}}
        onSignOut={() => {}}
      />,
    );

    const readyHandoffBtn = within(dialog).getByRole("button", {
      name: /Send magic link to email/i,
    });
    expect(readyHandoffBtn).toBeEnabled();
    await waitFor(() => {
      expect(
        within(dialog).getByRole("img", { name: /Device handoff QR code/i }),
      ).toBeInTheDocument();
    });
  });

  it("shows error feedback when QR handoff creation fails", async () => {
    const auth = createFakeAuthAdapter({
      handoffCreateError: "Could not create a Device handoff link.",
    });
    const session = {
      accountId: "acc-1",
      userId: "user-1",
      email: "alex@example.com",
      accessToken: "token",
      refreshToken: "refresh",
      expiresAt: Date.now() + 3600000,
    };

    render(
      <AccountScreen
        session={session}
        handoffReady={true}
        auth={auth}
        onClose={() => {}}
        onSignOut={() => {}}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Account" });
    await waitFor(() => {
      expect(
        within(dialog).getByText("Could not create a Device handoff link."),
      ).toBeInTheDocument();
    });
  });
});
