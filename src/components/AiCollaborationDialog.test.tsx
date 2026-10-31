import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AI_SKILL_INSTALL_PROMPT, AiCollaborationDialog } from "./AiCollaborationDialog";

afterEach(() => { cleanup(); Reflect.deleteProperty(navigator, "clipboard"); });

it("copies the installation prompt and confirms success", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(<AiCollaborationDialog onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "复制安装提示词" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(AI_SKILL_INSTALL_PROMPT));
  expect(screen.getByRole("status")).toHaveTextContent("已复制");
});

it("offers the visible prompt when clipboard access fails", async () => {
  const writeText = vi.fn().mockRejectedValue(new Error("denied"));
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(<AiCollaborationDialog onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "复制安装提示词" }));
  expect(await screen.findByRole("status")).toHaveTextContent("复制失败");
  expect(screen.getByText(AI_SKILL_INSTALL_PROMPT)).toBeInTheDocument();
});
