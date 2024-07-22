/**
 * @template Value
 * @typedef {Object} GoodResult
 * @property {true} ok - The success status.
 * @property {Value} value - The data extracted from the URL.
 */

/**
 * @template Error
 * @typedef {Object} BadResult
 * @property {false} ok - The success status.
 * @property {Error} error - The error
 */

/**
 * @template Value, Error
 * @typedef {GoodResult<Value> | BadResult<Error>} Result
 */

/**
 * @typedef {Object} UnfurledData
 * @property {string|undefined} title - The title extracted from the URL.
 * @property {string|undefined} description - The description extracted from the URL.
 * @property {string|undefined} image - The image URL extracted from the URL.
 * @property {string|undefined} favicon - The favicon URL extracted from the URL.
 */

/**
 * @typedef {'bad-param' | 'failed-fetch'} UnfurlError
 */

/**
 * Handles the unfurling of a URL by extracting metadata such as title, description, image, and favicon.
 * @param {string} url - The URL to unfurl.
 * @returns {Promise<Result<UnfurledData, UnfurlError>>} - A promise that resolves to an object containing the extracted metadata, or null if an error occurs.
 */
export async function unfurl(url) {
  if (
    typeof url !== "string" ||
    !url.startsWith("http://") ||
    !url.startsWith("https://")
  ) {
    return { ok: false, error: "bad-param" };
  }

  // cloudflare has a built-in HTML parser/rewriter called HTMLRewriter. in order to use it, we
  // need to define classes that act as event handlers for certain elements, attributes, etc.
  // see https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/
  const meta$ = new MetaExtractor();
  const title$ = new TextExtractor();
  const icon$ = new IconExtractor();

  try {
    await new HTMLRewriter()
      .on("meta", meta$)
      .on("title", title$)
      .on("link", icon$)
      .transform(await fetch(url))
      .blob();
  } catch {
    return { ok: false, error: "failed-fetch" };
  }

  // we don't know exactly what we'll end up with, so this is a best-effort extraction
  const { og, twitter } = meta$;
  const title =
    og["og:title"] ?? twitter["twitter:title"] ?? title$.string ?? undefined;
  const description =
    og["og:description"] ??
    twitter["twitter:description"] ??
    meta$.description ??
    undefined;
  let image =
    og["og:image:secure_url"] ??
    og["og:image"] ??
    twitter["twitter:image"] ??
    undefined;
  let favicon = icon$.appleIcon ?? icon$.icon ?? undefined;

  if (image && !image?.startsWith("http")) {
    image = new URL(image, url).href;
  }
  if (favicon && !favicon?.startsWith("http")) {
    favicon = new URL(favicon, url).href;
  }

  return {
    ok: true,
    value: {
      title,
      description,
      image,
      favicon,
    },
  };
}

/**
 * Implements a handler for a GET request where the uri is passed in as a search param called `url`.
 *
 * e.g. GET /foo/bar?url=https://example.com
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function handleUnfurlRequest(request) {
  const url = new URL(request.url).searchParams.get("url");

  if (!url) {
    return new Response("Missing URL query parameter.", { status: 400 });
  }

  const result = await unfurl(url);

  if (result.ok) {
    return new Response(JSON.stringify(result.value), {
      headers: { "Content-Type": "application/json" },
    });
  } else if (result.error === "bad-param") {
    return new Response("Bad URL query parameter.", { status: 400 });
  } else {
    return new Response("Failed to fetch URL.", { status: 422 });
  }
}

/**
 * Extracts text from HTML elements.
 */
class TextExtractor {
  /**
   * The accumulated text extracted from elements.
   * @type {string}
   */
  string = "";

  /**
   * Handles an incoming piece of text.
   * @param {Object} param - The text object.
   * @param {string} param.text - The incoming text.
   */
  text({ text }) {
    this.string += text;
  }
}

/**
 * Extracts metadata from HTML elements.
 */
class MetaExtractor {
  /**
   * The Open Graph (og) metadata extracted from elements.
   * @type {Object.<string, string|null>}
   */
  og = {};

  /**
   * The Twitter metadata extracted from elements.
   * @type {Object.<string, string|null>}
   */
  twitter = {};

  /**
   * The description extracted from elements.
   * @type {string|null}
   */
  description = null;

  /**
   * Handles an incoming element.
   * @param {Element} element - The incoming element.
   */
  element(element) {
    const property = element.getAttribute("property");
    const name = element.getAttribute("name");

    if (property && property.startsWith("og:")) {
      this.og[property] = element.getAttribute("content");
    } else if (name && name.startsWith("twitter:")) {
      this.twitter[name] = element.getAttribute("content");
    } else if (name === "description") {
      this.description = element.getAttribute("content");
    }
  }
}

/**
 * Extracts favicon URLs from HTML elements.
 */
class IconExtractor {
  /**
   * The Apple touch icon URL extracted from elements.
   * @type {string|null}
   */
  appleIcon = null;

  /**
   * The favicon URL extracted from elements.
   * @type {string|null}
   */
  icon = null;

  /**
   * Handles an incoming element.
   * @param {Element} element - The incoming element.
   */
  element(element) {
    if (element.getAttribute("rel") === "icon") {
      this.icon = element.getAttribute("href");
    } else if (element.getAttribute("rel") === "apple-touch-icon") {
      this.appleIcon = element.getAttribute("href");
    }
  }
}
