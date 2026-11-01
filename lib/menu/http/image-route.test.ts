import { ConvexError } from "convex/values";
import { describe, expect, test, vi } from "vitest";
import { MENU_ERROR } from "../errors/core";
import { MENU_MEDIA_ERROR } from "../errors/media";
import {
  processMenuImage,
  statusForMenuMediaCode,
  type MenuImageRouteDeps,
  type MenuMediaPort,
  type MenuUploadContext,
} from "./image-route";
import type { MenuImageVersions } from "./image-transform";

const SECRET = "pipeline-secret";
const CONVEX_URL = "https://example.convex.cloud";
const TOKEN = "session-token";
const BODY = { uploadId: "upload_1", storageId: "storage-1" };

const READY: Extract<MenuUploadContext, { status: "ready" }> = {
  status: "ready",
  originalUrl: "https://example.convex.cloud/original",
  maxDimension: 2400,
  uploads: { avif: "https://up/avif", webp: "https://up/webp", thumb: "https://up/thumb" },
};

const VERSIONS: MenuImageVersions = {
  avif: { data: Buffer.from("avif-bytes"), width: 2400, height: 1800 },
  webp: { data: Buffer.from("webp-bytes-longer"), width: 2400, height: 1800 },
  thumb: { data: Buffer.from("thumb"), width: 512, height: 384 },
};

function setup(overrides: {
  context?: () => Promise<MenuUploadContext>;
  commit?: () => Promise<{ mediaId: string }>;
  failUpload?: () => Promise<unknown>;
  fetchBytes?: () => Promise<Buffer | null>;
  putVariant?: (url: string) => Promise<string | null>;
  transform?: () => Promise<MenuImageVersions>;
  deps?: Partial<MenuImageRouteDeps>;
} = {}) {
  const uploadContext = vi.fn(overrides.context ?? (async () => READY));
  const failUpload = vi.fn(overrides.failUpload ?? (async () => null));
  const commitProcessed = vi.fn(overrides.commit ?? (async () => ({ mediaId: "media_1" })));
  const mediaPort: MenuMediaPort = { uploadContext, failUpload, commitProcessed };
  const port = vi.fn<(convexUrl: string, token: string) => MenuMediaPort>(() => mediaPort);
  const fetchBytes = vi.fn(overrides.fetchBytes ?? (async () => Buffer.from("original")));
  const putVariant = vi.fn(
    overrides.putVariant ??
      (async (url: string) => `ref:${url.split("/").pop()}`),
  );
  const transform = vi.fn(overrides.transform ?? (async () => VERSIONS));
  const deps: MenuImageRouteDeps = {
    token: TOKEN,
    secret: SECRET,
    convexUrl: CONVEX_URL,
    port,
    fetchBytes,
    putVariant,
    transform,
    ...overrides.deps,
  };
  return { deps, port, uploadContext, failUpload, commitProcessed, fetchBytes, putVariant, transform };
}

