import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { AuthForm } from "./AuthForm";

vi.mock("@convex-dev/auth/react", () => ({ useAuthActions: () => ({ signIn: vi.fn() }) }));

test("sign-in form offers password recovery", () => {
  const html = renderToStaticMarkup(createElement(AuthForm));
  expect(html).toContain("Sign in to your trips");
  expect(html).toContain("Forgot password?");
});
