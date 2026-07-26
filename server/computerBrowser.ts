import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";

export type BrowserListing = {
  carId: string;
  label: string;
  url: string;
};

export type ComputerAction = {
  type:
    | "click"
    | "double_click"
    | "drag"
    | "move"
    | "scroll"
    | "keypress"
    | "type"
    | "wait"
    | "screenshot";
  x?: number;
  y?: number;
  button?: string;
  keys?: string[];
  text?: string;
  scroll_x?: number;
  scroll_y?: number;
  path?: Array<[number, number] | { x: number; y: number }>;
};

export type ComputerBrowser = {
  runActions: (actions: ComputerAction[]) => Promise<void>;
  screenshot: () => Promise<Buffer>;
  missingListings: () => BrowserListing[];
  close: () => Promise<void>;
};

const resourceHosts = ["pewneauto.pl", "otomoto.pl", "olx.pl", "olxcdn.com"];

const hostMatches = (hostname: string, suffix: string) =>
  hostname === suffix || hostname.endsWith(`.${suffix}`);

export function normalizedListingUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:")
    throw new Error("Ogłoszenie musi używać HTTPS");
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

export function isAllowedBrowserNavigation(
  value: string,
  allowedUrls: ReadonlySet<string>,
) {
  if (value === "about:blank") return true;
  try {
    return allowedUrls.has(normalizedListingUrl(value));
  } catch {
    return false;
  }
}

function isAllowedResource(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      resourceHosts.some((suffix) => hostMatches(url.hostname, suffix))
    );
  } catch {
    return false;
  }
}

function normalizeKey(key: string) {
  const names: Record<string, string> = {
    ENTER: "Enter",
    RETURN: "Enter",
    ESC: "Escape",
    ESCAPE: "Escape",
    TAB: "Tab",
    SPACE: "Space",
    BACKSPACE: "Backspace",
    DELETE: "Delete",
    DEL: "Delete",
    HOME: "Home",
    END: "End",
    PAGEUP: "PageUp",
    PAGEDOWN: "PageDown",
    UP: "ArrowUp",
    ARROWUP: "ArrowUp",
    DOWN: "ArrowDown",
    ARROWDOWN: "ArrowDown",
    LEFT: "ArrowLeft",
    ARROWLEFT: "ArrowLeft",
    RIGHT: "ArrowRight",
    ARROWRIGHT: "ArrowRight",
    CTRL: "Control",
    CONTROL: "Control",
    SHIFT: "Shift",
    OPTION: "Alt",
    ALT: "Alt",
    META: "Meta",
    CMD: "Meta",
    COMMAND: "Meta",
  };
  return names[key.toUpperCase()] || key;
}

function mouseButton(button = "left"): "left" | "right" | "middle" {
  if (button === "left" || button === "right") return button;
  if (button === "wheel" || button === "middle") return "middle";
  throw new Error(`Nieobsługiwany przycisk myszy: ${button}`);
}

function point(action: ComputerAction) {
  if (!Number.isFinite(action.x) || !Number.isFinite(action.y))
    throw new Error(`Akcja ${action.type} wymaga współrzędnych`);
  return { x: action.x!, y: action.y! };
}

function dragPath(action: ComputerAction) {
  if (!Array.isArray(action.path) || action.path.length < 2)
    throw new Error("Akcja drag wymaga co najmniej dwóch punktów");
  return action.path.map((item) =>
    Array.isArray(item) ? item : ([item.x, item.y] as [number, number]),
  );
}

async function withModifiers(
  page: Page,
  keys: string[] | undefined,
  callback: () => Promise<void>,
) {
  const normalized = (keys || []).map(normalizeKey);
  try {
    for (const key of normalized) await page.keyboard.down(key);
    await callback();
  } finally {
    for (const key of normalized.reverse()) await page.keyboard.up(key);
  }
}

async function executeAction(page: Page, action: ComputerAction) {
  switch (action.type) {
    case "click": {
      const { x, y } = point(action);
      await withModifiers(page, action.keys, () =>
        page.mouse.click(x, y, { button: mouseButton(action.button) }),
      );
      break;
    }
    case "double_click": {
      const { x, y } = point(action);
      await withModifiers(page, action.keys, () => page.mouse.dblclick(x, y));
      break;
    }
    case "drag": {
      const [[startX, startY], ...rest] = dragPath(action);
      await withModifiers(page, action.keys, async () => {
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        try {
          for (const [x, y] of rest) await page.mouse.move(x, y);
        } finally {
          await page.mouse.up();
        }
      });
      break;
    }
    case "move": {
      const { x, y } = point(action);
      await withModifiers(page, action.keys, () => page.mouse.move(x, y));
      break;
    }
    case "scroll": {
      const { x, y } = point(action);
      await withModifiers(page, action.keys, async () => {
        await page.mouse.move(x, y);
        await page.mouse.wheel(action.scroll_x || 0, action.scroll_y || 0);
      });
      break;
    }
    case "keypress":
      for (const key of action.keys || [])
        await page.keyboard.press(normalizeKey(key));
      break;
    case "type":
      await page.keyboard.type(action.text || "");
      break;
    case "wait":
      await page.waitForTimeout(2_000);
      break;
    case "screenshot":
      break;
    default:
      throw new Error(`Nieobsługiwana akcja przeglądarki: ${action.type}`);
  }
}

