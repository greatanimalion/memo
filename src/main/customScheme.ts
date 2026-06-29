import { protocol } from "electron";
import fs from "fs";
import path from "path";

const MIME_TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".html": "text/html",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

export class CustomScheme {
  private static getMimeType(extension: string): string {
    return MIME_TYPES[extension] || "";
  }

  static registerScheme() {
    protocol.registerStreamProtocol("app", (request, callback) => {
      let pathName = new URL(request.url).pathname;
      let extension = path.extname(pathName).toLowerCase();
      if (extension === "") {
        pathName = path.join(pathName, "index.html");
        extension = ".html";
      }
      const normalized = path
        .normalize(pathName)
        .replace(/^(\.\.(\/|\\|$))+/, "");
      const tarFile = path.join(__dirname, normalized);
      if (!tarFile.startsWith(__dirname)) {
        callback({ statusCode: 403 });
        return;
      }
      try {
        const stream = fs.createReadStream(tarFile);
        stream.on("error", () => {
          callback({ statusCode: 404 });
        });
        callback({
          statusCode: 200,
          headers: {
            "content-type":
              this.getMimeType(extension) || "application/octet-stream",
          },
          data: stream,
        });
      } catch {
        callback({ statusCode: 404 });
      }
    });
  }
}