describe("processMenuImage: configuration and request checks", () => {
  test("missing secret answers 503 media/disabled", async () => {
    const t = setup({ deps: { secret: undefined } });
    const result = await processMenuImage(BODY, t.deps);
    expect(result).toEqual({ status: 503, body: { ok: false, code: MENU_MEDIA_ERROR.disabled } });
    expect(t.port).not.toHaveBeenCalled();
  });

  test("empty secret answers 503 media/disabled", async () => {
    const t = setup({ deps: { secret: "" } });
    expect((await processMenuImage(BODY, t.deps)).status).toBe(503);
  });

  test("missing convexUrl answers 503 media/disabled", async () => {
    const t = setup({ deps: { convexUrl: undefined } });
    const result = await processMenuImage(BODY, t.deps);
    expect(result).toEqual({ status: 503, body: { ok: false, code: MENU_MEDIA_ERROR.disabled } });
    expect(t.port).not.toHaveBeenCalled();
  });

  test("no session token answers 401 menu/unauthenticated", async () => {
    const t = setup({ deps: { token: null } });
    const result = await processMenuImage(BODY, t.deps);
    expect(result).toEqual({ status: 401, body: { ok: false, code: MENU_ERROR.unauthenticated } });
    expect(t.port).not.toHaveBeenCalled();
    expect(t.uploadContext).not.toHaveBeenCalled();
  });

  test("disabled is checked before the token", async () => {
    const t = setup({ deps: { secret: undefined, token: null } });
    expect((await processMenuImage(BODY, t.deps)).status).toBe(503);
  });

  test.each([
    ["null", null],
    ["a string", "uploadId"],
    ["a number", 5],
    ["an empty object", {}],
    ["missing storageId", { uploadId: "a" }],
    ["missing uploadId", { storageId: "a" }],
    ["non-string ids", { uploadId: 1, storageId: 2 }],
    ["empty ids", { uploadId: "", storageId: "" }],
    ["uploadId with a slash", { uploadId: "a/b", storageId: "ok" }],
    ["storageId with a slash", { uploadId: "ok", storageId: "../x" }],
    ["uploadId over 128 characters", { uploadId: "a".repeat(129), storageId: "ok" }],
    ["storageId over 128 characters", { uploadId: "ok", storageId: "b".repeat(129) }],
  ])("bad body (%s) answers 400 menu/invalid_input", async (_label, body) => {
    const t = setup();
    const result = await processMenuImage(body, t.deps);
    expect(result).toEqual({ status: 400, body: { ok: false, code: MENU_ERROR.invalidInput } });
    expect(t.uploadContext).not.toHaveBeenCalled();
  });

  test("ids of exactly 128 characters are accepted", async () => {
    const t = setup();
    const ids = { uploadId: "a".repeat(128), storageId: "b".repeat(128) };
    const result = await processMenuImage(ids, t.deps);
    expect(result.status).toBe(200);
    expect(t.uploadContext).toHaveBeenCalledWith({ secret: SECRET, ...ids });
  });

  test("the port is created with (convexUrl, token) and the claim gets the secret and the ids", async () => {
    const t = setup();
    await processMenuImage(BODY, t.deps);
    expect(t.port).toHaveBeenCalledTimes(1);
    expect(t.port).toHaveBeenCalledWith(CONVEX_URL, TOKEN);
    expect(t.uploadContext).toHaveBeenCalledWith({ secret: SECRET, uploadId: BODY.uploadId, storageId: BODY.storageId });
  });

  test("extra body fields are ignored", async () => {
    const t = setup();
    await processMenuImage({ ...BODY, evil: "x" }, t.deps);
    expect(t.uploadContext).toHaveBeenCalledWith({ secret: SECRET, uploadId: BODY.uploadId, storageId: BODY.storageId });
  });
});

describe("processMenuImage: uploadContext refusals", () => {
  test.each([
    [MENU_ERROR.notFound, 404],
    [MENU_MEDIA_ERROR.wrongState, 409],
    [MENU_MEDIA_ERROR.invalidSecret, 503],
    [MENU_ERROR.forbidden, 403],
    [MENU_ERROR.unauthenticated, 401],
    [MENU_ERROR.editingDisabled, 403],
    [MENU_ERROR.serviceInactive, 403],
    ["media/something_new", 502],
  ])("ConvexError(%s) answers %i with that code", async (code, status) => {
    const t = setup({
      context: async () => {
        throw new ConvexError(code);
      },
    });
    const result = await processMenuImage(BODY, t.deps);
    expect(result).toEqual({ status, body: { ok: false, code } });
    expect(t.fetchBytes).not.toHaveBeenCalled();
    expect(t.transform).not.toHaveBeenCalled();
  });

  test("a non-Convex error answers 502 with no code", async () => {
    const t = setup({
      context: async () => {
        throw new Error("network down");
      },
    });
    expect(await processMenuImage(BODY, t.deps)).toEqual({ status: 502, body: { ok: false } });
  });

  test("a ConvexError with non-string data answers 502 with no code", async () => {
    const t = setup({
      context: async () => {
        throw new ConvexError({ reason: "x" });
      },
    });
    expect(await processMenuImage(BODY, t.deps)).toEqual({ status: 502, body: { ok: false } });
  });
});

