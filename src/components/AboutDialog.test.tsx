import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AboutDialog } from "./AboutDialog";

afterEach(cleanup);

const props = () => ({
  version: "0.1.0",
  update: { kind: "current" as const },
  updateAction: { kind: "idle" as const },
  showUpdateGuide: false,
  onCheck: vi.fn(),
  onDownload: vi.fn(),
  onInstall: vi.fn(),
  onClose: vi.fn(),
  onOpenLink: vi.fn(),
});

describe("AboutDialog", () => {
  it("shows the current version and routes issue links separately", () => {
    const options = props();
    render(<AboutDialog {...options} />);
    expect(screen.getByText("v0.1.0")).toBeInTheDocument();
    expect(screen.getByText("已是最新发布版本")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "提交问题" }));
    fireEvent.click(screen.getByRole("button", { name: "提出需求建议" }));
    expect(options.onOpenLink).toHaveBeenCalledTimes(2);
    expect(options.onOpenLink.mock.calls[0][0]).toContain("/issues/new?");
    expect(options.onOpenLink.mock.calls[0][0]).not.toBe(options.onOpenLink.mock.calls[1][0]);
    fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
    expect(options.onCheck).toHaveBeenCalledOnce();
  });

  it("links to a validated new release and disables repeated checks in progress", () => {
    const options = props();
    const url = "https://github.com/inuyasha1692/BlackDoc/releases/tag/v0.2.0";
    const { rerender } = render(
      <AboutDialog {...options} update={{ kind: "available", version: "0.2.0", url }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "查看新版本" }));
    expect(options.onOpenLink).toHaveBeenCalledWith(url);
    fireEvent.click(screen.getByRole("button", { name: "下载更新" }));
    expect(options.onDownload).toHaveBeenCalledOnce();
    rerender(<AboutDialog {...options} update={{ kind: "available", version: "0.2.0", url }} updateAction={{ kind: "downloading", percent: 45 }} />);
    expect(screen.getByRole("progressbar", { name: "更新下载进度" })).toHaveAttribute("value", "45");
    rerender(<AboutDialog {...options} update={{ kind: "available", version: "0.2.0", url }} updateAction={{ kind: "ready" }} />);
    fireEvent.click(screen.getByRole("button", { name: "重启并安装" }));
    expect(options.onInstall).toHaveBeenCalledOnce();
    rerender(<AboutDialog {...options} update={{ kind: "checking" }} />);
    expect(screen.getByRole("button", { name: "检查更新" })).toBeDisabled();
  });
});
