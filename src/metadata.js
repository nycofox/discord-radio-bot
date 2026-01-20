import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

function pickHttpLib(url) {
  return url.startsWith("https:") ? https : http;
}

/**
 * Connects to a radio stream and listens for ICY metadata (StreamTitle).
 * Calls onTitle(title) when it changes.
 */
export function listenIcyStreamTitle(streamUrl, { onTitle, onError } = {}) {
  let stopped = false;
  let req = null;

  const start = () => {
    const u = new URL(streamUrl);
    const lib = pickHttpLib(u.href);

    req = lib.request(
      u,
      {
        headers: {
          // Request ICY metadata
          "Icy-MetaData": "1",
          "User-Agent": "discord-radio-bot"
        }
      },
      (res) => {
        const metaintHeader = res.headers["icy-metaint"];
        const metaint = metaintHeader ? parseInt(metaintHeader, 10) : 0;

        if (!metaint || Number.isNaN(metaint)) {
          onError?.(new Error("No icy-metaint header (station may not provide ICY metadata)."));
          res.resume(); // drain
          return;
        }

        let bytesUntilMeta = metaint;
        let metaLen = 0;
        let metaBuf = Buffer.alloc(0);

        res.on("data", (chunk) => {
          if (stopped) return;

          let offset = 0;
          while (offset < chunk.length) {
            if (bytesUntilMeta > 0) {
              const toSkip = Math.min(bytesUntilMeta, chunk.length - offset);
              offset += toSkip;
              bytesUntilMeta -= toSkip;
              if (bytesUntilMeta > 0) continue;
            }

            // We are at metadata length byte
            if (metaLen === 0) {
              if (offset >= chunk.length) break;
              metaLen = chunk[offset] * 16; // length byte * 16
              offset += 1;

              metaBuf = Buffer.alloc(0);

              if (metaLen === 0) {
                // No metadata this interval; reset
                bytesUntilMeta = metaint;
                continue;
              }
            }

            // Collect metadata bytes
            const remaining = chunk.length - offset;
            const needed = metaLen - metaBuf.length;
            const take = Math.min(needed, remaining);

            metaBuf = Buffer.concat([metaBuf, chunk.subarray(offset, offset + take)]);
            offset += take;

            if (metaBuf.length === metaLen) {
              // Parse
              const metaStr = metaBuf.toString("utf8").replace(/\0+$/g, "");
              // Typical format: StreamTitle='Artist - Track';StreamUrl='';
              const match = metaStr.match(/StreamTitle='([^']*)'/);
              const title = match?.[1]?.trim();

              if (title) onTitle?.(title);

              // Reset for next interval
              metaLen = 0;
              bytesUntilMeta = metaint;
            }
          }
        });

        res.on("error", (err) => onError?.(err));
      }
    );

    req.on("error", (err) => onError?.(err));
    req.end();
  };

  start();

  return {
    stop() {
      stopped = true;
      try {
        req?.destroy();
      } catch {}
    }
  };
}