describe("processMenuImage: context done and refused", () => {
  test("done answers 200 with that mediaId and never transforms", async () => {
    const t = setup({ context: async () => ({ status: "done", mediaId: "media_existing" }) });
    const result = await processMenuImage(BODY, t.deps);
    expect(result).toEqual({ status: 200, body: { ok: true, mediaId: "media_existing" } });
    expect(t.fetchBytes).not.toHaveBeenCalled();
    expect(t.transform).not.toHaveBeenCalled();
    expect(t.putVariant).not.toHaveBeenCalled();
    expect(t.commitProcessed).not.toHaveBeenCalled();
  });

  test.each([
    [MENU_MEDIA_ERROR.tooLarge, 413],
    [MENU_MEDIA_ERROR.wrongType, 422],
    [MENU_MEDIA_ERROR.heic, 422],
    [MENU_MEDIA_ERROR.empty, 422],
  ])("refused with %s answers %i", async (code, status) => {
    const t = setup({ context: async () => ({ status: "refused", code }) });
    const result = await processMenuImage(BODY, t.deps);
    expect(result).toEqual({ status, body: { ok: false, code } });
    expect(t.fetchBytes).not.toHaveBeenCalled();
    expect(t.transform).not.toHaveBeenCalled();
  });
});

describe("processMenuImage: fetch and transform", () => {
  test("fetchBytes null answers 502 and does not transform", async () => {
    const t = setup({ fetchBytes: async () => null });
    expect(await processMenuImage(BODY, t.deps)).toEqual({ status: 502, body: { ok: false } });
    expect(t.fetchBytes).toHaveBeenCalledWith(READY.originalUrl);
    expect(t.transform).not.toHaveBeenCalled();
    expect(t.failUpload).not.toHaveBeenCalled();
  });

  test("transform receives the original bytes and the context's maxDimension", async () => {
    const original = Buffer.from("the-original");
    const t = setup({ fetchBytes: async () => original });
    await processMenuImage(BODY, t.deps);
    expect(t.transform).toHaveBeenCalledWith(original, 2400);
  });

  test("transform throws: failUpload with the uploadId and 422 media/unreadable", async () => {
    const t = setup({
      transform: async () => {
        throw new Error("Input buffer contains unsupported image format");
      },
    });
    const result = await processMenuImage(BODY, t.deps);
    expect(result).toEqual({ status: 422, body: { ok: false, code: MENU_MEDIA_ERROR.unreadable } });
    expect(t.failUpload).toHaveBeenCalledTimes(1);
    expect(t.failUpload).toHaveBeenCalledWith({ secret: SECRET, uploadId: BODY.uploadId });
    expect(t.putVariant).not.toHaveBeenCalled();
    expect(t.commitProcessed).not.toHaveBeenCalled();
  });

  test("transform throws and failUpload throws too: still 422 media/unreadable", async () => {
    const t = setup({
      transform: async () => {
        throw new Error("bad image");
      },
      failUpload: async () => {
        throw new ConvexError(MENU_MEDIA_ERROR.wrongState);
      },
    });
    const result = await processMenuImage(BODY, t.deps);
    expect(result).toEqual({ status: 422, body: { ok: false, code: MENU_MEDIA_ERROR.unreadable } });
    expect(t.failUpload).toHaveBeenCalledTimes(1);
  });
});