function toolbarScript() {
  return ({ links }: { links: BrowserListing[] }) => {
    const mount = () => {
      if (document.getElementById("corolla-radar-browser-toolbar")) return;
      const toolbar = document.createElement("nav");
      toolbar.id = "corolla-radar-browser-toolbar";
      toolbar.setAttribute("aria-label", "Ogłoszenia TOP 10");
      Object.assign(toolbar.style, {
        position: "fixed",
        inset: "0 0 auto 0",
        zIndex: "2147483647",
        display: "flex",
        gap: "6px",
        alignItems: "center",
        padding: "8px",
        background: "#111827",
        color: "white",
        font: "13px system-ui, sans-serif",
        overflowX: "auto",
        boxShadow: "0 2px 8px rgba(0,0,0,.35)",
      });
      const title = document.createElement("strong");
      title.textContent = "TOP 10:";
      toolbar.append(title);
      links.forEach((link, index) => {
        const anchor = document.createElement("a");
        anchor.href = link.url;
        anchor.textContent = `${index + 1}. ${link.label}`;
        anchor.title = `${link.carId} — ${link.url}`;
        Object.assign(anchor.style, {
          flex: "0 0 auto",
          padding: "6px 9px",
          borderRadius: "6px",
          background: "#374151",
          color: "white",
          textDecoration: "none",
        });
        toolbar.append(anchor);
      });
      document.documentElement.append(toolbar);
    };
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", mount, { once: true });
    else mount();
  };
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

async function closeAll(
  browser: Browser | undefined,
  context: BrowserContext | undefined,
) {
  await context?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
}

export async function createComputerBrowser(
  listings: BrowserListing[],
): Promise<ComputerBrowser> {
  if (!listings.length)
    throw new Error("Brak ogłoszeń dla przeglądarki OpenAI");
  const uniqueListings = listings.filter(
    (listing, index, all) =>
      all.findIndex(
        (candidate) =>
          normalizedListingUrl(candidate.url) ===
          normalizedListingUrl(listing.url),
      ) === index,
  );
  const allowedUrls = new Set(
    uniqueListings.map((listing) => normalizedListingUrl(listing.url)),
  );
  const visitedUrls = new Set<string>();
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      chromiumSandbox: true,
      env: {},
      args: ["--disable-extensions", "--disable-file-system"],
    });
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: "pl-PL",
      acceptDownloads: false,
      permissions: [],
    });
    const page = await context.newPage();
    page.on("framenavigated", (frame) => {
      if (
        frame === page.mainFrame() &&
        frame.url() !== "about:blank" &&
        isAllowedBrowserNavigation(frame.url(), allowedUrls)
      )
        visitedUrls.add(normalizedListingUrl(frame.url()));
    });
    context.on("page", (popup) => {
      if (popup !== page) void popup.close();
    });
    page.on("dialog", (dialog) => void dialog.dismiss());
    page.on("download", (download) => void download.cancel());
    await page.addInitScript(toolbarScript(), {
      links: uniqueListings,
    });
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = request.url();
      if (
        request.isNavigationRequest() &&
        request.frame() === page.mainFrame()
      ) {
        if (
          request.method() === "GET" &&
          isAllowedBrowserNavigation(url, allowedUrls)
        )
          await route.continue();
        else await route.abort("blockedbyclient");
        return;
      }
      if (["GET", "HEAD"].includes(request.method()) && isAllowedResource(url))
        await route.continue();
      else await route.abort("blockedbyclient");
    });
    const links = uniqueListings
      .map(
        (listing, index) =>
          `<li><a href="${escapeHtml(listing.url)}">${index + 1}. ${escapeHtml(listing.label)}</a><br><small>${escapeHtml(listing.carId)}</small></li>`,
      )
      .join("");
    await page.setContent(
      `<!doctype html><html lang="pl"><head><meta charset="utf-8"><style>body{font:18px system-ui;margin:90px 40px;color:#111827}li{margin:14px 0}small{color:#6b7280}</style></head><body><h1>Ogłoszenia do analizy</h1><p>Otwórz kolejno każde ogłoszenie. Stały pasek TOP 10 pozwala przełączać strony.</p><ol>${links}</ol></body></html>`,
    );

    return {
      runActions: async (actions) => {
        for (const action of actions) {
          await executeAction(page, action);
          if (!isAllowedBrowserNavigation(page.url(), allowedUrls))
            throw new Error(
              `Przeglądarka zablokowała nawigację poza TOP 10: ${page.url()}`,
            );
        }
        await page
          .waitForLoadState("domcontentloaded", { timeout: 10_000 })
          .catch(() => undefined);
        if (page.url() !== "about:blank")
          visitedUrls.add(normalizedListingUrl(page.url()));
      },
      screenshot: () => page.screenshot({ type: "png" }),
      missingListings: () =>
        uniqueListings.filter(
          (listing) => !visitedUrls.has(normalizedListingUrl(listing.url)),
        ),
      close: () => closeAll(browser, context),
    };
  } catch (error) {
    await closeAll(browser, context);
    throw error;
  }
}
