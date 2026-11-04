import { describe, expect, it } from "vitest";
import { testsFromTail } from "./tests.js";

describe("testsFromTail", () => {
  it("reads a passing vitest run", () => {
    expect(testsFromTail(" Test Files  1 passed (1)\n Tests  5 passed (5)\n")).toEqual({ pass: true });
  });
  it("reads a failing vitest run with counts", () => {
    expect(testsFromTail(" Test Files  1 failed (1)\n Tests  3 failed | 2 passed (5)\n")).toEqual({
      pass: false,
      detail: "3 failed",
    });
  });
  it("fails on mixed counts", () => {
    expect(testsFromTail("2 passed, 1 failed")).toEqual({ pass: false, detail: "1 failed" });
  });
  it("does not count a run with no tests as passing", () => {
    expect(testsFromTail("0 passed, 0 failed").pass).toBeNull();
  });
  it("treats 0 failed as passing", () => {
    expect(testsFromTail("5 passed, 0 failed")).toEqual({ pass: true });
  });
  it("ignores 'failed to' prose", () => {
    expect(testsFromTail("failed to connect to localhost\n5 passed")).toEqual({ pass: true });
  });
  it("reads jest and pytest summaries", () => {
    expect(testsFromTail("Tests: 2 passed, 2 total")).toEqual({ pass: true });
    expect(testsFromTail("==== 1 failed, 4 passed in 2.1s ====")).toEqual({ pass: false, detail: "1 failed" });
  });
  it("reads pytest FAILED lines", () => {
    expect(testsFromTail("FAILED test_login.py::test_expired - assert 401 == 200\n")).toEqual({
      pass: false,
      detail: "FAILED test_login.py::test_expired",
    });
  });
  it("reads cargo and go results", () => {
    expect(testsFromTail("test result: ok. 12 passed; 0 failed;")).toEqual({ pass: true });
    expect(testsFromTail("test result: FAILED. 10 passed; 2 failed;")).toEqual({ pass: false, detail: "2 failed" });
    expect(testsFromTail("ok  \tmypkg\t0.4s")).toEqual({ pass: true });
    expect(testsFromTail("FAIL\tmypkg [build failed]")).toEqual({ pass: false, detail: "go tests failed" });
  });
  it("only the last summary counts", () => {
    const tail = ["1 failed", "rerunning…", "ok  \tmypkg\t0.2s"].join("\n");
    expect(testsFromTail(tail)).toEqual({ pass: true });
  });
  it("returns null when no test run is visible", () => {
    expect(testsFromTail("Just some chat output\nwith no summary")).toEqual({ pass: null });
    expect(testsFromTail("")).toEqual({ pass: null });
  });
});