describe("processMenuImage: variants and commit", () => {
  test.each([
    ["avif", "https://up/avif"],
    ["webp", "https://up/webp"],
    ["thumb", "https://up/thumb"],
  ])("a failed %s upload answers 502 and does not commit", async (_name, failing) => {
    const t = setup({ putVariant: async (url) => (url === failing ? null : `ref:${url}`) });
    expect(await processMenuImage(BODY, t.deps)).toEqual({ status: 502, body: { ok: false } });
    expect(t.commitProcessed).not.toHaveBeenCalled();
    expect(t.failUpload).not.toHaveBeenCalled();
  });

  test("each variant goes to its own upload URL with its content type", async () => {
    const t = setup();
    await processMenuImage(BODY, t.deps);
    expect(t.putVariant).toHaveBeenCalledTimes(3);
    expect(t.putVariant).toHaveBeenCalledWith(READY.uploads.avif, VERSIONS.avif.data, "image/avif");
    expect(t.putVariant).toHaveBeenCalledWith(READY.uploads.webp, VERSIONS.webp.data, "image/webp");
    expect(t.putVariant).toHaveBeenCalledWith(READY.uploads.thumb, VERSIONS.thumb.data, "image/webp");
  });

  test("success commits once with the three refs, sizes, bytes, the same secret and ids, answers 200", async () => {
    const t = setup({
      putVariant: async (url) => `ref-${url.split("/").pop()}`,
      commit: async () => ({ mediaId: "media_new" }),
    });
    const result = await processMenuImage(BODY, t.deps);
    expect(result).toEqual({ status: 200, body: { ok: true, mediaId: "media_new" } });
    expect(t.commitProcessed).toHaveBeenCalledTimes(1);
    expect(t.commitProcessed).toHaveBeenCalledWith({
      secret: SECRET,
      uploadId: BODY.uploadId,
      storageId: BODY.storageId,
      variants: {
        avif: { ref: "ref-avif", width: 2400, height: 1800, bytes: VERSIONS.avif.data.length },
        webp: { ref: "ref-webp", width: 2400, height: 1800, bytes: VERSIONS.webp.data.length },
        thumb: { ref: "ref-thumb", width: 512, height: 384, bytes: VERSIONS.thumb.data.length },
      },
    });
    expect(t.failUpload).not.toHaveBeenCalled();
  });

  test.each([
    [MENU_ERROR.forbidden, 403],
    [MENU_MEDIA_ERROR.wrongState, 409],
    [MENU_MEDIA_ERROR.invalidSecret, 503],
  ])("commit refusing with %s answers %i", async (code, status) => {
    const t = setup({
      commit: async () => {
        throw new ConvexError(code);
      },
    });
    expect(await processMenuImage(BODY, t.deps)).toEqual({ status, body: { ok: false, code } });
  });

  test("commit throwing a plain error answers 502", async () => {
    const t = setup({
      commit: async () => {
        throw new Error("boom");
      },
    });
    expect(await processMenuImage(BODY, t.deps)).toEqual({ status: 502, body: { ok: false } });
  });
});

describe("statusForMenuMediaCode", () => {
  test.each([
    [MENU_ERROR.unauthenticated, 401],
    [MENU_ERROR.forbidden, 403],
    [MENU_ERROR.editingDisabled, 403],
    [MENU_ERROR.serviceInactive, 403],
    [MENU_ERROR.notFound, 404],
    [MENU_MEDIA_ERROR.wrongState, 409],
    [MENU_MEDIA_ERROR.tooLarge, 413],
    [MENU_MEDIA_ERROR.wrongType, 422],
    [MENU_MEDIA_ERROR.heic, 422],
    [MENU_MEDIA_ERROR.empty, 422],
    [MENU_MEDIA_ERROR.unreadable, 422],
    [MENU_MEDIA_ERROR.disabled, 503],
    [MENU_MEDIA_ERROR.invalidSecret, 503],
    [MENU_MEDIA_ERROR.tooMany, 502],
    [MENU_ERROR.invalidInput, 502],
    ["unknown/code", 502],
  ])("%s -> %i", (code, status) => {
    expect(statusForMenuMediaCode(code)).toBe(status);
  });
});
