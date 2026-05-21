/*
文件说明: 校验项目级 npm scripts 指向真实的生产运行入口。
对应文档: README.md / README.zh-CN.md
*/

import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

describe("package scripts", () => {
  it("starts the compiled server entrypoint", () => {
    expect(packageJson.scripts.start).toBe("node dist/src/server.js");
  });
});
