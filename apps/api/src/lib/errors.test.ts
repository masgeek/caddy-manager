import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "./errors";

describe("API error handler", () => {
  it("returns unexpected backend errors to API clients", () => {
    const send = vi.fn();
    const status = vi.fn().mockReturnValue({ send });

    errorHandler(
      new Error("database connection refused"),
      { log: { error: vi.fn() } },
      { status },
    );

    expect(status).toHaveBeenCalledWith(500);
    expect(send).toHaveBeenCalledWith({
      statusCode: 500,
      message: "database connection refused",
    });
  });
});
