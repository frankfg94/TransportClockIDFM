import process from 'node:process';globalThis._importMeta_={url:import.meta.url,env:process.env};import { tmpdir } from 'node:os';
import { Server } from 'node:http';
import path, { resolve, dirname, join } from 'node:path';
import nodeCrypto from 'node:crypto';
import { parentPort, threadId } from 'node:worker_threads';
import { defineEventHandler, handleCacheHeaders, splitCookiesString, createEvent, fetchWithEvent, isEvent, eventHandler, setHeaders, createError, sendRedirect, proxyRequest, getRequestHeader, setResponseHeaders, setResponseStatus, send, getRequestHeaders, setResponseHeader, appendResponseHeader, getRequestURL, getResponseHeader, removeResponseHeader, getQuery as getQuery$1, readBody, getRouterParam, setHeader, createApp, createRouter as createRouter$1, toNodeListener, lazyEventHandler, getResponseStatus, getMethod, readRawBody, getResponseStatusText } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/h3/dist/index.mjs';
import { escapeHtml } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/@vue/shared/dist/shared.cjs.js';
import { createRenderer, getRequestDependencies, getPreloadLinks, getPrefetchLinks } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/vue-bundle-renderer/dist/runtime.mjs';
import { parseURL, withoutBase, joinURL, getQuery, withQuery, withTrailingSlash, decodePath, withLeadingSlash, withoutTrailingSlash, joinRelativeURL } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/ufo/dist/index.mjs';
import process$1 from 'node:process';
import { renderToString } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/vue/server-renderer/index.mjs';
import { klona } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/klona/dist/index.mjs';
import defu, { defuFn } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/defu/dist/defu.mjs';
import destr, { destr as destr$1 } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/destr/dist/index.mjs';
import { snakeCase } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/scule/dist/index.mjs';
import { createHead as createHead$1, propsToString, renderSSRHead } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/unhead/dist/server.mjs';
import { stringify, uneval } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/devalue/index.js';
import { isVNode, isRef, toValue } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/vue/index.mjs';
import { DeprecationsPlugin, PromisesPlugin, TemplateParamsPlugin, AliasSortingPlugin } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/unhead/dist/plugins.mjs';
import { createHooks } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/hookable/dist/index.mjs';
import { createFetch, Headers as Headers$1 } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/ofetch/dist/node.mjs';
import { fetchNodeRequestHandler, callNodeRequestHandler } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/node-mock-http/dist/index.mjs';
import { createStorage, prefixStorage } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/@nuxt/nitro-server/node_modules/unstorage/dist/index.mjs';
import unstorage_47drivers_47fs from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/@nuxt/nitro-server/node_modules/unstorage/drivers/fs.mjs';
import { digest } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/ohash/dist/index.mjs';
import { toRouteMatcher, createRouter } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/radix3/dist/index.mjs';
import fs, { readFile } from 'node:fs/promises';
import consola, { consola as consola$1 } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/consola/dist/index.mjs';
import { ErrorParser } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/youch-core/build/index.js';
import { Youch } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/youch/build/index.js';
import { SourceMapConsumer } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/source-map/source-map.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getContext } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/unctx/dist/index.mjs';
import { captureRawStackTrace, parseRawStackTrace } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/errx/dist/index.js';
import { promises } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname as dirname$1, resolve as resolve$1 } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/pathe/dist/index.mjs';
import { walkResolver } from 'file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/node_modules/unhead/dist/utils.mjs';

const serverAssets = [{"baseName":"server","dir":"C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/server/assets"}];

const assets$1 = createStorage();

for (const asset of serverAssets) {
  assets$1.mount(asset.baseName, unstorage_47drivers_47fs({ base: asset.dir, ignore: (asset?.ignore || []) }));
}

const storage = createStorage({});

storage.mount('/assets', assets$1);

storage.mount('lineGeometry', unstorage_47drivers_47fs({"driver":"fs","base":"./.data/line-geometry"}));
storage.mount('gtfs', unstorage_47drivers_47fs({"driver":"fs","base":"./.data/gtfs"}));
storage.mount('traffic', unstorage_47drivers_47fs({"driver":"fs","base":"./.data/traffic"}));
storage.mount('root', unstorage_47drivers_47fs({"driver":"fs","readOnly":true,"base":"C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT","watchOptions":{"ignored":[null]}}));
storage.mount('src', unstorage_47drivers_47fs({"driver":"fs","readOnly":true,"base":"C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/server","watchOptions":{"ignored":[null]}}));
storage.mount('build', unstorage_47drivers_47fs({"driver":"fs","readOnly":false,"base":"C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/.nuxt-visual"}));
storage.mount('cache', unstorage_47drivers_47fs({"driver":"fs","readOnly":false,"base":"C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/.nuxt-visual/cache"}));
storage.mount('data', unstorage_47drivers_47fs({"driver":"fs","base":"C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/.data/kv"}));

function useStorage(base = "") {
  return base ? prefixStorage(storage, base) : storage;
}

const Hasher = /* @__PURE__ */ (() => {
  class Hasher2 {
    buff = "";
    #context = /* @__PURE__ */ new Map();
    write(str) {
      this.buff += str;
    }
    dispatch(value) {
      const type = value === null ? "null" : typeof value;
      return this[type](value);
    }
    object(object) {
      if (object && typeof object.toJSON === "function") {
        return this.object(object.toJSON());
      }
      const objString = Object.prototype.toString.call(object);
      let objType = "";
      const objectLength = objString.length;
      objType = objectLength < 10 ? "unknown:[" + objString + "]" : objString.slice(8, objectLength - 1);
      objType = objType.toLowerCase();
      let objectNumber = null;
      if ((objectNumber = this.#context.get(object)) === void 0) {
        this.#context.set(object, this.#context.size);
      } else {
        return this.dispatch("[CIRCULAR:" + objectNumber + "]");
      }
      if (typeof Buffer !== "undefined" && Buffer.isBuffer && Buffer.isBuffer(object)) {
        this.write("buffer:");
        return this.write(object.toString("utf8"));
      }
      if (objType !== "object" && objType !== "function" && objType !== "asyncfunction") {
        if (this[objType]) {
          this[objType](object);
        } else {
          this.unknown(object, objType);
        }
      } else {
        const keys = Object.keys(object).sort();
        const extraKeys = [];
        this.write("object:" + (keys.length + extraKeys.length) + ":");
        const dispatchForKey = (key) => {
          this.dispatch(key);
          this.write(":");
          this.dispatch(object[key]);
          this.write(",");
        };
        for (const key of keys) {
          dispatchForKey(key);
        }
        for (const key of extraKeys) {
          dispatchForKey(key);
        }
      }
    }
    array(arr, unordered) {
      unordered = unordered === void 0 ? false : unordered;
      this.write("array:" + arr.length + ":");
      if (!unordered || arr.length <= 1) {
        for (const entry of arr) {
          this.dispatch(entry);
        }
        return;
      }
      const contextAdditions = /* @__PURE__ */ new Map();
      const entries = arr.map((entry) => {
        const hasher = new Hasher2();
        hasher.dispatch(entry);
        for (const [key, value] of hasher.#context) {
          contextAdditions.set(key, value);
        }
        return hasher.toString();
      });
      this.#context = contextAdditions;
      entries.sort();
      return this.array(entries, false);
    }
    date(date) {
      return this.write("date:" + date.toJSON());
    }
    symbol(sym) {
      return this.write("symbol:" + sym.toString());
    }
    unknown(value, type) {
      this.write(type);
      if (!value) {
        return;
      }
      this.write(":");
      if (value && typeof value.entries === "function") {
        return this.array(
          [...value.entries()],
          true
          /* ordered */
        );
      }
    }
    error(err) {
      return this.write("error:" + err.toString());
    }
    boolean(bool) {
      return this.write("bool:" + bool);
    }
    string(string) {
      this.write("string:" + string.length + ":");
      this.write(string);
    }
    function(fn) {
      this.write("fn:");
      if (isNativeFunction(fn)) {
        this.dispatch("[native]");
      } else {
        this.dispatch(fn.toString());
      }
    }
    number(number) {
      return this.write("number:" + number);
    }
    null() {
      return this.write("Null");
    }
    undefined() {
      return this.write("Undefined");
    }
    regexp(regex) {
      return this.write("regex:" + regex.toString());
    }
    arraybuffer(arr) {
      this.write("arraybuffer:");
      return this.dispatch(new Uint8Array(arr));
    }
    url(url) {
      return this.write("url:" + url.toString());
    }
    map(map) {
      this.write("map:");
      const arr = [...map];
      return this.array(arr, false);
    }
    set(set) {
      this.write("set:");
      const arr = [...set];
      return this.array(arr, false);
    }
    bigint(number) {
      return this.write("bigint:" + number.toString());
    }
  }
  for (const type of [
    "uint8array",
    "uint8clampedarray",
    "unt8array",
    "uint16array",
    "unt16array",
    "uint32array",
    "unt32array",
    "float32array",
    "float64array"
  ]) {
    Hasher2.prototype[type] = function(arr) {
      this.write(type + ":");
      return this.array([...arr], false);
    };
  }
  function isNativeFunction(f) {
    if (typeof f !== "function") {
      return false;
    }
    return Function.prototype.toString.call(f).slice(
      -15
      /* "[native code] }".length */
    ) === "[native code] }";
  }
  return Hasher2;
})();
function serialize(object) {
  const hasher = new Hasher();
  hasher.dispatch(object);
  return hasher.buff;
}
function hash(value) {
  return digest(typeof value === "string" ? value : serialize(value)).replace(/[-_]/g, "").slice(0, 10);
}

function defaultCacheOptions() {
  return {
    name: "_",
    base: "/cache",
    swr: true,
    maxAge: 1
  };
}
function defineCachedFunction(fn, opts = {}) {
  opts = { ...defaultCacheOptions(), ...opts };
  const pending = {};
  const group = opts.group || "nitro/functions";
  const name = opts.name || fn.name || "_";
  const integrity = opts.integrity || hash([fn, opts]);
  const validate = opts.validate || ((entry) => entry.value !== void 0);
  async function get(key, resolver, shouldInvalidateCache, event) {
    const cacheKey = [opts.base, group, name, key + ".json"].filter(Boolean).join(":").replace(/:\/$/, ":index");
    let entry = await useStorage().getItem(cacheKey).catch((error) => {
      console.error(`[cache] Cache read error.`, error);
      useNitroApp().captureError(error, { event, tags: ["cache"] });
    }) || {};
    if (typeof entry !== "object") {
      entry = {};
      const error = new Error("Malformed data read from cache.");
      console.error("[cache]", error);
      useNitroApp().captureError(error, { event, tags: ["cache"] });
    }
    const ttl = (opts.maxAge ?? 0) * 1e3;
    if (ttl) {
      entry.expires = Date.now() + ttl;
    }
    const expired = shouldInvalidateCache || entry.integrity !== integrity || ttl && Date.now() - (entry.mtime || 0) > ttl || validate(entry) === false;
    const _resolve = async () => {
      const isPending = pending[key];
      if (!isPending) {
        if (entry.value !== void 0 && (opts.staleMaxAge || 0) >= 0 && opts.swr === false) {
          entry.value = void 0;
          entry.integrity = void 0;
          entry.mtime = void 0;
          entry.expires = void 0;
        }
        pending[key] = Promise.resolve(resolver());
      }
      try {
        entry.value = await pending[key];
      } catch (error) {
        if (!isPending) {
          delete pending[key];
        }
        throw error;
      }
      if (!isPending) {
        entry.mtime = Date.now();
        entry.integrity = integrity;
        delete pending[key];
        if (validate(entry) !== false) {
          let setOpts;
          if (opts.maxAge && !opts.swr) {
            setOpts = { ttl: opts.maxAge };
          }
          const promise = useStorage().setItem(cacheKey, entry, setOpts).catch((error) => {
            console.error(`[cache] Cache write error.`, error);
            useNitroApp().captureError(error, { event, tags: ["cache"] });
          });
          if (event?.waitUntil) {
            event.waitUntil(promise);
          }
        }
      }
    };
    const _resolvePromise = expired ? _resolve() : Promise.resolve();
    if (entry.value === void 0) {
      await _resolvePromise;
    } else if (expired && event && event.waitUntil) {
      event.waitUntil(_resolvePromise);
    }
    if (opts.swr && validate(entry) !== false) {
      _resolvePromise.catch((error) => {
        console.error(`[cache] SWR handler error.`, error);
        useNitroApp().captureError(error, { event, tags: ["cache"] });
      });
      return entry;
    }
    return _resolvePromise.then(() => entry);
  }
  return async (...args) => {
    const shouldBypassCache = await opts.shouldBypassCache?.(...args);
    if (shouldBypassCache) {
      return fn(...args);
    }
    const key = await (opts.getKey || getKey)(...args);
    const shouldInvalidateCache = await opts.shouldInvalidateCache?.(...args);
    const entry = await get(
      key,
      () => fn(...args),
      shouldInvalidateCache,
      args[0] && isEvent(args[0]) ? args[0] : void 0
    );
    let value = entry.value;
    if (opts.transform) {
      value = await opts.transform(entry, ...args) || value;
    }
    return value;
  };
}
function cachedFunction(fn, opts = {}) {
  return defineCachedFunction(fn, opts);
}
function getKey(...args) {
  return args.length > 0 ? hash(args) : "";
}
function escapeKey(key) {
  return String(key).replace(/\W/g, "");
}
function defineCachedEventHandler(handler, opts = defaultCacheOptions()) {
  const variableHeaderNames = (opts.varies || []).filter(Boolean).map((h) => h.toLowerCase()).sort();
  const _opts = {
    ...opts,
    getKey: async (event) => {
      const customKey = await opts.getKey?.(event);
      if (customKey) {
        return escapeKey(customKey);
      }
      const _path = event.node.req.originalUrl || event.node.req.url || event.path;
      let _pathname;
      try {
        _pathname = escapeKey(decodeURI(parseURL(_path).pathname)).slice(0, 16) || "index";
      } catch {
        _pathname = "-";
      }
      const _hashedPath = `${_pathname}.${hash(_path)}`;
      const _headers = variableHeaderNames.map((header) => [header, event.node.req.headers[header]]).map(([name, value]) => `${escapeKey(name)}.${hash(value)}`);
      return [_hashedPath, ..._headers].join(":");
    },
    validate: (entry) => {
      if (!entry.value) {
        return false;
      }
      if (entry.value.code >= 400) {
        return false;
      }
      if (entry.value.body === void 0) {
        return false;
      }
      if (entry.value.headers.etag === "undefined" || entry.value.headers["last-modified"] === "undefined") {
        return false;
      }
      return true;
    },
    group: opts.group || "nitro/handlers",
    integrity: opts.integrity || hash([handler, opts])
  };
  const _cachedHandler = cachedFunction(
    async (incomingEvent) => {
      const variableHeaders = {};
      for (const header of variableHeaderNames) {
        const value = incomingEvent.node.req.headers[header];
        if (value !== void 0) {
          variableHeaders[header] = value;
        }
      }
      const reqProxy = cloneWithProxy(incomingEvent.node.req, {
        headers: variableHeaders
      });
      const resHeaders = {};
      let _resSendBody;
      const resProxy = cloneWithProxy(incomingEvent.node.res, {
        statusCode: 200,
        writableEnded: false,
        writableFinished: false,
        headersSent: false,
        closed: false,
        getHeader(name) {
          return resHeaders[name];
        },
        setHeader(name, value) {
          resHeaders[name] = value;
          return this;
        },
        getHeaderNames() {
          return Object.keys(resHeaders);
        },
        hasHeader(name) {
          return name in resHeaders;
        },
        removeHeader(name) {
          delete resHeaders[name];
        },
        getHeaders() {
          return resHeaders;
        },
        end(chunk, arg2, arg3) {
          if (typeof chunk === "string") {
            _resSendBody = chunk;
          }
          if (typeof arg2 === "function") {
            arg2();
          }
          if (typeof arg3 === "function") {
            arg3();
          }
          return this;
        },
        write(chunk, arg2, arg3) {
          if (typeof chunk === "string") {
            _resSendBody = chunk;
          }
          if (typeof arg2 === "function") {
            arg2(void 0);
          }
          if (typeof arg3 === "function") {
            arg3();
          }
          return true;
        },
        writeHead(statusCode, headers2) {
          this.statusCode = statusCode;
          if (headers2) {
            if (Array.isArray(headers2) || typeof headers2 === "string") {
              throw new TypeError("Raw headers  is not supported.");
            }
            for (const header in headers2) {
              const value = headers2[header];
              if (value !== void 0) {
                this.setHeader(
                  header,
                  value
                );
              }
            }
          }
          return this;
        }
      });
      const event = createEvent(reqProxy, resProxy);
      event.fetch = (url, fetchOptions) => fetchWithEvent(event, url, fetchOptions, {
        fetch: useNitroApp().localFetch
      });
      event.$fetch = (url, fetchOptions) => fetchWithEvent(event, url, fetchOptions, {
        fetch: globalThis.$fetch
      });
      event.waitUntil = incomingEvent.waitUntil;
      event.context = incomingEvent.context;
      event.context.cache = {
        options: _opts
      };
      const body = await handler(event) || _resSendBody;
      const headers = event.node.res.getHeaders();
      headers.etag = String(
        headers.Etag || headers.etag || `W/"${hash(body)}"`
      );
      headers["last-modified"] = String(
        headers["Last-Modified"] || headers["last-modified"] || (/* @__PURE__ */ new Date()).toUTCString()
      );
      const cacheControl = [];
      if (opts.swr) {
        if (opts.maxAge) {
          cacheControl.push(`s-maxage=${opts.maxAge}`);
        }
        if (opts.staleMaxAge) {
          cacheControl.push(`stale-while-revalidate=${opts.staleMaxAge}`);
        } else {
          cacheControl.push("stale-while-revalidate");
        }
      } else if (opts.maxAge) {
        cacheControl.push(`max-age=${opts.maxAge}`);
      }
      if (cacheControl.length > 0) {
        headers["cache-control"] = cacheControl.join(", ");
      }
      const cacheEntry = {
        code: event.node.res.statusCode,
        headers,
        body
      };
      return cacheEntry;
    },
    _opts
  );
  return defineEventHandler(async (event) => {
    if (opts.headersOnly) {
      if (handleCacheHeaders(event, { maxAge: opts.maxAge })) {
        return;
      }
      return handler(event);
    }
    const response = await _cachedHandler(
      event
    );
    if (event.node.res.headersSent || event.node.res.writableEnded) {
      return response.body;
    }
    if (handleCacheHeaders(event, {
      modifiedTime: new Date(response.headers["last-modified"]),
      etag: response.headers.etag,
      maxAge: opts.maxAge
    })) {
      return;
    }
    event.node.res.statusCode = response.code;
    for (const name in response.headers) {
      const value = response.headers[name];
      if (name === "set-cookie") {
        event.node.res.appendHeader(
          name,
          splitCookiesString(value)
        );
      } else {
        if (value !== void 0) {
          event.node.res.setHeader(name, value);
        }
      }
    }
    return response.body;
  });
}
function cloneWithProxy(obj, overrides) {
  return new Proxy(obj, {
    get(target, property, receiver) {
      if (property in overrides) {
        return overrides[property];
      }
      return Reflect.get(target, property, receiver);
    },
    set(target, property, value, receiver) {
      if (property in overrides) {
        overrides[property] = value;
        return true;
      }
      return Reflect.set(target, property, value, receiver);
    }
  });
}
const cachedEventHandler = defineCachedEventHandler;

const inlineAppConfig = {
  "nuxt": {}
};



const appConfig = defuFn(inlineAppConfig);

function getEnv(key, opts) {
  const envKey = snakeCase(key).toUpperCase();
  return destr(
    process.env[opts.prefix + envKey] ?? process.env[opts.altPrefix + envKey]
  );
}
function _isObject(input) {
  return typeof input === "object" && !Array.isArray(input);
}
function applyEnv(obj, opts, parentKey = "") {
  for (const key in obj) {
    const subKey = parentKey ? `${parentKey}_${key}` : key;
    const envValue = getEnv(subKey, opts);
    if (_isObject(obj[key])) {
      if (_isObject(envValue)) {
        obj[key] = { ...obj[key], ...envValue };
        applyEnv(obj[key], opts, subKey);
      } else if (envValue === void 0) {
        applyEnv(obj[key], opts, subKey);
      } else {
        obj[key] = envValue ?? obj[key];
      }
    } else {
      obj[key] = envValue ?? obj[key];
    }
    if (opts.envExpansion && typeof obj[key] === "string") {
      obj[key] = _expandFromEnv(obj[key]);
    }
  }
  return obj;
}
const envExpandRx = /\{\{([^{}]*)\}\}/g;
function _expandFromEnv(value) {
  return value.replace(envExpandRx, (match, key) => {
    return process.env[key] || match;
  });
}

const _inlineRuntimeConfig = {
  "app": {
    "baseURL": "/",
    "buildId": "dev",
    "buildAssetsDir": "/_nuxt/",
    "cdnURL": ""
  },
  "nitro": {
    "envPrefix": "NUXT_",
    "routeRules": {
      "/__nuxt_error": {
        "cache": false
      },
      "/api/**": {
        "cors": true,
        "headers": {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "*",
          "access-control-allow-headers": "*",
          "access-control-max-age": "0"
        }
      }
    }
  },
  "public": {},
  "idfmApiKey": "ZMKOLcO1Th9yoJABTXBTJjE0QqNkCxoy"
};
const envOptions = {
  prefix: "NITRO_",
  altPrefix: _inlineRuntimeConfig.nitro.envPrefix ?? process.env.NITRO_ENV_PREFIX ?? "_",
  envExpansion: _inlineRuntimeConfig.nitro.envExpansion ?? process.env.NITRO_ENV_EXPANSION ?? false
};
const _sharedRuntimeConfig = _deepFreeze(
  applyEnv(klona(_inlineRuntimeConfig), envOptions)
);
function useRuntimeConfig(event) {
  if (!event) {
    return _sharedRuntimeConfig;
  }
  if (event.context.nitro.runtimeConfig) {
    return event.context.nitro.runtimeConfig;
  }
  const runtimeConfig = klona(_inlineRuntimeConfig);
  applyEnv(runtimeConfig, envOptions);
  event.context.nitro.runtimeConfig = runtimeConfig;
  return runtimeConfig;
}
_deepFreeze(klona(appConfig));
function _deepFreeze(object) {
  const propNames = Object.getOwnPropertyNames(object);
  for (const name of propNames) {
    const value = object[name];
    if (value && typeof value === "object") {
      _deepFreeze(value);
    }
  }
  return Object.freeze(object);
}
new Proxy(/* @__PURE__ */ Object.create(null), {
  get: (_, prop) => {
    console.warn(
      "Please use `useRuntimeConfig()` instead of accessing config directly."
    );
    const runtimeConfig = useRuntimeConfig();
    if (prop in runtimeConfig) {
      return runtimeConfig[prop];
    }
    return void 0;
  }
});

function isPathInScope(pathname, base) {
  let canonical;
  try {
    const pre = pathname.replace(/%2f/gi, "/").replace(/%5c/gi, "\\");
    canonical = new URL(pre, "http://_").pathname;
  } catch {
    return false;
  }
  return !base || canonical === base || canonical.startsWith(base + "/");
}

const config = useRuntimeConfig();
const _routeRulesMatcher = toRouteMatcher(
  createRouter({ routes: config.nitro.routeRules })
);
function createRouteRulesHandler(ctx) {
  return eventHandler((event) => {
    const routeRules = getRouteRules(event);
    if (routeRules.headers) {
      setHeaders(event, routeRules.headers);
    }
    if (routeRules.redirect) {
      let target = routeRules.redirect.to;
      if (target.endsWith("/**")) {
        let targetPath = event.path;
        const strpBase = routeRules.redirect._redirectStripBase;
        if (strpBase) {
          if (!isPathInScope(event.path.split("?")[0], strpBase)) {
            throw createError({ statusCode: 400 });
          }
          targetPath = withoutBase(targetPath, strpBase);
        } else if (targetPath.startsWith("//")) {
          targetPath = targetPath.replace(/^\/+/, "/");
        }
        target = joinURL(target.slice(0, -3), targetPath);
      } else if (event.path.includes("?")) {
        const query = getQuery(event.path);
        target = withQuery(target, query);
      }
      return sendRedirect(event, target, routeRules.redirect.statusCode);
    }
    if (routeRules.proxy) {
      let target = routeRules.proxy.to;
      if (target.endsWith("/**")) {
        let targetPath = event.path;
        const strpBase = routeRules.proxy._proxyStripBase;
        if (strpBase) {
          if (!isPathInScope(event.path.split("?")[0], strpBase)) {
            throw createError({ statusCode: 400 });
          }
          targetPath = withoutBase(targetPath, strpBase);
        } else if (targetPath.startsWith("//")) {
          targetPath = targetPath.replace(/^\/+/, "/");
        }
        target = joinURL(target.slice(0, -3), targetPath);
      } else if (event.path.includes("?")) {
        const query = getQuery(event.path);
        target = withQuery(target, query);
      }
      return proxyRequest(event, target, {
        fetch: ctx.localFetch,
        ...routeRules.proxy
      });
    }
  });
}
function getRouteRules(event) {
  event.context._nitro = event.context._nitro || {};
  if (!event.context._nitro.routeRules) {
    event.context._nitro.routeRules = getRouteRulesForPath(
      withoutBase(event.path.split("?")[0], useRuntimeConfig().app.baseURL)
    );
  }
  return event.context._nitro.routeRules;
}
function getRouteRulesForPath(path) {
  return defu({}, ..._routeRulesMatcher.matchAll(path).reverse());
}

function _captureError(error, type) {
  console.error(`[${type}]`, error);
  useNitroApp().captureError(error, { tags: [type] });
}
function trapUnhandledNodeErrors() {
  process.on(
    "unhandledRejection",
    (error) => _captureError(error, "unhandledRejection")
  );
  process.on(
    "uncaughtException",
    (error) => _captureError(error, "uncaughtException")
  );
}
function joinHeaders(value) {
  return Array.isArray(value) ? value.join(", ") : String(value);
}
function normalizeFetchResponse(response) {
  if (!response.headers.has("set-cookie")) {
    return response;
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: normalizeCookieHeaders(response.headers)
  });
}
function normalizeCookieHeader(header = "") {
  return splitCookiesString(joinHeaders(header));
}
function normalizeCookieHeaders(headers) {
  const outgoingHeaders = new Headers();
  for (const [name, header] of headers) {
    if (name === "set-cookie") {
      for (const cookie of normalizeCookieHeader(header)) {
        outgoingHeaders.append("set-cookie", cookie);
      }
    } else {
      outgoingHeaders.set(name, joinHeaders(header));
    }
  }
  return outgoingHeaders;
}

function isJsonRequest(event) {
  if (hasReqHeader(event, "accept", "text/html")) {
    return false;
  }
  return hasReqHeader(event, "accept", "application/json") || hasReqHeader(event, "user-agent", "curl/") || hasReqHeader(event, "user-agent", "httpie/") || hasReqHeader(event, "sec-fetch-mode", "cors") || event.path.startsWith("/api/") || event.path.endsWith(".json");
}
function hasReqHeader(event, name, includes) {
  const value = getRequestHeader(event, name);
  return value && typeof value === "string" && value.toLowerCase().includes(includes);
}

const iframeStorageBridge = (nonce) => (
  /* js */
  `
(function() {
  const memoryStore = {};

  const NONCE = ${JSON.stringify(nonce)}
  
  const mockStorage = {
    getItem: function(key) {
      return memoryStore[key] !== undefined ? memoryStore[key] : null;
    },
    setItem: function(key, value) {
      memoryStore[key] = String(value);
      window.parent.postMessage({
        type: 'storage-set',
        key: key,
        value: String(value),
        nonce: NONCE
      }, '*');
    },
    removeItem: function(key) {
      delete memoryStore[key];
      window.parent.postMessage({
        type: 'storage-remove',
        key: key,
        nonce: NONCE
      }, '*');
    },
    clear: function() {
      for (const key in memoryStore) {
        delete memoryStore[key];
      }
      window.parent.postMessage({
        type: 'storage-clear',
        nonce: NONCE
      }, '*');
    },
    key: function(index) {
      const keys = Object.keys(memoryStore);
      return keys[index] !== undefined ? keys[index] : null;
    },
    get length() {
      return Object.keys(memoryStore).length;
    }
  };
  
  try {
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: false,
      configurable: true
    });
  } catch (e) {
    window.localStorage = mockStorage;
  }
  
  window.addEventListener('message', function(event) {
    if (event.data.type === 'storage-sync-data' && event.data.nonce === NONCE) {
      const data = event.data.data;
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          memoryStore[key] = data[key];
        }
      }
      if (typeof window.initTheme === 'function') {
        window.initTheme();
      }
      window.dispatchEvent(new Event('storage-ready'));
    }
  });
  
  window.parent.postMessage({ 
    type: 'storage-sync-request',
    nonce: NONCE
  }, '*');
})();
`
);
const parentStorageBridge = (nonce) => (
  /* js */
  `
(function() {
  const host = document.querySelector('nuxt-error-overlay');
  if (!host) return;
  
  // Wait for shadow root to be attached
  const checkShadow = setInterval(function() {
    if (host.shadowRoot) {
      clearInterval(checkShadow);
      const iframe = host.shadowRoot.getElementById('frame');
      if (!iframe) return;

      const NONCE = ${JSON.stringify(nonce)}
      
      window.addEventListener('message', function(event) {
        if (!event.data || event.data.nonce !== NONCE) return;
        
        const data = event.data;
        
        if (data.type === 'storage-set') {
          localStorage.setItem(data.key, data.value);
        } else if (data.type === 'storage-remove') {
          localStorage.removeItem(data.key);
        } else if (data.type === 'storage-clear') {
          localStorage.clear();
        } else if (data.type === 'storage-sync-request') {
          const allData = {};
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            allData[key] = localStorage.getItem(key);
          }
          iframe.contentWindow.postMessage({
            type: 'storage-sync-data',
            data: allData,
            nonce: NONCE
          }, '*');
        }
      });
    }
  }, 10);
})();
`
);
const errorCSS = (
  /* css */
  `
:host {
  --preview-width: 240px;
  --preview-height: 180px;
  --base-width: 1200px;
  --base-height: 900px;
  --z-base: 999999998;
  all: initial;
  display: contents;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
#frame {
  position: fixed;
  left: 0;
  top: 0;
  width: 100vw;
  height: 100vh;
  border: none;
  z-index: var(--z-base);
}
#frame[inert] {
  right: 5px;
  bottom: 5px;
  left: auto;
  top: auto;
  width: var(--base-width);
  height: var(--base-height);
  transform: scale(calc(240 / 1200));
  transform-origin: bottom right;
  overflow: hidden;
  border-radius: calc(1200 * 8px / 240);
}
#preview {
  position: fixed;
  right: 5px;
  bottom: 5px;
  width: var(--preview-width);
  height: var(--preview-height);
  overflow: hidden;
  border-radius: 8px;
  pointer-events: none;
  z-index: var(--z-base);
  background: white;
  display: none;
}
#frame:not([inert]) + #preview {
  display: block;
}
#toggle {
  position: fixed;
  right: 5px;
  bottom: 5px;
  width: var(--preview-width);
  height: var(--preview-height);
  background: none;
  border: 3px solid #00DC82;
  border-radius: 8px;
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.2s, box-shadow 0.2s;
  z-index: calc(var(--z-base) + 1);
}
#toggle:hover,
#toggle:focus {
  opacity: 1;
  box-shadow: 0 0 20px rgba(0, 220, 130, 0.6);
}
#toggle:focus-visible {
  outline: 3px solid #00DC82;
  outline-offset: 3px;
  box-shadow: 0 0 24px rgba(0, 220, 130, 0.8);
}
@media (prefers-reduced-motion: reduce) {
  #toggle {
    transition: none;
  }
}
`
);
function webComponentScript(base64HTML, startMinimized) {
  return (
    /* js */
    `
  (function() {
    try {
      const host = document.querySelector('nuxt-error-overlay');
      if (!host) return;
      
      const shadow = host.attachShadow({ mode: 'open' });
      
      // Create elements
      const style = document.createElement('style');
      style.textContent = ${JSON.stringify(errorCSS)};
      
      const iframe = document.createElement('iframe');
      iframe.id = 'frame';
      iframe.src = 'data:text/html;base64,${base64HTML}';
      iframe.title = 'Detailed error stack trace';
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      
      const preview = document.createElement('div');
      preview.id = 'preview';
      
      const button = document.createElement('button');
      button.id = 'toggle';
      button.setAttribute('aria-expanded', 'true');
      button.setAttribute('type', 'button');
      button.innerHTML = '<span class="sr-only">Toggle detailed error view</span>';
      
      const liveRegion = document.createElement('div');
      liveRegion.setAttribute('role', 'status');
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.className = 'sr-only';
      
      // Update preview snapshot
      function updatePreview() {
        try {
          let previewIframe = preview.querySelector('iframe');
          if (!previewIframe) {
            previewIframe = document.createElement('iframe');
            previewIframe.style.cssText = 'width: 1200px; height: 900px; transform: scale(0.2); transform-origin: top left; border: none;';
            previewIframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
            preview.appendChild(previewIframe);
          }
          
          const doctype = document.doctype ? '<!DOCTYPE ' + document.doctype.name + '>' : '';
          const cleanedHTML = document.documentElement.outerHTML
            .replace(/<nuxt-error-overlay[^>]*>.*?<\\/nuxt-error-overlay>/gs, '')
            .replace(/<script[^>]*>.*?<\\/script>/gs, '');
          
          const iframeDoc = previewIframe.contentDocument || previewIframe.contentWindow.document;
          iframeDoc.open();
          iframeDoc.write(doctype + cleanedHTML);
          iframeDoc.close();
        } catch (error) {
          console.error('Failed to update preview:', error);
        }
      }
      
      function toggleView() {
        const isMinimized = iframe.hasAttribute('inert');
        
        if (isMinimized) {
          updatePreview();
          iframe.removeAttribute('inert');
          button.setAttribute('aria-expanded', 'true');
          liveRegion.textContent = 'Showing detailed error view';
          setTimeout(function() {
            try { iframe.contentWindow.focus(); } catch {}
          }, 100);
        } else {
          iframe.setAttribute('inert', '');
          button.setAttribute('aria-expanded', 'false');
          liveRegion.textContent = 'Showing error page';
          button.focus();
        }
      }
      
      button.onclick = toggleView;
      
      document.addEventListener('keydown', function(e) {
        if ((e.key === 'Escape' || e.key === 'Esc') && !iframe.hasAttribute('inert')) {
          toggleView();
        }
      });
      
      // Append to shadow DOM
      shadow.appendChild(style);
      shadow.appendChild(liveRegion);
      shadow.appendChild(iframe);
      shadow.appendChild(preview);
      shadow.appendChild(button);
      
      if (${startMinimized}) {
        iframe.setAttribute('inert', '');
        button.setAttribute('aria-expanded', 'false');
      }
      
      // Initialize preview
      setTimeout(updatePreview, 100);
      
    } catch (error) {
      console.error('Failed to initialize Nuxt error overlay:', error);
    }
  })();
  `
  );
}
function generateErrorOverlayHTML(html, options) {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  const errorPage = html.replace("<head>", `<head><script>${iframeStorageBridge(nonce)}<\/script>`);
  const base64HTML = Buffer.from(errorPage, "utf8").toString("base64");
  return `
    <script>${parentStorageBridge(nonce)}<\/script>
    <nuxt-error-overlay></nuxt-error-overlay>
    <script>${webComponentScript(base64HTML, options?.startMinimized ?? false)}<\/script>
  `;
}

const errorHandler$0 = (async function errorhandler(error, event, { defaultHandler }) {
  if (event.handled || isJsonRequest(event)) {
    return;
  }
  const defaultRes = await defaultHandler(error, event, { json: true });
  const statusCode = error.statusCode || 500;
  if (statusCode === 404 && defaultRes.status === 302) {
    setResponseHeaders(event, defaultRes.headers);
    setResponseStatus(event, defaultRes.status, defaultRes.statusText);
    return send(event, JSON.stringify(defaultRes.body, null, 2));
  }
  if (typeof defaultRes.body !== "string" && Array.isArray(defaultRes.body.stack)) {
    defaultRes.body.stack = defaultRes.body.stack.join("\n");
  }
  const errorObject = defaultRes.body;
  const url = new URL(errorObject.url);
  errorObject.url = withoutBase(url.pathname, useRuntimeConfig(event).app.baseURL) + url.search + url.hash;
  errorObject.message ||= "Server Error";
  errorObject.data ||= error.data;
  errorObject.statusMessage ||= error.statusMessage;
  delete defaultRes.headers["content-type"];
  delete defaultRes.headers["content-security-policy"];
  setResponseHeaders(event, defaultRes.headers);
  const reqHeaders = getRequestHeaders(event);
  const isRenderingError = event.path.startsWith("/__nuxt_error") || !!reqHeaders["x-nuxt-error"];
  const res = isRenderingError ? null : await useNitroApp().localFetch(
    withQuery(joinURL(useRuntimeConfig(event).app.baseURL, "/__nuxt_error"), errorObject),
    {
      headers: { ...reqHeaders, "x-nuxt-error": "true" },
      redirect: "manual"
    }
  ).catch(() => null);
  if (event.handled) {
    return;
  }
  if (!res) {
    const { template } = await Promise.resolve().then(function () { return error500; });
    {
      errorObject.description = errorObject.message;
    }
    setResponseHeader(event, "Content-Type", "text/html;charset=UTF-8");
    return send(event, template(errorObject));
  }
  const html = await res.text();
  for (const [header, value] of res.headers.entries()) {
    if (header === "set-cookie") {
      appendResponseHeader(event, header, value);
      continue;
    }
    setResponseHeader(event, header, value);
  }
  setResponseStatus(event, res.status && res.status !== 200 ? res.status : defaultRes.status, res.statusText || defaultRes.statusText);
  if (!globalThis._importMeta_.test && typeof html === "string") {
    const prettyResponse = await defaultHandler(error, event, { json: false });
    return send(event, html.replace("</body>", `${generateErrorOverlayHTML(prettyResponse.body, { startMinimized: 300 <= statusCode && statusCode < 500 })}</body>`));
  }
  return send(event, html);
});

function defineNitroErrorHandler(handler) {
  return handler;
}

const errorHandler$1 = defineNitroErrorHandler(
  async function defaultNitroErrorHandler(error, event) {
    const res = await defaultHandler(error, event);
    if (!event.node?.res.headersSent) {
      setResponseHeaders(event, res.headers);
    }
    setResponseStatus(event, res.status, res.statusText);
    return send(
      event,
      typeof res.body === "string" ? res.body : JSON.stringify(res.body, null, 2)
    );
  }
);
async function defaultHandler(error, event, opts) {
  const isSensitive = error.unhandled || error.fatal;
  const statusCode = error.statusCode || 500;
  const statusMessage = error.statusMessage || "Server Error";
  const url = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true });
  if (statusCode === 404) {
    const baseURL = "/";
    if (/^\/[^/]/.test(baseURL) && !url.pathname.startsWith(baseURL)) {
      const redirectTo = `${baseURL}${url.pathname.slice(1)}${url.search}`;
      return {
        status: 302,
        statusText: "Found",
        headers: { location: redirectTo },
        body: `Redirecting...`
      };
    }
  }
  await loadStackTrace(error).catch(consola.error);
  const youch = new Youch();
  if (isSensitive && !opts?.silent) {
    const tags = [error.unhandled && "[unhandled]", error.fatal && "[fatal]"].filter(Boolean).join(" ");
    const ansiError = await (await youch.toANSI(error)).replaceAll(process.cwd(), ".");
    consola.error(
      `[request error] ${tags} [${event.method}] ${url}

`,
      ansiError
    );
  }
  const useJSON = opts?.json ?? !getRequestHeader(event, "accept")?.includes("text/html");
  const headers = {
    "content-type": useJSON ? "application/json" : "text/html",
    // Prevent browser from guessing the MIME types of resources.
    "x-content-type-options": "nosniff",
    // Prevent error page from being embedded in an iframe
    "x-frame-options": "DENY",
    // Prevent browsers from sending the Referer header
    "referrer-policy": "no-referrer",
    // Disable the execution of any js
    "content-security-policy": "script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self';"
  };
  if (statusCode === 404 || !getResponseHeader(event, "cache-control")) {
    headers["cache-control"] = "no-cache";
  }
  const body = useJSON ? {
    error: true,
    url,
    statusCode,
    statusMessage,
    message: error.message,
    data: error.data,
    stack: error.stack?.split("\n").map((line) => line.trim())
  } : await youch.toHTML(error, {
    request: {
      url: url.href,
      method: event.method,
      headers: getRequestHeaders(event)
    }
  });
  return {
    status: statusCode,
    statusText: statusMessage,
    headers,
    body
  };
}
async function loadStackTrace(error) {
  if (!(error instanceof Error)) {
    return;
  }
  const parsed = await new ErrorParser().defineSourceLoader(sourceLoader).parse(error);
  const stack = error.message + "\n" + parsed.frames.map((frame) => fmtFrame(frame)).join("\n");
  Object.defineProperty(error, "stack", { value: stack });
  if (error.cause) {
    await loadStackTrace(error.cause).catch(consola.error);
  }
}
async function sourceLoader(frame) {
  if (!frame.fileName || frame.fileType !== "fs" || frame.type === "native") {
    return;
  }
  if (frame.type === "app") {
    const rawSourceMap = await readFile(`${frame.fileName}.map`, "utf8").catch(() => {
    });
    if (rawSourceMap) {
      const consumer = await new SourceMapConsumer(rawSourceMap);
      const originalPosition = consumer.originalPositionFor({ line: frame.lineNumber, column: frame.columnNumber });
      if (originalPosition.source && originalPosition.line) {
        frame.fileName = resolve(dirname(frame.fileName), originalPosition.source);
        frame.lineNumber = originalPosition.line;
        frame.columnNumber = originalPosition.column || 0;
      }
    }
  }
  const contents = await readFile(frame.fileName, "utf8").catch(() => {
  });
  return contents ? { contents } : void 0;
}
function fmtFrame(frame) {
  if (frame.type === "native") {
    return frame.raw;
  }
  const src = `${frame.fileName || ""}:${frame.lineNumber}:${frame.columnNumber})`;
  return frame.functionName ? `at ${frame.functionName} (${src}` : `at ${src}`;
}

const errorHandlers = [errorHandler$0, errorHandler$1];

async function errorHandler(error, event) {
  for (const handler of errorHandlers) {
    try {
      await handler(error, event, { defaultHandler });
      if (event.handled) {
        return; // Response handled
      }
    } catch(error) {
      // Handler itself thrown, log and continue
      console.error(error);
    }
  }
  // H3 will handle fallback
}

const rootDir = "C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT";

const appHead = {"meta":[{"name":"viewport","content":"width=device-width, initial-scale=1"},{"charset":"utf-8"}],"link":[{"rel":"preconnect","href":"https://a.basemaps.cartocdn.com","crossorigin":"anonymous"},{"rel":"preconnect","href":"https://b.basemaps.cartocdn.com","crossorigin":"anonymous"},{"rel":"preconnect","href":"https://c.basemaps.cartocdn.com","crossorigin":"anonymous"}],"style":[],"script":[],"noscript":[]};

const appRootTag = "div";

const appRootAttrs = {"id":"__nuxt"};

const appTeleportTag = "div";

const appTeleportAttrs = {"id":"teleports"};

const appId = "nuxt-app";

const devReducers = {
  VNode: (data) => isVNode(data) ? { type: data.type, props: data.props } : void 0,
  URL: (data) => data instanceof URL ? data.toString() : void 0
};
const asyncContext = getContext("nuxt-dev", { asyncContext: true, AsyncLocalStorage });
const _R2jsDl3OBZp6L4NWG_pXdnDnP_ZJXcNILBMLLqPesY = (nitroApp) => {
  const handler = nitroApp.h3App.handler;
  nitroApp.h3App.handler = (event) => {
    return asyncContext.callAsync({ logs: [], event }, () => handler(event));
  };
  onConsoleLog((_log) => {
    const ctx = asyncContext.tryUse();
    if (!ctx) {
      return;
    }
    const rawStack = captureRawStackTrace();
    if (!rawStack || rawStack.includes("runtime/vite-node.mjs")) {
      return;
    }
    const trace = [];
    let filename = "";
    for (const entry of parseRawStackTrace(rawStack)) {
      if (entry.source === globalThis._importMeta_.url) {
        continue;
      }
      if (EXCLUDE_TRACE_RE.test(entry.source)) {
        continue;
      }
      filename ||= entry.source.replace(withTrailingSlash(rootDir), "");
      trace.push({
        ...entry,
        source: entry.source.startsWith("file://") ? entry.source.replace("file://", "") : entry.source
      });
    }
    const log = {
      ..._log,
      // Pass along filename to allow the client to display more info about where log comes from
      filename,
      // Clean up file names in stack trace
      stack: trace
    };
    ctx.logs.push(log);
  });
  nitroApp.hooks.hook("afterResponse", () => {
    const ctx = asyncContext.tryUse();
    if (!ctx) {
      return;
    }
    return nitroApp.hooks.callHook("dev:ssr-logs", { logs: ctx.logs, path: ctx.event.path });
  });
  nitroApp.hooks.hook("render:html", (htmlContext) => {
    const ctx = asyncContext.tryUse();
    if (!ctx) {
      return;
    }
    try {
      const reducers = Object.assign(/* @__PURE__ */ Object.create(null), devReducers, ctx.event.context._payloadReducers);
      htmlContext.bodyAppend.unshift(`<script type="application/json" data-nuxt-logs="${appId}">${stringify(ctx.logs, reducers)}<\/script>`);
    } catch (e) {
      const shortError = e instanceof Error && "toString" in e ? ` Received \`${e.toString()}\`.` : "";
      console.warn(`[nuxt] Failed to stringify dev server logs.${shortError} You can define your own reducer/reviver for rich types following the instructions in https://nuxt.com/docs/api/composables/use-nuxt-app#payload.`);
    }
  });
};
const EXCLUDE_TRACE_RE = /\/node_modules\/(?:.*\/)?(?:nuxt|nuxt-nightly|nuxt-edge|nuxt3|consola|@vue)\/|core\/runtime\/nitro/;
function onConsoleLog(callback) {
  consola$1.addReporter({
    log(logObj) {
      callback(logObj);
    }
  });
  consola$1.wrapConsole();
}

function defineNitroPlugin(def) {
  return def;
}

function normalizeGtfsLineLabel(value) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr").replace(/[^\p{Letter}\p{Number}]+/gu, " ").trim();
}

async function resolveLineGeometryWithProviders(request, providers) {
  const attempts = [];
  for (const provider of providers) {
    if (provider.enabled && !provider.enabled(request)) {
      attempts.push({ source: provider.source, status: "disabled" });
      continue;
    }
    try {
      const result = await provider.resolve(request);
      if (result.status !== "success") {
        attempts.push({
          source: provider.source,
          status: result.status,
          ...result.reason ? { reason: result.reason } : {}
        });
        continue;
      }
      const validationError = validateLineGeometry(request, result.geometry);
      if (validationError) {
        attempts.push({
          source: provider.source,
          status: "invalid",
          reason: validationError
        });
        continue;
      }
      attempts.push({ source: provider.source, status: "success" });
      return { ...result.geometry, attempts };
    } catch (error) {
      attempts.push({
        source: provider.source,
        status: "error",
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }
  throw new Error(`No line geometry provider succeeded for ${request.lineId}.`);
}
function createDirectLineGeometry(request, now = /* @__PURE__ */ new Date()) {
  const stops = new Map(request.stops.map((stop) => [stop.id, stop]));
  const seen = /* @__PURE__ */ new Set();
  const segments = [];
  for (const branch of request.branches) {
    for (let index = 0; index < branch.stopIds.length - 1; index += 1) {
      const fromStopId = branch.stopIds[index];
      const toStopId = branch.stopIds[index + 1];
      const pairKey = createUndirectedEdgeKey(fromStopId, toStopId);
      if (seen.has(pairKey)) continue;
      const from = stops.get(fromStopId);
      const to = stops.get(toStopId);
      if (!from || !to) continue;
      seen.add(pairKey);
      segments.push({
        id: pairKey,
        fromStopId,
        toStopId,
        coordinates: [
          { lon: from.lon, lat: from.lat },
          { lon: to.lon, lat: to.lat }
        ]
      });
    }
  }
  return {
    schemaVersion: 1,
    source: "direct",
    generatedAt: now.toISOString(),
    stops: request.stops,
    branches: request.branches,
    segments,
    entrances: []
  };
}
function createDirectLineGeometryProvider() {
  return {
    source: "direct",
    resolve: async (request) => ({
      status: "success",
      geometry: createDirectLineGeometry(request)
    })
  };
}
function validateLineGeometry(request, geometry) {
  if (geometry.schemaVersion !== 1) return "unsupported_schema";
  if (geometry.segments.length === 0) return "empty_geometry";
  const requestedEdges = collectBranchEdges(
    geometry.topology === "provider" ? geometry.branches : request.branches
  );
  const suppliedEdges = new Set(
    geometry.segments.map(
      (segment) => createUndirectedEdgeKey(segment.fromStopId, segment.toStopId)
    )
  );
  for (const edge of requestedEdges) {
    if (!suppliedEdges.has(edge)) return `missing_edge:${edge}`;
  }
  for (const segment of geometry.segments) {
    if (segment.coordinates.length < 2) return `short_segment:${segment.id}`;
    if (!segment.coordinates.every(isValidCoordinate$1)) {
      return `invalid_coordinate:${segment.id}`;
    }
  }
  return void 0;
}
function measureLineGeometryContinuity(segments, toleranceMeters = 5) {
  const endpoints = /* @__PURE__ */ new Map();
  let pointCount = 0;
  let maxCoordinateStepMeters = 0;
  for (const segment of segments) {
    pointCount += segment.coordinates.length;
    appendCoordinate(endpoints, segment.fromStopId, segment.coordinates[0]);
    appendCoordinate(endpoints, segment.toStopId, segment.coordinates.at(-1));
    segment.coordinates.slice(1).forEach((coordinate, index) => {
      maxCoordinateStepMeters = Math.max(
        maxCoordinateStepMeters,
        coordinateDistanceMeters$1(segment.coordinates[index], coordinate)
      );
    });
  }
  const sharedStops = [...endpoints].filter(([, coordinates]) => coordinates.length > 1);
  const gaps = sharedStops.map(([stopId, coordinates]) => ({
    stopId,
    gapMeters: maximumCoordinateDistance(coordinates)
  }));
  return {
    segmentCount: segments.length,
    pointCount,
    sharedStopCount: sharedStops.length,
    maxSharedStopGapMeters: Math.max(0, ...gaps.map(({ gapMeters }) => gapMeters)),
    maxCoordinateStepMeters,
    disconnectedStops: gaps.filter(({ gapMeters }) => gapMeters > toleranceMeters).sort((left, right) => right.gapMeters - left.gapMeters)
  };
}
function createUndirectedEdgeKey(left, right) {
  return [left, right].sort().join("--");
}
function collectBranchEdges(branches) {
  const edges = /* @__PURE__ */ new Set();
  branches.forEach((branch) => {
    for (let index = 0; index < branch.stopIds.length - 1; index += 1) {
      edges.add(createUndirectedEdgeKey(branch.stopIds[index], branch.stopIds[index + 1]));
    }
  });
  return edges;
}
function isValidCoordinate$1(coordinate) {
  return Number.isFinite(coordinate.lon) && Number.isFinite(coordinate.lat) && Math.abs(coordinate.lon) <= 180 && Math.abs(coordinate.lat) <= 90;
}
function appendCoordinate(coordinatesByStop, stopId, coordinate) {
  var _a;
  if (!coordinate) return;
  coordinatesByStop.set(stopId, [...(_a = coordinatesByStop.get(stopId)) != null ? _a : [], coordinate]);
}
function maximumCoordinateDistance(coordinates) {
  let maximum = 0;
  coordinates.forEach((left, index) => {
    coordinates.slice(index + 1).forEach((right) => {
      maximum = Math.max(maximum, coordinateDistanceMeters$1(left, right));
    });
  });
  return maximum;
}
function coordinateDistanceMeters$1(left, right) {
  const latitudeRadians = (left.lat + right.lat) / 2 * Math.PI / 180;
  return Math.hypot((right.lon - left.lon) * Math.cos(latitudeRadians), right.lat - left.lat) * 111320;
}

const MAX_STOP_MATCH_DISTANCE_METERS$1 = 300;
const MIN_SHAPE_STOP_RECONCILIATION_IMPROVEMENT_METERS = 20;
const MAX_SHARED_EDGE_DEVIATION_METERS = 75;
const MAX_GEOMETRY_COMPARISON_SAMPLES = 24;
const MAX_PREFERRED_PATH_RATIO$1 = 1.8;
function compileGtfsLineArtifact(artifact) {
  const orientedShapes = /* @__PURE__ */ new Map();
  const stopsById = /* @__PURE__ */ new Map();
  const referenceSets = /* @__PURE__ */ new Map();
  const patterns = artifact.patterns.flatMap((pattern) => {
    const compiled = compilePattern(pattern, artifact, orientedShapes);
    if (!compiled) return [];
    compiled.projections.forEach((projection) => {
      var _a;
      const stop = (_a = stopsById.get(projection.stopId)) != null ? _a : {
        id: projection.stopId,
        coordinates: []
      };
      if (!stop.coordinates.some(
        (coordinate) => distanceMeters$3(coordinate, projection.coordinate) < 0.25
      )) {
        stop.coordinates.push(projection.coordinate);
      }
      stopsById.set(stop.id, stop);
      createStopReferenceKeys(stop.id).forEach((key) => {
        var _a2;
        const ids = (_a2 = referenceSets.get(key)) != null ? _a2 : /* @__PURE__ */ new Set();
        ids.add(stop.id);
        referenceSets.set(key, ids);
      });
    });
    return [compiled];
  });
  return {
    lineId: artifact.lineId,
    patterns,
    stops: [...stopsById.values()],
    stopIdsByReferenceKey: new Map(
      [...referenceSets].map(([key, ids]) => [key, [...ids].sort()])
    )
  };
}
function createSegmentsFromIndexedGtfs(request, compiled) {
  if (compiled.patterns.length === 0) return void 0;
  const referencedStopIds = new Set(request.branches.flatMap((branch) => branch.stopIds));
  const requestedStops = request.stops.filter((stop) => referencedStopIds.has(stop.id));
  const candidatesByRequestId = new Map(
    requestedStops.map((stop) => [stop.id, findStopCandidates(stop, compiled)])
  );
  const requestedStopsById = new Map(requestedStops.map((stop) => [stop.id, stop]));
  if ([...candidatesByRequestId.values()].some((candidates) => candidates.length === 0)) {
    return void 0;
  }
  const segments = /* @__PURE__ */ new Map();
  for (const branch of request.branches) {
    const branchCandidates = branch.stopIds.map(
      (stopId) => {
        var _a;
        return (_a = candidatesByRequestId.get(stopId)) != null ? _a : [];
      }
    );
    if (branchCandidates.some((candidates) => candidates.length === 0)) return void 0;
    const patternMatch = findBestPatternMatch(
      branchCandidates,
      branch.direction,
      compiled.patterns,
      branch.stopIds.map((stopId) => requestedStopsById.get(stopId))
    );
    if (!patternMatch) return void 0;
    const patternScore = patternMatch.directionPenalty * 1e12 + patternMatch.skippedStops * 1e8 + patternMatch.geographicErrorMeters;
    const projectionOverrides = reconcilePatternProjections(
      patternMatch.pattern,
      patternMatch.stopIndexes,
      branch.stopIds.map((stopId) => requestedStopsById.get(stopId))
    );
    for (let index = 0; index < branch.stopIds.length - 1; index += 1) {
      const fromStopId = branch.stopIds[index];
      const toStopId = branch.stopIds[index + 1];
      const coordinates = slicePatternShape(
        patternMatch.pattern,
        patternMatch.stopIndexes[index],
        patternMatch.stopIndexes[index + 1],
        projectionOverrides
      );
      if (coordinates.length < 2) return void 0;
      const edgeKey = createUndirectedEdgeKey(fromStopId, toStopId);
      const candidate = {
        score: patternScore,
        segment: {
          id: edgeKey,
          fromStopId,
          toStopId,
          coordinates
        }
      };
      const existing = segments.get(edgeKey);
      if (!existing) {
        segments.set(edgeKey, candidate);
        continue;
      }
      const orientedCandidate = existing.segment.fromStopId === candidate.segment.fromStopId ? candidate.segment.coordinates : [...candidate.segment.coordinates].reverse();
      if (maximumPolylineDeviationMeters(
        existing.segment.coordinates,
        orientedCandidate
      ) > MAX_SHARED_EDGE_DEVIATION_METERS) {
        return void 0;
      }
      if (candidate.score < existing.score) {
        segments.set(edgeKey, candidate);
      }
    }
  }
  return [...segments.values()].map(({ segment }) => segment);
}
function compilePattern(pattern, artifact, orientedShapes) {
  if (pattern.stopIds.length < 2 || pattern.projections.length !== pattern.stopIds.length || pattern.projections.some(
    (projection, index) => projection.stopId !== pattern.stopIds[index] || !isValidCoordinate(projection.coordinate) || !Number.isInteger(projection.shapePointIndex) || projection.shapePointIndex < 0 || projection.segmentProgress < 0 || projection.segmentProgress > 1 || index > 0 && projection.distanceAlongMeters < pattern.projections[index - 1].distanceAlongMeters
  )) {
    return void 0;
  }
  const shapeKey = `${pattern.shapeId}:${pattern.shapeDirection}`;
  let shape = orientedShapes.get(shapeKey);
  if (!shape) {
    const rawShape = artifact.shapes[pattern.shapeId];
    if (!(rawShape == null ? void 0 : rawShape.length) || rawShape.length < 2 || !rawShape.every(isValidCoordinate)) {
      return void 0;
    }
    shape = pattern.shapeDirection === "reverse" ? [...rawShape].reverse() : rawShape;
    orientedShapes.set(shapeKey, shape);
  }
  if (pattern.projections.some(
    (projection) => projection.shapePointIndex >= shape.length - 1
  )) {
    return void 0;
  }
  return {
    id: pattern.id,
    direction: pattern.direction,
    stopIds: pattern.stopIds,
    projections: pattern.projections,
    shape
  };
}
function findStopCandidates(request, compiled) {
  var _a;
  const exactIds = new Set(
    (_a = compiled.stopIdsByReferenceKey.get(createCanonicalStopReferenceKey(request.id))) != null ? _a : []
  );
  const candidates = (exactIds.size > 0 ? compiled.stops.filter(({ id }) => exactIds.has(id)) : compiled.stops).map((stop) => ({
    gtfsStopId: stop.id,
    errorMeters: minimumCoordinateDistance(request, stop.coordinates)
  })).filter(({ errorMeters }) => errorMeters <= MAX_STOP_MATCH_DISTANCE_METERS$1).sort(
    (left, right) => left.errorMeters - right.errorMeters || left.gtfsStopId.localeCompare(right.gtfsStopId)
  );
  return exactIds.size === 1 ? candidates.slice(0, 1) : candidates;
}
function findBestPatternMatch(stopCandidates, requestedDirection, patterns, requestedStops) {
  const directDistanceMeters = requestedStops.slice(1).reduce(
    (total, stop, index) => total + distanceMeters$3(requestedStops[index], stop),
    0
  );
  const matches = patterns.flatMap((pattern) => {
    const increasing = findCandidateSubsequence(pattern.stopIds, stopCandidates);
    const decreasing = findDecreasingCandidateSubsequence(
      pattern.stopIds,
      stopCandidates
    );
    return [increasing, decreasing].flatMap((subsequence) => {
      if (!subsequence) return [];
      const projectionError = subsequence.indexes.reduce(
        (total, stopIndex) => total + pattern.projections[stopIndex].errorMeters,
        0
      );
      const directionPenalty = requestedDirection && pattern.direction && normalizeDirection(requestedDirection) !== normalizeDirection(pattern.direction) ? 1 : 0;
      const geographicErrorMeters = subsequence.stopMatchErrorMeters + projectionError;
      const pathDistanceMeters = subsequence.indexes.slice(1).reduce((total, stopIndex, index) => {
        const coordinates = slicePatternShape(
          pattern,
          subsequence.indexes[index],
          stopIndex
        );
        return total + getPolylineLengthMeters(coordinates);
      }, 0);
      return [
        {
          pattern,
          stopIndexes: subsequence.indexes,
          directionPenalty,
          skippedStops: subsequence.skipped,
          geographicErrorMeters,
          pathRatio: pathDistanceMeters / Math.max(directDistanceMeters, 1)
        }
      ];
    });
  });
  return matches.sort(
    (left, right) => left.directionPenalty - right.directionPenalty || left.skippedStops - right.skippedStops || getPathRatioPenalty(left.pathRatio) - getPathRatioPenalty(right.pathRatio) || left.geographicErrorMeters - right.geographicErrorMeters || left.pattern.id.localeCompare(right.pattern.id) || left.stopIndexes.join(",").localeCompare(right.stopIndexes.join(","))
  )[0];
}
function getPathRatioPenalty(pathRatio) {
  return pathRatio > MAX_PREFERRED_PATH_RATIO$1 ? 1 : 0;
}
function findCandidateSubsequence(sequence, candidateGroups) {
  if (candidateGroups.length === 0) return void 0;
  let states = createInitialCandidateStates(sequence, candidateGroups[0]);
  for (const candidates of candidateGroups.slice(1)) {
    const candidateByStopId = new Map(
      candidates.map((candidate) => [candidate.gtfsStopId, candidate])
    );
    const nextByIndex = /* @__PURE__ */ new Map();
    for (const state of states) {
      const previousIndex = state.indexes[state.indexes.length - 1];
      for (let index = previousIndex + 1; index < sequence.length; index += 1) {
        const matchedCandidate = candidateByStopId.get(sequence[index]);
        if (!matchedCandidate) continue;
        const nextState = {
          indexes: [...state.indexes, index],
          skipped: state.skipped + index - previousIndex - 1,
          stopMatchErrorMeters: state.stopMatchErrorMeters + matchedCandidate.errorMeters
        };
        const existing = nextByIndex.get(index);
        if (!existing || compareCandidateSubsequences(nextState, existing) < 0) {
          nextByIndex.set(index, nextState);
        }
      }
    }
    states = [...nextByIndex.values()];
    if (states.length === 0) return void 0;
  }
  return states.sort(compareCandidateSubsequences)[0];
}
function findDecreasingCandidateSubsequence(sequence, candidateGroups) {
  const reversed = findCandidateSubsequence(
    [...sequence].reverse(),
    candidateGroups
  );
  return reversed ? {
    ...reversed,
    indexes: reversed.indexes.map((index) => sequence.length - 1 - index)
  } : void 0;
}
function createInitialCandidateStates(sequence, candidates) {
  const candidateByStopId = new Map(
    candidates.map((candidate) => [candidate.gtfsStopId, candidate])
  );
  return sequence.flatMap((stopId, index) => {
    const candidate = candidateByStopId.get(stopId);
    return candidate ? [{
      indexes: [index],
      skipped: 0,
      stopMatchErrorMeters: candidate.errorMeters
    }] : [];
  });
}
function compareCandidateSubsequences(left, right) {
  return left.skipped - right.skipped || left.stopMatchErrorMeters - right.stopMatchErrorMeters || left.indexes[left.indexes.length - 1] - left.indexes[0] - (right.indexes[right.indexes.length - 1] - right.indexes[0]) || left.indexes.join(",").localeCompare(right.indexes.join(","));
}
function reconcilePatternProjections(pattern, stopIndexes, requestedStops) {
  const overrides = /* @__PURE__ */ new Map();
  stopIndexes.forEach((patternStopIndex, requestedStopIndex) => {
    const projection = pattern.projections[patternStopIndex];
    const requestedStop = requestedStops[requestedStopIndex];
    if (!projection || !requestedStop) return;
    const previousProjection = pattern.projections[patternStopIndex - 1];
    const nextProjection = pattern.projections[patternStopIndex + 1];
    const corridorStart = previousProjection ? Math.min(previousProjection.shapePointIndex, projection.shapePointIndex) : 0;
    const corridorEnd = nextProjection ? Math.max(
      projection.shapePointIndex + 1,
      nextProjection.shapePointIndex + 1
    ) : pattern.shape.length - 1;
    const candidate = findClosestShapeProjection(
      pattern.shape,
      requestedStop,
      corridorStart,
      corridorEnd
    );
    if (!candidate) return;
    const importedErrorMeters = distanceMeters$3(
      requestedStop,
      projection.coordinate
    );
    if (candidate.errorMeters > MAX_STOP_MATCH_DISTANCE_METERS$1 || importedErrorMeters - candidate.errorMeters < MIN_SHAPE_STOP_RECONCILIATION_IMPROVEMENT_METERS) {
      return;
    }
    overrides.set(patternStopIndex, candidate);
  });
  return overrides;
}
function findClosestShapeProjection(shape, point, startShapePointIndex, endShapePointIndex) {
  if (shape.length === 0) return void 0;
  const start = Math.max(0, Math.min(startShapePointIndex, shape.length - 1));
  const end = Math.max(0, Math.min(endShapePointIndex, shape.length - 1));
  if (end <= start) {
    const coordinate = shape[start];
    return coordinate ? {
      shapePointIndex: start,
      segmentProgress: 0,
      coordinate,
      errorMeters: distanceMeters$3(point, coordinate)
    } : void 0;
  }
  let best;
  for (let index = start; index < end; index += 1) {
    const from = shape[index];
    const to = shape[index + 1];
    if (!from || !to) continue;
    const projected = projectCoordinateOntoSegment(point, from, to);
    const atSegmentEnd = projected.progress >= 1 - 1e-6;
    const candidate = {
      shapePointIndex: atSegmentEnd ? index + 1 : index,
      segmentProgress: atSegmentEnd ? 0 : projected.progress,
      coordinate: atSegmentEnd ? to : projected.coordinate,
      errorMeters: distanceMeters$3(point, projected.coordinate)
    };
    if (!best || candidate.errorMeters < best.errorMeters) {
      best = candidate;
    }
  }
  return best;
}
function projectCoordinateOntoSegment(point, start, end) {
  const latitudeRadians = (point.lat + start.lat + end.lat) / 3 * Math.PI / 180;
  const xScale = Math.max(0.1, Math.cos(latitudeRadians));
  const dx = (end.lon - start.lon) * xScale;
  const dy = end.lat - start.lat;
  const px = (point.lon - start.lon) * xScale;
  const py = point.lat - start.lat;
  const denominator = dx * dx + dy * dy;
  const progress = denominator ? Math.min(1, Math.max(0, (px * dx + py * dy) / denominator)) : 0;
  return {
    progress,
    coordinate: {
      lon: start.lon + (end.lon - start.lon) * progress,
      lat: start.lat + (end.lat - start.lat) * progress
    }
  };
}
function slicePatternShape(pattern, fromStopIndex, toStopIndex, projectionOverrides = /* @__PURE__ */ new Map()) {
  var _a, _b;
  if (fromStopIndex === toStopIndex) return [];
  if (fromStopIndex > toStopIndex) {
    return slicePatternShape(
      pattern,
      toStopIndex,
      fromStopIndex,
      projectionOverrides
    ).reverse();
  }
  const fromProjection = pattern.projections[fromStopIndex];
  const toProjection = pattern.projections[toStopIndex];
  const from = (_a = projectionOverrides.get(fromStopIndex)) != null ? _a : fromProjection;
  const to = (_b = projectionOverrides.get(toStopIndex)) != null ? _b : toProjection;
  if (!fromProjection || !toProjection || !from || !to || toProjection.distanceAlongMeters < fromProjection.distanceAlongMeters) {
    return [];
  }
  const coordinates = [from.coordinate];
  for (let index = from.shapePointIndex + 1; index <= to.shapePointIndex; index += 1) {
    const coordinate = pattern.shape[index];
    if (coordinate) coordinates.push(coordinate);
  }
  coordinates.push(to.coordinate);
  return dedupeCoordinates$1(coordinates);
}
function getPolylineLengthMeters(coordinates) {
  return coordinates.slice(1).reduce(
    (total, coordinate, index) => total + distanceMeters$3(coordinates[index], coordinate),
    0
  );
}
function createStopReferenceKeys(value) {
  var _a;
  const normalized = createCanonicalStopReferenceKey(value);
  const tokens = value.toLowerCase().split(/[^a-z0-9]+/gu).filter(Boolean);
  const numericTail = (_a = value.match(/(\d{3,})\D*$/u)) == null ? void 0 : _a[1];
  return [
    normalized,
    tokens.at(-1),
    numericTail ? `number:${numericTail}` : void 0
  ].filter(
    (key, index, keys) => Boolean(key) && keys.indexOf(key) === index
  );
}
function createCanonicalStopReferenceKey(value) {
  return value.replace(/^(?:station|stop[_-]?point):/iu, "").toLowerCase().replace(/[^a-z0-9]+/gu, "");
}
function normalizeDirection(value) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/gu, "");
}
function minimumCoordinateDistance(coordinate, candidates) {
  return candidates.reduce(
    (minimum, candidate) => Math.min(minimum, distanceMeters$3(coordinate, candidate)),
    Number.POSITIVE_INFINITY
  );
}
function maximumPolylineDeviationMeters(left, right) {
  return Math.max(
    sampleCoordinates(left).reduce(
      (maximum, point) => Math.max(maximum, distancePointToPolylineMeters(point, right)),
      0
    ),
    sampleCoordinates(right).reduce(
      (maximum, point) => Math.max(maximum, distancePointToPolylineMeters(point, left)),
      0
    )
  );
}
function sampleCoordinates(coordinates) {
  if (coordinates.length <= MAX_GEOMETRY_COMPARISON_SAMPLES) return coordinates;
  return Array.from(
    { length: MAX_GEOMETRY_COMPARISON_SAMPLES },
    (_, index) => coordinates[Math.round(
      index * (coordinates.length - 1) / (MAX_GEOMETRY_COMPARISON_SAMPLES - 1)
    )]
  );
}
function distancePointToPolylineMeters(point, coordinates) {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    minimum = Math.min(
      minimum,
      distancePointToSegmentMeters(
        point,
        coordinates[index],
        coordinates[index + 1]
      )
    );
  }
  return minimum;
}
function distancePointToSegmentMeters(point, start, end) {
  const latitudeRadians = point.lat * Math.PI / 180;
  const xScale = Math.max(0.1, Math.cos(latitudeRadians));
  const dx = (end.lon - start.lon) * xScale;
  const dy = end.lat - start.lat;
  const px = (point.lon - start.lon) * xScale;
  const py = point.lat - start.lat;
  const denominator = dx * dx + dy * dy;
  const progress = denominator ? Math.min(1, Math.max(0, (px * dx + py * dy) / denominator)) : 0;
  return Math.hypot(
    px - dx * progress,
    py - dy * progress
  ) * 111320;
}
function dedupeCoordinates$1(coordinates) {
  return coordinates.filter((coordinate, index) => {
    const previous = coordinates[index - 1];
    return !previous || distanceMeters$3(previous, coordinate) >= 0.25;
  });
}
function distanceMeters$3(left, right) {
  const latitudeRadians = (left.lat + right.lat) / 2 * Math.PI / 180;
  return Math.hypot(
    (right.lon - left.lon) * Math.cos(latitudeRadians),
    right.lat - left.lat
  ) * 111320;
}
function isValidCoordinate(coordinate) {
  return Number.isFinite(coordinate.lon) && Number.isFinite(coordinate.lat) && Math.abs(coordinate.lon) <= 180 && Math.abs(coordinate.lat) <= 90;
}

const STALE_AFTER_MS = 20 * 24 * 60 * 6e4;
const MANIFEST_CACHE_MS = 6e4;
const COMMITTED_GTFS_ASSET_BASE = "/_gtfs-data";
let manifestCache;
const artifactCache = /* @__PURE__ */ new Map();
const lineLookupCache = /* @__PURE__ */ new Map();
const compiledArtifactCache = /* @__PURE__ */ new Map();
function isGtfsEnabled(event) {
  return !["0", "false", "no", "off"].includes(
    getGtfsRuntimeValue(event, "GTFS_ENABLED").toLowerCase()
  );
}
function getGtfsRuntimeValue(event, key) {
  var _a, _b, _c, _d, _e;
  const cloudflareValue = (_a = getCloudflareEnv(event)) == null ? void 0 : _a[key];
  const nodeValue = (_c = (_b = globalThis.process) == null ? void 0 : _b.env) == null ? void 0 : _c[key];
  return ((_e = (_d = typeof cloudflareValue === "string" ? cloudflareValue : void 0) != null ? _d : nodeValue) != null ? _e : "").trim();
}
async function getGtfsManifest(event, options = {}) {
  if (!options.fresh && manifestCache && manifestCache.expiresAt > Date.now()) {
    return manifestCache.manifest;
  }
  const loaded = await readGtfsJson(event, "current.json");
  manifestCache = {
    expiresAt: Date.now() + MANIFEST_CACHE_MS,
    manifest: loaded.value,
    storage: loaded.storage
  };
  return loaded.value;
}
async function getGtfsPublicStatus(event) {
  var _a, _b;
  const manifest = await getGtfsManifest(event);
  const sourceDate = (_a = manifest == null ? void 0 : manifest.sourceUpdatedAt) != null ? _a : manifest == null ? void 0 : manifest.installedAt;
  const ageMs = sourceDate ? Math.max(0, Date.now() - Date.parse(sourceDate)) : void 0;
  return {
    enabled: isGtfsEnabled(event),
    available: Boolean(manifest),
    ...manifest ? {
      datasetVersion: manifest.datasetVersion,
      sha256: manifest.sha256.slice(0, 12),
      sourceUpdatedAt: manifest.sourceUpdatedAt,
      installedAt: manifest.installedAt,
      ageDays: ageMs === void 0 ? void 0 : Math.floor(ageMs / (24 * 60 * 6e4)),
      lineCount: manifest.lineCount,
      cacheGeneration: manifest.cacheGeneration
    } : {},
    stale: ageMs !== void 0 && ageMs > STALE_AFTER_MS,
    storage: (_b = manifestCache == null ? void 0 : manifestCache.storage) != null ? _b : detectStorage(event)
  };
}
async function loadGtfsLineArtifact(event, lineId) {
  const manifest = await getGtfsManifest(event);
  if (!manifest) return void 0;
  const key = normalizeLineArtifactKey(lineId);
  const cacheKey = `${manifest.sha256}:${key}`;
  const cached = artifactCache.get(cacheKey);
  if (cached) return cached;
  const request = readGtfsJson(
    event,
    `versions/${manifest.sha256}/lines/${key}.json`
  ).then(({ value }) => value);
  artifactCache.set(cacheKey, request);
  request.catch(() => artifactCache.delete(cacheKey));
  return request;
}
async function loadCompiledGtfsLineArtifact(event, lineId) {
  const manifest = await getGtfsManifest(event);
  if (!manifest) return void 0;
  const key = normalizeLineArtifactKey(lineId);
  const cacheKey = `${manifest.sha256}:${manifest.cacheGeneration}:${key}`;
  const cached = compiledArtifactCache.get(cacheKey);
  if (cached) return cached;
  const request = loadGtfsLineArtifact(event, lineId).then(
    (artifact) => artifact ? compileGtfsLineArtifact(artifact) : void 0
  );
  compiledArtifactCache.set(cacheKey, request);
  request.catch(() => compiledArtifactCache.delete(cacheKey));
  return request;
}
async function loadGtfsLineArtifactsByLabel(event, label) {
  var _a;
  const manifest = await getGtfsManifest(event);
  const normalizedLabel = normalizeGtfsLineLabel(label);
  if (!manifest || !normalizedLabel) return [];
  const cacheKey = manifest.sha256;
  let lookupRequest = lineLookupCache.get(cacheKey);
  if (!lookupRequest) {
    lookupRequest = readGtfsJson(
      event,
      `versions/${manifest.sha256}/line-index.json`
    ).then(({ value }) => {
      if (!value) lineLookupCache.delete(cacheKey);
      return value;
    });
    lineLookupCache.set(cacheKey, lookupRequest);
    lookupRequest.catch(() => lineLookupCache.delete(cacheKey));
  }
  const lookup = await lookupRequest;
  const lineIds = (_a = lookup == null ? void 0 : lookup.lineIdsByLabel[normalizedLabel]) != null ? _a : [];
  const artifacts = await Promise.all(
    lineIds.map((lineId) => loadGtfsLineArtifact(event, lineId))
  );
  return artifacts.filter(
    (artifact) => artifact !== void 0
  );
}
function normalizeLineArtifactKey(value) {
  return encodeURIComponent(value.trim().replace(/^line:/iu, ""));
}
async function readGtfsJson(event, key) {
  var _a, _b;
  const bucket = (_a = getCloudflareEnv(event)) == null ? void 0 : _a.GTFS_DATA_BUCKET;
  if (bucket) {
    const object = await bucket.get(`gtfs/${key}`);
    const value = object ? object.json ? await object.json() : JSON.parse(await object.text()) : void 0;
    return { value, storage: "r2" };
  }
  try {
    const value = await useStorage("gtfs").getItem(key);
    if (value !== null && value !== void 0) {
      return { value, storage: "local" };
    }
  } catch {
  }
  if (event) {
    try {
      const request = new Request(
        new URL(createCommittedGtfsAssetPath(key), getRequestURL(event).origin),
        { headers: { Accept: "application/json" } }
      );
      const response = ((_b = getCloudflareEnv(event)) == null ? void 0 : _b.ASSETS) ? await getCloudflareEnv(event).ASSETS.fetch(request) : await fetch(request);
      if (response.ok) {
        return { value: await response.json(), storage: "local" };
      }
    } catch {
    }
  }
  return { storage: "unconfigured" };
}
function getCloudflareEnv(event) {
  var _a, _b;
  return (_b = (_a = event == null ? void 0 : event.context) == null ? void 0 : _a.cloudflare) == null ? void 0 : _b.env;
}
function detectStorage(event) {
  var _a;
  if ((_a = getCloudflareEnv(event)) == null ? void 0 : _a.GTFS_DATA_BUCKET) return "r2";
  return "local";
}
function createCommittedGtfsAssetPath(key) {
  const encodedKey = key.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  return `${COMMITTED_GTFS_ASSET_BASE}/${encodedKey}`;
}

const DEFAULT_NETEX_MEMORY_CACHE_TTL_MS = 3e5;
const cacheSourcePromise = /* @__PURE__ */ new Map();
const indexCache = /* @__PURE__ */ new Map();
const lineCache = /* @__PURE__ */ new Map();
let warnedLocalOnlyCache = false;
const announcedCacheSources = /* @__PURE__ */ new Set();
const KNOWN_LINE_CODES = {
  "metro-4": "C01374",
  "m4": "C01374",
  "rer-a": "C01742",
  "rer-b": "C01743",
  "rer-d": "C01728",
  "tram-t10": "C02528",
  "t10": "C02528",
  "transilien-j": "C01739",
  "train-j": "C01739"
};
const KNOWN_LINE_ALIASES_BY_CODE = {
  C01374: ["metro-4", "m4"],
  C01728: ["rer-d"],
  C01739: ["transilien-j", "train-j"],
  C01742: ["rer-a"],
  C01743: ["rer-b"],
  C02528: ["tram-t10", "t10"]
};
const MODE_BY_CODE = {
  C01374: "metro",
  C01728: "rer",
  C01739: "train",
  C01742: "rer",
  C01743: "rer",
  C02528: "tram"
};
function getNetexMemoryCacheTtlMs(runtimeEnv) {
  const configured = getRuntimeEnv$1(runtimeEnv).IDFM_NETEX_CACHE_MEMORY_TTL_MS;
  const parsed = configured ? Number(configured) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_NETEX_MEMORY_CACHE_TTL_MS;
}
function getTimedCacheEntry$1(cache, key) {
  const entry = cache.get(key);
  if (!entry) {
    return void 0;
  }
  if (Date.now() <= entry.expiresAt) {
    return entry.promise;
  }
  cache.delete(key);
  return void 0;
}
function setTimedCacheEntry$1(cache, key, promise, ttlMs) {
  const entry = {
    expiresAt: Date.now() + ttlMs,
    promise
  };
  cache.set(key, entry);
  promise.catch(() => {
    var _a;
    if (((_a = cache.get(key)) == null ? void 0 : _a.promise) === promise) {
      cache.delete(key);
    }
  });
}
async function getLineTopologyFromNetexCache(lineId, runtimeEnv) {
  const source = await resolveNetexCacheSource(runtimeEnv);
  const sourceId = createSourceId$1(source);
  const index = await loadNetexIndex(source);
  const code = resolveLineCode(lineId, index);
  const cacheKey = `${sourceId}:${code}`;
  const cached = getTimedCacheEntry$1(lineCache, cacheKey);
  if (cached) {
    return cached;
  }
  const request = loadNetexLineByCode(source, code, index).then(
    adaptNetexLineToTopology
  );
  setTimedCacheEntry$1(
    lineCache,
    cacheKey,
    request,
    getNetexMemoryCacheTtlMs(runtimeEnv)
  );
  return request;
}
async function loadNetexLineCache(lineId, runtimeEnv) {
  const source = await resolveNetexCacheSource(runtimeEnv);
  const index = await loadNetexIndex(source);
  const code = resolveLineCode(lineId, index);
  return loadNetexLineByCode(source, code, index);
}
async function getNetexCacheStatus(runtimeEnv) {
  try {
    const source = await resolveNetexCacheSource(runtimeEnv);
    const index = await loadNetexIndex(source);
    return {
      available: true,
      source: {
        kind: source.kind,
        location: source.root
      },
      generatedAt: index.generatedAt,
      lineCount: index.lines.length,
      warning: source.warning
    };
  } catch (error) {
    return {
      available: false,
      source: getConfiguredCacheSourceHint(runtimeEnv),
      message: error instanceof Error ? error.message : "NeTEx cache could not be loaded."
    };
  }
}
function getNetexRuntimeEnv(event) {
  var _a, _b, _c;
  const nodeEnv = (_a = globalThis.process) == null ? void 0 : _a.env;
  const cfEnv = (_c = (_b = event == null ? void 0 : event.context) == null ? void 0 : _b.cloudflare) == null ? void 0 : _c.env;
  return {
    ...nodeEnv != null ? nodeEnv : {},
    ...cfEnv != null ? cfEnv : {}
  };
}
function createNetexCacheEnvironmentKey(runtimeEnv) {
  var _a;
  const config = getConfiguredCacheConfig(runtimeEnv);
  return `${config.kind}:${(_a = config.value) != null ? _a : "__auto__"}`;
}
function resolveKnownLineAlias(transportType, lineId) {
  const normalizedType = normalizeSlug(transportType);
  const normalizedLine = normalizeSlug(lineId);
  const directCode = extractLineCode(lineId);
  if (directCode) {
    return `line:IDFM:${directCode}`;
  }
  const candidates = [
    `${normalizedType}-${normalizedLine}`,
    normalizedLine
  ];
  const code = candidates.map((candidate) => KNOWN_LINE_CODES[candidate]).find(Boolean);
  if (code) {
    return `line:IDFM:${code}`;
  }
  return normalizedType ? `${normalizedType}-${normalizedLine}` : normalizedLine;
}
async function resolveNetexCacheSource(runtimeEnv) {
  const config = getConfiguredCacheConfig(runtimeEnv);
  const cacheKey = createNetexCacheEnvironmentKey(runtimeEnv);
  const cached = cacheSourcePromise.get(cacheKey);
  if (cached) {
    return cached;
  }
  const request = findNetexCacheSource(config, getRuntimeEnv$1(runtimeEnv)).then(
    (source) => {
      announceNetexCacheSource(source, config);
      return source;
    }
  );
  cacheSourcePromise.set(cacheKey, request);
  return request;
}
async function findNetexCacheSource(config, runtimeEnv) {
  var _a;
  if (config.kind === "remote") {
    const remote = (_a = config.value) != null ? _a : "";
    if (isR2Url$1(remote)) {
      const r2Source = parseR2CacheSource$1(remote, runtimeEnv);
      validateR2Config$1(runtimeEnv);
      return r2Source;
    }
    if (isHttpUrl$1(remote)) {
      return {
        kind: "remote",
        root: trimTrailingSlashes$1(remote)
      };
    }
    throw new Error(
      `Invalid IDFM_NETEX_CACHE_REMOTE value "${remote}". Expected an r2:// or HTTP(S) cache URL.`
    );
  }
  warnLocalOnlyCache(config.kind === "local" ? config.value : void 0);
  const candidates = config.kind === "local" && config.value ? [config.value] : await getDefaultLocalCacheCandidates();
  for (const candidate of candidates) {
    const stat = await statLocalCacheIndex(candidate);
    if (stat == null ? void 0 : stat.isFile()) {
      return {
        kind: "directory",
        root: candidate,
        warning: "IDFM_NETEX_CACHE_LOCAL is using a local filesystem path. This works locally, but production should use IDFM_NETEX_CACHE_REMOTE."
      };
    }
  }
  throw new Error(
    `NeTEx cache not found. Set IDFM_NETEX_CACHE_REMOTE to an r2:// or HTTP(S) cache URL, or IDFM_NETEX_CACHE_LOCAL to a folder containing index.json.`
  );
}
async function loadNetexIndex(source) {
  const cacheKey = createSourceId$1(source);
  const cached = getTimedCacheEntry$1(indexCache, cacheKey);
  if (cached) {
    return cached;
  }
  const request = readCacheJson$1(source, "index.json");
  setTimedCacheEntry$1(
    indexCache,
    cacheKey,
    request,
    getNetexMemoryCacheTtlMs(source.env)
  );
  return request;
}
async function loadNetexLineByCode(source, code, index) {
  const entry = index.lines.find((line) => line.code === code);
  if (!entry) {
    throw new Error(`Line ${code} is not present in NeTEx cache index.`);
  }
  return readCacheJson$1(source, entry.file);
}
async function readCacheJson$1(source, relativePath) {
  const safePath = normalizeCachePath$1(relativePath);
  if (source.kind === "remote") {
    const response = await fetch(`${source.root}/${safePath}`);
    if (!response.ok) {
      throw new Error(
        `NeTEx cache request failed for ${safePath}: ${response.status} ${response.statusText}`
      );
    }
    return response.json();
  }
  if (source.kind === "r2") {
    const response = await fetchSignedR2Object$1(source, safePath);
    if (!response.ok) {
      throw new Error(
        `NeTEx R2 cache request failed for ${safePath}: ${response.status} ${response.statusText}`
      );
    }
    return response.json();
  }
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  return JSON.parse(
    await fs.readFile(path.join(source.root, safePath), "utf8")
  );
}
function getConfiguredCacheConfig(runtimeEnv) {
  var _a, _b;
  const env = getRuntimeEnv$1(runtimeEnv);
  const remote = (_a = env.IDFM_NETEX_CACHE_REMOTE) == null ? void 0 : _a.trim();
  const local = (_b = env.IDFM_NETEX_CACHE_LOCAL) == null ? void 0 : _b.trim();
  if (remote) {
    return {
      kind: "remote",
      value: remote
    };
  }
  if (local) {
    return {
      kind: "local",
      value: local
    };
  }
  return {
    kind: "auto"
  };
}
function getConfiguredCacheSourceHint(runtimeEnv) {
  var _a, _b, _c;
  const config = getConfiguredCacheConfig(runtimeEnv);
  if (config.kind === "auto") {
    return {
      kind: "auto",
      location: "public/data/netex or ../idfm-node-backend/public/data/netex"
    };
  }
  const kind = config.kind === "local" ? "directory" : isR2Url$1((_a = config.value) != null ? _a : "") ? "r2" : isHttpUrl$1((_b = config.value) != null ? _b : "") ? "remote" : "directory";
  return {
    kind,
    location: (_c = config.value) != null ? _c : ""
  };
}
function warnLocalOnlyCache(configured) {
  if (warnedLocalOnlyCache) {
    return;
  }
  const localTarget = configured ? `local path "${configured}"` : "automatic local cache search";
  console.warn(
    `[netex-cache] IDFM_NETEX_CACHE_REMOTE is not configured; using ${localTarget}. This will only work locally or if the NeTEx cache files are packaged with the Nuxt server.`
  );
  warnedLocalOnlyCache = true;
}
function announceNetexCacheSource(source, config) {
  const sourceKey = createSourceId$1(source);
  if (announcedCacheSources.has(sourceKey)) {
    return;
  }
  if (source.kind === "r2") {
    console.info(
      `[netex-cache] Using remote R2 cache bucket=${source.bucket} prefix=${source.prefix || "(root)"}`
    );
  } else if (source.kind === "remote") {
    console.info(`[netex-cache] Using remote HTTP cache ${source.root}`);
  } else if (config.kind === "auto") {
    console.info(`[netex-cache] Using auto-discovered local cache ${source.root}`);
  } else {
    console.info(`[netex-cache] Using local cache ${source.root}`);
  }
  announcedCacheSources.add(sourceKey);
}
function createSourceId$1(source) {
  return `${source.kind}:${source.root}`;
}
function isHttpUrl$1(value) {
  return /^https?:\/\//iu.test(value);
}
function isR2Url$1(value) {
  return /^r2:\/\//iu.test(value);
}
function trimTrailingSlashes$1(value) {
  return value.replace(/\/+$/u, "");
}
function normalizeCachePath$1(value) {
  const normalized = value.replace(/\\/gu, "/").replace(/^\/+/u, "");
  if (!normalized || normalized.split("/").some((part) => part === ".." || part === "")) {
    throw new Error(`Invalid NeTEx cache path: ${value}`);
  }
  return normalized;
}
function parseR2CacheSource$1(value, runtimeEnv) {
  const url = new URL(value);
  const bucket = url.hostname;
  const prefix = normalizeR2Prefix(url.pathname);
  if (!bucket) {
    throw new Error(
      `Invalid R2 cache URL "${value}". Expected r2://bucket/path/to/netex-cache.`
    );
  }
  return {
    kind: "r2",
    root: `r2://${bucket}${prefix ? `/${prefix}` : ""}`,
    bucket,
    env: getRuntimeEnv$1(runtimeEnv),
    prefix
  };
}
function normalizeR2Prefix(value) {
  return value.replace(/^\/+|\/+$/gu, "");
}
function validateR2Config$1(runtimeEnv) {
  const env = getRuntimeEnv$1(runtimeEnv);
  const missing = [
    ["R2_ACCOUNT_ID", env.R2_ACCOUNT_ID],
    ["R2_ACCESS_KEY_ID", env.R2_ACCESS_KEY_ID],
    ["R2_SECRET_ACCESS_KEY", env.R2_SECRET_ACCESS_KEY]
  ].filter(([, value]) => !(value == null ? void 0 : value.trim())).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(
      `R2 NeTEx cache is configured but missing ${missing.join(", ")}.`
    );
  }
}
async function fetchSignedR2Object$1(source, relativePath) {
  var _a, _b;
  if (!source.bucket) {
    throw new Error("R2 cache source is missing its bucket name.");
  }
  const objectKey = [source.prefix, relativePath].filter(Boolean).join("/");
  const endpoint = ((_b = (_a = source.env) == null ? void 0 : _a.R2_ENDPOINT) == null ? void 0 : _b.replace(/\/+$/u, "")) || `https://${requiredEnv$1("R2_ACCOUNT_ID", source.env)}.r2.cloudflarestorage.com`;
  const requestUrl = new URL(
    `${endpoint}/${encodePathSegment(source.bucket)}/${encodeObjectKey$1(objectKey)}`
  );
  const headers = await createR2SignedHeaders$1(requestUrl, source.env);
  const response = await fetch(requestUrl, {
    headers,
    method: "GET"
  });
  if (!response.ok) {
    console.warn(
      `[netex-cache] R2 GET failed bucket=${source.bucket} key=${objectKey} status=${response.status} ${response.statusText}`
    );
  }
  return response;
}
async function createR2SignedHeaders$1(url, runtimeEnv) {
  const env = getRuntimeEnv$1(runtimeEnv);
  const now = /* @__PURE__ */ new Date();
  const amzDate = formatAmzDate$1(now);
  const dateScope = amzDate.slice(0, 8);
  const host = url.host;
  const payloadHash = "UNSIGNED-PAYLOAD";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = `host:${host}
x-amz-content-sha256:${payloadHash}
x-amz-date:${amzDate}
`;
  const canonicalRequest = [
    "GET",
    url.pathname,
    url.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");
  const credentialScope = `${dateScope}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex$1(canonicalRequest)
  ].join("\n");
  const signature = await signR2Request$1(
    requiredEnv$1("R2_SECRET_ACCESS_KEY", env),
    dateScope,
    stringToSign
  );
  const authorization = `AWS4-HMAC-SHA256 Credential=${requiredEnv$1("R2_ACCESS_KEY_ID", env)}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return new Headers({
    Authorization: authorization,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  });
}
async function signR2Request$1(secretAccessKey, dateScope, stringToSign) {
  const dateKey = await hmac$1(`AWS4${secretAccessKey}`, dateScope);
  const regionKey = await hmac$1(dateKey, "auto");
  const serviceKey = await hmac$1(regionKey, "s3");
  const signingKey = await hmac$1(serviceKey, "aws4_request");
  const signature = await hmac$1(signingKey, stringToSign);
  return toHex$1(signature);
}
async function sha256Hex$1(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return toHex$1(digest);
}
async function hmac$1(key, value) {
  const rawKey = typeof key === "string" ? new TextEncoder().encode(key) : new Uint8Array(key);
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    rawKey,
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  return globalThis.crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(value)
  );
}
function toHex$1(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function formatAmzDate$1(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/gu, "");
}
function encodePathSegment(value) {
  return encodeURIComponent(value);
}
function encodeObjectKey$1(value) {
  return value.split("/").map((part) => encodeURIComponent(part)).join("/");
}
function requiredEnv$1(name, runtimeEnv) {
  var _a;
  const value = (_a = getRuntimeEnv$1(runtimeEnv)[name]) == null ? void 0 : _a.trim();
  if (!value) {
    throw new Error(`Missing required R2 environment variable ${name}.`);
  }
  return value;
}
function getRuntimeEnv$1(runtimeEnv) {
  var _a, _b;
  if (runtimeEnv) {
    return runtimeEnv;
  }
  return (_b = (_a = globalThis.process) == null ? void 0 : _a.env) != null ? _b : {};
}
async function getDefaultLocalCacheCandidates() {
  const path = await import('node:path');
  return [
    path.resolve(process.cwd(), "public/data/netex"),
    path.resolve(process.cwd(), "../idfm-node-backend/public/data/netex")
  ];
}
async function statLocalCacheIndex(candidate) {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  return fs.stat(path.join(candidate, "index.json")).catch(() => null);
}
function resolveLineCode(lineId, index) {
  const decoded = decodeURIComponent(lineId).trim();
  const directCode = extractLineCode(decoded);
  if (directCode) {
    return directCode;
  }
  const normalized = normalizeSlug(decoded);
  const knownCode = KNOWN_LINE_CODES[normalized];
  if (knownCode) {
    return knownCode;
  }
  const aliasMatch = index.lines.find(
    (line) => {
      var _a;
      return ((_a = line.aliases) != null ? _a : []).some((alias) => normalizeSlug(alias) === normalized);
    }
  );
  if (aliasMatch) {
    return aliasMatch.code;
  }
  const exact = index.lines.find(
    (line) => line.primLineId === decoded || line.id === decoded || normalizeSlug(line.name) === normalized
  );
  if (exact) {
    const sameNameMatches = index.lines.filter(
      (line) => normalizeSlug(line.name) === normalizeSlug(exact.name)
    );
    if (sameNameMatches.length === 1) {
      return exact.code;
    }
  }
  throw new Error(`No stable NeTEx cache line mapping found for ${lineId}.`);
}
function extractLineCode(value) {
  var _a;
  return (_a = value.match(/C\d{5}/iu)) == null ? void 0 : _a[0].toUpperCase();
}
function adaptNetexLineToTopology(cache) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
  const nodes = cache.schematic.nodes;
  const stationById = new Map(nodes.map((node) => [node.id, node]));
  const rawToSchematicId = buildRawToSchematicMap(cache, stationById);
  const quaysByStationId = buildTopologyQuaysByStationId(
    cache,
    rawToSchematicId,
    stationById
  );
  const stations = nodes.map((node) => {
    const quays = quaysByStationId.get(node.id);
    return {
      id: node.id,
      name: decodeMojibake(node.name),
      city: normalizeCacheCity(node.city),
      degree: node.degree,
      aliases: [node.name].filter(
        (alias) => alias !== decodeMojibake(node.name)
      ),
      projectedX: node.x,
      projectedY: node.y,
      srsName: node.srsName,
      ...(quays == null ? void 0 : quays.length) ? { quays } : {}
    };
  }).sort((left, right) => left.name.localeCompare(right.name, "fr"));
  const segments = buildTopologySegmentsFromSchematic(cache);
  const patterns = buildTopologyPatternsFromNetex(cache, rawToSchematicId, stationById);
  const branches = buildTopologyBranchesFromSchematic(cache);
  const terminalJunctions = buildTopologyTerminalJunctionsFromSchematic(cache);
  const loops = buildTopologyLoopsFromSchematic(cache);
  const branchPoints = nodes.filter((node) => node.isJunction || node.degree >= 3).map((node) => node.id).sort();
  const terminals = nodes.filter((node) => node.isTerminal || node.degree === 1).map((node) => node.id).sort();
  const code = (_b = (_a = cache.line.code) != null ? _a : cache.schematic.line.code) != null ? _b : "";
  const shortName = decodeMojibake(cache.line.name || cache.schematic.line.name || code);
  const mode = (_e = (_d = normalizeCacheTransportMode((_c = cache.line.transportMode) != null ? _c : cache.schematic.line.transportMode)) != null ? _d : MODE_BY_CODE[code]) != null ? _e : "train";
  return {
    line: {
      id: (_g = (_f = cache.line.primLineId) != null ? _f : cache.schematic.line.primLineId) != null ? _g : `line:IDFM:${code}`,
      aliases: [
        cache.line.id,
        cache.schematic.line.id,
        cache.line.primLineId,
        cache.schematic.line.primLineId,
        code,
        shortName,
        ...(_h = cache.line.aliases) != null ? _h : [],
        ...(_i = cache.schematic.line.aliases) != null ? _i : [],
        ...(_j = KNOWN_LINE_ALIASES_BY_CODE[code]) != null ? _j : []
      ].filter((value) => Boolean(value)),
      name: createLineName(mode, shortName),
      shortName,
      mode
    },
    stations,
    segments,
    patterns,
    branches,
    terminalJunctions,
    loops,
    branchPoints,
    terminals
  };
}
function buildTopologyTerminalJunctionsFromSchematic(cache) {
  var _a;
  return ((_a = cache.schematic.terminalJunctions) != null ? _a : []).map((junction) => ({
    id: junction.id,
    junctionStationId: junction.junctionStationId,
    direction: junction.direction,
    axisDegrees: junction.axisDegrees,
    arms: junction.arms.map((arm) => ({
      id: arm.id,
      anchorStationId: arm.anchorStationId,
      stationIds: dedupeConsecutive$1(arm.stationIds),
      direction: arm.direction,
      side: arm.side,
      angleDegrees: arm.angleDegrees
    }))
  })).filter((junction) => junction.arms.length >= 3).sort((left, right) => left.id.localeCompare(right.id));
}
function buildRawToSchematicMap(cache, stationById) {
  var _a, _b, _c;
  const rawToSchematicId = /* @__PURE__ */ new Map();
  const hasSchematicRawRefs = Array.from(stationById.values()).some(
    (node) => {
      var _a2, _b2;
      return ((_b2 = (_a2 = node.rawRefs) == null ? void 0 : _a2.length) != null ? _b2 : 0) > 0;
    }
  );
  for (const node of stationById.values()) {
    rawToSchematicId.set(node.id, node.id);
    for (const rawRef of (_a = node.rawRefs) != null ? _a : []) {
      rawToSchematicId.set(rawRef, node.id);
    }
  }
  for (const station of (_b = cache.stations) != null ? _b : []) {
    if (stationById.has(station.id)) {
      rawToSchematicId.set(station.id, station.id);
      continue;
    }
    for (const rawRef of (_c = station.rawRefs) != null ? _c : []) {
      const schematicId = rawToSchematicId.get(rawRef);
      if (schematicId) {
        rawToSchematicId.set(station.id, schematicId);
        rawToSchematicId.set(rawRef, schematicId);
      }
    }
  }
  if (!hasSchematicRawRefs) {
    addLegacyRawToSchematicNameFallback(cache, stationById, rawToSchematicId);
  }
  return rawToSchematicId;
}
function addLegacyRawToSchematicNameFallback(cache, stationById, rawToSchematicId) {
  var _a, _b, _c, _d;
  const byName = /* @__PURE__ */ new Map();
  for (const node of stationById.values()) {
    const key = normalizeStationName(node.name);
    byName.set(key, [...(_a = byName.get(key)) != null ? _a : [], node]);
  }
  for (const station of (_b = cache.stations) != null ? _b : []) {
    if (rawToSchematicId.has(station.id)) {
      continue;
    }
    const candidates = (_c = byName.get(normalizeStationName(station.name))) != null ? _c : [];
    const match = chooseNearestNode(station, candidates);
    if (!match) {
      continue;
    }
    rawToSchematicId.set(station.id, match.id);
    for (const rawRef of (_d = station.rawRefs) != null ? _d : []) {
      if (!rawToSchematicId.has(rawRef)) {
        rawToSchematicId.set(rawRef, match.id);
      }
    }
  }
}
function buildTopologyQuaysByStationId(cache, rawToSchematicId, stationById) {
  var _a, _b;
  const quaysByStationId = /* @__PURE__ */ new Map();
  for (const station of (_a = cache.stations) != null ? _a : []) {
    if (!isFiniteNumber(station.x) || !isFiniteNumber(station.y)) {
      continue;
    }
    const schematicId = rawToSchematicId.get(station.id);
    if (!schematicId || !stationById.has(schematicId)) {
      continue;
    }
    const quays = (_b = quaysByStationId.get(schematicId)) != null ? _b : /* @__PURE__ */ new Map();
    quays.set(station.id, {
      id: station.id,
      name: decodeMojibake(station.name),
      projectedX: station.x,
      projectedY: station.y,
      srsName: station.srsName
    });
    quaysByStationId.set(schematicId, quays);
  }
  return new Map(
    Array.from(quaysByStationId, ([stationId, quays]) => [
      stationId,
      Array.from(quays.values()).sort(
        (left, right) => left.id.localeCompare(right.id)
      )
    ])
  );
}
function chooseNearestNode(station, candidates) {
  if (candidates.length <= 1) {
    return candidates[0];
  }
  if (!isFiniteNumber(station.x) || !isFiniteNumber(station.y)) {
    return candidates[0];
  }
  return [...candidates].sort((left, right) => {
    const leftDistance = distanceSquared(station, left);
    const rightDistance = distanceSquared(station, right);
    return leftDistance - rightDistance;
  })[0];
}
function buildTopologySegmentsFromSchematic(cache) {
  const segmentsById = /* @__PURE__ */ new Map();
  for (const segment of cache.schematic.segments) {
    const stationIds = dedupeConsecutive$1(segment.stationIds);
    stationIds.slice(0, -1).forEach((from, index) => {
      const to = stationIds[index + 1];
      const id = segmentId$1(from, to);
      const existing = segmentsById.get(id);
      if (existing) {
        addUnique(existing.patterns, segment.id);
        return;
      }
      segmentsById.set(id, {
        id,
        from,
        to,
        patterns: [segment.id]
      });
    });
  }
  return [...segmentsById.values()].sort(
    (left, right) => left.id.localeCompare(right.id)
  );
}
function buildTopologyBranchesFromSchematic(cache) {
  return cache.schematic.branchGroups.flatMap(
    (group) => group.branches.map((branch) => {
      const layout = createTopologyBranchLayout(group, branch.id);
      return {
        id: branch.id,
        from: group.junctionStationId,
        to: branch.terminalStationId,
        stops: dedupeConsecutive$1(branch.stationIds),
        ...layout ? { layout } : {}
      };
    })
  ).sort((left, right) => left.id.localeCompare(right.id));
}
function buildTopologyLoopsFromSchematic(cache) {
  return cache.schematic.loops.map((loop) => {
    var _a, _b, _c, _d;
    return {
      id: loop.id,
      kind: loop.kind,
      anchorStationIds: dedupeConsecutive$1(loop.anchorStationIds),
      segmentIds: dedupeConsecutive$1(loop.segmentIds),
      stationIds: dedupeConsecutive$1(loop.stationIds),
      orderedAnchorStationIds: dedupeConsecutive$1(
        (_a = loop.orderedAnchorStationIds) != null ? _a : loop.anchorStationIds
      ),
      orderedSegmentIds: dedupeConsecutive$1((_b = loop.orderedSegmentIds) != null ? _b : loop.segmentIds),
      orderedStationIds: dedupeConsecutive$1((_c = loop.orderedStationIds) != null ? _c : loop.stationIds),
      laneHints: ((_d = loop.laneHints) != null ? _d : []).map((hint) => ({
        id: hint.id,
        role: hint.role,
        anchorStationIds: dedupeConsecutive$1(hint.anchorStationIds),
        segmentIds: dedupeConsecutive$1(hint.segmentIds),
        stationIds: dedupeConsecutive$1(hint.stationIds),
        lane: hint.lane,
        side: hint.side
      }))
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
}
function createTopologyBranchLayout(group, branchId) {
  var _a;
  const branchLayout = (_a = group.layout) == null ? void 0 : _a.branches.find(
    (candidate) => candidate.branchId === branchId
  );
  if (!group.layout || !branchLayout) {
    return void 0;
  }
  return {
    kind: group.layout.kind,
    junctionStationId: group.junctionStationId,
    terminalStationId: branchLayout.terminalStationId,
    trunkStationId: group.layout.trunkStationId,
    direction: branchLayout.direction,
    side: branchLayout.side,
    axisDegrees: group.layout.axisDegrees,
    angleDegrees: branchLayout.angleDegrees
  };
}
function buildTopologyPatternsFromNetex(cache, rawToSchematicId, stationById) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
  const patternsBySequence = /* @__PURE__ */ new Map();
  const rawQuayIdByReference = /* @__PURE__ */ new Map();
  for (const station of (_a = cache.stations) != null ? _a : []) {
    rawQuayIdByReference.set(station.id, station.id);
    for (const rawRef of (_b = station.rawRefs) != null ? _b : []) {
      rawQuayIdByReference.set(rawRef, station.id);
    }
  }
  for (const pattern of (_c = cache.patterns) != null ? _c : []) {
    const rawStopIds = (_f = (_e = pattern.stopIds) != null ? _e : (_d = pattern.stops) == null ? void 0 : _d.map((stop) => stop.id)) != null ? _f : [];
    const mappedStops = rawStopIds.map((stopId) => {
      var _a2;
      return {
        stopId: (_a2 = rawToSchematicId.get(stopId)) != null ? _a2 : stopId,
        quayId: rawQuayIdByReference.get(stopId)
      };
    }).filter(({ stopId }) => stationById.has(stopId));
    const stopsWithQuays = mappedStops.filter(
      (entry, index) => {
        var _a2;
        return index === 0 || entry.stopId !== ((_a2 = mappedStops[index - 1]) == null ? void 0 : _a2.stopId);
      }
    );
    const stops = stopsWithQuays.map(({ stopId }) => stopId);
    const quayIds = stopsWithQuays.map(({ quayId }) => quayId);
    if (stops.length < 2) {
      continue;
    }
    const sequenceKey = stops.join(">");
    const existing = patternsBySequence.get(sequenceKey);
    if (existing) {
      existing.tripCount += (_g = pattern.serviceCount) != null ? _g : 1;
      if (!((_h = existing.quayIds) == null ? void 0 : _h.some(Boolean)) && quayIds.some(Boolean)) {
        existing.quayIds = quayIds;
      }
      continue;
    }
    const first = stationById.get(stops[0]);
    const last = stationById.get(stops[stops.length - 1]);
    const terminalTo = decodeMojibake((_k = (_j = (_i = pattern.destination) != null ? _i : pattern.direction) != null ? _j : last == null ? void 0 : last.name) != null ? _k : "");
    patternsBySequence.set(sequenceKey, {
      id: pattern.id,
      terminalFrom: decodeMojibake((_l = first == null ? void 0 : first.name) != null ? _l : ""),
      terminalTo: terminalTo || decodeMojibake((_m = last == null ? void 0 : last.name) != null ? _m : ""),
      stops,
      ...quayIds.some(Boolean) ? { quayIds } : {},
      tripCount: (_n = pattern.serviceCount) != null ? _n : 1
    });
  }
  if (patternsBySequence.size > 0) {
    return [...patternsBySequence.values()].sort(
      (left, right) => right.tripCount - left.tripCount || left.id.localeCompare(right.id)
    );
  }
  return cache.schematic.segments.map((segment) => {
    var _a2, _b2;
    const stops = dedupeConsecutive$1(segment.stationIds);
    const first = stationById.get(stops[0]);
    const last = stationById.get(stops[stops.length - 1]);
    return {
      id: segment.id,
      terminalFrom: decodeMojibake((_a2 = first == null ? void 0 : first.name) != null ? _a2 : ""),
      terminalTo: decodeMojibake((_b2 = last == null ? void 0 : last.name) != null ? _b2 : ""),
      stops,
      tripCount: 1
    };
  });
}
function createLineName(mode, shortName) {
  if (mode === "metro") {
    return `Metro ${shortName}`;
  }
  if (mode === "rer") {
    return `RER ${shortName}`;
  }
  if (mode === "tram") {
    return shortName.startsWith("T") ? `Tram ${shortName}` : `Tram ${shortName}`;
  }
  if (mode === "train") {
    return `Transilien ${shortName}`;
  }
  return shortName;
}
function normalizeCacheTransportMode(value) {
  const normalized = normalizeSlug(value != null ? value : "");
  if (!normalized) {
    return null;
  }
  if (normalized === "rail") {
    return "train";
  }
  if (normalized === "metro" || normalized === "rer" || normalized === "tram" || normalized === "train" || normalized === "bus") {
    return normalized;
  }
  return null;
}
function segmentId$1(left, right) {
  return [left, right].sort().join("__");
}
function dedupeConsecutive$1(values) {
  return values.filter((value, index) => index === 0 || value !== values[index - 1]);
}
function normalizeSlug(value) {
  return decodeURIComponent(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " et ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function normalizeStationName(value) {
  return decodeMojibake(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/giu, "").toLowerCase();
}
function normalizeCacheCity(value) {
  const city = decodeMojibake(value).replace(/\s+/g, " ").trim();
  return city || void 0;
}
function decodeMojibake(value) {
  const text = value != null ? value : "";
  if (!/[ÃÂ]/u.test(text)) {
    return text;
  }
  try {
    const bytes = Uint8Array.from([...text].map((char) => char.charCodeAt(0) & 255));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return text;
  }
}
function addUnique(values, value) {
  if (!values.includes(value)) {
    values.push(value);
  }
}
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function distanceSquared(station, node) {
  if (!isFiniteNumber(station.x) || !isFiniteNumber(station.y)) {
    return Number.MAX_SAFE_INTEGER;
  }
  if (!isFiniteNumber(node.x) || !isFiniteNumber(node.y)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return (station.x - node.x) ** 2 + (station.y - node.y) ** 2;
}

const STATION_METRIC_ORDER = {
  annual_station_entries: 0,
  annual_station_boardings: 1
};
const IDFM_RAIL_VALIDATION_SOURCE = "idfm-rail-validations";
function rankLine(line, lines) {
  const ranking = rankValue(
    line.primary,
    lines.filter((candidate) => candidate.mode === line.mode).map((candidate) => ({ id: candidate.id, value: candidate.primary }))
  );
  return ranking ? { ...ranking, scope: "mode", mode: line.mode } : void 0;
}
function rankStationCollections(stationId, line, lines) {
  var _a, _b, _c;
  const allStations = canonicalStations(lines);
  const modeStations = canonicalStations(lines.filter((candidate) => candidate.mode === line.mode));
  const station = (_a = line.stations.find((candidate) => candidate.id === stationId)) != null ? _a : allStations.find((candidate) => candidate.id === stationId);
  if (!station) return {};
  if (isIdfmRailValidation(station.primary)) {
    const network2 = rankIdfmRailValidationStation(station.primary, lines);
    const lineRanking2 = rankIdfmRailValidationStationCandidates(station.primary, line.stations);
    return {
      ...network2 ? { network: { ...network2, scope: "network" } } : {},
      ...lineRanking2 ? {
        line: {
          ...lineRanking2,
          scope: "line",
          lineId: line.id
        }
      } : {}
    };
  }
  const network = rankContextStation(
    stationId,
    station.primary,
    allStations.find((candidate) => candidate.id === stationId),
    allStations
  );
  const mode = rankValue(
    (_c = (_b = modeStations.find((candidate) => candidate.id === stationId)) == null ? void 0 : _b.primary) != null ? _c : station.primary,
    modeStations.map((candidate) => ({ id: candidate.id, value: candidate.primary }))
  );
  const lineRanking = rankValue(
    station.primary,
    line.stations.map((candidate) => ({ id: candidate.id, value: candidate.primary }))
  );
  return {
    ...network ? { network: { ...network, scope: "network" } } : {},
    ...mode ? {
      mode: {
        ...mode,
        scope: "mode",
        mode: line.mode
      }
    } : {},
    ...lineRanking ? {
      line: {
        ...lineRanking,
        scope: "line",
        lineId: line.id
      }
    } : {}
  };
}
function rankNetworkStation(stationId, lines) {
  const stations = canonicalStations(lines);
  const station = stations.find((candidate) => candidate.id === stationId);
  if (station && isIdfmRailValidation(station.primary)) {
    return rankIdfmRailValidationStation(station.primary, lines);
  }
  return rankStations(stationId, stations);
}
function rankStations(stationId, stations) {
  const station = stations.find((candidate) => candidate.id === stationId);
  if (!station) return void 0;
  return rankValue(
    station.primary,
    stations.map((candidate) => ({ id: candidate.id, value: candidate.primary }))
  );
}
function decorateLineWithRankings(line, lines) {
  return {
    ...line,
    ranking: rankLine(line, lines),
    stations: line.stations.map((station) => ({
      ...station,
      rankings: rankStationCollections(station.id, line, lines)
    }))
  };
}
function canonicalStations(lines) {
  var _a;
  const candidatesById = /* @__PURE__ */ new Map();
  for (const line of lines) {
    for (const station of line.stations) {
      const candidates = (_a = candidatesById.get(station.id)) != null ? _a : [];
      candidates.push(station);
      candidatesById.set(station.id, candidates);
    }
  }
  return [...candidatesById.entries()].map(([id, candidates]) => canonicalStation(id, candidates)).filter((station) => Boolean(station));
}
function canonicalStation(id, candidates) {
  const preferred = [...candidates].filter((candidate) => isRankable(candidate.primary)).sort(comparePrimaryPreference);
  const selected = preferred[0];
  if (!selected) {
    const fallback = candidates[0];
    return fallback ? {
      id,
      name: fallback.name,
      ...fallback.city ? { city: fallback.city } : {},
      lineIds: [...new Set(candidates.flatMap((candidate) => candidate.lineIds))].sort(),
      measures: mergeMeasures(candidates),
      primary: fallback.primary
    } : void 0;
  }
  const compatible = preferred.filter(
    (candidate) => comparableKey(candidate.primary) === comparableKey(selected.primary)
  );
  const hasConflictingValues = compatible.some((candidate) => candidate.primary.value !== selected.primary.value);
  const primary = hasConflictingValues ? unavailableValue() : selected.primary;
  return {
    id,
    name: selected.name,
    ...selected.city ? { city: selected.city } : {},
    lineIds: [...new Set(candidates.flatMap((candidate) => candidate.lineIds))].sort(),
    measures: mergeMeasures(candidates),
    primary
  };
}
function rankValue(value, candidates) {
  if (!isRankable(value)) return void 0;
  const key = rankingComparableKey(value);
  if (!key) return void 0;
  const compatible = candidates.filter(
    (candidate) => isRankable(candidate.value) && rankingComparableKey(candidate.value) === key
  );
  if (!compatible.length) return void 0;
  const rank = 1 + compatible.filter((candidate) => candidate.value.value > value.value).length;
  return {
    scope: "network",
    rank,
    total: compatible.length,
    year: value.year,
    metric: value.metric,
    unit: value.unit
  };
}
function rankIdfmRailValidationStation(value, lines) {
  return rankIdfmRailValidationStationCandidates(value, lines.flatMap((line) => line.stations));
}
function rankIdfmRailValidationStationCandidates(value, stations) {
  var _a;
  const candidatesByIdentity = /* @__PURE__ */ new Map();
  for (const station of stations) {
    if (!isIdfmRailValidation(station.primary)) continue;
    const identity = ((_a = station.primary.qualifier) == null ? void 0 : _a.stationIdentity) || station.id;
    const existing = candidatesByIdentity.get(identity);
    if (!existing || comparePrimaryPreference(station, existing) < 0) {
      candidatesByIdentity.set(identity, station);
    }
  }
  return rankValue(value, [...candidatesByIdentity.entries()].map(([id, station]) => ({ id, value: station.primary })));
}
function rankContextStation(stationId, contextValue, canonical, stations) {
  if (canonical && isRankable(canonical.primary)) {
    return rankValue(
      canonical.primary,
      stations.map((candidate) => ({ id: candidate.id, value: candidate.primary }))
    );
  }
  if (!isRankable(contextValue)) return void 0;
  const candidates = stations.filter((candidate) => candidate.id !== stationId).map((candidate) => ({ id: candidate.id, value: candidate.primary }));
  if (!candidates.some((candidate) => rankingComparableKey(candidate.value) === rankingComparableKey(contextValue))) {
    return void 0;
  }
  const ranking = rankValue(contextValue, [...candidates, { id: stationId, value: contextValue }]);
  return ranking && ranking.total > 1 ? ranking : void 0;
}
function isRankable(value) {
  return value.status !== "unavailable" && typeof value.value === "number" && Number.isFinite(value.value) && typeof value.year === "number" && typeof value.metric === "string" && typeof value.unit === "string";
}
function comparableKey(value) {
  return isRankable(value) ? `${value.metric}|${value.unit}|${value.year}` : void 0;
}
function rankingComparableKey(value) {
  if (isIdfmRailValidation(value)) {
    return `${value.metric}|${value.unit}|${value.year}|${IDFM_RAIL_VALIDATION_SOURCE}`;
  }
  return isRankable(value) ? `${value.metric}|${value.unit}` : void 0;
}
function isIdfmRailValidation(value) {
  return isRankable(value) && value.metric === "annual_station_entries" && value.unit === "entries" && value.sourceIds.includes(IDFM_RAIL_VALIDATION_SOURCE);
}
function comparePrimaryPreference(left, right) {
  var _a, _b, _c, _d, _e, _f;
  const leftMetric = (_b = STATION_METRIC_ORDER[(_a = left.primary.metric) != null ? _a : ""]) != null ? _b : 99;
  const rightMetric = (_d = STATION_METRIC_ORDER[(_c = right.primary.metric) != null ? _c : ""]) != null ? _d : 99;
  return leftMetric - rightMetric || Number(right.primary.status === "official") - Number(left.primary.status === "official") || ((_e = right.primary.year) != null ? _e : 0) - ((_f = left.primary.year) != null ? _f : 0) || left.id.localeCompare(right.id);
}
function mergeMeasures(candidates) {
  const seen = /* @__PURE__ */ new Set();
  return candidates.flatMap((candidate) => candidate.measures).filter((measure) => {
    const key = JSON.stringify(measure);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function unavailableValue() {
  return { value: null, status: "unavailable", sourceIds: [], sourceRecordIds: [] };
}

const DEFAULT_MEMORY_CACHE_TTL_MS = 3e5;
const sourcePromises = /* @__PURE__ */ new Map();
const snapshotPromises = /* @__PURE__ */ new Map();
const linePromises = /* @__PURE__ */ new Map();
const allLinePromises = /* @__PURE__ */ new Map();
async function getRidershipStatus(runtimeEnv) {
  try {
    const snapshot = await loadRidershipSnapshot(runtimeEnv);
    return {
      available: true,
      version: snapshot.current.version,
      generatedAt: snapshot.manifest.generatedAt,
      requestedYear: snapshot.manifest.requestedYear,
      actualYears: snapshot.manifest.actualYears,
      counts: snapshot.manifest.counts,
      source: {
        kind: snapshot.source.kind,
        location: snapshot.source.root
      },
      warning: snapshot.source.warning
    };
  } catch (error) {
    return {
      available: false,
      source: getConfiguredRidershipSourceHint(runtimeEnv),
      message: error instanceof Error ? error.message : "Ridership cache could not be loaded."
    };
  }
}
async function getRidershipLine(lineId, runtimeEnv) {
  const normalizedLineId = decodeRidershipLineId(lineId);
  const snapshot = await loadRidershipSnapshot(runtimeEnv);
  const sourceId = createSourceId(snapshot.source);
  const cacheKey = `${sourceId}:${normalizedLineId}`;
  const cached = getTimedCacheEntry(linePromises, cacheKey);
  if (cached) return cached;
  const request = (async () => {
    const line = await loadRidershipLineDocument(snapshot, normalizedLineId);
    const lines = await loadAllRidershipLines(snapshot, line, getMemoryCacheTtlMs(runtimeEnv));
    const rankedLine = decorateLineWithRankings(line, lines);
    return {
      ...rankedLine,
      sources: snapshot.lineIndex.sources
    };
  })();
  setTimedCacheEntry(linePromises, cacheKey, request, getMemoryCacheTtlMs(runtimeEnv));
  return request;
}
async function getRidershipStation(stationId, lineId, runtimeEnv) {
  var _a, _b, _c;
  const snapshot = await loadRidershipSnapshot(runtimeEnv);
  const normalizedStationId = decodeRidershipStationId(stationId);
  const normalizedLineId = lineId ? decodeRidershipLineId(lineId) : void 0;
  const contextLine = normalizedLineId ? await loadRidershipLineDocument(snapshot, normalizedLineId) : void 0;
  const lines = await loadAllRidershipLines(
    snapshot,
    contextLine,
    getMemoryCacheTtlMs(runtimeEnv)
  );
  const rankedContextLine = contextLine ? decorateLineWithRankings(contextLine, lines) : void 0;
  const contextStation = rankedContextLine == null ? void 0 : rankedContextLine.stations.find((station2) => station2.id === normalizedStationId);
  const indexedStation = await loadRidershipStationFromIndex(snapshot, normalizedStationId);
  const globalStation = canonicalStations(lines).find((station2) => station2.id === normalizedStationId);
  const station = (_a = contextStation != null ? contextStation : globalStation) != null ? _a : indexedStation;
  if (!station) throw new Error(`Ridership data is unavailable for station ${normalizedStationId}.`);
  const networkRanking = (_b = rankNetworkStation(normalizedStationId, lines)) != null ? _b : rankStations(normalizedStationId, getIndexedStationDocuments(snapshot));
  const rankings = (_c = contextStation == null ? void 0 : contextStation.rankings) != null ? _c : networkRanking ? { network: networkRanking } : {};
  return {
    ...station,
    sources: snapshot.lineIndex.sources,
    rankings,
    ...contextLine ? {
      context: {
        lineId: contextLine.id,
        mode: contextLine.mode
      }
    } : {}
  };
}
async function loadRidershipSnapshot(runtimeEnv) {
  const source = await resolveRidershipCacheSource(runtimeEnv);
  const sourceId = createSourceId(source);
  const cached = getTimedCacheEntry(snapshotPromises, sourceId);
  if (cached) return cached;
  const request = (async () => {
    const current = await readCacheJson(source, "current.json");
    const manifest = await readCacheJson(source, current.manifest);
    const lineIndex = await readCacheJson(
      source,
      `versions/${current.version}/${manifest.files.lines}`
    );
    if (manifest.version !== current.version) {
      throw new Error("Ridership current.json points to a different manifest version.");
    }
    if (lineIndex.schemaVersion !== 2 || !Array.isArray(lineIndex.lines) || !Array.isArray(lineIndex.sources)) {
      throw new Error("Ridership lines/index.json has an invalid compact schema.");
    }
    const stationIndex = await loadRidershipStationIndex(source, current, manifest);
    return { source, current, manifest, lineIndex, ...stationIndex ? { stationIndex } : {} };
  })();
  setTimedCacheEntry(snapshotPromises, sourceId, request, getMemoryCacheTtlMs(runtimeEnv));
  return request;
}
async function loadRidershipStationIndex(source, current, manifest) {
  if (!manifest.files.stations) return void 0;
  try {
    const stationIndex = await readCacheJson(
      source,
      `versions/${current.version}/${manifest.files.stations}`
    );
    if (stationIndex.schemaVersion !== 2 || !Array.isArray(stationIndex.stations)) return void 0;
    return stationIndex;
  } catch {
    return void 0;
  }
}
async function loadRidershipLineDocument(snapshot, lineId) {
  let line;
  const directPath = `versions/${snapshot.current.version}/lines/${encodeURIComponent(lineId)}.json`;
  try {
    line = await readCacheJson(snapshot.source, directPath);
  } catch (directError) {
    const entry = snapshot.lineIndex.lines.find(
      (candidate) => candidate.id === lineId || candidate.code === lineId || candidate.label === lineId
    );
    if (!entry) {
      throw directError instanceof Error ? directError : new Error(`Ridership data is unavailable for line ${lineId}.`);
    }
    line = await readCacheJson(
      snapshot.source,
      `versions/${snapshot.current.version}/${entry.file}`
    );
  }
  return line;
}
async function loadRidershipStationFromIndex(snapshot, stationId) {
  var _a, _b;
  const entry = (_a = snapshot.stationIndex) == null ? void 0 : _a.stations.find((candidate) => candidate.id === stationId);
  if (!entry) return void 0;
  if (entry.file) {
    try {
      return await readCacheJson(
        snapshot.source,
        `versions/${snapshot.current.version}/${entry.file}`
      );
    } catch {
    }
  }
  return {
    id: entry.id,
    name: entry.name,
    ...entry.city ? { city: entry.city } : {},
    lineIds: (_b = entry.lineIds) != null ? _b : [],
    measures: [],
    primary: entry.primary
  };
}
function getIndexedStationDocuments(snapshot) {
  var _a, _b;
  return ((_b = (_a = snapshot.stationIndex) == null ? void 0 : _a.stations) != null ? _b : []).map((entry) => {
    var _a2;
    return {
      id: entry.id,
      name: entry.name,
      ...entry.city ? { city: entry.city } : {},
      lineIds: (_a2 = entry.lineIds) != null ? _a2 : [],
      measures: [],
      primary: entry.primary
    };
  });
}
async function loadAllRidershipLines(snapshot, knownLine, ttlMs) {
  const cacheKey = createSourceId(snapshot.source);
  const cached = getTimedCacheEntry(allLinePromises, cacheKey);
  if (cached) return cached;
  const request = Promise.all(snapshot.lineIndex.lines.map(async (entry) => {
    if ((knownLine == null ? void 0 : knownLine.id) === entry.id) return knownLine;
    try {
      return await readCacheJson(
        snapshot.source,
        `versions/${snapshot.current.version}/${entry.file}`
      );
    } catch {
      return void 0;
    }
  })).then((lines) => lines.filter((line) => Boolean(line)));
  setTimedCacheEntry(allLinePromises, cacheKey, request, ttlMs);
  return request;
}
async function resolveRidershipCacheSource(runtimeEnv) {
  var _a;
  const config = getConfiguredRidershipCacheConfig(runtimeEnv);
  const cacheKey = `${config.kind}:${(_a = config.value) != null ? _a : "__auto__"}`;
  const cached = sourcePromises.get(cacheKey);
  if (cached) return cached;
  const request = findRidershipCacheSource(config, getRuntimeEnv(runtimeEnv));
  sourcePromises.set(cacheKey, request);
  request.catch(() => {
    if (sourcePromises.get(cacheKey) === request) sourcePromises.delete(cacheKey);
  });
  return request;
}
async function findRidershipCacheSource(config, runtimeEnv) {
  var _a;
  if (config.kind === "remote") {
    const remote = (_a = config.value) != null ? _a : "";
    if (isR2Url(remote)) {
      const source = parseR2CacheSource(remote, runtimeEnv);
      validateR2Config(runtimeEnv);
      return source;
    }
    if (isHttpUrl(remote)) return { kind: "remote", root: trimTrailingSlashes(remote) };
    throw new Error(
      `Invalid IDFM_RIDERSHIP_CACHE_REMOTE value "${remote}". Expected r2:// or HTTP(S).`
    );
  }
  const candidates = config.kind === "local" && config.value ? [config.value] : [
    path.resolve(process.cwd(), "public/data/ridership"),
    path.resolve(process.cwd(), "../idfm-node-backend/public/data/ridership")
  ];
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(path.join(candidate, "current.json"));
      if (stat.isFile()) {
        return {
          kind: "directory",
          root: candidate,
          warning: "Using a local ridership cache. Production should use the private R2 cache."
        };
      }
    } catch {
    }
  }
  if (config.kind === "auto" && config.value) {
    const fallback = config.value;
    if (isR2Url(fallback)) {
      const source = parseR2CacheSource(fallback, runtimeEnv);
      validateR2Config(runtimeEnv);
      return source;
    }
    if (isHttpUrl(fallback)) {
      return { kind: "remote", root: trimTrailingSlashes(fallback) };
    }
  }
  throw new Error(
    "Ridership cache not found locally or in its configured remote fallback. Set IDFM_RIDERSHIP_CACHE_REMOTE or IDFM_RIDERSHIP_CACHE_LOCAL."
  );
}
function getConfiguredRidershipCacheConfig(runtimeEnv) {
  var _a, _b, _c;
  const env = getRuntimeEnv(runtimeEnv);
  const remote = (_a = env.IDFM_RIDERSHIP_CACHE_REMOTE) == null ? void 0 : _a.trim();
  const local = (_b = env.IDFM_RIDERSHIP_CACHE_LOCAL) == null ? void 0 : _b.trim();
  if (remote) return { kind: "remote", value: remote };
  if (local) return { kind: "local", value: local };
  const netexRemote = (_c = env.IDFM_NETEX_CACHE_REMOTE) == null ? void 0 : _c.trim();
  if (netexRemote && isR2Url(netexRemote)) {
    const netex = new URL(netexRemote);
    return { kind: "auto", value: `r2://${netex.hostname}/ridership` };
  }
  return { kind: "auto" };
}
function getConfiguredRidershipSourceHint(runtimeEnv) {
  var _a, _b;
  const config = getConfiguredRidershipCacheConfig(runtimeEnv);
  if (config.kind === "auto") {
    if (config.value) {
      return {
        kind: isR2Url(config.value) ? "r2" : "remote",
        location: config.value
      };
    }
    return { kind: "auto", location: "public/data/ridership or ../idfm-node-backend/public/data/ridership" };
  }
  return {
    kind: config.kind === "local" ? "directory" : isR2Url((_a = config.value) != null ? _a : "") ? "r2" : "remote",
    location: (_b = config.value) != null ? _b : ""
  };
}
function getRuntimeEnv(runtimeEnv) {
  return getNetexRuntimeEnv(runtimeEnv);
}
function getMemoryCacheTtlMs(runtimeEnv) {
  var _a;
  const env = getRuntimeEnv(runtimeEnv);
  const configured = (_a = env.IDFM_RIDERSHIP_CACHE_MEMORY_TTL_MS) != null ? _a : env.IDFM_NETEX_CACHE_MEMORY_TTL_MS;
  const parsed = configured ? Number(configured) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MEMORY_CACHE_TTL_MS;
}
function getTimedCacheEntry(cache, key) {
  const entry = cache.get(key);
  if (!entry) return void 0;
  if (Date.now() <= entry.expiresAt) return entry.promise;
  cache.delete(key);
  return void 0;
}
function setTimedCacheEntry(cache, key, promise, ttlMs) {
  const entry = { expiresAt: Date.now() + ttlMs, promise };
  cache.set(key, entry);
  promise.catch(() => {
    var _a;
    if (((_a = cache.get(key)) == null ? void 0 : _a.promise) === promise) cache.delete(key);
  });
}
async function readCacheJson(source, relativePath) {
  const safePath = normalizeCachePath(relativePath);
  if (source.kind === "directory") {
    return JSON.parse(await fs.readFile(path.join(source.root, safePath), "utf8"));
  }
  if (source.kind === "remote") {
    const response2 = await fetch(`${source.root}/${safePath}`);
    if (!response2.ok) {
      throw new Error(`Ridership cache request failed for ${safePath}: ${response2.status} ${response2.statusText}`);
    }
    return response2.json();
  }
  const response = await fetchSignedR2Object(source, safePath);
  if (!response.ok) {
    throw new Error(`Ridership R2 request failed for ${safePath}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
function normalizeCachePath(value) {
  const normalized = value.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "..")) {
    throw new Error(`Invalid ridership cache path: ${value}`);
  }
  return normalized;
}
function decodeRidershipLineId(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
function decodeRidershipStationId(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
function parseR2CacheSource(value, runtimeEnv) {
  const url = new URL(value);
  const bucket = url.hostname;
  const prefix = url.pathname.replace(/^\/+|\/+$/gu, "");
  if (!bucket) throw new Error(`Invalid R2 ridership cache URL: ${value}`);
  return {
    kind: "r2",
    root: `r2://${bucket}${prefix ? `/${prefix}` : ""}`,
    bucket,
    prefix,
    env: getRuntimeEnv(runtimeEnv)
  };
}
function validateR2Config(runtimeEnv) {
  const env = getRuntimeEnv(runtimeEnv);
  const missing = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"].filter((name) => {
    var _a;
    return !((_a = env[name]) == null ? void 0 : _a.trim());
  });
  if (missing.length) throw new Error(`R2 ridership cache is missing ${missing.join(", ")}.`);
}
async function fetchSignedR2Object(source, relativePath) {
  var _a, _b;
  if (!source.bucket) throw new Error("R2 ridership source has no bucket.");
  const objectKey = [source.prefix, relativePath].filter(Boolean).join("/");
  const endpoint = ((_b = (_a = source.env) == null ? void 0 : _a.R2_ENDPOINT) == null ? void 0 : _b.replace(/\/+$/u, "")) || `https://${requiredEnv("R2_ACCOUNT_ID", source.env)}.r2.cloudflarestorage.com`;
  const requestUrl = new URL(`${endpoint}/${encodeURIComponent(source.bucket)}/${encodeObjectKey(objectKey)}`);
  const headers = await createR2SignedHeaders(requestUrl, source.env);
  return fetch(requestUrl, { method: "GET", headers });
}
async function createR2SignedHeaders(url, runtimeEnv) {
  const env = getRuntimeEnv(runtimeEnv);
  const now = /* @__PURE__ */ new Date();
  const amzDate = formatAmzDate(now);
  const dateScope = amzDate.slice(0, 8);
  const payloadHash = "UNSIGNED-PAYLOAD";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = `host:${url.host}
x-amz-content-sha256:${payloadHash}
x-amz-date:${amzDate}
`;
  const canonicalRequest = ["GET", url.pathname, url.searchParams.toString(), canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateScope}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, await sha256Hex(canonicalRequest)].join("\n");
  const signature = await signR2Request(requiredEnv("R2_SECRET_ACCESS_KEY", env), dateScope, stringToSign);
  return new Headers({
    Authorization: `AWS4-HMAC-SHA256 Credential=${requiredEnv("R2_ACCESS_KEY_ID", env)}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  });
}
async function signR2Request(secret, dateScope, stringToSign) {
  const dateKey = await hmac(`AWS4${secret}`, dateScope);
  const regionKey = await hmac(dateKey, "auto");
  const serviceKey = await hmac(regionKey, "s3");
  const signingKey = await hmac(serviceKey, "aws4_request");
  return toHex(await hmac(signingKey, stringToSign));
}
async function sha256Hex(value) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(digest);
}
async function hmac(key, value) {
  const rawKey = typeof key === "string" ? new TextEncoder().encode(key) : new Uint8Array(key);
  const cryptoKey = await globalThis.crypto.subtle.importKey("raw", rawKey, { hash: "SHA-256", name: "HMAC" }, false, ["sign"]);
  return globalThis.crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
}
function requiredEnv(name, env) {
  var _a;
  const value = (_a = getRuntimeEnv(env)[name]) == null ? void 0 : _a.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}
function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function formatAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/gu, "");
}
function encodeObjectKey(value) {
  return value.split("/").map((part) => {
    try {
      return encodeURIComponent(decodeURIComponent(part));
    } catch {
      return encodeURIComponent(part);
    }
  }).join("/");
}
function trimTrailingSlashes(value) {
  return value.replace(/\/+$/u, "");
}
function createSourceId(source) {
  return `${source.kind}:${source.root}`;
}
function isHttpUrl(value) {
  return /^https?:\/\//iu.test(value);
}
function isR2Url(value) {
  return /^r2:\/\//iu.test(value);
}

let preloadPromise;
const _0hNoKKLl8JiU4KWmkFYzbBWRpACQ91gMMa2D_ON4BQ = defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("request", async (event) => {
    preloadPromise != null ? preloadPromise : preloadPromise = preloadDataStatuses(event);
    await preloadPromise;
  });
});
async function preloadDataStatuses(event) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
  const runtimeEnv = getNetexRuntimeEnv(event);
  const [gtfs, netex, ridership] = await Promise.all([
    getGtfsPublicStatus(event).catch((error) => {
      console.warn(
        "[gtfs] unable to preload status",
        error instanceof Error ? error.message : error
      );
      return {
        enabled: true,
        available: false,
        stale: false,
        storage: "unconfigured"
      };
    }),
    getNetexCacheStatus(runtimeEnv).catch((error) => ({
      available: false,
      source: { kind: "auto", location: "unknown" },
      message: error instanceof Error ? error.message : String(error)
    })),
    getRidershipStatus(runtimeEnv).catch((error) => ({
      available: false,
      source: { kind: "auto", location: "unknown" },
      message: error instanceof Error ? error.message : String(error)
    }))
  ]);
  console.info(
    `[data-status] netex loaded=${netex.available} mode=${cacheMode((_a = netex.source) == null ? void 0 : _a.kind)} lines=${(_b = netex.lineCount) != null ? _b : 0}${netex.message ? ` error="${netex.message}"` : ""}`
  );
  console.info(
    `[data-status] gtfs enabled=${gtfs.enabled} loaded=${gtfs.available} mode=${gtfsMode(gtfs)} lines=${(_c = gtfs.lineCount) != null ? _c : 0}`
  );
  console.info(
    `[data-status] ridership loaded=${ridership.available} mode=${cacheMode((_d = ridership.source) == null ? void 0 : _d.kind)} lines=${(_f = (_e = ridership.counts) == null ? void 0 : _e.availableLines) != null ? _f : 0}/${(_h = (_g = ridership.counts) == null ? void 0 : _g.lines) != null ? _h : 0} stations=${(_j = (_i = ridership.counts) == null ? void 0 : _i.availableStations) != null ? _j : 0}/${(_l = (_k = ridership.counts) == null ? void 0 : _k.stations) != null ? _l : 0}${ridership.message ? ` error="${ridership.message}"` : ""}`
  );
}
function cacheMode(kind) {
  if (kind === "directory") return "Local";
  if (kind === "r2") return "Online (Cloudflare R2)";
  if (kind === "remote") return "Online (HTTP)";
  return "Not configured";
}
function gtfsMode(status) {
  if (!status.enabled || status.storage === "unconfigured") return "Not configured";
  if (status.storage === "r2") return "Online (Cloudflare R2)";
  return "Local";
}

const plugins = [
  _R2jsDl3OBZp6L4NWG_pXdnDnP_ZJXcNILBMLLqPesY,
_0hNoKKLl8JiU4KWmkFYzbBWRpACQ91gMMa2D_ON4BQ
];

const assets = {};

function readAsset (id) {
  const serverDir = dirname$1(fileURLToPath(globalThis._importMeta_.url));
  return promises.readFile(resolve$1(serverDir, assets[id].path))
}

const publicAssetBases = {"/_gtfs-data/":{"maxAge":0}};

function isPublicAssetURL(id = '') {
  if (assets[id]) {
    return true
  }
  for (const base in publicAssetBases) {
    if (id.startsWith(base)) { return true }
  }
  return false
}

function getAsset (id) {
  return assets[id]
}

const METHODS = /* @__PURE__ */ new Set(["HEAD", "GET"]);
const EncodingMap = { gzip: ".gz", br: ".br" };
const _rNlGOc = eventHandler((event) => {
  if (event.method && !METHODS.has(event.method)) {
    return;
  }
  let id = decodePath(
    withLeadingSlash(withoutTrailingSlash(parseURL(event.path).pathname))
  );
  let asset;
  const encodingHeader = String(
    getRequestHeader(event, "accept-encoding") || ""
  );
  const encodings = [
    ...encodingHeader.split(",").map((e) => EncodingMap[e.trim()]).filter(Boolean).sort(),
    ""
  ];
  for (const encoding of encodings) {
    for (const _id of [id + encoding, joinURL(id, "index.html" + encoding)]) {
      const _asset = getAsset(_id);
      if (_asset) {
        asset = _asset;
        id = _id;
        break;
      }
    }
  }
  if (!asset) {
    if (isPublicAssetURL(id)) {
      removeResponseHeader(event, "Cache-Control");
      throw createError({ statusCode: 404 });
    }
    return;
  }
  if (asset.encoding !== void 0) {
    appendResponseHeader(event, "Vary", "Accept-Encoding");
  }
  const ifNotMatch = getRequestHeader(event, "if-none-match") === asset.etag;
  if (ifNotMatch) {
    setResponseStatus(event, 304, "Not Modified");
    return "";
  }
  const ifModifiedSinceH = getRequestHeader(event, "if-modified-since");
  const mtimeDate = new Date(asset.mtime);
  if (ifModifiedSinceH && asset.mtime && new Date(ifModifiedSinceH) >= mtimeDate) {
    setResponseStatus(event, 304, "Not Modified");
    return "";
  }
  if (asset.type && !getResponseHeader(event, "Content-Type")) {
    setResponseHeader(event, "Content-Type", asset.type);
  }
  if (asset.etag && !getResponseHeader(event, "ETag")) {
    setResponseHeader(event, "ETag", asset.etag);
  }
  if (asset.mtime && !getResponseHeader(event, "Last-Modified")) {
    setResponseHeader(event, "Last-Modified", mtimeDate.toUTCString());
  }
  if (asset.encoding && !getResponseHeader(event, "Content-Encoding")) {
    setResponseHeader(event, "Content-Encoding", asset.encoding);
  }
  if (asset.size > 0 && !getResponseHeader(event, "Content-Length")) {
    setResponseHeader(event, "Content-Length", asset.size);
  }
  return readAsset(id);
});

const VueResolver = (_, value) => {
  return isRef(value) ? toValue(value) : value;
};

const headSymbol = "usehead";
// @__NO_SIDE_EFFECTS__
function vueInstall(head) {
  const plugin = {
    install(app) {
      app.config.globalProperties.$unhead = head;
      app.config.globalProperties.$head = head;
      app.provide(headSymbol, head);
    }
  };
  return plugin.install;
}

// @__NO_SIDE_EFFECTS__
function resolveUnrefHeadInput(input) {
  return walkResolver(input, VueResolver);
}

// @__NO_SIDE_EFFECTS__
function createHead(options = {}) {
  const head = createHead$1({
    ...options,
    propResolvers: [VueResolver]
  });
  head.install = vueInstall(head);
  return head;
}

const unheadOptions = {
  disableDefaults: true,
  disableCapoSorting: false,
  plugins: [DeprecationsPlugin, PromisesPlugin, TemplateParamsPlugin, AliasSortingPlugin],
};

function createSSRContext(event) {
  const ssrContext = {
    url: event.path,
    event,
    runtimeConfig: useRuntimeConfig(event),
    noSSR: true,
    head: createHead(unheadOptions),
    error: false,
    nuxt: void 0,
    /* NuxtApp */
    payload: {},
    _payloadReducers: /* @__PURE__ */ Object.create(null),
    modules: /* @__PURE__ */ new Set()
  };
  return ssrContext;
}
function setSSRError(ssrContext, error) {
  ssrContext.error = true;
  ssrContext.payload = { error };
  ssrContext.url = error.url;
}

function buildAssetsDir() {
  return useRuntimeConfig().app.buildAssetsDir;
}
function buildAssetsURL(...path) {
  return joinRelativeURL(publicAssetsURL(), buildAssetsDir(), ...path);
}
function publicAssetsURL(...path) {
  const app = useRuntimeConfig().app;
  const publicBase = app.cdnURL || app.baseURL;
  return path.length ? joinRelativeURL(publicBase, ...path) : publicBase;
}

const APP_ROOT_OPEN_TAG = `<${appRootTag}${propsToString(appRootAttrs)}>`;
const APP_ROOT_CLOSE_TAG = `</${appRootTag}>`;
const getServerEntry = () => Promise.resolve().then(function () { return server$1; }).then((r) => r.default || r);
const getClientManifest = () => import('file://C:/Users/franc/AndroidStudioProjects/VibeIDFM/TransportClockGPT/.nuxt-visual//dist/server/client.manifest.mjs').then((r) => r.default || r).then((r) => typeof r === "function" ? r() : r);
const getSSRRenderer = lazyCachedFunction(async () => {
  const createSSRApp = await getServerEntry();
  if (!createSSRApp) {
    throw new Error("Server bundle is not available");
  }
  const precomputed = void 0 ;
  const renderer = createRenderer(createSSRApp, {
    precomputed,
    manifest: await getClientManifest() ,
    renderToString: renderToString$1,
    buildAssetsURL
  });
  async function renderToString$1(input, context) {
    const html = await renderToString(input, context);
    if (process$1.env.NUXT_VITE_NODE_OPTIONS) {
      renderer.rendererContext.updateManifest(await getClientManifest());
    }
    return APP_ROOT_OPEN_TAG + html + APP_ROOT_CLOSE_TAG;
  }
  return renderer;
});
const getSPARenderer = lazyCachedFunction(async () => {
  const precomputed = void 0 ;
  const spaTemplate = await Promise.resolve().then(function () { return _virtual__spaTemplate; }).then((r) => r.template).catch(() => "").then((r) => {
    {
      return APP_ROOT_OPEN_TAG + r + APP_ROOT_CLOSE_TAG;
    }
  });
  const renderer = createRenderer(() => () => {
  }, {
    precomputed,
    manifest: await getClientManifest() ,
    renderToString: () => spaTemplate,
    buildAssetsURL
  });
  const result = await renderer.renderToString({});
  const renderToString = (ssrContext) => {
    const config = useRuntimeConfig(ssrContext.event);
    ssrContext.modules ||= /* @__PURE__ */ new Set();
    ssrContext.payload.serverRendered = false;
    ssrContext.config = {
      public: config.public,
      app: config.app
    };
    return Promise.resolve(result);
  };
  return {
    rendererContext: renderer.rendererContext,
    renderToString
  };
});
function lazyCachedFunction(fn) {
  let res = null;
  return () => {
    if (res === null) {
      res = fn().catch((err) => {
        res = null;
        throw err;
      });
    }
    return res;
  };
}
function getRenderer(ssrContext) {
  return getSPARenderer() ;
}
const getSSRStyles = lazyCachedFunction(() => Promise.resolve().then(function () { return styles$1; }).then((r) => r.default || r));

async function renderInlineStyles(usedModules) {
  const styleMap = await getSSRStyles();
  const inlinedStyles = /* @__PURE__ */ new Set();
  for (const mod of usedModules) {
    if (mod in styleMap && styleMap[mod]) {
      for (const style of await styleMap[mod]()) {
        inlinedStyles.add(style);
      }
    }
  }
  return Array.from(inlinedStyles).map((style) => ({ innerHTML: style }));
}

const ROOT_NODE_REGEX = new RegExp(`^<${appRootTag}[^>]*>([\\s\\S]*)<\\/${appRootTag}>$`);
function getServerComponentHTML(body) {
  const match = body.match(ROOT_NODE_REGEX);
  return match?.[1] || body;
}
const SSR_SLOT_TELEPORT_MARKER = /^uid=([^;]*);slot=(.*)$/;
const SSR_CLIENT_TELEPORT_MARKER = /^uid=([^;]*);client=(.*)$/;
const SSR_CLIENT_SLOT_MARKER = /^island-slot=([^;]*);(.*)$/;
function getSlotIslandResponse(ssrContext) {
  if (!ssrContext.islandContext || !Object.keys(ssrContext.islandContext.slots).length) {
    return void 0;
  }
  const response = {};
  for (const [name, slot] of Object.entries(ssrContext.islandContext.slots)) {
    response[name] = {
      ...slot,
      fallback: ssrContext.teleports?.[`island-fallback=${name}`]
    };
  }
  return response;
}
function getClientIslandResponse(ssrContext) {
  if (!ssrContext.islandContext || !Object.keys(ssrContext.islandContext.components).length) {
    return void 0;
  }
  const response = {};
  for (const [clientUid, component] of Object.entries(ssrContext.islandContext.components)) {
    const html = ssrContext.teleports?.[clientUid]?.replaceAll("<!--teleport start anchor-->", "") || "";
    response[clientUid] = {
      ...component,
      html,
      slots: getComponentSlotTeleport(clientUid, ssrContext.teleports ?? {})
    };
  }
  return response;
}
function getComponentSlotTeleport(clientUid, teleports) {
  const entries = Object.entries(teleports);
  const slots = {};
  for (const [key, value] of entries) {
    const match = key.match(SSR_CLIENT_SLOT_MARKER);
    if (match) {
      const [, id, slot] = match;
      if (!slot || clientUid !== id) {
        continue;
      }
      slots[slot] = value;
    }
  }
  return slots;
}
function replaceIslandTeleports(ssrContext, html) {
  const { teleports, islandContext } = ssrContext;
  if (islandContext || !teleports) {
    return html;
  }
  for (const key in teleports) {
    const matchClientComp = key.match(SSR_CLIENT_TELEPORT_MARKER);
    if (matchClientComp) {
      const [, uid, clientId] = matchClientComp;
      if (!uid || !clientId) {
        continue;
      }
      html = html.replace(new RegExp(` data-island-uid="${uid}" data-island-component="${clientId}"[^>]*>`), (full) => {
        return full + teleports[key];
      });
      continue;
    }
    const matchSlot = key.match(SSR_SLOT_TELEPORT_MARKER);
    if (matchSlot) {
      const [, uid, slot] = matchSlot;
      if (!uid || !slot) {
        continue;
      }
      html = html.replace(new RegExp(` data-island-uid="${uid}" data-island-slot="${slot}"[^>]*>`), (full) => {
        return full + teleports[key];
      });
    }
  }
  return html;
}

const ISLAND_SUFFIX_RE = /\.json(?:\?.*)?$/;
const _SxA8c9 = defineEventHandler(async (event) => {
  const nitroApp = useNitroApp();
  setResponseHeaders(event, {
    "content-type": "application/json;charset=utf-8",
    "x-powered-by": "Nuxt"
  });
  const islandContext = await getIslandContext(event);
  const ssrContext = {
    ...createSSRContext(event),
    islandContext,
    noSSR: false,
    url: islandContext.url
  };
  const renderer = await getSSRRenderer();
  const renderResult = await renderer.renderToString(ssrContext).catch(async (err) => {
    await ssrContext.nuxt?.hooks.callHook("app:error", err);
    throw err;
  });
  if (ssrContext.payload?.error) {
    throw ssrContext.payload.error;
  }
  const inlinedStyles = await renderInlineStyles(ssrContext.modules ?? []);
  await ssrContext.nuxt?.hooks.callHook("app:rendered", { ssrContext, renderResult });
  if (inlinedStyles.length) {
    ssrContext.head.push({ style: inlinedStyles });
  }
  {
    const { styles } = getRequestDependencies(ssrContext, renderer.rendererContext);
    const link = [];
    for (const resource of Object.values(styles)) {
      if ("inline" in getQuery(resource.file)) {
        continue;
      }
      if (resource.file.includes("scoped") && !resource.file.includes("pages/")) {
        link.push({ rel: "stylesheet", href: renderer.rendererContext.buildAssetsURL(resource.file), crossorigin: "" });
      }
    }
    if (link.length) {
      ssrContext.head.push({ link }, { mode: "server" });
    }
  }
  const islandHead = {};
  for (const entry of ssrContext.head.entries.values()) {
    for (const [key, value] of Object.entries(resolveUnrefHeadInput(entry.input))) {
      const currentValue = islandHead[key];
      if (Array.isArray(currentValue)) {
        currentValue.push(...value);
      }
      islandHead[key] = value;
    }
  }
  islandHead.link ||= [];
  islandHead.style ||= [];
  const islandResponse = {
    id: islandContext.id,
    head: islandHead,
    html: getServerComponentHTML(renderResult.html),
    components: getClientIslandResponse(ssrContext),
    slots: getSlotIslandResponse(ssrContext)
  };
  await nitroApp.hooks.callHook("render:island", islandResponse, { event, islandContext });
  return islandResponse;
});
async function getIslandContext(event) {
  let url = event.path || "";
  const componentParts = url.substring("/__nuxt_island".length + 1).replace(ISLAND_SUFFIX_RE, "").split("_");
  const hashId = componentParts.length > 1 ? componentParts.pop() : void 0;
  const componentName = componentParts.join("_");
  const context = event.method === "GET" ? getQuery$1(event) : await readBody(event);
  const ctx = {
    url: "/",
    ...context,
    id: hashId,
    name: componentName,
    props: destr$1(context.props) || {},
    slots: {},
    components: {}
  };
  return ctx;
}

const LAMBERT93_E = 0.0818191910428158;
const LAMBERT93_N = 0.725607765053267;
const LAMBERT93_C = 11754255426096e-6;
const LAMBERT93_XS = 7e5;
const LAMBERT93_YS = 12655612049876e-6;
const LAMBERT93_LON0_RAD = 3 * Math.PI / 180;
function resolveTransitLonLat(coordinate) {
  if (typeof coordinate.lon === "number" && Number.isFinite(coordinate.lon) && typeof coordinate.lat === "number" && Number.isFinite(coordinate.lat)) {
    return {
      lon: coordinate.lon,
      lat: coordinate.lat
    };
  }
  if (typeof coordinate.projectedX === "number" && typeof coordinate.projectedY === "number") {
    return convertLambert93ToWgs84(
      coordinate.projectedX,
      coordinate.projectedY
    );
  }
  return void 0;
}
function convertLambert93ToWgs84(x, y) {
  if (!isLikelyLambert93Coordinate(x, y)) {
    return void 0;
  }
  const radius = Math.hypot(x - LAMBERT93_XS, y - LAMBERT93_YS);
  const gamma = Math.atan2(x - LAMBERT93_XS, LAMBERT93_YS - y);
  const latIso = -1.3781550421067914 * Math.log(radius / LAMBERT93_C);
  const lonRad = LAMBERT93_LON0_RAD + gamma / LAMBERT93_N;
  let latRad = 2 * Math.atan(Math.exp(latIso)) - Math.PI / 2;
  for (let index = 0; index < 6; index += 1) {
    const eSinLat = LAMBERT93_E * Math.sin(latRad);
    latRad = 2 * Math.atan(
      Math.pow((1 + eSinLat) / (1 - eSinLat), LAMBERT93_E / 2) * Math.exp(latIso)
    ) - Math.PI / 2;
  }
  const lon = lonRad * 180 / Math.PI;
  const lat = latRad * 180 / Math.PI;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return void 0;
  }
  return { lon, lat };
}
function isLikelyLambert93Coordinate(x, y) {
  return x >= 1e5 && x <= 13e5 && y >= 6e6 && y <= 72e5;
}

function getCoordinatesDistanceKm(sourceLatValue, sourceLonValue, targetLatValue, targetLonValue) {
  return getCoordinatesDistanceMeters(
    sourceLatValue,
    sourceLonValue,
    targetLatValue,
    targetLonValue
  ) / 1e3;
}
function getCoordinatesDistanceMeters(sourceLatValue, sourceLonValue, targetLatValue, targetLonValue) {
  const earthRadiusMeters = 6371e3;
  const sourceLat = toRadians(sourceLatValue);
  const targetLat = toRadians(targetLatValue);
  const deltaLat = toRadians(targetLatValue - sourceLatValue);
  const deltaLon = toRadians(targetLonValue - sourceLonValue);
  const haversine = Math.sin(deltaLat / 2) ** 2 + Math.cos(sourceLat) * Math.cos(targetLat) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(
    Math.sqrt(haversine),
    Math.sqrt(Math.max(0, 1 - haversine))
  );
}
function toRadians(value) {
  return value * Math.PI / 180;
}

const NAVITIA_STOP_POINT_PREFIX = "stop_point:IDFM:";
function extractIdfmStopPointCode(reference) {
  var _a, _b, _c, _d;
  const value = reference == null ? void 0 : reference.trim();
  if (!value || /monomodalStopPlace/iu.test(value)) {
    return void 0;
  }
  const match = (_c = (_b = (_a = value.match(/(?:^|:)StopPoint:Q:([^:]+)(?::|$)/iu)) != null ? _a : value.match(/^stop_point:IDFM:([^:]+)$/iu)) != null ? _b : value.match(/(?:^|:)Quay:([^:]+)(?::|$)/iu)) != null ? _c : value.match(/(?:^|:)ScheduledStopPoint:([^:]+)(?::|$)/iu);
  return ((_d = match == null ? void 0 : match[1]) == null ? void 0 : _d.trim()) || void 0;
}
function navitiaStopPointToMonitoringRef(reference) {
  const code = extractIdfmStopPointCode(reference);
  return code ? `STIF:StopPoint:Q:${code}:` : void 0;
}
function monitoringRefToNavitiaStopPointRef(reference) {
  const code = extractIdfmStopPointCode(reference);
  return code ? `${NAVITIA_STOP_POINT_PREFIX}${code}` : void 0;
}
function createIdfmStopReferenceKeys(reference) {
  const normalized = reference == null ? void 0 : reference.trim().toLowerCase();
  if (!normalized) {
    return [];
  }
  const keys = [normalized, normalized.replace(/^station:/u, "")];
  const code = extractIdfmStopPointCode(reference);
  const stopAreaCode = extractIdfmStopAreaCode(reference);
  if (code) {
    keys.push(`idfm-stop:${code.toLowerCase()}`);
  }
  if (stopAreaCode) {
    keys.push(`idfm-stop-area:${stopAreaCode.toLowerCase()}`);
  }
  return [...new Set(keys)];
}
function extractIdfmStopAreaCode(reference) {
  var _a, _b, _c, _d, _e, _f;
  const value = reference == null ? void 0 : reference.trim();
  if (!value) return void 0;
  return ((_f = (_e = (_c = (_a = value.match(/(?:^|:)(?:monomodalStopPlace|multimodalStopPlace):([^:]+)(?::|$)/iu)) == null ? void 0 : _a[1]) != null ? _c : (_b = value.match(/^stop_area:IDFM:([^:]+)$/iu)) == null ? void 0 : _b[1]) != null ? _e : (_d = value.match(/(?:^|:)StopArea:SP:([^:]+)(?::|$)/iu)) == null ? void 0 : _d[1]) == null ? void 0 : _f.trim()) || void 0;
}

function getServerIdfmApiKey(event) {
  var _a, _b, _c, _d, _e, _f;
  const cfEnv = (_a = event.context.cloudflare) == null ? void 0 : _a.env;
  const nodeEnv = (_b = globalThis.process) == null ? void 0 : _b.env;
  return ((_f = (_e = (_d = (_c = cfEnv == null ? void 0 : cfEnv.NUXT_IDFM_API_KEY) != null ? _c : cfEnv == null ? void 0 : cfEnv.IDFM_API_KEY) != null ? _d : nodeEnv == null ? void 0 : nodeEnv.NUXT_IDFM_API_KEY) != null ? _e : nodeEnv == null ? void 0 : nodeEnv.IDFM_API_KEY) != null ? _f : "").trim();
}
function getServerIdfmDatasetKey(event) {
  var _a, _b, _c, _d, _e, _f;
  const cfEnv = (_a = event.context.cloudflare) == null ? void 0 : _a.env;
  const nodeEnv = (_b = globalThis.process) == null ? void 0 : _b.env;
  return ((_f = (_e = (_d = (_c = cfEnv == null ? void 0 : cfEnv.NUXT_IDFM_DATASET_KEY) != null ? _c : cfEnv == null ? void 0 : cfEnv.IDFM_DATASET_KEY) != null ? _d : nodeEnv == null ? void 0 : nodeEnv.NUXT_IDFM_DATASET_KEY) != null ? _e : nodeEnv == null ? void 0 : nodeEnv.IDFM_DATASET_KEY) != null ? _f : "").trim();
}

var __defProp$2 = Object.defineProperty;
var __defNormalProp$2 = (obj, key, value) => key in obj ? __defProp$2(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField$2 = (obj, key, value) => __defNormalProp$2(obj, typeof key !== "symbol" ? key + "" : key, value);
const IDFM_MARKETPLACE_BASE_URL = "https://prim.iledefrance-mobilites.fr/marketplace";
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 260;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 3e4;
const MAX_RATE_LIMIT_COOLDOWN_MS = 24 * 60 * 6e4;
class IdfmMarketplaceRateGate {
  constructor(options = {}) {
    __publicField$2(this, "defaultCooldownMs");
    __publicField$2(this, "maxCooldownMs");
    __publicField$2(this, "minRequestIntervalMs");
    __publicField$2(this, "now");
    __publicField$2(this, "wait");
    __publicField$2(this, "cooldownUntilByScope", /* @__PURE__ */ new Map());
    __publicField$2(this, "nextRequestAt", 0);
    __publicField$2(this, "reservationTail", Promise.resolve());
    var _a, _b, _c, _d, _e;
    this.defaultCooldownMs = (_a = options.defaultCooldownMs) != null ? _a : DEFAULT_RATE_LIMIT_COOLDOWN_MS;
    this.maxCooldownMs = (_b = options.maxCooldownMs) != null ? _b : MAX_RATE_LIMIT_COOLDOWN_MS;
    this.minRequestIntervalMs = (_c = options.minRequestIntervalMs) != null ? _c : DEFAULT_MIN_REQUEST_INTERVAL_MS;
    this.now = (_d = options.now) != null ? _d : Date.now;
    this.wait = (_e = options.wait) != null ? _e : wait;
  }
  async fetch(upstreamUrl, init, fetchImpl = fetch) {
    var _a;
    const scope = getIdfmRateLimitScope(upstreamUrl);
    const cooldownResponse = await this.reserveRequestSlot(scope);
    if (cooldownResponse) {
      return cooldownResponse;
    }
    const response = await fetchImpl(upstreamUrl, init);
    if (response.status === 429) {
      const cooldownMs = getIdfmRetryDelayMs(
        response,
        this.defaultCooldownMs,
        this.maxCooldownMs,
        this.now()
      );
      this.cooldownUntilByScope.set(
        scope,
        Math.max((_a = this.cooldownUntilByScope.get(scope)) != null ? _a : 0, this.now() + cooldownMs)
      );
    }
    return response;
  }
  async reserveRequestSlot(scope) {
    let releaseReservation;
    const previousReservation = this.reservationTail;
    this.reservationTail = new Promise((resolve) => {
      releaseReservation = resolve;
    });
    await previousReservation;
    try {
      const initialCooldown = this.createCooldownResponse(scope);
      if (initialCooldown) {
        return initialCooldown;
      }
      const waitMs = Math.max(0, this.nextRequestAt - this.now());
      if (waitMs > 0) {
        await this.wait(waitMs);
      }
      const delayedCooldown = this.createCooldownResponse(scope);
      if (delayedCooldown) {
        return delayedCooldown;
      }
      this.nextRequestAt = this.now() + this.minRequestIntervalMs;
      return void 0;
    } finally {
      releaseReservation == null ? void 0 : releaseReservation();
    }
  }
  createCooldownResponse(scope) {
    var _a;
    const remainingMs = ((_a = this.cooldownUntilByScope.get(scope)) != null ? _a : 0) - this.now();
    if (remainingMs <= 0) {
      return void 0;
    }
    return new Response(
      JSON.stringify({ message: "IDFM upstream rate-limit cooldown active" }),
      {
        status: 429,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "retry-after": String(Math.max(1, Math.ceil(remainingMs / 1e3))),
          "x-idfm-rate-limit-scope": scope,
          "x-idfm-rate-limit-source": "shared-cooldown"
        }
      }
    );
  }
}
function getIdfmRateLimitScope(upstreamUrl) {
  const pathname = upstreamUrl.pathname.toLocaleLowerCase("en-US");
  if (pathname.includes("/v2/navitia")) return "navitia";
  if (pathname.includes("/stop-monitoring")) return "siri-unit";
  if (pathname.includes("/estimated-timetable")) return "siri-global";
  if (pathname.includes("/general-message")) return "siri-messages";
  return "marketplace-other";
}
const sharedIdfmMarketplaceRateGate = new IdfmMarketplaceRateGate();
async function fetchIdfmMarketplaceWithRetry(upstreamUrl, init, options = {}) {
  var _a, _b;
  return ((_a = options.rateGate) != null ? _a : sharedIdfmMarketplaceRateGate).fetch(
    upstreamUrl,
    init,
    (_b = options.fetchImpl) != null ? _b : fetch
  );
}
function getIdfmRetryDelayMs(response, fallbackMs, maxDelayMs = MAX_RATE_LIMIT_COOLDOWN_MS, now = Date.now()) {
  const retryAfter = response.headers.get("retry-after");
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1e3, maxDelayMs);
  }
  const retryAt = retryAfter ? Date.parse(retryAfter) : Number.NaN;
  if (Number.isFinite(retryAt) && retryAt > now) {
    return Math.min(retryAt - now, maxDelayMs);
  }
  return Math.min(Math.max(1, fallbackMs), maxDelayMs);
}
function wait(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

const LINE_STOP_POINTS_CACHE_TTL_MS = 6 * 60 * 6e4;
const LINE_STOP_POINTS_FAILURE_TTL_MS = 6e4;
const cache = /* @__PURE__ */ new Map();
const inFlight = /* @__PURE__ */ new Map();
async function loadIdfmLineStopPoints(options) {
  var _a;
  const nowMs = (_a = options.nowMs) != null ? _a : Date.now();
  const cached = cache.get(options.lineId);
  if (cached && cached.expiresAt > nowMs) {
    return cached.result;
  }
  const pending = inFlight.get(options.lineId);
  if (pending) {
    return pending;
  }
  const request = fetchLineStopPoints(options).catch(() => ({
    available: false,
    stopPoints: []
  }));
  inFlight.set(options.lineId, request);
  try {
    const result = await request;
    cache.set(options.lineId, {
      expiresAt: nowMs + (result.available ? LINE_STOP_POINTS_CACHE_TTL_MS : LINE_STOP_POINTS_FAILURE_TTL_MS),
      result
    });
    return result;
  } finally {
    if (inFlight.get(options.lineId) === request) {
      inFlight.delete(options.lineId);
    }
  }
}
async function fetchLineStopPoints(options) {
  const upstreamUrl = new URL(
    `${IDFM_MARKETPLACE_BASE_URL}/v2/navitia/lines/${encodeURIComponent(
      options.lineId
    )}/stop_points`
  );
  upstreamUrl.searchParams.set("count", "1000");
  upstreamUrl.searchParams.set("disable_geojson", "true");
  const response = await fetchIdfmMarketplaceWithRetry(
    upstreamUrl,
    {
      headers: {
        Accept: "application/json",
        apikey: options.apiKey
      },
      method: "GET",
      redirect: "follow"
    },
    { fetchImpl: options.fetchImpl }
  );
  if (!response.ok) {
    return {
      available: false,
      stopPoints: [],
      upstreamStatus: response.status
    };
  }
  const payload = await response.json();
  return {
    available: true,
    stopPoints: asRecords(payload.stop_points).map(mapStopPoint).filter((stopPoint) => Boolean(stopPoint))
  };
}
function mapStopPoint(value) {
  var _a;
  const id = textValue$1(value.id);
  const name = (_a = textValue$1(value.name)) != null ? _a : textValue$1(value.label);
  if (!id || !name) {
    return void 0;
  }
  const sourceReferences = [
    id,
    ...asRecords(value.codes).map((code) => textValue$1(code.value))
  ].filter((reference) => Boolean(reference));
  const references = sourceReferences.flatMap((reference) => [
    reference,
    ...createSiriStopAreaAliases(reference)
  ]);
  return {
    id,
    name,
    references: [...new Set(references)]
  };
}
function createSiriStopAreaAliases(reference) {
  var _a;
  const monomodalStopPlaceCode = (_a = reference.match(
    /(?:^|:)monomodalStopPlace:(\d+)(?::|$)/iu
  )) == null ? void 0 : _a[1];
  return monomodalStopPlaceCode ? [`STIF:StopArea:SP:${monomodalStopPlaceCode}:`] : [];
}
function asRecords(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.filter(
    (item) => typeof item === "object" && item !== null && !Array.isArray(item)
  );
}
function textValue$1(value) {
  if (typeof value === "string") {
    return value.trim() || void 0;
  }
  if (typeof value === "object" && value !== null && "value" in value) {
    return textValue$1(value.value);
  }
  return void 0;
}

var __defProp$1 = Object.defineProperty;
var __defNormalProp$1 = (obj, key, value) => key in obj ? __defProp$1(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField$1 = (obj, key, value) => __defNormalProp$1(obj, typeof key !== "symbol" ? key + "" : key, value);
const REALTIME_VEHICLE_POLL_AFTER_MS = 6e4;
const SNAPSHOT_CACHE_TTL_MS = 6e4;
const MAX_RESPONSE_AGE_MS = 3 * REALTIME_VEHICLE_POLL_AFTER_MS;
const MAX_INTERSTATION_DURATION_MS = 45 * 6e4;
class RealtimeVehicleUpstreamError extends Error {
  constructor(response) {
    var _a;
    const statusCode = response.status === 429 ? 429 : response.status >= 500 ? 503 : 502;
    super(`IDFM Estimated Timetable request failed (${response.status}).`);
    __publicField$1(this, "retryAfter");
    __publicField$1(this, "statusCode");
    __publicField$1(this, "upstreamStatus");
    this.name = "RealtimeVehicleUpstreamError";
    this.retryAfter = (_a = response.headers.get("retry-after")) != null ? _a : void 0;
    this.statusCode = statusCode;
    this.upstreamStatus = response.status;
  }
}
const snapshotCache = /* @__PURE__ */ new Map();
const inFlightSnapshots = /* @__PURE__ */ new Map();
let globalPayloadCache;
let inFlightGlobalPayload;
function isGuidedRealtimeMode(value) {
  return isGuidedRealtimeTransportType(value);
}
function isGuidedRealtimeTransportType(value) {
  return [
    "cable",
    "cableway",
    "funicular",
    "metro",
    "rail",
    "rer",
    "train",
    "tram",
    "tramway",
    "transilien"
  ].includes(normalizeMode(value));
}
function createUnavailableVehicleSnapshot(lineId, reason, now = /* @__PURE__ */ new Date(), complete = true, diagnostics) {
  return {
    available: false,
    reason,
    lineId,
    source: "idfm-siri-estimated-timetable",
    positionKind: "estimated",
    generatedAt: now.toISOString(),
    complete,
    pollAfterMs: REALTIME_VEHICLE_POLL_AFTER_MS,
    journeys: [],
    ...diagnostics ? { diagnostics } : {}
  };
}
async function getRealtimeVehicleSnapshot(options) {
  var _a, _b, _c, _d, _e;
  const now = (_a = options.now) != null ? _a : /* @__PURE__ */ new Date();
  const topology = createRealtimeTopologyIndex(options.lineCache);
  if (!isGuidedRealtimeMode(resolveCacheMode(options.lineCache))) {
    return createUnavailableVehicleSnapshot(
      (_c = (_b = topology == null ? void 0 : topology.lineId) != null ? _b : resolveCanonicalLineId(options.lineCache)) != null ? _c : "unknown",
      "unsupported_mode",
      now,
      true,
      createTopologyDiagnostics(options.lineCache, "supported_guided_transport_mode")
    );
  }
  if (!topology) {
    const lineId = (_d = resolveCanonicalLineId(options.lineCache)) != null ? _d : "unknown";
    const reason = resolvePrimLineCode(options.lineCache) ? "missing_topology" : "missing_line_ref";
    return createUnavailableVehicleSnapshot(
      lineId,
      reason,
      now,
      true,
      createTopologyDiagnostics(
        options.lineCache,
        reason === "missing_line_ref" ? "prim_line_ref" : "mapped_topology_patterns"
      )
    );
  }
  const nowMs = now.getTime();
  const cached = snapshotCache.get(topology.lineRef);
  if (cached && cached.expiresAt > nowMs) {
    return cached.snapshot;
  }
  const inFlight = inFlightSnapshots.get(topology.lineRef);
  if (inFlight) {
    return inFlight;
  }
  const request = loadGlobalRealtimePayload(options, nowMs).then(
    (payload) => buildSnapshotWithStopPointAliases(payload, topology, options, now, nowMs)
  );
  inFlightSnapshots.set(topology.lineRef, request);
  try {
    const snapshot = await request;
    const ttl = (_e = options.cacheTtlMs) != null ? _e : SNAPSHOT_CACHE_TTL_MS;
    if (ttl > 0) {
      snapshotCache.set(topology.lineRef, {
        expiresAt: nowMs + ttl,
        snapshot
      });
    }
    return snapshot;
  } finally {
    if (inFlightSnapshots.get(topology.lineRef) === request) {
      inFlightSnapshots.delete(topology.lineRef);
    }
  }
}
async function loadGlobalRealtimePayload(options, nowMs) {
  var _a;
  if (globalPayloadCache && globalPayloadCache.expiresAt > nowMs) {
    return globalPayloadCache.payload;
  }
  if (inFlightGlobalPayload) {
    return inFlightGlobalPayload;
  }
  const request = fetchGlobalRealtimePayload(options);
  inFlightGlobalPayload = request;
  try {
    const payload = await request;
    const ttl = (_a = options.cacheTtlMs) != null ? _a : SNAPSHOT_CACHE_TTL_MS;
    if (ttl > 0) {
      globalPayloadCache = {
        expiresAt: nowMs + ttl,
        payload
      };
    }
    return payload;
  } finally {
    if (inFlightGlobalPayload === request) {
      inFlightGlobalPayload = void 0;
    }
  }
}
async function buildSnapshotWithStopPointAliases(payload, topology, options, now, nowMs) {
  var _a;
  const initialSnapshot = buildSnapshotFromPayload(payload, topology, now);
  if (initialSnapshot.available || !((_a = initialSnapshot.diagnostics) == null ? void 0 : _a.missing.includes(
    "mapped_station_calls_or_valid_times"
  ))) {
    return initialSnapshot;
  }
  const lineStopPoints = await loadIdfmLineStopPoints({
    apiKey: options.apiKey,
    fetchImpl: options.fetchImpl,
    lineId: topology.lineId,
    nowMs
  });
  const enrichedTopology = createRealtimeTopologyIndex(
    options.lineCache,
    lineStopPoints
  );
  return enrichedTopology ? buildSnapshotFromPayload(payload, enrichedTopology, now) : initialSnapshot;
}
async function fetchGlobalRealtimePayload(options) {
  const upstreamUrl = new URL(
    `${IDFM_MARKETPLACE_BASE_URL}/estimated-timetable`
  );
  upstreamUrl.searchParams.set("LineRef", "ALL");
  const response = await fetchIdfmMarketplaceWithRetry(
    upstreamUrl,
    {
      headers: {
        Accept: "application/json",
        apikey: options.apiKey
      },
      method: "GET",
      redirect: "follow"
    },
    {
      fetchImpl: options.fetchImpl}
  );
  if (!response.ok) {
    throw new RealtimeVehicleUpstreamError(response);
  }
  let payload;
  try {
    payload = await response.json();
  } catch (cause) {
    const error = new Error("IDFM Estimated Timetable returned invalid JSON.", {
      cause
    });
    Object.assign(error, { statusCode: 502 });
    throw error;
  }
  return payload;
}
function buildSnapshotFromPayload(payload, topology, now) {
  const serviceDelivery = getNestedRecord(payload, "Siri", "ServiceDelivery");
  const deliveries = asArray$2(serviceDelivery == null ? void 0 : serviceDelivery.EstimatedTimetableDelivery).filter(
    isRecord$3
  );
  const responseTimestamp = firstIsoValue(
    serviceDelivery == null ? void 0 : serviceDelivery.ResponseTimestamp,
    getNestedValue(payload, "Siri", "ServiceDelivery", "ResponseTimestamp")
  );
  const generatedAt = responseTimestamp != null ? responseTimestamp : now.toISOString();
  const complete = isPayloadComplete(
    serviceDelivery,
    deliveries,
    generatedAt,
    now
  );
  const rawJourneyResult = parseRawVehicleJourneys(
    payload,
    serviceDelivery,
    deliveries,
    topology
  );
  const journeys = reconstructJourneys(rawJourneyResult.journeys, topology);
  const diagnostics = createPayloadDiagnostics({
    complete,
    deliveryCount: deliveries.length,
    journeys,
    rawJourneyResult,
    responseTimestamp,
    serviceDelivery,
    topology
  });
  if (journeys.length === 0) {
    return createUnavailableVehicleSnapshot(
      topology.lineId,
      "no_data",
      new Date(generatedAt),
      complete,
      diagnostics
    );
  }
  return {
    available: true,
    lineId: topology.lineId,
    source: "idfm-siri-estimated-timetable",
    positionKind: "estimated",
    generatedAt,
    complete,
    pollAfterMs: REALTIME_VEHICLE_POLL_AFTER_MS,
    journeys,
    diagnostics
  };
}
function createPayloadDiagnostics({
  complete,
  deliveryCount,
  journeys,
  rawJourneyResult,
  responseTimestamp,
  serviceDelivery,
  topology
}) {
  var _a, _b;
  const missing = [];
  const monitoredVisitCount = (_a = rawJourneyResult.monitoredVisitCount) != null ? _a : 0;
  const monitoredLineVisitCount = (_b = rawJourneyResult.monitoredLineVisitCount) != null ? _b : 0;
  const upstreamRecordCount = rawJourneyResult.estimatedJourneyCount + monitoredVisitCount;
  const upstreamLineRecordCount = rawJourneyResult.estimatedLineJourneyCount + monitoredLineVisitCount;
  if (!serviceDelivery) {
    missing.push("siri_service_delivery");
  }
  if (!responseTimestamp) {
    missing.push("response_timestamp");
  }
  if (upstreamRecordCount === 0) {
    missing.push("upstream_vehicle_records");
  } else if (upstreamLineRecordCount === 0) {
    missing.push("upstream_line_records");
  }
  if (upstreamLineRecordCount > 0 && rawJourneyResult.journeys.length === 0) {
    missing.push("mapped_station_calls_or_valid_times");
  }
  if (rawJourneyResult.journeys.length > 0 && journeys.length === 0) {
    missing.push("reconstructable_journeys");
  }
  return {
    stage: upstreamRecordCount === 0 || upstreamLineRecordCount === 0 ? "upstream" : "reconstruction",
    missing,
    lineRef: topology.lineRef,
    topologyPatternCount: topology.patterns.length,
    deliveryCount,
    estimatedJourneyCount: rawJourneyResult.estimatedJourneyCount,
    estimatedLineJourneyCount: rawJourneyResult.estimatedLineJourneyCount,
    monitoredVisitCount,
    monitoredLineVisitCount,
    mappedRawJourneyCount: rawJourneyResult.journeys.length,
    navitiaStopPointAliasSourceAvailable: topology.navitiaStopPointAliasSourceAvailable,
    navitiaStopPointCount: topology.navitiaStopPointCount,
    resolvedStopPointAliasCount: topology.resolvedStopPointAliasCount,
    reconstructedJourneyCount: journeys.length,
    responseTimestampPresent: Boolean(responseTimestamp),
    payloadComplete: complete
  };
}
function createRealtimeTopologyIndex(cache, lineStopPoints) {
  var _a, _b, _c, _d, _e, _f, _g;
  const code = resolvePrimLineCode(cache);
  if (!code) {
    return void 0;
  }
  const bindingByKey = /* @__PURE__ */ new Map();
  for (const node of cache.schematic.nodes) {
    bindStationReference(bindingByKey, node.id, node.id);
    for (const rawRef of (_a = node.rawRefs) != null ? _a : []) {
      bindStationReference(bindingByKey, rawRef, node.id);
    }
  }
  for (const station of (_b = cache.stations) != null ? _b : []) {
    const candidates = [station.id, ...(_c = station.rawRefs) != null ? _c : []].flatMap(referenceKeys).map((key) => bindingByKey.get(key)).filter((value) => typeof value === "string");
    const stationId = uniqueValue(candidates);
    if (!stationId) {
      continue;
    }
    bindStationReference(bindingByKey, station.id, stationId);
    for (const rawRef of (_d = station.rawRefs) != null ? _d : []) {
      bindStationReference(bindingByKey, rawRef, stationId);
    }
  }
  const resolvedStopPointAliasCount = bindLineStopPointReferences(
    bindingByKey,
    cache.schematic.nodes,
    (_e = lineStopPoints == null ? void 0 : lineStopPoints.stopPoints) != null ? _e : []
  );
  const resolveStationRef = (value) => {
    const candidates = referenceKeys(textValue(value)).map((key) => bindingByKey.get(key)).filter((candidate) => typeof candidate === "string");
    return uniqueValue(candidates);
  };
  const patterns = ((_f = cache.patterns) != null ? _f : []).map((pattern) => normalizeTopologyPattern(pattern, resolveStationRef)).filter((pattern) => Boolean(pattern));
  if (patterns.length === 0 || bindingByKey.size === 0) {
    return void 0;
  }
  return {
    lineId: `line:IDFM:${code}`,
    lineRef: `STIF:Line::${code}:`,
    navitiaStopPointAliasSourceAvailable: lineStopPoints == null ? void 0 : lineStopPoints.available,
    navitiaStopPointCount: (_g = lineStopPoints == null ? void 0 : lineStopPoints.stopPoints.length) != null ? _g : 0,
    patterns,
    resolvedStopPointAliasCount,
    resolveStationRef
  };
}
function bindLineStopPointReferences(bindings, nodes, stopPoints) {
  var _a, _b;
  const stationByName = /* @__PURE__ */ new Map();
  for (const node of nodes) {
    const key = normalizeText$3(node.name);
    if (!key) {
      continue;
    }
    const current = stationByName.get(key);
    stationByName.set(
      key,
      current === void 0 || current === node.id ? node.id : null
    );
  }
  let resolvedCount = 0;
  for (const stopPoint of stopPoints) {
    const referenceCandidates = stopPoint.references.flatMap(referenceKeys).map((key) => bindings.get(key)).filter((value) => typeof value === "string");
    const stationId = (_b = (_a = uniqueValue(referenceCandidates)) != null ? _a : stationByName.get(normalizeText$3(stopPoint.name))) != null ? _b : void 0;
    if (!stationId) {
      continue;
    }
    resolvedCount += 1;
    bindStationReference(bindings, stopPoint.id, stationId);
    for (const reference of stopPoint.references) {
      bindStationReference(bindings, reference, stationId);
    }
  }
  return resolvedCount;
}
function normalizeTopologyPattern(pattern, resolveStationRef) {
  var _a, _b, _c, _d;
  const stops = dedupeConsecutive(
    ((_c = (_b = pattern.stopIds) != null ? _b : (_a = pattern.stops) == null ? void 0 : _a.map((stop) => stop.id)) != null ? _c : []).map(resolveStationRef).filter((stationId) => Boolean(stationId))
  );
  if (stops.length < 2) {
    return void 0;
  }
  return {
    id: pattern.id,
    destination: cleanText(pattern.destination),
    direction: cleanText(pattern.direction),
    serviceCount: (_d = pattern.serviceCount) != null ? _d : 0,
    stops
  };
}
function resolvePrimLineCode(cache) {
  var _a, _b, _c;
  const primLineId = (_b = (_a = cache.line.primLineId) != null ? _a : cache.schematic.line.primLineId) != null ? _b : void 0;
  return (_c = primLineId == null ? void 0 : primLineId.match(/^line:IDFM:(C\d{5})$/iu)) == null ? void 0 : _c[1].toUpperCase();
}
function resolveCanonicalLineId(cache) {
  const code = resolvePrimLineCode(cache);
  return code ? `line:IDFM:${code}` : void 0;
}
function resolveCacheMode(cache) {
  var _a;
  return (_a = cache.line.transportMode) != null ? _a : cache.schematic.line.transportMode;
}
function createTopologyDiagnostics(cache, missing) {
  var _a, _b, _c;
  const code = resolvePrimLineCode(cache);
  return {
    stage: "topology",
    missing: [missing],
    ...code ? { lineRef: `STIF:Line::${code}:` } : {},
    cacheTransportMode: (_a = cleanText(resolveCacheMode(cache))) != null ? _a : "unknown",
    topologyNodeCount: cache.schematic.nodes.length,
    topologyPatternCount: (_c = (_b = cache.patterns) == null ? void 0 : _b.length) != null ? _c : 0
  };
}
function bindStationReference(bindings, reference, stationId) {
  for (const key of referenceKeys(reference)) {
    const current = bindings.get(key);
    if (current === void 0) {
      bindings.set(key, stationId);
    } else if (current !== stationId) {
      bindings.set(key, null);
    }
  }
}
function referenceKeys(value) {
  return createIdfmStopReferenceKeys(value);
}
function parseRawVehicleJourneys(payload, serviceDelivery, deliveries, topology) {
  const roots = deliveries.length > 0 ? deliveries : [serviceDelivery != null ? serviceDelivery : payload];
  const estimatedJourneys = roots.flatMap(
    (root) => collectNamedRecords(root, "EstimatedVehicleJourney")
  );
  const estimatedLineJourneys = estimatedJourneys.filter(
    (journey) => hasCompatibleLineRef(journey.LineRef, topology)
  );
  const parsed = estimatedLineJourneys.map((journey) => parseEstimatedVehicleJourney(journey, topology)).filter((journey) => Boolean(journey));
  if (parsed.length > 0) {
    return {
      journeys: parsed,
      estimatedJourneyCount: estimatedJourneys.length,
      estimatedLineJourneyCount: estimatedLineJourneys.length
    };
  }
  const monitoredVisits = roots.flatMap(
    (root) => collectNamedRecords(root, "MonitoredStopVisit")
  );
  const monitoredLineVisits = monitoredVisits.filter((visit) => {
    const journey = asRecord$1(visit.MonitoredVehicleJourney);
    return Boolean(journey && hasCompatibleLineRef(journey.LineRef, topology));
  });
  const monitoredJourneys = monitoredLineVisits.map((visit) => parseMonitoredStopVisit(visit, topology)).filter((journey) => Boolean(journey));
  return {
    journeys: monitoredJourneys,
    estimatedJourneyCount: estimatedJourneys.length,
    estimatedLineJourneyCount: estimatedLineJourneys.length,
    monitoredVisitCount: monitoredVisits.length,
    monitoredLineVisitCount: monitoredLineVisits.length
  };
}
function parseEstimatedVehicleJourney(journey, topology) {
  var _a, _b;
  const lineRef = textValue(journey.LineRef);
  if (!hasCompatibleLineRef(lineRef, topology)) {
    return void 0;
  }
  const framedRef = asRecord$1(journey.FramedVehicleJourneyRef);
  const calls = collectNamedRecords(journey, "EstimatedCall").map((call) => parseVehicleCall(call, void 0, topology)).filter((call) => Boolean(call));
  if (calls.length === 0) {
    return void 0;
  }
  const journeyRef = cleanText(
    (_a = textValue(framedRef == null ? void 0 : framedRef.DatedVehicleJourneyRef)) != null ? _a : textValue(journey.DatedVehicleJourneyRef)
  );
  const destinationRef = textValue(journey.DestinationRef);
  return {
    calls,
    cancelled: isCancelled(journey),
    destination: firstText(journey.DestinationName, journey.DestinationDisplay),
    destinationStationId: topology.resolveStationRef(destinationRef),
    directionRef: (_b = cleanText(textValue(journey.DirectionRef))) != null ? _b : firstText(journey.DirectionName),
    journeyRef,
    serviceDate: extractServiceDate(
      textValue(framedRef == null ? void 0 : framedRef.DataFrameRef),
      journeyRef
    )
  };
}
function parseMonitoredStopVisit(visit, topology) {
  var _a;
  const journey = asRecord$1(visit.MonitoredVehicleJourney);
  if (!journey) {
    return void 0;
  }
  const lineRef = textValue(journey.LineRef);
  if (!hasCompatibleLineRef(lineRef, topology)) {
    return void 0;
  }
  const monitoredCall = asRecord$1(journey.MonitoredCall);
  const call = monitoredCall ? parseVehicleCall(monitoredCall, visit.MonitoringRef, topology) : void 0;
  if (!call) {
    return void 0;
  }
  const framedRef = asRecord$1(journey.FramedVehicleJourneyRef);
  const journeyRef = cleanText(textValue(framedRef == null ? void 0 : framedRef.DatedVehicleJourneyRef));
  const destinationRef = textValue(journey.DestinationRef);
  return {
    calls: [call],
    cancelled: isCancelled(journey),
    destination: firstText(journey.DestinationName, journey.DestinationDisplay),
    destinationStationId: topology.resolveStationRef(destinationRef),
    directionRef: (_a = cleanText(textValue(journey.DirectionRef))) != null ? _a : firstText(journey.DirectionName),
    journeyRef,
    serviceDate: extractServiceDate(
      textValue(framedRef == null ? void 0 : framedRef.DataFrameRef),
      journeyRef
    )
  };
}
function hasCompatibleLineRef(value, topology) {
  const lineRef = textValue(value);
  return !lineRef || normalizeReference(lineRef) === normalizeReference(topology.lineRef);
}
function parseVehicleCall(call, fallbackStopRef, topology) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const stationId = topology.resolveStationRef(
    (_b = (_a = call.StopPointRef) != null ? _a : call.StopPointId) != null ? _b : fallbackStopRef
  );
  if (!stationId) {
    return void 0;
  }
  const recordedArrival = firstIsoValue(
    call.ActualArrivalTime,
    call.RecordedArrivalTime
  );
  const recordedDeparture = firstIsoValue(
    call.ActualDepartureTime,
    call.RecordedDepartureTime
  );
  const expectedArrival = firstIsoValue(call.ExpectedArrivalTime);
  const expectedDeparture = firstIsoValue(call.ExpectedDepartureTime);
  const aimedArrivalAt = firstIsoValue(call.AimedArrivalTime);
  const aimedDepartureAt = firstIsoValue(call.AimedDepartureTime);
  const arrivalAt = (_c = recordedArrival != null ? recordedArrival : expectedArrival) != null ? _c : aimedArrivalAt;
  const departureAt = (_d = recordedDeparture != null ? recordedDeparture : expectedDeparture) != null ? _d : aimedDepartureAt;
  const timeQuality = recordedArrival || recordedDeparture ? "recorded" : expectedArrival || expectedDeparture ? "estimated" : "aimed";
  const arrivalStatus = cleanText(textValue(call.ArrivalStatus));
  const departureStatus = cleanText(textValue(call.DepartureStatus));
  const upstreamOrder = finiteNumber((_e = call.Order) != null ? _e : call.VisitNumber);
  const effectiveTimeMs = timeMilliseconds(
    (_g = (_f = arrivalAt != null ? arrivalAt : departureAt) != null ? _f : aimedArrivalAt) != null ? _g : aimedDepartureAt
  );
  if (effectiveTimeMs === void 0) {
    return void 0;
  }
  return {
    stationId,
    order: upstreamOrder != null ? upstreamOrder : 0,
    ...arrivalAt ? { arrivalAt } : {},
    ...departureAt ? { departureAt } : {},
    ...aimedArrivalAt ? { aimedArrivalAt } : {},
    ...aimedDepartureAt ? { aimedDepartureAt } : {},
    timeQuality,
    vehicleAtStop: (_h = booleanValue(call.VehicleAtStop)) != null ? _h : normalizeMode(arrivalStatus) === "arrived",
    cancelled: isCancelled(call) || [arrivalStatus, departureStatus].some(
      (status) => normalizeMode(status) === "cancelled"
    ),
    effectiveTimeMs,
    upstreamOrder
  };
}
function reconstructJourneys(rawJourneys, topology) {
  var _a, _b;
  const groupedByReference = /* @__PURE__ */ new Map();
  const anonymous = [];
  for (const journey of rawJourneys) {
    if (!journey.journeyRef) {
      anonymous.push(journey);
      continue;
    }
    const key = `${(_a = journey.serviceDate) != null ? _a : "unknown"}:${journey.journeyRef}`;
    groupedByReference.set(key, [
      ...(_b = groupedByReference.get(key)) != null ? _b : [],
      journey
    ]);
  }
  const result = [];
  const needsInference = [];
  for (const group of groupedByReference.values()) {
    if (group.length === 1) {
      const direct = createDirectJourney(group[0], topology, "reliable");
      if (direct) {
        result.push(direct);
        continue;
      }
    }
    needsInference.push(...group);
  }
  for (const journey of anonymous) {
    const direct = createDirectJourney(journey, topology, "inferred");
    if (direct) {
      result.push(direct);
    } else {
      needsInference.push(journey);
    }
  }
  result.push(...inferCollidingJourneys(needsInference, topology));
  return result.filter((journey) => journey.confidence !== "low").sort((left, right) => {
    const leftTime = firstJourneyTime(left);
    const rightTime = firstJourneyTime(right);
    return leftTime - rightTime || left.snapshotId.localeCompare(right.snapshotId);
  });
}
function createDirectJourney(journey, topology, identityQuality) {
  if (journey.cancelled) {
    return void 0;
  }
  const match = findPatternMatch(journey, topology.patterns, 2);
  if (!match) {
    return void 0;
  }
  const calls = normalizeCallsForPattern(journey.calls, match.pattern);
  const activeCalls = calls.filter((call) => !call.cancelled);
  if (activeCalls.length < 2 || !hasConsecutiveCalls(activeCalls) || !hasTemporalContinuity(activeCalls)) {
    return void 0;
  }
  const journeyRef = identityQuality === "reliable" ? journey.journeyRef : void 0;
  const snapshotId = createJourneySnapshotId(
    identityQuality,
    match.pattern.id,
    calls,
    journeyRef,
    journey.serviceDate
  );
  return {
    snapshotId,
    ...journeyRef ? { journeyRef } : {},
    ...journey.serviceDate ? { serviceDate: journey.serviceDate } : {},
    identityQuality,
    confidence: activeCalls.length >= 3 ? "high" : "medium",
    patternId: match.pattern.id,
    ...journey.directionRef ? { directionRef: journey.directionRef } : {},
    ...journey.destination ? { destination: journey.destination } : {},
    patternStationIds: [...match.pattern.stops],
    calls: calls.map(stripInternalCallFields)
  };
}
function inferCollidingJourneys(journeys, topology) {
  var _a;
  const pools = /* @__PURE__ */ new Map();
  let observationSequence = 0;
  for (const journey of journeys) {
    if (journey.cancelled) {
      continue;
    }
    const match = findPatternMatch(journey, topology.patterns, 1);
    if (!match) {
      continue;
    }
    const poolKey = [
      match.pattern.id,
      normalizeText$3(journey.directionRef),
      normalizeText$3(journey.destination)
    ].join("|");
    const pool = (_a = pools.get(poolKey)) != null ? _a : {
      destination: journey.destination,
      directionRef: journey.directionRef,
      observations: [],
      pattern: match.pattern
    };
    for (const call of normalizeCallsForPattern(journey.calls, match.pattern)) {
      if (call.cancelled || call.effectiveTimeMs === void 0) {
        continue;
      }
      pool.observations.push({
        call,
        id: `${poolKey}:${observationSequence}`,
        serviceDate: journey.serviceDate,
        timeMs: call.effectiveTimeMs
      });
      observationSequence += 1;
    }
    pools.set(poolKey, pool);
  }
  return [...pools.values()].flatMap(reconstructInferencePool);
}
function reconstructInferencePool(pool) {
  var _a, _b, _c, _d;
  const deduped = dedupeObservations(pool.observations);
  const byOrder = /* @__PURE__ */ new Map();
  for (const observation of deduped) {
    byOrder.set(observation.call.order, [
      ...(_a = byOrder.get(observation.call.order)) != null ? _a : [],
      observation
    ]);
  }
  for (const observations of byOrder.values()) {
    observations.sort((left, right) => left.timeMs - right.timeMs);
  }
  const parent = new Map(deduped.map((observation) => [observation.id, observation.id]));
  for (let order = 0; order < pool.pattern.stops.length - 1; order += 1) {
    const left = (_b = byOrder.get(order)) != null ? _b : [];
    const right = (_c = byOrder.get(order + 1)) != null ? _c : [];
    for (const [source, target] of matchAdjacentObservations(left, right)) {
      union(parent, source.id, target.id);
    }
  }
  const components = /* @__PURE__ */ new Map();
  for (const observation of deduped) {
    const root = findRoot(parent, observation.id);
    components.set(root, [...(_d = components.get(root)) != null ? _d : [], observation]);
  }
  const journeys = [];
  for (const component of components.values()) {
    const calls = component.sort((left, right) => left.call.order - right.call.order).map((observation) => observation.call);
    if (calls.length < 2 || !hasConsecutiveCalls(calls) || !hasTemporalContinuity(calls)) {
      continue;
    }
    const serviceDate = uniqueValue(
      component.map((observation) => observation.serviceDate).filter((value) => Boolean(value))
    );
    journeys.push({
      snapshotId: createJourneySnapshotId(
        "inferred",
        pool.pattern.id,
        calls,
        void 0,
        serviceDate
      ),
      ...serviceDate ? { serviceDate } : {},
      identityQuality: "inferred",
      confidence: "medium",
      patternId: pool.pattern.id,
      ...pool.directionRef ? { directionRef: pool.directionRef } : {},
      ...pool.destination ? { destination: pool.destination } : {},
      patternStationIds: [...pool.pattern.stops],
      calls: calls.map(stripInternalCallFields)
    });
  }
  return journeys;
}
function findPatternMatch(journey, patterns, minimumStations) {
  const orderedCalls = [...journey.calls].sort(compareUpstreamCalls);
  const stationSequence = dedupeConsecutive(
    orderedCalls.map((call) => call.stationId)
  );
  if (new Set(stationSequence).size < minimumStations) {
    return void 0;
  }
  const candidates = patterns.map((pattern) => {
    const indices = findMonotonicIndices(pattern.stops, stationSequence);
    if (!indices) {
      return void 0;
    }
    let score = stationSequence.length * 1e5;
    const terminal = pattern.stops.at(-1);
    if (journey.destinationStationId && terminal === journey.destinationStationId) {
      score += 5e4;
    }
    if (journey.destination && pattern.destination && normalizeText$3(journey.destination) === normalizeText$3(pattern.destination)) {
      score += 2e4;
    }
    if (journey.directionRef && pattern.direction && normalizeText$3(journey.directionRef) === normalizeText$3(pattern.direction)) {
      score += 5e3;
    }
    score += Math.min(pattern.serviceCount, 4999);
    score += Math.min(pattern.stops.length, 999);
    return { pattern, score };
  }).filter((match) => Boolean(match)).sort(
    (left, right) => right.score - left.score || left.pattern.id.localeCompare(right.pattern.id)
  );
  if (candidates.length === 0) {
    return void 0;
  }
  if (candidates.length > 1 && candidates[0].score === candidates[1].score && candidates[0].pattern.stops.join("|") !== candidates[1].pattern.stops.join("|")) {
    return void 0;
  }
  return candidates[0];
}
function normalizeCallsForPattern(calls, pattern) {
  const stationOrder = new Map(
    pattern.stops.map((stationId, order) => [stationId, order])
  );
  const byIdentity = /* @__PURE__ */ new Map();
  for (const call of calls) {
    const order = stationOrder.get(call.stationId);
    if (order === void 0) {
      continue;
    }
    const normalizedCall = {
      ...call,
      order
    };
    const key = [
      normalizedCall.stationId,
      normalizedCall.arrivalAt,
      normalizedCall.departureAt,
      normalizedCall.cancelled
    ].join("|");
    const current = byIdentity.get(key);
    if (!current || callQualityScore(normalizedCall) > callQualityScore(current)) {
      byIdentity.set(key, normalizedCall);
    }
  }
  return [...byIdentity.values()].sort(
    (left, right) => {
      var _a, _b;
      return left.order - right.order || ((_a = left.effectiveTimeMs) != null ? _a : 0) - ((_b = right.effectiveTimeMs) != null ? _b : 0);
    }
  );
}
function matchAdjacentObservations(left, right) {
  const pairs = [];
  let rightIndex = 0;
  for (const source of left) {
    while (rightIndex < right.length && right[rightIndex].timeMs <= source.timeMs) {
      rightIndex += 1;
    }
    const target = right[rightIndex];
    if (!target) {
      break;
    }
    if (target.timeMs - source.timeMs <= MAX_INTERSTATION_DURATION_MS) {
      pairs.push([source, target]);
      rightIndex += 1;
    }
  }
  return pairs;
}
function dedupeObservations(observations) {
  const byKey = /* @__PURE__ */ new Map();
  for (const observation of observations) {
    const key = [
      observation.call.order,
      observation.call.arrivalAt,
      observation.call.departureAt,
      observation.call.timeQuality
    ].join("|");
    const current = byKey.get(key);
    if (!current || callQualityScore(observation.call) > callQualityScore(current.call)) {
      byKey.set(key, observation);
    }
  }
  return [...byKey.values()];
}
function hasConsecutiveCalls(calls) {
  return calls.some(
    (call, index) => index > 0 && call.order === calls[index - 1].order + 1
  );
}
function hasTemporalContinuity(calls) {
  let previous;
  for (const call of calls) {
    if (call.cancelled || call.effectiveTimeMs === void 0) {
      continue;
    }
    if (previous !== void 0 && (call.effectiveTimeMs <= previous || call.effectiveTimeMs - previous > MAX_INTERSTATION_DURATION_MS)) {
      return false;
    }
    previous = call.effectiveTimeMs;
  }
  return true;
}
function findMonotonicIndices(patternStops, stationSequence) {
  const indices = [];
  let cursor = 0;
  for (const stationId of stationSequence) {
    const index = patternStops.indexOf(stationId, cursor);
    if (index < 0) {
      return void 0;
    }
    indices.push(index);
    cursor = index + 1;
  }
  return indices;
}
function isPayloadComplete(serviceDelivery, deliveries, generatedAt, now) {
  if (deliveries.length === 0 || explicitFalse(serviceDelivery == null ? void 0 : serviceDelivery.Status)) {
    return false;
  }
  if (deliveries.some(
    (delivery) => explicitFalse(delivery.Status) || booleanValue(delivery.MoreData) === true || hasMeaningfulValue(delivery.ErrorCondition)
  )) {
    return false;
  }
  const generatedMs = timeMilliseconds(generatedAt);
  return generatedMs !== void 0 && now.getTime() - generatedMs <= MAX_RESPONSE_AGE_MS && generatedMs - now.getTime() <= MAX_RESPONSE_AGE_MS;
}
function collectNamedRecords(root, targetKey) {
  const result = [];
  const visited = /* @__PURE__ */ new Set();
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord$3(value) || visited.has(value)) {
      return;
    }
    visited.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (key === targetKey) {
        result.push(...asArray$2(child).filter(isRecord$3));
      } else {
        visit(child);
      }
    }
  };
  visit(root);
  return result;
}
function getNestedRecord(value, ...path) {
  return asRecord$1(getNestedValue(value, ...path));
}
function getNestedValue(value, ...path) {
  let current = value;
  for (const key of path) {
    const record = asRecord$1(current);
    if (!record) {
      return void 0;
    }
    current = record[key];
  }
  return current;
}
function firstText(...values) {
  for (const value of values) {
    for (const candidate of asArray$2(value)) {
      const text = cleanText(textValue(candidate));
      if (text) {
        return text;
      }
    }
  }
  return void 0;
}
function textValue(value) {
  var _a;
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(textValue).find(Boolean);
  }
  const record = asRecord$1(value);
  return record ? textValue((_a = record.value) != null ? _a : record.Value) : void 0;
}
function firstIsoValue(...values) {
  for (const value of values) {
    const text = textValue(value);
    const milliseconds = timeMilliseconds(text);
    if (milliseconds !== void 0) {
      return new Date(milliseconds).toISOString();
    }
  }
  return void 0;
}
function timeMilliseconds(value) {
  if (!value) {
    return void 0;
  }
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : void 0;
}
function booleanValue(value) {
  var _a;
  if (typeof value === "boolean") {
    return value;
  }
  const text = (_a = textValue(value)) == null ? void 0 : _a.trim().toLowerCase();
  if (text === "true") {
    return true;
  }
  if (text === "false") {
    return false;
  }
  return void 0;
}
function explicitFalse(value) {
  return booleanValue(value) === false;
}
function isCancelled(record) {
  if ([record.Cancellation, record.Cancelled, record.IsCancelled].some(
    (value) => booleanValue(value) === true
  )) {
    return true;
  }
  return [record.ArrivalStatus, record.DepartureStatus, record.Status].some(
    (value) => normalizeMode(textValue(value)) === "cancelled"
  );
}
function hasMeaningfulValue(value) {
  if (value === null || value === void 0 || value === "") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(hasMeaningfulValue);
  }
  if (isRecord$3(value)) {
    return Object.values(value).some(hasMeaningfulValue);
  }
  return true;
}
function finiteNumber(value) {
  const parsed = typeof value === "number" ? value : Number(textValue(value));
  return Number.isFinite(parsed) ? parsed : void 0;
}
function extractServiceDate(dataFrameRef, journeyRef) {
  const value = `${dataFrameRef != null ? dataFrameRef : ""} ${journeyRef != null ? journeyRef : ""}`;
  const separated = value.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/u);
  if (separated) {
    return `${separated[1]}-${separated[2]}-${separated[3]}`;
  }
  const compact = value.match(/\b(20\d{2})(\d{2})(\d{2})\b/u);
  return compact ? `${compact[1]}-${compact[2]}-${compact[3]}` : void 0;
}
function compareUpstreamCalls(left, right) {
  var _a, _b;
  if (left.upstreamOrder !== void 0 && right.upstreamOrder !== void 0) {
    return left.upstreamOrder - right.upstreamOrder;
  }
  return ((_a = left.effectiveTimeMs) != null ? _a : 0) - ((_b = right.effectiveTimeMs) != null ? _b : 0);
}
function stripInternalCallFields(call) {
  const { effectiveTimeMs: _effectiveTimeMs, upstreamOrder: _upstreamOrder, ...publicCall } = call;
  return publicCall;
}
function callQualityScore(call) {
  return call.timeQuality === "recorded" ? 3 : call.timeQuality === "estimated" ? 2 : 1;
}
function createJourneySnapshotId(identityQuality, patternId, calls, journeyRef, serviceDate) {
  var _a;
  const timingAnchor = calls.map(
    (call) => {
      var _a2, _b, _c;
      return (_c = (_a2 = call.aimedArrivalAt) != null ? _a2 : call.aimedDepartureAt) != null ? _c : roundIsoToMinute((_b = call.arrivalAt) != null ? _b : call.departureAt);
    }
  ).find(Boolean);
  const seed = [
    identityQuality,
    patternId,
    journeyRef,
    serviceDate,
    (_a = calls[0]) == null ? void 0 : _a.stationId,
    timingAnchor
  ].join("|");
  return `${identityQuality}:${hashString(seed)}`;
}
function roundIsoToMinute(value) {
  const milliseconds = timeMilliseconds(value);
  if (milliseconds === void 0) {
    return void 0;
  }
  return String(Math.round(milliseconds / 6e4));
}
function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
function firstJourneyTime(journey) {
  var _a;
  for (const call of journey.calls) {
    const milliseconds = timeMilliseconds((_a = call.arrivalAt) != null ? _a : call.departureAt);
    if (milliseconds !== void 0) {
      return milliseconds;
    }
  }
  return Number.MAX_SAFE_INTEGER;
}
function findRoot(parent, value) {
  const current = parent.get(value);
  if (!current || current === value) {
    return current != null ? current : value;
  }
  const root = findRoot(parent, current);
  parent.set(value, root);
  return root;
}
function union(parent, left, right) {
  const leftRoot = findRoot(parent, left);
  const rightRoot = findRoot(parent, right);
  if (leftRoot !== rightRoot) {
    parent.set(rightRoot, leftRoot);
  }
}
function dedupeConsecutive(values) {
  return values.filter((value, index) => index === 0 || value !== values[index - 1]);
}
function uniqueValue(values) {
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0] : void 0;
}
function normalizeReference(value) {
  return value.trim().toUpperCase();
}
function normalizeMode(value) {
  return (value != null ? value : "").trim().toLowerCase();
}
function normalizeText$3(value) {
  return (value != null ? value : "").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/giu, "").toLowerCase();
}
function cleanText(value) {
  const text = value == null ? void 0 : value.replace(/\s+/gu, " ").trim();
  return text || void 0;
}
function asArray$2(value) {
  if (value === null || value === void 0) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}
function asRecord$1(value) {
  return isRecord$3(value) ? value : void 0;
}
function isRecord$3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const idfmSiriEstimatedTimetableProvider = {
  id: "idfm-siri-estimated-timetable",
  label: "IDFM PRIM \xB7 SIRI Estimated Timetable",
  minimumPollAfterMs: REALTIME_VEHICLE_POLL_AFTER_MS,
  capabilities: {
    exactCoordinates: false,
    exactVehicleIdentity: false,
    estimatedCalls: true
  },
  async loadSnapshot(context) {
    var _a;
    const snapshot = await getRealtimeVehicleSnapshot(context);
    const diagnostics = (_a = snapshot.diagnostics) != null ? _a : {
      stage: "upstream",
      missing: []
    };
    return {
      ...snapshot,
      diagnostics: {
        ...diagnostics,
        providerId: this.id,
        providerExactCoordinates: this.capabilities.exactCoordinates
      }
    };
  }
};
function getRealtimeVehicleProvider() {
  return idfmSiriEstimatedTimetableProvider;
}

const IDFM_LINE_TRACES_DATASET = "traces-des-lignes-de-transport-en-commun-idfm";
const IDFM_LINE_TRACES_API_ROOT = `https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/${IDFM_LINE_TRACES_DATASET}/records`;
const TRACE_CACHE_TTL_MS = 8 * 60 * 6e4;
const MAX_SERVER_PROJECTION_ERROR_METERS = 1e3;
const TRACE_REQUEST_TIMEOUT_MS = 3e3;
const traceCache$1 = /* @__PURE__ */ new Map();
const inFlightTraces = /* @__PURE__ */ new Map();
function createIdfmLineTraceUrl(routeId) {
  const url = new URL(IDFM_LINE_TRACES_API_ROOT);
  url.searchParams.set("select", "route_id,route_type,shape");
  url.searchParams.set("where", `route_id="${routeId}"`);
  url.searchParams.set("limit", "1");
  return url.toString();
}
async function loadIdfmLineTraceSegmentMetrics(options) {
  var _a, _b;
  const routeId = resolveIdfmRouteId(options.lineCache);
  const fallback = buildLineTraceSegmentMetrics(options.lineCache, []);
  if (!routeId) {
    return {
      status: "unavailable",
      metrics: fallback,
      missing: ["idfm_route_id"]
    };
  }
  try {
    const loaded = await loadLineTraces(
      routeId,
      (_a = options.fetchImpl) != null ? _a : fetch,
      (_b = options.nowMs) != null ? _b : Date.now()
    );
    const metrics = buildLineTraceSegmentMetrics(
      options.lineCache,
      loaded.traces
    );
    const gtfsMetricCount = metrics.filter(
      (metric) => metric.distanceSource === "gtfs_shape"
    ).length;
    return {
      routeId,
      status: loaded.status,
      metrics,
      missing: gtfsMetricCount > 0 ? [] : ["projectable_gtfs_shape_segments"]
    };
  } catch (error) {
    return {
      routeId,
      status: "unavailable",
      metrics: fallback,
      missing: [
        "idfm_line_trace",
        ...fallback.length > 0 ? [] : ["station_coordinates"],
        error instanceof Error ? error.message : String(error)
      ]
    };
  }
}
async function loadLineTraces(routeId, fetchImpl, nowMs) {
  const cached = traceCache$1.get(routeId);
  if (cached && cached.expiresAt > nowMs) {
    return { status: "fresh", traces: cached.traces };
  }
  const pending = inFlightTraces.get(routeId);
  if (pending) {
    return pending;
  }
  const request = (async () => {
    try {
      const response = await fetchLineTraceWithTimeout(
        fetchImpl,
        createIdfmLineTraceUrl(routeId)
      );
      if (!response.ok) {
        throw new Error(`IDFM line trace request failed (${response.status}).`);
      }
      const traces = parseIdfmLineTracePayload(await response.json());
      if (traces.length === 0) {
        throw new Error("IDFM line trace response contains no usable geometry.");
      }
      traceCache$1.set(routeId, {
        expiresAt: nowMs + TRACE_CACHE_TTL_MS,
        traces
      });
      return { status: "fresh", traces };
    } catch (error) {
      if (cached == null ? void 0 : cached.traces.length) {
        return { status: "stale", traces: cached.traces };
      }
      throw error;
    }
  })();
  inFlightTraces.set(routeId, request);
  try {
    return await request;
  } finally {
    if (inFlightTraces.get(routeId) === request) {
      inFlightTraces.delete(routeId);
    }
  }
}
async function fetchLineTraceWithTimeout(fetchImpl, url) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    TRACE_REQUEST_TIMEOUT_MS
  );
  try {
    return await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}
function parseIdfmLineTracePayload(payload) {
  if (!isRecord$2(payload) || !Array.isArray(payload.results)) {
    return [];
  }
  return payload.results.flatMap((result) => {
    const geometry = isRecord$2(result) && isRecord$2(result.shape) ? result.shape.geometry : void 0;
    if (!isRecord$2(geometry) || geometry.type !== "MultiLineString") {
      return [];
    }
    return asCoordinateArray(geometry.coordinates);
  });
}
function asCoordinateArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((line) => {
    if (!Array.isArray(line)) {
      return [];
    }
    const points = line.flatMap((coordinate) => {
      if (!Array.isArray(coordinate) || coordinate.length < 2 || !Number.isFinite(Number(coordinate[0])) || !Number.isFinite(Number(coordinate[1]))) {
        return [];
      }
      return [{ lon: Number(coordinate[0]), lat: Number(coordinate[1]) }];
    });
    return points.length >= 2 ? [points] : [];
  });
}
function buildLineTraceSegmentMetrics(lineCache, traces) {
  const nodes = new Map(
    lineCache.schematic.nodes.map((node) => [node.id, node])
  );
  const seen = /* @__PURE__ */ new Set();
  const metrics = [];
  for (const segment of lineCache.schematic.segments) {
    const stationIds = segment.stationIds.length >= 2 ? segment.stationIds : [segment.from, segment.to];
    for (let index = 0; index < stationIds.length - 1; index += 1) {
      const sourceStationId = stationIds[index];
      const targetStationId = stationIds[index + 1];
      const pairKey = [sourceStationId, targetStationId].sort().join("\0");
      if (seen.has(pairKey)) {
        continue;
      }
      seen.add(pairKey);
      const source = resolveNodeLonLat(nodes.get(sourceStationId));
      const target = resolveNodeLonLat(nodes.get(targetStationId));
      if (!source || !target) {
        continue;
      }
      const fallbackDistanceMeters = Math.round(
        getCoordinatesDistanceKm(
          source.lat,
          source.lon,
          target.lat,
          target.lon
        ) * 1e3
      );
      const traced = findBestTraceDistance(source, target, traces);
      const useTrace = traced !== void 0 && traced.projectionErrorMeters <= MAX_SERVER_PROJECTION_ERROR_METERS && isPlausibleTraceDistance(
        traced.distanceMeters,
        fallbackDistanceMeters
      );
      metrics.push({
        id: `${segment.id}:${index}`,
        sourceStationId,
        targetStationId,
        distanceMeters: useTrace ? Math.round(traced.distanceMeters) : fallbackDistanceMeters,
        fallbackDistanceMeters,
        distanceSource: useTrace ? "gtfs_shape" : "geodesic_fallback",
        ...traced ? { projectionErrorMeters: Math.round(traced.projectionErrorMeters) } : {}
      });
    }
  }
  return metrics;
}
function resolveNodeLonLat(node) {
  if (!node || !Number.isFinite(node.x) || !Number.isFinite(node.y)) {
    return void 0;
  }
  const x = node.x;
  const y = node.y;
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
    return { lon: x, lat: y };
  }
  return convertLambert93ToWgs84(x, y);
}
function findBestTraceDistance(source, target, traces) {
  return traces.flatMap((trace) => {
    const sourceProjection = projectPointOnTrace(source, trace);
    const targetProjection = projectPointOnTrace(target, trace);
    if (!sourceProjection || !targetProjection) {
      return [];
    }
    return [{
      distanceMeters: Math.abs(
        targetProjection.alongMeters - sourceProjection.alongMeters
      ),
      projectionErrorMeters: Math.max(
        sourceProjection.errorMeters,
        targetProjection.errorMeters
      )
    }];
  }).sort(
    (left, right) => left.projectionErrorMeters - right.projectionErrorMeters || left.distanceMeters - right.distanceMeters
  )[0];
}
function projectPointOnTrace(point, trace) {
  let travelledMeters = 0;
  let best;
  for (let index = 0; index < trace.length - 1; index += 1) {
    const start = trace[index];
    const end = trace[index + 1];
    const segmentMeters = distanceMeters$2(start, end);
    if (segmentMeters <= 0) {
      continue;
    }
    const projected = projectOnSegment$1(point, start, end);
    const candidate = {
      alongMeters: travelledMeters + projected.progress * segmentMeters,
      errorMeters: distanceMeters$2(point, projected.point)
    };
    if (!best || candidate.errorMeters < best.errorMeters) {
      best = candidate;
    }
    travelledMeters += segmentMeters;
  }
  return best;
}
function projectOnSegment$1(point, start, end) {
  const latitudeRadians = point.lat * Math.PI / 180;
  const xScale = Math.max(0.1, Math.cos(latitudeRadians));
  const dx = (end.lon - start.lon) * xScale;
  const dy = end.lat - start.lat;
  const px = (point.lon - start.lon) * xScale;
  const py = point.lat - start.lat;
  const denominator = dx * dx + dy * dy;
  const progress = denominator > 0 ? Math.min(1, Math.max(0, (px * dx + py * dy) / denominator)) : 0;
  return {
    progress,
    point: {
      lon: start.lon + (end.lon - start.lon) * progress,
      lat: start.lat + (end.lat - start.lat) * progress
    }
  };
}
function isPlausibleTraceDistance(traceDistanceMeters, fallbackDistanceMeters) {
  if (!Number.isFinite(traceDistanceMeters) || traceDistanceMeters <= 0) {
    return false;
  }
  if (fallbackDistanceMeters <= 0) {
    return traceDistanceMeters <= 1e4;
  }
  return traceDistanceMeters >= fallbackDistanceMeters * 0.7 && traceDistanceMeters <= Math.max(
    fallbackDistanceMeters * 8,
    fallbackDistanceMeters + 4e3
  );
}
function distanceMeters$2(left, right) {
  return getCoordinatesDistanceKm(left.lat, left.lon, right.lat, right.lon) * 1e3;
}
function resolveIdfmRouteId(lineCache) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i;
  const value = (_c = (_b = (_a = lineCache.line.primLineId) != null ? _a : lineCache.schematic.line.primLineId) != null ? _b : lineCache.line.id) != null ? _c : lineCache.schematic.line.id;
  const code = (_i = (_f = (_d = value == null ? void 0 : value.match(/(?:line:)?IDFM:(C\d{5})/iu)) == null ? void 0 : _d[1]) != null ? _f : (_e = value == null ? void 0 : value.match(/(?:Line::)?(C\d{5})/iu)) == null ? void 0 : _e[1]) != null ? _i : (_h = (_g = lineCache.line.code) == null ? void 0 : _g.match(/C\d{5}/iu)) == null ? void 0 : _h[0];
  return code ? `IDFM:${code.toUpperCase()}` : void 0;
}
function isRecord$2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const _DcXa0V = defineEventHandler(async (event) => {
  const transportType = getRouterParam(event, "transportType");
  const lineId = getRouterParam(event, "lineId");
  if (!transportType || !lineId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing transport type or line id."
    });
  }
  setHeader(
    event,
    "Cache-Control",
    "public, max-age=0, s-maxage=60, stale-while-revalidate=120"
  );
  if (!isGuidedRealtimeTransportType(transportType)) {
    const snapshot = createUnavailableVehicleSnapshot(
      lineId,
      "unsupported_mode",
      /* @__PURE__ */ new Date(),
      true,
      {
        stage: "topology",
        missing: ["supported_guided_transport_type"],
        cacheTransportMode: transportType
      }
    );
    logVehicleSnapshot(transportType, lineId, snapshot);
    return snapshot;
  }
  const runtimeEnv = getNetexRuntimeEnv(event);
  let lineCache;
  try {
    lineCache = await loadNetexLineCache(
      resolveKnownLineAlias(transportType, lineId),
      runtimeEnv
    );
  } catch (error) {
    console.error("[realtime-vehicles:server] topology-load-failed", {
      transportType,
      requestedLineId: lineId,
      error: serializeVehicleError(error)
    });
    throw createError({
      cause: error,
      statusCode: 404,
      statusMessage: `No topology found for ${transportType}/${lineId}.`
    });
  }
  const apiKey = getServerIdfmApiKey(event);
  if (!apiKey) {
    console.error("[realtime-vehicles:server] configuration-missing", {
      transportType,
      requestedLineId: lineId,
      missing: ["IDFM_API_KEY"]
    });
    throw createError({
      statusCode: 500,
      statusMessage: "IDFM_API_KEY is not configured on this deployment."
    });
  }
  try {
    const provider = getRealtimeVehicleProvider();
    const [snapshot, segmentMetricResult] = await Promise.all([
      provider.loadSnapshot({
        apiKey,
        lineCache
      }),
      loadIdfmLineTraceSegmentMetrics({ lineCache })
    ]);
    const enrichedSnapshot = {
      ...snapshot,
      segmentMetrics: segmentMetricResult.metrics,
      diagnostics: {
        ...snapshot.diagnostics,
        segmentMetricCount: segmentMetricResult.metrics.length,
        gtfsShapeMetricCount: segmentMetricResult.metrics.filter(
          (metric) => metric.distanceSource === "gtfs_shape"
        ).length,
        segmentMetricFallbackCount: segmentMetricResult.metrics.filter(
          (metric) => metric.distanceSource === "geodesic_fallback"
        ).length,
        lineTraceStatus: segmentMetricResult.status,
        providerId: provider.id,
        providerExactCoordinates: provider.capabilities.exactCoordinates
      }
    };
    if (segmentMetricResult.missing.length > 0) {
      console.warn("[realtime-vehicles:server] segment-metrics-degraded", {
        transportType,
        requestedLineId: lineId,
        routeId: segmentMetricResult.routeId,
        status: segmentMetricResult.status,
        metricCount: segmentMetricResult.metrics.length,
        missing: segmentMetricResult.missing
      });
    }
    logVehicleSnapshot(transportType, lineId, enrichedSnapshot);
    return enrichedSnapshot;
  } catch (error) {
    console.error("[realtime-vehicles:server] snapshot-failed", {
      transportType,
      requestedLineId: lineId,
      error: serializeVehicleError(error)
    });
    if (error instanceof RealtimeVehicleUpstreamError) {
      if (error.retryAfter) {
        setResponseHeaders(event, { "Retry-After": error.retryAfter });
      }
      throw createError({
        cause: error,
        statusCode: error.statusCode,
        statusMessage: error.statusCode === 429 ? "IDFM realtime quota exceeded." : "IDFM realtime service is temporarily unavailable."
      });
    }
    const statusCode = getErrorStatusCode(error);
    throw createError({
      cause: error,
      statusCode,
      statusMessage: "Unable to build the realtime vehicle snapshot."
    });
  }
});
function logVehicleSnapshot(transportType, requestedLineId, snapshot) {
  const details = {
    transportType,
    requestedLineId,
    resolvedLineId: snapshot.lineId,
    available: snapshot.available,
    reason: snapshot.reason,
    complete: snapshot.complete,
    generatedAt: snapshot.generatedAt,
    journeyCount: snapshot.journeys.length,
    diagnostics: snapshot.diagnostics
  };
  if (snapshot.available) {
    console.info("[realtime-vehicles:server] snapshot-ready", details);
  } else {
    console.warn("[realtime-vehicles:server] snapshot-unavailable", details);
  }
}
function serializeVehicleError(error) {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }
  const details = error;
  return {
    message: error.message,
    name: error.name,
    statusCode: details.statusCode,
    upstreamStatus: details.upstreamStatus
  };
}
function getErrorStatusCode(error) {
  if (typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number") {
    return error.statusCode;
  }
  return 503;
}

const _lazy_QjWT_3 = () => Promise.resolve().then(function () { return plugins_get$1; });
const _lazy_n5ioNr = () => Promise.resolve().then(function () { return autocomplete_post$1; });
const _lazy_IFGTvq = () => Promise.resolve().then(function () { return reverse_post$1; });
const _lazy_A9KbVd = () => Promise.resolve().then(function () { return search_post$1; });
const _lazy_OU2H5t = () => Promise.resolve().then(function () { return preload_post$1; });
const _lazy_mN1kuZ = () => Promise.resolve().then(function () { return status_get$7; });
const _lazy_Sj7dAs = () => Promise.resolve().then(function () { return boards_post$1; });
const _lazy_Py6NIA = () => Promise.resolve().then(function () { return directions_get$1; });
const _lazy_4Fc9AW = () => Promise.resolve().then(function () { return families_get$1; });
const _lazy_W_YxAU = () => Promise.resolve().then(function () { return lines_get$1; });
const _lazy_XCyCzJ = () => Promise.resolve().then(function () { return stations_get$1; });
const _lazy_aueWEb = () => Promise.resolve().then(function () { return info_get$1; });
const _lazy_FAv4P1 = () => Promise.resolve().then(function () { return health_get$1; });
const _lazy_MJNfcP = () => Promise.resolve().then(function () { return ____path_$1; });
const _lazy_Kbp7bA = () => Promise.resolve().then(function () { return resolve_post$1; });
const _lazy_SDpziS = () => Promise.resolve().then(function () { return topology_get$1; });
const _lazy_aZ0js1 = () => Promise.resolve().then(function () { return pattern_get$1; });
const _lazy_o3V7p8 = () => Promise.resolve().then(function () { return release_get$1; });
const _lazy_zxXcsJ = () => Promise.resolve().then(function () { return download_get$1; });
const _lazy_9KfhY1 = () => Promise.resolve().then(function () { return status_get$5; });
const _lazy_a93cST = () => Promise.resolve().then(function () { return records_get$1; });
const _lazy_Jf_ppw = () => Promise.resolve().then(function () { return _lineId__get$1; });
const _lazy_8PiHDq = () => Promise.resolve().then(function () { return _stationId__get$1; });
const _lazy_lM9jcP = () => Promise.resolve().then(function () { return status_get$3; });
const _lazy_KX3p5T = () => Promise.resolve().then(function () { return traffic_get$1; });
const _lazy_KT_BD2 = () => Promise.resolve().then(function () { return refresh_post$1; });
const _lazy_xM6rDh = () => Promise.resolve().then(function () { return status_get$1; });
const _lazy_VSBmMq = () => Promise.resolve().then(function () { return transferBundles_delete$1; });
const _lazy_YjVIUm = () => Promise.resolve().then(function () { return transferBundles_get$1; });
const _lazy_gVIs4x = () => Promise.resolve().then(function () { return transferBundles_post$1; });
const _lazy_QVJQNP = () => Promise.resolve().then(function () { return weather_get$1; });
const _lazy_hj0LNc = () => Promise.resolve().then(function () { return renderer$1; });

const handlers = [
  { route: '', handler: _rNlGOc, lazy: false, middleware: true, method: undefined },
  { route: '/api/_transport-clock/plugins', handler: _lazy_QjWT_3, lazy: true, middleware: false, method: "get" },
  { route: '/api/geocoding/autocomplete', handler: _lazy_n5ioNr, lazy: true, middleware: false, method: "post" },
  { route: '/api/geocoding/reverse', handler: _lazy_IFGTvq, lazy: true, middleware: false, method: "post" },
  { route: '/api/geocoding/search', handler: _lazy_A9KbVd, lazy: true, middleware: false, method: "post" },
  { route: '/api/gtfs/preload', handler: _lazy_OU2H5t, lazy: true, middleware: false, method: "post" },
  { route: '/api/gtfs/status', handler: _lazy_mN1kuZ, lazy: true, middleware: false, method: "get" },
  { route: '/api/ha/v1/boards', handler: _lazy_Sj7dAs, lazy: true, middleware: false, method: "post" },
  { route: '/api/ha/v1/catalog/directions', handler: _lazy_Py6NIA, lazy: true, middleware: false, method: "get" },
  { route: '/api/ha/v1/catalog/families', handler: _lazy_4Fc9AW, lazy: true, middleware: false, method: "get" },
  { route: '/api/ha/v1/catalog/lines', handler: _lazy_W_YxAU, lazy: true, middleware: false, method: "get" },
  { route: '/api/ha/v1/catalog/stations', handler: _lazy_XCyCzJ, lazy: true, middleware: false, method: "get" },
  { route: '/api/ha/v1/info', handler: _lazy_aueWEb, lazy: true, middleware: false, method: "get" },
  { route: '/api/health', handler: _lazy_FAv4P1, lazy: true, middleware: false, method: "get" },
  { route: '/api/idfm/**:path', handler: _lazy_MJNfcP, lazy: true, middleware: false, method: undefined },
  { route: '/api/line-geometry/resolve', handler: _lazy_Kbp7bA, lazy: true, middleware: false, method: "post" },
  { route: '/api/lines/:lineId/topology', handler: _lazy_SDpziS, lazy: true, middleware: false, method: "get" },
  { route: '/api/lines/:transportType/:lineId/pattern', handler: _lazy_aZ0js1, lazy: true, middleware: false, method: "get" },
  { route: '/api/mobile/android/release', handler: _lazy_o3V7p8, lazy: true, middleware: false, method: "get" },
  { route: '/api/mobile/android/release/download', handler: _lazy_zxXcsJ, lazy: true, middleware: false, method: "get" },
  { route: '/api/netex/status', handler: _lazy_9KfhY1, lazy: true, middleware: false, method: "get" },
  { route: '/api/opendata/arrets-lignes/records', handler: _lazy_a93cST, lazy: true, middleware: false, method: "get" },
  { route: '/api/ridership/lines/:lineId', handler: _lazy_Jf_ppw, lazy: true, middleware: false, method: "get" },
  { route: '/api/ridership/stations/:stationId', handler: _lazy_8PiHDq, lazy: true, middleware: false, method: "get" },
  { route: '/api/ridership/status', handler: _lazy_lM9jcP, lazy: true, middleware: false, method: "get" },
  { route: '/api/traffic', handler: _lazy_KX3p5T, lazy: true, middleware: false, method: "get" },
  { route: '/api/traffic/refresh', handler: _lazy_KT_BD2, lazy: true, middleware: false, method: "post" },
  { route: '/api/traffic/status', handler: _lazy_xM6rDh, lazy: true, middleware: false, method: "get" },
  { route: '/api/transfer-bundles', handler: _lazy_VSBmMq, lazy: true, middleware: false, method: "delete" },
  { route: '/api/transfer-bundles', handler: _lazy_YjVIUm, lazy: true, middleware: false, method: "get" },
  { route: '/api/transfer-bundles', handler: _lazy_gVIs4x, lazy: true, middleware: false, method: "post" },
  { route: '/api/weather', handler: _lazy_QVJQNP, lazy: true, middleware: false, method: "get" },
  { route: '/__nuxt_error', handler: _lazy_hj0LNc, lazy: true, middleware: false, method: undefined },
  { route: '/__nuxt_island/**', handler: _SxA8c9, lazy: false, middleware: false, method: undefined },
  { route: '/api/lines/:transportType/:lineId/vehicles', handler: _DcXa0V, lazy: false, middleware: false, method: "get" },
  { route: '/**', handler: _lazy_hj0LNc, lazy: true, middleware: false, method: undefined }
];

function createNitroApp() {
  const config = useRuntimeConfig();
  const hooks = createHooks();
  const captureError = (error, context = {}) => {
    const promise = hooks.callHookParallel("error", error, context).catch((error_) => {
      console.error("Error while capturing another error", error_);
    });
    if (context.event && isEvent(context.event)) {
      const errors = context.event.context.nitro?.errors;
      if (errors) {
        errors.push({ error, context });
      }
      if (context.event.waitUntil) {
        context.event.waitUntil(promise);
      }
    }
  };
  const h3App = createApp({
    debug: destr(true),
    onError: (error, event) => {
      captureError(error, { event, tags: ["request"] });
      return errorHandler(error, event);
    },
    onRequest: async (event) => {
      event.context.nitro = event.context.nitro || { errors: [] };
      const fetchContext = event.node.req?.__unenv__;
      if (fetchContext?._platform) {
        event.context = {
          _platform: fetchContext?._platform,
          // #3335
          ...fetchContext._platform,
          ...event.context
        };
      }
      if (!event.context.waitUntil && fetchContext?.waitUntil) {
        event.context.waitUntil = fetchContext.waitUntil;
      }
      event.fetch = (req, init) => fetchWithEvent(event, req, init, { fetch: localFetch });
      event.$fetch = (req, init) => fetchWithEvent(event, req, init, {
        fetch: $fetch
      });
      event.waitUntil = (promise) => {
        if (!event.context.nitro._waitUntilPromises) {
          event.context.nitro._waitUntilPromises = [];
        }
        event.context.nitro._waitUntilPromises.push(promise);
        if (event.context.waitUntil) {
          event.context.waitUntil(promise);
        }
      };
      event.captureError = (error, context) => {
        captureError(error, { event, ...context });
      };
      await nitroApp$1.hooks.callHook("request", event).catch((error) => {
        captureError(error, { event, tags: ["request"] });
      });
    },
    onBeforeResponse: async (event, response) => {
      await nitroApp$1.hooks.callHook("beforeResponse", event, response).catch((error) => {
        captureError(error, { event, tags: ["request", "response"] });
      });
    },
    onAfterResponse: async (event, response) => {
      await nitroApp$1.hooks.callHook("afterResponse", event, response).catch((error) => {
        captureError(error, { event, tags: ["request", "response"] });
      });
    }
  });
  const router = createRouter$1({
    preemptive: true
  });
  const nodeHandler = toNodeListener(h3App);
  const localCall = (aRequest) => callNodeRequestHandler(
    nodeHandler,
    aRequest
  );
  const localFetch = (input, init) => {
    if (!input.toString().startsWith("/")) {
      return globalThis.fetch(input, init);
    }
    return fetchNodeRequestHandler(
      nodeHandler,
      input,
      init
    ).then((response) => normalizeFetchResponse(response));
  };
  const $fetch = createFetch({
    fetch: localFetch,
    Headers: Headers$1,
    defaults: { baseURL: config.app.baseURL }
  });
  globalThis.$fetch = $fetch;
  h3App.use(createRouteRulesHandler({ localFetch }));
  for (const h of handlers) {
    let handler = h.lazy ? lazyEventHandler(h.handler) : h.handler;
    if (h.middleware || !h.route) {
      const middlewareBase = (config.app.baseURL + (h.route || "/")).replace(
        /\/+/g,
        "/"
      );
      h3App.use(middlewareBase, handler);
    } else {
      const routeRules = getRouteRulesForPath(
        h.route.replace(/:\w+|\*\*/g, "_")
      );
      if (routeRules.cache) {
        handler = cachedEventHandler(handler, {
          group: "nitro/routes",
          ...routeRules.cache
        });
      }
      router.use(h.route, handler, h.method);
    }
  }
  h3App.use(config.app.baseURL, router.handler);
  const app = {
    hooks,
    h3App,
    router,
    localCall,
    localFetch,
    captureError
  };
  return app;
}
function runNitroPlugins(nitroApp2) {
  for (const plugin of plugins) {
    try {
      plugin(nitroApp2);
    } catch (error) {
      nitroApp2.captureError(error, { tags: ["plugin"] });
      throw error;
    }
  }
}
const nitroApp$1 = createNitroApp();
function useNitroApp() {
  return nitroApp$1;
}
runNitroPlugins(nitroApp$1);

function defineRenderHandler(render) {
  const runtimeConfig = useRuntimeConfig();
  return eventHandler(async (event) => {
    const nitroApp = useNitroApp();
    const ctx = { event, render, response: void 0 };
    await nitroApp.hooks.callHook("render:before", ctx);
    if (!ctx.response) {
      if (event.path === `${runtimeConfig.app.baseURL}favicon.ico`) {
        setResponseHeader(event, "Content-Type", "image/x-icon");
        return send(
          event,
          "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
        );
      }
      ctx.response = await ctx.render(event);
      if (!ctx.response) {
        const _currentStatus = getResponseStatus(event);
        setResponseStatus(event, _currentStatus === 200 ? 500 : _currentStatus);
        return send(
          event,
          "No response returned from render handler: " + event.path
        );
      }
    }
    await nitroApp.hooks.callHook("render:response", ctx.response, ctx);
    if (ctx.response.headers) {
      setResponseHeaders(event, ctx.response.headers);
    }
    if (ctx.response.statusCode || ctx.response.statusMessage) {
      setResponseStatus(
        event,
        ctx.response.statusCode,
        ctx.response.statusMessage
      );
    }
    return ctx.response.body;
  });
}

const scheduledTasks = false;

const tasks = {
  
};

const __runningTasks__ = {};
async function runTask(name, {
  payload = {},
  context = {}
} = {}) {
  if (__runningTasks__[name]) {
    return __runningTasks__[name];
  }
  if (!(name in tasks)) {
    throw createError({
      message: `Task \`${name}\` is not available!`,
      statusCode: 404
    });
  }
  if (!tasks[name].resolve) {
    throw createError({
      message: `Task \`${name}\` is not implemented!`,
      statusCode: 501
    });
  }
  const handler = await tasks[name].resolve();
  const taskEvent = { name, payload, context };
  __runningTasks__[name] = handler.run(taskEvent);
  try {
    const res = await __runningTasks__[name];
    return res;
  } finally {
    delete __runningTasks__[name];
  }
}

if (!globalThis.crypto) {
  globalThis.crypto = nodeCrypto.webcrypto;
}
const { NITRO_NO_UNIX_SOCKET, NITRO_DEV_WORKER_ID } = process.env;
trapUnhandledNodeErrors();
parentPort?.on("message", (msg) => {
  if (msg && msg.event === "shutdown") {
    shutdown();
  }
});
const nitroApp = useNitroApp();
const server$2 = new Server(toNodeListener(nitroApp.h3App));
let listener;
listen().catch(() => listen(
  true
  /* use random port */
)).catch((error) => {
  console.error("Dev worker failed to listen:", error);
  return shutdown();
});
nitroApp.router.get(
  "/_nitro/tasks",
  defineEventHandler(async (event) => {
    const _tasks = await Promise.all(
      Object.entries(tasks).map(async ([name, task]) => {
        const _task = await task.resolve?.();
        return [name, { description: _task?.meta?.description }];
      })
    );
    return {
      tasks: Object.fromEntries(_tasks),
      scheduledTasks
    };
  })
);
nitroApp.router.use(
  "/_nitro/tasks/:name",
  defineEventHandler(async (event) => {
    const name = getRouterParam(event, "name");
    const payload = {
      ...getQuery$1(event),
      ...await readBody(event).then((r) => r?.payload).catch(() => ({}))
    };
    return await runTask(name, { payload });
  })
);
function listen(useRandomPort = Boolean(
  NITRO_NO_UNIX_SOCKET || process.versions.webcontainer || "Bun" in globalThis && process.platform === "win32"
)) {
  return new Promise((resolve, reject) => {
    try {
      listener = server$2.listen(useRandomPort ? 0 : getSocketAddress(), () => {
        const address = server$2.address();
        parentPort?.postMessage({
          event: "listen",
          address: typeof address === "string" ? { socketPath: address } : { host: "localhost", port: address?.port }
        });
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}
function getSocketAddress() {
  const socketName = `nitro-worker-${process.pid}-${threadId}-${NITRO_DEV_WORKER_ID}-${Math.round(Math.random() * 1e4)}.sock`;
  if (process.platform === "win32") {
    return join(String.raw`\\.\pipe`, socketName);
  }
  if (process.platform === "linux") {
    const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
    if (nodeMajor >= 20) {
      return `\0${socketName}`;
    }
  }
  return join(tmpdir(), socketName);
}
async function shutdown() {
  server$2.closeAllConnections?.();
  await Promise.all([
    new Promise((resolve) => listener?.close(resolve)),
    nitroApp.hooks.callHook("close").catch(console.error)
  ]);
  parentPort?.postMessage({ event: "exit" });
}

const _messages = { "appName": "Nuxt", "version": "", "statusCode": 500, "statusMessage": "Server error", "description": "This page is temporarily unavailable." };
const template$1 = (messages) => {
  messages = { ..._messages, ...messages };
  return '<!DOCTYPE html><html lang="en"><head><title>' + escapeHtml(messages.statusCode) + " - " + escapeHtml(messages.statusMessage) + " | " + escapeHtml(messages.appName) + `</title><meta charset="utf-8"><meta content="width=device-width,initial-scale=1.0,minimum-scale=1.0" name="viewport"><style>.spotlight{background:linear-gradient(45deg,#00dc82,#36e4da 50%,#0047e1);filter:blur(20vh)}*,:after,:before{border-color:var(--un-default-border-color,#e5e7eb);border-style:solid;border-width:0;box-sizing:border-box}:after,:before{--un-content:""}html{line-height:1.5;-webkit-text-size-adjust:100%;font-family:ui-sans-serif,system-ui,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji;font-feature-settings:normal;font-variation-settings:normal;-moz-tab-size:4;tab-size:4;-webkit-tap-highlight-color:transparent}body{line-height:inherit;margin:0}h1{font-size:inherit;font-weight:inherit}h1,p{margin:0}*,:after,:before{--un-rotate:0;--un-rotate-x:0;--un-rotate-y:0;--un-rotate-z:0;--un-scale-x:1;--un-scale-y:1;--un-scale-z:1;--un-skew-x:0;--un-skew-y:0;--un-translate-x:0;--un-translate-y:0;--un-translate-z:0;--un-pan-x: ;--un-pan-y: ;--un-pinch-zoom: ;--un-scroll-snap-strictness:proximity;--un-ordinal: ;--un-slashed-zero: ;--un-numeric-figure: ;--un-numeric-spacing: ;--un-numeric-fraction: ;--un-border-spacing-x:0;--un-border-spacing-y:0;--un-ring-offset-shadow:0 0 transparent;--un-ring-shadow:0 0 transparent;--un-shadow-inset: ;--un-shadow:0 0 transparent;--un-ring-inset: ;--un-ring-offset-width:0px;--un-ring-offset-color:#fff;--un-ring-width:0px;--un-ring-color:rgba(147,197,253,.5);--un-blur: ;--un-brightness: ;--un-contrast: ;--un-drop-shadow: ;--un-grayscale: ;--un-hue-rotate: ;--un-invert: ;--un-saturate: ;--un-sepia: ;--un-backdrop-blur: ;--un-backdrop-brightness: ;--un-backdrop-contrast: ;--un-backdrop-grayscale: ;--un-backdrop-hue-rotate: ;--un-backdrop-invert: ;--un-backdrop-opacity: ;--un-backdrop-saturate: ;--un-backdrop-sepia: }.fixed{position:fixed}.-bottom-1\\/2{bottom:-50%}.left-0{left:0}.right-0{right:0}.grid{display:grid}.mb-16{margin-bottom:4rem}.mb-8{margin-bottom:2rem}.h-1\\/2{height:50%}.max-w-520px{max-width:520px}.min-h-screen{min-height:100vh}.place-content-center{place-content:center}.overflow-hidden{overflow:hidden}.bg-white{--un-bg-opacity:1;background-color:rgb(255 255 255/var(--un-bg-opacity))}.px-8{padding-left:2rem;padding-right:2rem}.text-center{text-align:center}.text-8xl{font-size:6rem;line-height:1}.text-xl{font-size:1.25rem;line-height:1.75rem}.text-black{--un-text-opacity:1;color:rgb(0 0 0/var(--un-text-opacity))}.font-light{font-weight:300}.font-medium{font-weight:500}.leading-tight{line-height:1.25}.font-sans{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,Noto Sans,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji}.antialiased{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}@media(prefers-color-scheme:dark){.dark\\:bg-black{--un-bg-opacity:1;background-color:rgb(0 0 0/var(--un-bg-opacity))}.dark\\:text-white{--un-text-opacity:1;color:rgb(255 255 255/var(--un-text-opacity))}}@media(min-width:640px){.sm\\:px-0{padding-left:0;padding-right:0}.sm\\:text-4xl{font-size:2.25rem;line-height:2.5rem}}</style><script>!function(){const e=document.createElement("link").relList;if(!(e&&e.supports&&e.supports("modulepreload"))){for(const e of document.querySelectorAll('link[rel="modulepreload"]'))r(e);new MutationObserver((e=>{for(const o of e)if("childList"===o.type)for(const e of o.addedNodes)"LINK"===e.tagName&&"modulepreload"===e.rel&&r(e)})).observe(document,{childList:!0,subtree:!0})}function r(e){if(e.ep)return;e.ep=!0;const r=function(e){const r={};return e.integrity&&(r.integrity=e.integrity),e.referrerPolicy&&(r.referrerPolicy=e.referrerPolicy),"use-credentials"===e.crossOrigin?r.credentials="include":"anonymous"===e.crossOrigin?r.credentials="omit":r.credentials="same-origin",r}(e);fetch(e.href,r)}}();<\/script></head><body class="antialiased bg-white dark:bg-black dark:text-white font-sans grid min-h-screen overflow-hidden place-content-center text-black"><div class="-bottom-1/2 fixed h-1/2 left-0 right-0 spotlight"></div><div class="max-w-520px text-center"><h1 class="font-medium mb-8 sm:text-10xl text-8xl">` + escapeHtml(messages.statusCode) + '</h1><p class="font-light leading-tight mb-16 px-8 sm:px-0 sm:text-4xl text-xl">' + escapeHtml(messages.description) + "</p></div></body></html>";
};

const error500 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  template: template$1
}, Symbol.toStringTag, { value: 'Module' }));

const server = () => {};

const server$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: server
}, Symbol.toStringTag, { value: 'Module' }));

const template = "<div class=\"initial-loader\">\r\n    <div class=\"initial-loader__background\">\r\n        <span class=\"orb orb--blue\"></span>\r\n        <span class=\"orb orb--cyan\"></span>\r\n        <span class=\"orb orb--mint\"></span>\r\n    </div>\r\n\r\n    <div class=\"initial-loader__card\">\r\n        <div class=\"metro-map\" aria-hidden=\"true\">\r\n            <div class=\"metro-line metro-line--a\"></div>\r\n            <div class=\"metro-line metro-line--b\"></div>\r\n            <div class=\"metro-line metro-line--c\"></div>\r\n\r\n            <span class=\"station station--a\"></span>\r\n            <span class=\"station station--b\"></span>\r\n            <span class=\"station station--c\"></span>\r\n            <span class=\"station station--d\"></span>\r\n            <span class=\"station station--e\"></span>\r\n\r\n            <div class=\"train-path train-path--a\">\r\n                <img class=\"train-image train-image--a\" src=\"/images/mp14_train_top.webp\" width=\"276\" height=\"53\" alt=\"\" fetchpriority=\"high\" />\n            </div>\r\n\r\n            <div class=\"train-path train-path--b\">\r\n                <img class=\"train-image train-image--b\" src=\"/images/mp14_train_top.webp\" width=\"276\" height=\"53\" alt=\"\" fetchpriority=\"high\" />\n            </div>\r\n            <div class=\"train-path train-path--c\">\r\n                <img class=\"train-image train-image--b\" src=\"/images/mp14_train_top.webp\" width=\"276\" height=\"53\" alt=\"\" fetchpriority=\"high\" />\n            </div>\r\n        </div>\r\n\r\n        <div class=\"initial-loader__content\">\r\n            <p class=\"initial-loader__eyebrow\">IDFM Dashboard</p>\r\n            <p>Préparation des prochains passages, météo et info trafic…</p>\r\n        </div>\r\n\r\n        <div class=\"initial-loader__progress\">\r\n            <span></span>\r\n        </div>\r\n    </div>\r\n</div>\r\n\r\n<style>\r\n    :root {\r\n        color-scheme: light;\r\n\r\n        --idfm-blue: #66deff;\r\n        --idfm-blue-strong: #0f8ed8;\r\n        --idfm-cyan: #38c8ff;\r\n        --idfm-mint: #66d6c2;\r\n        --idfm-anthracite: #14202a;\r\n        --idfm-navy: #0f2f57;\r\n        --idfm-white: #ffffff;\r\n\r\n        --loader-text: #18324a;\r\n        --loader-muted: #5d7286;\r\n    }\r\n\r\n    .initial-loader {\r\n        position: fixed;\r\n        inset: 0;\r\n        z-index: 999999;\r\n        display: grid;\r\n        place-items: center;\r\n        overflow: hidden;\r\n        background:\r\n            radial-gradient(circle at 18% 18%,\r\n                rgba(102, 222, 255, 0.2),\r\n                transparent 30%),\r\n            radial-gradient(circle at 82% 12%,\r\n                rgba(56, 200, 255, 0.16),\r\n                transparent 32%),\r\n            radial-gradient(circle at 50% 95%,\r\n                rgba(102, 214, 194, 0.16),\r\n                transparent 34%),\r\n            linear-gradient(135deg, #f5f9fd 0%, #edf6fb 45%, #ffffff 100%);\r\n        font-family:\r\n            Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,\r\n            \"Segoe UI\", sans-serif;\r\n        color: var(--loader-text);\r\n    }\r\n\r\n    .initial-loader::before {\r\n        content: \"\";\r\n        position: absolute;\r\n        inset: -40%;\r\n        background-image:\r\n            linear-gradient(rgba(15, 47, 87, 0.045) 1px, transparent 1px),\r\n            linear-gradient(90deg, rgba(15, 47, 87, 0.045) 1px, transparent 1px);\r\n        background-size: 58px 58px;\r\n        transform: rotate(-7deg);\r\n        animation: grid-drift 16s linear infinite;\r\n    }\r\n\r\n    .initial-loader__background {\r\n        position: absolute;\r\n        inset: 0;\r\n        pointer-events: none;\r\n        overflow: hidden;\r\n    }\r\n\r\n    .orb {\r\n        position: absolute;\r\n        width: 290px;\r\n        height: 290px;\r\n        border-radius: 999px;\r\n        filter: blur(16px);\r\n        opacity: 0.74;\r\n        animation: orb-float 7s ease-in-out infinite;\r\n    }\r\n\r\n    .orb--blue {\r\n        left: 8%;\r\n        top: 14%;\r\n        background: rgba(102, 222, 255, 0.22);\r\n    }\r\n\r\n    .orb--cyan {\r\n        right: 8%;\r\n        top: 10%;\r\n        background: rgba(56, 200, 255, 0.18);\r\n        animation-delay: -2s;\r\n    }\r\n\r\n    .orb--mint {\r\n        left: 42%;\r\n        bottom: 2%;\r\n        background: rgba(102, 214, 194, 0.16);\r\n        animation-delay: -4s;\r\n    }\r\n\r\n    .initial-loader__card {\r\n        position: relative;\r\n        width: min(560px, calc(100vw - 40px));\r\n        padding: 34px;\r\n        border: 1px solid rgba(15, 47, 87, 0.1);\r\n        border-radius: 34px;\r\n        background:\r\n            linear-gradient(180deg,\r\n                rgba(255, 255, 255, 0.97),\r\n                rgba(247, 251, 253, 0.94));\r\n        box-shadow:\r\n            0 28px 90px rgba(15, 47, 87, 0.15),\r\n            0 8px 24px rgba(15, 47, 87, 0.08),\r\n            inset 0 1px 0 rgba(255, 255, 255, 0.92);\r\n        backdrop-filter: blur(22px);\r\n        overflow: hidden;\r\n    }\r\n\r\n    .initial-loader__card::before {\r\n        content: \"\";\r\n        position: absolute;\r\n        inset: 0;\r\n        background: linear-gradient(120deg,\r\n                transparent 0%,\r\n                rgba(102, 222, 255, 0.06) 34%,\r\n                rgba(56, 200, 255, 0.14) 45%,\r\n                transparent 58%);\r\n        transform: translateX(-125%);\r\n        animation: card-shine 3s ease-in-out infinite;\r\n    }\r\n\r\n    .metro-map {\r\n        position: relative;\r\n        height: 174px;\r\n        margin-bottom: 28px;\r\n        border-radius: 26px;\r\n        background:\r\n            radial-gradient(circle at 50% 50%,\r\n                rgba(102, 222, 255, 0.12),\r\n                transparent 56%),\r\n            linear-gradient(180deg, #ffffff 0%, #f2f8fb 100%);\r\n        box-shadow:\r\n            inset 0 0 0 1px rgba(15, 47, 87, 0.08),\r\n            inset 0 -22px 44px rgba(102, 222, 255, 0.08);\r\n        overflow: hidden;\r\n    }\r\n\r\n    .metro-map::before {\r\n        content: \"\";\r\n        position: absolute;\r\n        inset: -30%;\r\n        background-image:\r\n            linear-gradient(rgba(15, 47, 87, 0.04) 1px, transparent 1px),\r\n            linear-gradient(90deg, rgba(15, 47, 87, 0.04) 1px, transparent 1px);\r\n        background-size: 36px 36px;\r\n        transform: rotate(-5deg);\r\n    }\r\n\r\n    .metro-line {\r\n        position: absolute;\r\n        height: 8px;\r\n        border-radius: 999px;\r\n        box-shadow:\r\n            0 8px 18px rgba(15, 47, 87, 0.12),\r\n            0 0 12px rgba(102, 222, 255, 0.28);\r\n    }\r\n\r\n    .metro-line--a {\r\n        left: 44px;\r\n        right: 54px;\r\n        top: 54px;\r\n        background: linear-gradient(90deg,\r\n                var(--idfm-blue),\r\n                var(--idfm-blue-strong));\r\n        transform: rotate(-7deg);\r\n        transform-origin: center;\r\n    }\r\n\r\n    .metro-line--b {\r\n        left: 44px;\r\n        right: 44px;\r\n        top: 118px;\r\n        background: linear-gradient(90deg,\r\n                var(--idfm-blue),\r\n                var(--idfm-cyan));\r\n        transform: rotate(-2deg);\r\n        transform-origin: center;\r\n    }\r\n\r\n    .metro-line--c {\r\n        left: 56px;\r\n        right: 82px;\r\n        top: 84px;\r\n        background: linear-gradient(90deg,\r\n                rgba(15, 47, 87, 0.86),\r\n                var(--idfm-mint));\r\n        opacity: 0.7;\r\n        transform: rotate(8deg);\r\n        transform-origin: center;\r\n    }\r\n\r\n    .station {\r\n        position: absolute;\r\n        z-index: 2;\r\n        width: 19px;\r\n        height: 19px;\r\n        border: 5px solid var(--idfm-white);\r\n        border-radius: 999px;\r\n        background: var(--idfm-anthracite);\r\n        box-shadow:\r\n            0 0 0 2px rgba(15, 47, 87, 0.1),\r\n            0 8px 16px rgba(15, 47, 87, 0.16);\r\n    }\r\n\r\n    .station--a {\r\n        left: 88px;\r\n        top: 39px;\r\n    }\r\n\r\n    .station--b {\r\n        left: 242px;\r\n        top: 72px;\r\n    }\r\n\r\n    .station--c {\r\n        left: 174px;\r\n        top: 104px;\r\n    }\r\n\r\n    .station--d {\r\n        right: 96px;\r\n        top: 48px;\r\n    }\r\n\r\n    .station--e {\r\n        right: 138px;\r\n        top: 132px;\r\n    }\r\n\r\n    .train-path {\r\n        position: absolute;\r\n        z-index: 3;\r\n        height: 30px;\r\n        pointer-events: none;\r\n    }\r\n\r\n    .train-path--a {\r\n        left: 50px;\r\n        right: 74px;\r\n        top: 43px;\r\n        transform: rotate(-7deg);\r\n        transform-origin: center;\r\n        --travel: 320px;\r\n    }\r\n\r\n    .train-path--b {\r\n        left: 174px;\r\n        right: 64px;\r\n        top: 107px;\r\n        transform: rotate(-2deg);\r\n        transform-origin: center;\r\n        --travel: 325px;\r\n    }\r\n\r\n    .train-path--c {\r\n        left: -20px;\r\n        right: 64px;\r\n        top: 70px;\r\n        transform: rotate(188deg);\r\n        transform-origin: center;\r\n        --travel: 325px;\r\n    }\r\n\r\n\r\n    .train-image {\r\n        position: absolute;\r\n        left: 0;\r\n        top: 50%;\r\n        width: 92px;\r\n        height: auto;\r\n        transform: translateY(-50%);\r\n        pointer-events: none;\r\n        user-select: none;\r\n        -webkit-user-drag: none;\r\n        filter:\r\n            drop-shadow(0 4px 8px rgba(15, 47, 87, 0.18)) drop-shadow(0 0 8px rgba(102, 222, 255, 0.26));\r\n    }\r\n\r\n    .train-image--a {\r\n        animation: train-image-forward 2.6s ease-in-out infinite;\r\n    }\r\n\r\n    .train-image--b {\r\n        animation: train-image-forward 3s ease-in-out infinite reverse;\r\n    }\r\n\r\n    .initial-loader__content {\r\n        position: relative;\r\n        text-align: center;\r\n    }\r\n\r\n    .initial-loader__eyebrow {\r\n        margin: 0 0 10px;\r\n        color: var(--idfm-navy);\r\n        font-size: 0.76rem;\r\n        font-weight: 850;\r\n        letter-spacing: 0.2em;\r\n        text-transform: uppercase;\r\n    }\r\n\r\n    .initial-loader h1 {\r\n        margin: 0;\r\n        color: var(--loader-text);\r\n        font-size: clamp(1.7rem, 4vw, 2.45rem);\r\n        line-height: 1.05;\r\n        font-weight: 850;\r\n        letter-spacing: -0.045em;\r\n    }\r\n\r\n    .initial-loader p {\r\n        margin: 13px 0 0;\r\n        color: var(--loader-muted);\r\n        font-size: 0.98rem;\r\n    }\r\n\r\n    .initial-loader__progress {\r\n        position: relative;\r\n        height: 8px;\r\n        margin-top: 30px;\r\n        border-radius: 999px;\r\n        background: rgba(15, 47, 87, 0.08);\r\n        overflow: hidden;\r\n        box-shadow: inset 0 0 0 1px rgba(15, 47, 87, 0.06);\r\n    }\r\n\r\n    .initial-loader__progress span {\r\n        position: absolute;\r\n        inset: 0;\r\n        width: 42%;\r\n        border-radius: inherit;\r\n        background: linear-gradient(90deg,\r\n                var(--idfm-navy),\r\n                var(--idfm-blue),\r\n                var(--idfm-cyan));\r\n        box-shadow: 0 0 18px rgba(56, 200, 255, 0.24);\r\n        animation: progress-slide 1.15s ease-in-out infinite;\r\n    }\r\n\r\n    @keyframes grid-drift {\r\n        from {\r\n            transform: rotate(-7deg) translate3d(0, 0, 0);\r\n        }\r\n\r\n        to {\r\n            transform: rotate(-7deg) translate3d(58px, 58px, 0);\r\n        }\r\n    }\r\n\r\n    @keyframes orb-float {\r\n\r\n        0%,\r\n        100% {\r\n            transform: translate3d(0, 0, 0) scale(1);\r\n        }\r\n\r\n        50% {\r\n            transform: translate3d(22px, -18px, 0) scale(1.08);\r\n        }\r\n    }\r\n\r\n    @keyframes card-shine {\r\n        0% {\r\n            transform: translateX(-130%);\r\n        }\r\n\r\n        46%,\r\n        100% {\r\n            transform: translateX(130%);\r\n        }\r\n    }\r\n\r\n    @keyframes train-image-forward {\r\n        0% {\r\n            transform: translateX(0) translateY(-50%);\r\n            opacity: 0;\r\n        }\r\n\r\n        14% {\r\n            opacity: 1;\r\n        }\r\n\r\n        84% {\r\n            opacity: 1;\r\n        }\r\n\r\n        100% {\r\n            transform: translateX(var(--travel)) translateY(-50%);\r\n            opacity: 0;\r\n        }\r\n    }\r\n\r\n    @keyframes progress-slide {\r\n        0% {\r\n            transform: translateX(-110%);\r\n        }\r\n\r\n        55% {\r\n            transform: translateX(85%);\r\n        }\r\n\r\n        100% {\r\n            transform: translateX(250%);\r\n        }\r\n    }\r\n\r\n    @media (max-width: 520px) {\r\n        .initial-loader__card {\r\n            width: min(420px, calc(100vw - 32px));\r\n            padding: 24px;\r\n            border-radius: 28px;\r\n        }\r\n\r\n        .metro-map {\r\n            height: 145px;\r\n            margin-bottom: 24px;\r\n        }\r\n\r\n        .metro-line {\r\n            height: 7px;\r\n        }\r\n\r\n        .metro-line--a {\r\n            left: 30px;\r\n            right: 38px;\r\n            top: 46px;\r\n        }\r\n\r\n        .metro-line--b {\r\n            left: 30px;\r\n            right: 32px;\r\n            top: 100px;\r\n        }\r\n\r\n        .metro-line--c {\r\n            left: 38px;\r\n            right: 48px;\r\n            top: 72px;\r\n        }\r\n\r\n        .station {\r\n            width: 17px;\r\n            height: 17px;\r\n            border-width: 4px;\r\n        }\r\n\r\n        .station--a {\r\n            left: 56px;\r\n            top: 33px;\r\n        }\r\n\r\n        .station--b {\r\n            left: 154px;\r\n            top: 62px;\r\n        }\r\n\r\n        .station--c {\r\n            left: 112px;\r\n            top: 88px;\r\n        }\r\n\r\n        .station--d {\r\n            right: 62px;\r\n            top: 42px;\r\n        }\r\n\r\n        .station--e {\r\n            right: 88px;\r\n            top: 112px;\r\n        }\r\n\r\n        .train-path--a {\r\n            left: 36px;\r\n            right: 54px;\r\n            top: 36px;\r\n            --travel: 205px;\r\n        }\r\n\r\n        .train-path--b {\r\n            left: 38px;\r\n            right: 48px;\r\n            top: 90px;\r\n            --travel: 210px;\r\n        }\r\n\r\n        .train-image {\r\n            width: 72px;\r\n        }\r\n\r\n        .initial-loader h1 {\r\n            font-size: 1.72rem;\r\n        }\r\n\r\n        .initial-loader p {\r\n            font-size: 0.92rem;\r\n        }\r\n    }\r\n\r\n    @media (prefers-reduced-motion: reduce) {\r\n\r\n        .initial-loader::before,\r\n        .orb,\r\n        .initial-loader__card::before,\r\n        .train-image,\r\n        .initial-loader__progress span {\r\n            animation: none;\r\n        }\r\n\r\n        .train-image--a {\r\n            transform: translateX(36%) translateY(-50%);\r\n            opacity: 1;\r\n        }\r\n\r\n        .train-image--b {\r\n            transform: translateX(64%) translateY(-50%);\r\n            opacity: 1;\r\n        }\r\n\r\n        .initial-loader__progress span {\r\n            width: 100%;\r\n            opacity: 0.75;\r\n        }\r\n    }\r\n</style>";

const _virtual__spaTemplate = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  template: template
}, Symbol.toStringTag, { value: 'Module' }));

const styles = {};

const styles$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: styles
}, Symbol.toStringTag, { value: 'Module' }));

function realtimeVehicleHealthCheck(_event) {
  return checkIdfmLineTraces();
}
async function checkIdfmLineTraces() {
  const startedAt = Date.now();
  try {
    const url = new URL(IDFM_LINE_TRACES_API_ROOT);
    url.searchParams.set("select", "route_id");
    url.searchParams.set("limit", "1");
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(2800)
    });
    return {
      id: "idfm-line-traces",
      label: "IDFM line traces",
      category: "Realtime",
      required: false,
      status: response.ok ? "ok" : "warning",
      latencyMs: Date.now() - startedAt,
      message: response.ok ? "The public IDFM line trace API is reachable." : (String(response.status) + " " + response.statusText).trim(),
      detail: response.ok ? "Used by the realtime vehicles plugin to project positions on track geometry." : "The public IDFM line trace API responded without an OK status."
    };
  } catch (error) {
    return {
      id: "idfm-line-traces",
      label: "IDFM line traces",
      category: "Realtime",
      required: false,
      status: "warning",
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : "Request failed",
      detail: "The realtime plugin will fall back to topology distances."
    };
  }
}

const transportClockPluginHealthChecks = [realtimeVehicleHealthCheck];
const transportClockServerPlugins = [{"apiVersion":1,"id":"idfm-realtime-vehicles","version":"1.0.0"}];

const plugins_get = defineEventHandler(() => ({
  apiVersion: 1,
  plugins: transportClockServerPlugins
}));

const plugins_get$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: plugins_get
}, Symbol.toStringTag, { value: 'Module' }));

const IGN_GEOCODING_ROOT = "https://data.geopf.fr/geocodage";
const REQUEST_TIMEOUT_MS = 4500;
const USER_AGENT = "TransportClockGPT/0.1 (nearby station address search)";
async function autocompleteIgnAddress(query) {
  var _a;
  const params = new URLSearchParams({
    text: query,
    maximumResponses: "5",
    type: "StreetAddress",
    bbox: "1.4,48.1,3.6,49.3"
  });
  const payload = await fetchIgnJson(`${IGN_GEOCODING_ROOT}/completion/?${params}`);
  return ((_a = payload.results) != null ? _a : []).map(normalizeCompletionResult).filter(isGeocoderPoint).filter(isWithinIleDeFrance);
}
async function searchIgnAddress(query) {
  const params = new URLSearchParams({
    q: query,
    limit: "5",
    autocomplete: "0"
  });
  const payload = await fetchIgnJson(`${IGN_GEOCODING_ROOT}/search/?${params}`);
  return normalizeFeatures(payload).filter(isWithinIleDeFrance);
}
async function reverseIgnAddress(lon, lat) {
  const params = new URLSearchParams({ lon: String(lon), lat: String(lat), limit: "1" });
  const payload = await fetchIgnJson(`${IGN_GEOCODING_ROOT}/reverse/?${params}`);
  return normalizeFeatures(payload);
}
async function fetchIgnJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", "accept-language": "fr-FR,fr;q=0.9", "user-agent": USER_AGENT },
      signal: controller.signal
    });
    if (!response.ok) {
      throw createError({
        statusCode: response.status === 429 ? 429 : 502,
        statusMessage: response.status === 429 ? "IGN geocoding rate limit reached." : `IGN geocoding failed: ${response.status} ${response.statusText}`
      });
    }
    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw createError({ statusCode: 504, statusMessage: "IGN geocoding timed out." });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
function normalizeCompletionResult(result) {
  const lon = asFiniteNumber(result.x);
  const lat = asFiniteNumber(result.y);
  if (lon === void 0 || lat === void 0) return void 0;
  return {
    id: asString(result.poi) || `${lon}:${lat}`,
    lon,
    lat,
    label: asString(result.fulltext) || asString(result.street) || asString(result.city),
    provider: "ign-geoplateforme",
    city: asString(result.city),
    postcode: asString(result.zipcode),
    type: normalizeType(result.kind)
  };
}
function normalizeFeatures(payload) {
  var _a;
  return ((_a = payload.features) != null ? _a : []).map((feature) => {
    var _a2, _b;
    const coordinates = (_a2 = feature.geometry) == null ? void 0 : _a2.coordinates;
    const properties = (_b = feature.properties) != null ? _b : {};
    const lon = asFiniteNumber(coordinates == null ? void 0 : coordinates[0]);
    const lat = asFiniteNumber(coordinates == null ? void 0 : coordinates[1]);
    if (lon === void 0 || lat === void 0) return void 0;
    return {
      id: asString(properties.id) || `${lon}:${lat}`,
      lon,
      lat,
      label: asString(properties.label) || asString(properties.name),
      provider: "ign-geoplateforme",
      city: asString(properties.city),
      postcode: asString(properties.postcode),
      type: normalizeType(properties.type)
    };
  }).filter(isGeocoderPoint);
}
function normalizeType(value) {
  const type = asString(value).toLowerCase();
  if (type.includes("address") || type === "housenumber") return "address";
  if (type.includes("street")) return "street";
  if (type.includes("municip") || type === "city") return "municipality";
  if (type.includes("local")) return "locality";
  return "unknown";
}
function asFiniteNumber(value) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : void 0;
}
function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}
function isGeocoderPoint(value) {
  return Boolean(value && Number.isFinite(value.lon) && Number.isFinite(value.lat));
}
function isWithinIleDeFrance(point) {
  return point.lon >= 1.4 && point.lon <= 3.6 && point.lat >= 48.1 && point.lat <= 49.3;
}

const autocomplete_post = defineEventHandler(async (event) => {
  const body = await readBody(event);
  const query = typeof (body == null ? void 0 : body.query) === "string" ? body.query.trim() : "";
  if (query.length < 3 || query.length > 180) {
    throw createError({ statusCode: 400, statusMessage: "Address query must contain between 3 and 180 characters." });
  }
  return { provider: "ign-geoplateforme", results: await autocompleteIgnAddress(query) };
});

const autocomplete_post$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: autocomplete_post
}, Symbol.toStringTag, { value: 'Module' }));

const reverse_post = defineEventHandler(async (event) => {
  const body = await readBody(event);
  const lon = Number(body == null ? void 0 : body.lon);
  const lat = Number(body == null ? void 0 : body.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    throw createError({ statusCode: 400, statusMessage: "Valid longitude and latitude are required." });
  }
  return { provider: "ign-geoplateforme", results: await reverseIgnAddress(lon, lat) };
});

const reverse_post$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: reverse_post
}, Symbol.toStringTag, { value: 'Module' }));

const search_post = defineEventHandler(async (event) => {
  const body = await readBody(event);
  const query = typeof (body == null ? void 0 : body.query) === "string" ? body.query.trim() : "";
  if (query.length < 3 || query.length > 180) {
    throw createError({ statusCode: 400, statusMessage: "Address query must contain between 3 and 180 characters." });
  }
  return { provider: "ign-geoplateforme", results: await searchIgnAddress(query) };
});

const search_post$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: search_post
}, Symbol.toStringTag, { value: 'Module' }));

const MAX_PRELOAD_LINES = 24;
const MAX_BODY_BYTES$1 = 12e3;
const preload_post = defineEventHandler(async (event) => {
  const declaredLength = Number(getRequestHeader(event, "content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES$1) {
    throw invalidPreload("Request body is too large.", 413);
  }
  const body = await readBody(event);
  if (JSON.stringify(body).length > MAX_BODY_BYTES$1) {
    throw invalidPreload("Request body is too large.", 413);
  }
  const lineIds = parsePreloadLineIds(body);
  if (!isGtfsEnabled(event)) {
    return { enabled: false, availableLineIds: [], missingLineIds: lineIds };
  }
  const manifest = await getGtfsManifest(event);
  if (!manifest) {
    return { enabled: true, availableLineIds: [], missingLineIds: lineIds };
  }
  const artifacts = await Promise.all(
    lineIds.map((lineId) => loadCompiledGtfsLineArtifact(event, lineId))
  );
  const availableLineIds = lineIds.filter((_lineId, index) => artifacts[index]);
  return {
    enabled: true,
    datasetVersion: manifest.datasetVersion,
    availableLineIds,
    missingLineIds: lineIds.filter((lineId) => !availableLineIds.includes(lineId))
  };
});
function parsePreloadLineIds(value) {
  if (!isRecord$1(value) || !Array.isArray(value.lineIds)) {
    throw invalidPreload("lineIds is required.");
  }
  const lineIds = [...new Set(value.lineIds)].filter(
    (lineId) => typeof lineId === "string" && lineId.trim().length > 0 && lineId.length <= 180
  );
  if (lineIds.length === 0 || lineIds.length > MAX_PRELOAD_LINES || lineIds.length !== value.lineIds.length) {
    throw invalidPreload(`lineIds must contain 1 to ${MAX_PRELOAD_LINES} unique values.`);
  }
  return lineIds;
}
function invalidPreload(message, statusCode = 400) {
  return createError({
    statusCode,
    statusMessage: message,
    data: { code: "invalid_request" }
  });
}
function isRecord$1(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const preload_post$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: preload_post,
  parsePreloadLineIds: parsePreloadLineIds
}, Symbol.toStringTag, { value: 'Module' }));

const status_get$6 = defineEventHandler((event) => getGtfsPublicStatus(event));

const status_get$7 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: status_get$6
}, Symbol.toStringTag, { value: 'Module' }));

const IDFM_MARKETPLACE_BASE$2 = "https://prim.iledefrance-mobilites.fr/marketplace";
function createServerIdfmRequestOptions(apiKey) {
  return {
    apiBase: `${IDFM_MARKETPLACE_BASE$2}/v2/navitia`,
    fetcher: (input, init = {}) => {
      const headers = new Headers(init.headers);
      headers.set("accept", "application/json");
      headers.set("apikey", apiKey);
      const upstreamUrl = input instanceof Request ? new URL(input.url) : new URL(input.toString());
      return fetchIdfmMarketplaceWithRetry(upstreamUrl, {
        ...init,
        headers
      });
    },
    siriApiBase: IDFM_MARKETPLACE_BASE$2
  };
}

function normalizeTrafficText(value) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

const TRAFFIC_TEXT_MONTH_PATTERN = "janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre";
const TRAFFIC_TEXT_WEEKDAY_PATTERN = String.raw`(?:(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+)?`;
const TRAFFIC_TEXT_MONTH_INDEXES = {
  janvier: 0,
  fevrier: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  aout: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  decembre: 11
};
function parseTrafficDate(value) {
  if (!value) {
    return void 0;
  }
  const compactDate = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/u);
  if (compactDate) {
    const [, year, month, day, hour, minute, second] = compactDate;
    return /* @__PURE__ */ new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? void 0 : date;
}
function getTrafficDisruptionTextDateSets(disruption, now = Date.now()) {
  const source = [disruption.title, disruption.message, disruption.motif].filter((value) => Boolean(value)).join("\n");
  const searchable = normalizeTrafficText(source).replace(/[’']/gu, " ").replace(/\r/gu, "");
  const matchGroups = groupTrafficTextDateSetMatches(extractTrafficTextDateSetMatches(searchable));
  const evening = hasEveningTrafficPeriod(searchable);
  return matchGroups.flatMap((matchGroup, index) => {
    var _a, _b, _c, _d, _e, _f;
    const match = selectBestTrafficTextDateSetMatch(matchGroup);
    const line = getTrafficTextSourceLine(source, match.index);
    const nextGroup = matchGroups[index + 1];
    const sectionStart = index === 0 ? 0 : Math.min(
      ...matchGroup.map(
        (candidate) => getTrafficTextSourceLine(source, candidate.index).start
      )
    );
    const sectionEnd = nextGroup ? Math.min(...nextGroup.map((candidate) => candidate.index)) : source.length;
    const sourceText = source.slice(sectionStart, sectionEnd);
    const rawText = source.slice(match.index, match.index + match.length);
    let period;
    let start;
    let end;
    if (match.kind === "range" || match.kind === "single") {
      const parsedPeriod = createTrafficTextPeriod({
        disruption,
        endDayText: (_a = match.endDayText) != null ? _a : "",
        endMonthKey: (_b = match.endMonthKey) != null ? _b : "",
        endYearText: match.endYearText,
        now,
        startDayText: (_c = match.startDayText) != null ? _c : "",
        startMonthKey: (_d = match.startMonthKey) != null ? _d : "",
        startYearText: match.startYearText
      });
      if (!parsedPeriod) return [];
      start = parsedPeriod.begin;
      end = parsedPeriod.end;
      period = {
        begin: start.toISOString(),
        end: end.toISOString()
      };
    } else if (match.kind === "until") {
      const parsedPeriod = createInclusiveTrafficEndPeriod({
        disruption,
        endDayText: (_e = match.endDayText) != null ? _e : "",
        endMonthKey: (_f = match.endMonthKey) != null ? _f : "",
        endYearText: match.endYearText,
        now
      });
      if (!parsedPeriod) return [];
      end = parsedPeriod.end;
      period = {
        begin: parsedPeriod.begin.toISOString(),
        end: end.toISOString()
      };
    }
    return [
      {
        id: createTrafficTextDateSetId(match, period, index),
        kind: match.kind,
        period,
        start,
        end,
        endLabel: match.endLabel,
        explicitStart: match.kind === "range" || match.kind === "single",
        evening,
        titleHint: getTrafficTextDateSetTitleHint(source, matchGroup),
        rawText,
        sourceLine: line.text,
        sourceText
      }
    ];
  });
}
function extractTrafficTextDateSetMatches(text) {
  const matches = [
    ...extractNamedTrafficDateSetMatches(text),
    ...extractSameMonthTrafficDateSetMatches(text),
    ...extractNumericTrafficDateSetMatches(text),
    ...extractUntilTrafficDateSetMatches(text),
    ...extractSingleTrafficDateSetMatches(text),
    ...extractEstimatedEndTrafficDateSetMatches(text)
  ].sort((left, right) => left.index - right.index);
  const explicitPeriodEnds = new Set(
    matches.filter((match) => match.kind === "range" || match.kind === "single").map(getTrafficTextDateSetEndKey)
  );
  return matches.filter(
    (match) => match.kind !== "until" || !explicitPeriodEnds.has(getTrafficTextDateSetEndKey(match))
  );
}
function groupTrafficTextDateSetMatches(matches) {
  const groups = /* @__PURE__ */ new Map();
  matches.forEach((match) => {
    const key = getTrafficTextDateSetMatchKey(match);
    const group = groups.get(key);
    if (group) {
      group.push(match);
    } else {
      groups.set(key, [match]);
    }
  });
  return Array.from(groups.values()).sort((left, right) => left[0].index - right[0].index);
}
function getTrafficTextDateSetMatchKey(match) {
  var _a, _b, _c;
  return [
    match.kind,
    normalizeTrafficTextDateSetDay(match.startDayText),
    (_a = match.startMonthKey) != null ? _a : "",
    normalizeTrafficTextDateSetDay(match.endDayText),
    (_b = match.endMonthKey) != null ? _b : "",
    (_c = match.endLabel) != null ? _c : ""
  ].join("|");
}
function getTrafficTextDateSetEndKey(match) {
  var _a;
  return [normalizeTrafficTextDateSetDay(match.endDayText), (_a = match.endMonthKey) != null ? _a : ""].join("|");
}
function normalizeTrafficTextDateSetDay(value) {
  if (!value) return "";
  const day = Number.parseInt(value, 10);
  return Number.isFinite(day) ? String(day) : value;
}
function selectBestTrafficTextDateSetMatch(matches) {
  return [...matches].sort((left, right) => {
    const leftScore = Number(Boolean(left.startYearText)) + Number(Boolean(left.endYearText));
    const rightScore = Number(Boolean(right.startYearText)) + Number(Boolean(right.endYearText));
    return rightScore - leftScore || left.index - right.index;
  })[0];
}
function getTrafficTitleWithoutLinePrefix(value) {
  const compact = value.replace(/\s+/gu, " ").trim();
  const withoutLine = compact.replace(
    /^(?:la\s+)?ligne\s+[a-z0-9-]+\s+(?:est\s+)?(?:déviée|interrompue|perturbée)\s*:\s*/iu,
    ""
  ).replace(
    /^(?:(?:rer|m[eé]tro|tramway|ligne|transilien|bus)\s+[a-z0-9-]+)\s*:\s*/iu,
    ""
  ).trim();
  const title = withoutLine || compact;
  return title ? title.charAt(0).toLocaleUpperCase("fr-FR") + title.slice(1) : title;
}
function getTrafficTextDateSetTitleHint(source, matches) {
  var _a;
  return (_a = matches.flatMap((match) => {
    const line = getTrafficTextSourceLine(source, match.index);
    const rawPrefix = line.text.slice(0, Math.max(0, match.index - line.start)).replace(/^\s*[-–—•]\s*/u, "").replace(/^\s*(?:dates?|periode|période)\s*:\s*/iu, "").replace(/\b(?:du|de)\s*$/iu, "").replace(
      /(?:^|\s)(?:du\s+)?\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\s*(?:au|a|[-–])\s*\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\s*(?:et)?\s*$/iu,
      ""
    ).replace(/\b(?:sauf|excepte|excepté)\s*$/iu, "").replace(/\bdans\s+les?\s+2\s+sens\s*$/iu, "").replace(/[\s:;,–—-]+$/gu, "").replace(/\s+/gu, " ").trim();
    const rawNormalized = normalizeTrafficText(rawPrefix);
    const transportSpecific = /\b(?:rer|metro|tramway|ligne|transilien|bus)\b/u.test(
      rawNormalized
    );
    const prefix = getTrafficTitleWithoutLinePrefix(rawPrefix);
    const normalized = normalizeTrafficText(prefix);
    const isGeneric = /^(?:attention|important|a noter|dates?|periode|travaux|information trafic|trafic (?:interrompu|perturbe)|arret(?:s)? non desservi(?:s)?)$/u.test(
      normalized
    );
    const containsAnnouncementMetadata = /\b(?:dates?|periode|rappel)\s*:/u.test(rawNormalized) || /^(?:reprise|jusqu|du|date|a partir)\b/u.test(normalized);
    const suffixHint = getTrafficTextDateSetSuffixHint(line, match);
    const title = isGeneric ? suffixHint : prefix;
    if (!title || title.length > 130 || containsAnnouncementMetadata) {
      return [];
    }
    return [
      {
        title,
        score: Number(transportSpecific) * 100 + Math.min(title.length, 80)
      }
    ];
  }).sort((left, right) => right.score - left.score).at(0)) == null ? void 0 : _a.title;
}
function getTrafficTextDateSetSuffixHint(line, match) {
  const relativeEnd = match.index - line.start + match.length;
  const suffix = line.text.slice(relativeEnd).replace(/^\s*[:;,–—-]?\s*/u, "").split(/\s*[:;]\s*/u, 1)[0].replace(/[.!,\s]+$/gu, "").replace(/\s+/gu, " ").trim();
  const normalized = normalizeTrafficText(suffix);
  if (suffix.length < 4 || suffix.length > 100 || /^(?:dates?|periode|attention|important|a noter)$/u.test(normalized)) {
    return void 0;
  }
  return getTrafficTitleWithoutLinePrefix(suffix);
}
function extractNamedTrafficDateSetMatches(text) {
  const pattern = new RegExp(
    "\\b(?:dates?\\s*:\\s*)?(?:du|de)\\s+" + TRAFFIC_TEXT_WEEKDAY_PATTERN + "(\\d{1,2})(?:er)?\\s+(" + TRAFFIC_TEXT_MONTH_PATTERN + ")(?:\\s+(\\d{4}))?\\s+(?:au|a|jusqu\\s+au)\\s+" + TRAFFIC_TEXT_WEEKDAY_PATTERN + "(\\d{1,2})(?:er)?\\s+(" + TRAFFIC_TEXT_MONTH_PATTERN + ")(?:\\s+(\\d{4}))?\\b",
    "gu"
  );
  return Array.from(text.matchAll(pattern)).flatMap(
    (match) => match.index === void 0 ? [] : [
      {
        kind: "range",
        index: match.index,
        length: match[0].length,
        startDayText: match[1],
        startMonthKey: match[2],
        startYearText: match[3],
        endDayText: match[4],
        endMonthKey: match[5],
        endYearText: match[6]
      }
    ]
  );
}
function extractSameMonthTrafficDateSetMatches(text) {
  const pattern = new RegExp(
    "\\b(?:dates?\\s*:\\s*)?(?:du|de)\\s+" + TRAFFIC_TEXT_WEEKDAY_PATTERN + "(\\d{1,2})(?:er)?\\s+(?:au|a|jusqu\\s+au)\\s+" + TRAFFIC_TEXT_WEEKDAY_PATTERN + "(\\d{1,2})(?:er)?\\s+(" + TRAFFIC_TEXT_MONTH_PATTERN + ")(?:\\s+(\\d{4}))?\\b",
    "gu"
  );
  return Array.from(text.matchAll(pattern)).flatMap(
    (match) => match.index === void 0 ? [] : [
      {
        kind: "range",
        index: match.index,
        length: match[0].length,
        startDayText: match[1],
        startMonthKey: match[3],
        startYearText: match[4],
        endDayText: match[2],
        endMonthKey: match[3],
        endYearText: match[4]
      }
    ]
  );
}
function extractNumericTrafficDateSetMatches(text) {
  const fullRangePatterns = [
    /\b(?:dates?\s*:\s*)?(?:du|de)\s+(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\s*(?:au|a|[-–])\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/gu,
    /\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\s*(?:au|a|[-–])\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/gu
  ];
  const fullRanges = fullRangePatterns.flatMap(
    (pattern) => Array.from(text.matchAll(pattern)).flatMap((match) => {
      const startMonth = normalizeNumericTrafficMonth(match[2]);
      const endMonth = normalizeNumericTrafficMonth(match[5]);
      return match.index === void 0 || startMonth === void 0 || endMonth === void 0 ? [] : [
        {
          kind: "range",
          index: match.index,
          length: match[0].length,
          startDayText: match[1],
          startMonthKey: startMonth,
          startYearText: match[3],
          endDayText: match[4],
          endMonthKey: endMonth,
          endYearText: match[6]
        }
      ];
    })
  );
  const compactSameMonthPattern = /(?<![\d./])\b(\d{1,2})\s*[-–]\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/gu;
  const compactSameMonth = Array.from(text.matchAll(compactSameMonthPattern)).flatMap((match) => {
    const month = normalizeNumericTrafficMonth(match[3]);
    return match.index === void 0 || month === void 0 ? [] : [
      {
        kind: "range",
        index: match.index,
        length: match[0].length,
        startDayText: match[1],
        startMonthKey: month,
        startYearText: match[4],
        endDayText: match[2],
        endMonthKey: month,
        endYearText: match[4]
      }
    ];
  });
  return [...fullRanges, ...compactSameMonth];
}
function extractUntilTrafficDateSetMatches(text) {
  const namedPattern = new RegExp(
    "\\bjusqu\\s+au\\s+" + TRAFFIC_TEXT_WEEKDAY_PATTERN + "(\\d{1,2})(?:er)?\\s+(" + TRAFFIC_TEXT_MONTH_PATTERN + ")(?:\\s+(\\d{4}))?(?:\\s+inclus)?\\b",
    "gu"
  );
  const numericPattern = /\bjusqu\s+au\s+(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?(?:\s+inclus)?\b/gu;
  const named = Array.from(text.matchAll(namedPattern)).flatMap(
    (match) => match.index === void 0 ? [] : [
      {
        kind: "until",
        index: match.index,
        length: match[0].length,
        endDayText: match[1],
        endMonthKey: match[2],
        endYearText: match[3]
      }
    ]
  );
  const numeric = Array.from(text.matchAll(numericPattern)).flatMap((match) => {
    const month = normalizeNumericTrafficMonth(match[2]);
    return match.index === void 0 || month === void 0 ? [] : [
      {
        kind: "until",
        index: match.index,
        length: match[0].length,
        endDayText: match[1],
        endMonthKey: month,
        endYearText: match[3]
      }
    ];
  });
  const estimatedRestartPattern = new RegExp(
    "\\breprise(?:\\s+des\\s+circulations)?\\s+(?:estimee|prevue|envisagee)\\s*:?\\s*" + TRAFFIC_TEXT_WEEKDAY_PATTERN + "(\\d{1,2})(?:er)?\\s+(" + TRAFFIC_TEXT_MONTH_PATTERN + ")(?:\\s+(\\d{4}))?\\b",
    "gu"
  );
  const estimatedRestarts = Array.from(text.matchAll(estimatedRestartPattern)).flatMap(
    (match) => match.index === void 0 ? [] : [
      {
        kind: "until",
        index: match.index,
        length: match[0].length,
        endDayText: match[1],
        endMonthKey: match[2],
        endYearText: match[3]
      }
    ]
  );
  return [...named, ...numeric, ...estimatedRestarts];
}
function extractSingleTrafficDateSetMatches(text) {
  const pattern = new RegExp(
    "\\b(?:date\\s*:?\\s*(?:le\\s+)?|le\\s+)" + TRAFFIC_TEXT_WEEKDAY_PATTERN + "(\\d{1,2})(?:er)?\\s+(" + TRAFFIC_TEXT_MONTH_PATTERN + ")(?:\\s+(\\d{4}))?\\b",
    "gu"
  );
  return Array.from(text.matchAll(pattern)).flatMap(
    (match) => match.index === void 0 ? [] : [
      {
        kind: "single",
        index: match.index,
        length: match[0].length,
        startDayText: match[1],
        startMonthKey: match[2],
        startYearText: match[3],
        endDayText: match[1],
        endMonthKey: match[2],
        endYearText: match[3]
      }
    ]
  );
}
function extractEstimatedEndTrafficDateSetMatches(text) {
  const pattern = /\bfin\s+(?:de\s+l\s+|d\s+)?ete\s+(\d{4})\b/gu;
  return Array.from(text.matchAll(pattern)).flatMap((match) => {
    if (match.index === void 0 || !/\breprise\b/u.test(text.slice(Math.max(0, match.index - 120), match.index))) {
      return [];
    }
    return [
      {
        kind: "estimated-end",
        index: match.index,
        length: match[0].length,
        endLabel: "fin d\u2019\xE9t\xE9 " + match[1]
      }
    ];
  });
}
function createInclusiveTrafficEndPeriod({
  disruption,
  endDayText,
  endMonthKey,
  endYearText,
  now
}) {
  const endDay = Number.parseInt(endDayText, 10);
  const endMonth = TRAFFIC_TEXT_MONTH_INDEXES[endMonthKey];
  if (!Number.isFinite(endDay) || endMonth === void 0) {
    return void 0;
  }
  const anchorYear = getTrafficTextYearAnchor(disruption, now);
  const periods = getTrafficTextYearCandidates({
    anchorYear,
    disruption,
    endYearText,
    now
  }).map((endYearCandidate) => {
    var _a;
    const endYear = (_a = normalizeTrafficTextYear(endYearText)) != null ? _a : endYearCandidate;
    const endDayStart = createLocalTrafficDate(endYear, endMonth, endDay);
    if (!endDayStart) return void 0;
    const end = new Date(endDayStart);
    end.setHours(23, 59, 59, 999);
    const begin = disruption.applicationPeriods.map((applicationPeriod) => parseTrafficDate(applicationPeriod.begin)).filter((date) => Boolean(date)).filter((date) => date.getTime() <= end.getTime()).sort((left, right) => left.getTime() - right.getTime()).at(0);
    return begin && end.getTime() > begin.getTime() ? { begin, end } : void 0;
  }).filter((period) => period !== void 0);
  const matchingTechnicalPeriod = periods.find(
    (period) => trafficTextPeriodOverlapsApplicationPeriod(period, disruption.applicationPeriods)
  );
  return matchingTechnicalPeriod != null ? matchingTechnicalPeriod : periods.at(0);
}
function normalizeNumericTrafficMonth(value) {
  var _a;
  const monthIndex = Number.parseInt(value, 10) - 1;
  return (_a = Object.entries(TRAFFIC_TEXT_MONTH_INDEXES).find(([, index]) => index === monthIndex)) == null ? void 0 : _a[0];
}
function hasEveningTrafficPeriod(text) {
  return /(?:^|\n)\s*periode\s*:[^\n]*\bsoirees?\b/u.test(text);
}
function getTrafficTextSourceLine(source, index) {
  const start = Math.max(0, source.lastIndexOf("\n", index - 1) + 1);
  const lineEnd = source.indexOf("\n", index);
  const end = lineEnd < 0 ? source.length : lineEnd;
  return { start, text: source.slice(start, end) };
}
function createTrafficTextDateSetId(match, period, index) {
  var _a, _b, _c;
  return [match.kind, (_a = period == null ? void 0 : period.begin) != null ? _a : "", (_b = period == null ? void 0 : period.end) != null ? _b : "", (_c = match.endLabel) != null ? _c : "", index].join(
    ":"
  );
}
function createTrafficTextPeriod({
  disruption,
  endDayText,
  endMonthKey,
  endYearText,
  now,
  startDayText,
  startMonthKey,
  startYearText
}) {
  const startDay = Number.parseInt(startDayText, 10);
  const endDay = Number.parseInt(endDayText, 10);
  const startMonth = TRAFFIC_TEXT_MONTH_INDEXES[startMonthKey];
  const endMonth = TRAFFIC_TEXT_MONTH_INDEXES[endMonthKey];
  if (!Number.isFinite(startDay) || !Number.isFinite(endDay) || startMonth === void 0 || endMonth === void 0) {
    return void 0;
  }
  const anchorYear = getTrafficTextYearAnchor(disruption, now);
  const candidates = getTrafficTextYearCandidates({
    anchorYear,
    disruption,
    endYearText,
    now,
    startYearText
  });
  const periods = candidates.map(
    (startYearCandidate) => createTrafficTextPeriodForYear({
      endDay,
      endMonth,
      endYearText,
      startDay,
      startMonth,
      startYearCandidate,
      startYearText
    })
  ).filter((period) => period !== void 0);
  const matchingTechnicalPeriod = periods.find(
    (period) => trafficTextPeriodOverlapsApplicationPeriod(period, disruption.applicationPeriods)
  );
  return matchingTechnicalPeriod != null ? matchingTechnicalPeriod : periods.at(0);
}
function createTrafficTextPeriodForYear({
  endDay,
  endMonth,
  endYearText,
  startDay,
  startMonth,
  startYearCandidate,
  startYearText
}) {
  const normalizedStartYear = normalizeTrafficTextYear(startYearText);
  const normalizedEndYear = normalizeTrafficTextYear(endYearText);
  let startYear = normalizedStartYear != null ? normalizedStartYear : startYearCandidate;
  let endYear = normalizedEndYear != null ? normalizedEndYear : startYear;
  if (!normalizedEndYear && endMonth < startMonth) {
    endYear += 1;
  }
  if (!normalizedStartYear && normalizedEndYear && startMonth > endMonth) {
    startYear = normalizedEndYear - 1;
  }
  const begin = createLocalTrafficDate(startYear, startMonth, startDay);
  const endDayStart = createLocalTrafficDate(endYear, endMonth, endDay);
  if (!begin || !endDayStart) {
    return void 0;
  }
  const end = new Date(endDayStart);
  end.setHours(23, 59, 59, 999);
  return end.getTime() <= begin.getTime() ? void 0 : { begin, end };
}
function getTrafficTextYearCandidates({
  anchorYear,
  disruption,
  endYearText,
  now,
  startYearText
}) {
  const normalizedStartYear = normalizeTrafficTextYear(startYearText);
  const normalizedEndYear = normalizeTrafficTextYear(endYearText);
  const years = /* @__PURE__ */ new Set();
  if (normalizedStartYear) {
    years.add(normalizedStartYear);
  } else if (normalizedEndYear) {
    years.add(normalizedEndYear);
    years.add(normalizedEndYear - 1);
  } else {
    years.add(anchorYear);
    years.add(anchorYear - 1);
    years.add(anchorYear + 1);
    years.add(new Date(now).getFullYear());
    disruption.applicationPeriods.flatMap((period) => [period.begin, period.end]).map((value) => parseTrafficDate(value)).filter((date) => Boolean(date)).forEach((date) => {
      const year = date.getFullYear();
      years.add(year);
      years.add(year - 1);
      years.add(year + 1);
    });
  }
  return Array.from(years);
}
function trafficTextPeriodOverlapsApplicationPeriod(textPeriod, applicationPeriods) {
  return applicationPeriods.some((period) => {
    var _a, _b;
    const begin = (_a = parseTrafficDate(period.begin)) == null ? void 0 : _a.getTime();
    const end = (_b = parseTrafficDate(period.end)) == null ? void 0 : _b.getTime();
    if (begin === void 0 && end === void 0) {
      return false;
    }
    const periodBegin = begin != null ? begin : Number.NEGATIVE_INFINITY;
    const periodEnd = end != null ? end : Number.POSITIVE_INFINITY;
    return textPeriod.begin.getTime() <= periodEnd && textPeriod.end.getTime() >= periodBegin;
  });
}
function getTrafficTextYearAnchor(disruption, now) {
  var _a, _b;
  return (_b = (_a = disruption.applicationPeriods.flatMap((period) => [period.begin, period.end]).map((value) => parseTrafficDate(value)).filter((date) => Boolean(date)).sort((left, right) => left.getTime() - right.getTime()).at(0)) == null ? void 0 : _a.getFullYear()) != null ? _b : new Date(now).getFullYear();
}
function normalizeTrafficTextYear(value) {
  if (!value) {
    return void 0;
  }
  const year = Number.parseInt(value, 10);
  if (!Number.isFinite(year)) {
    return void 0;
  }
  return year < 100 ? 2e3 + year : year;
}
function createLocalTrafficDate(year, month, day) {
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : void 0;
}

const WORKS_KEYWORDS = ["travaux", "chantier", "maintenance", "works"];
const DIVERSION_PATTERNS = [
  /\bla ligne\b[\s\S]{0,160}\best deviee\b/u,
  /\bline\b[\s\S]{0,160}\bis diverted\b/u
];
function getPatternTrafficSummaryCopy(disruption) {
  var _a, _b;
  const sourceText = [disruption.motif, disruption.message, disruption.cause, disruption.title].filter((value) => Boolean(value)).join("\n");
  const normalizedSourceText = normalizeTrafficText(sourceText);
  if (containsTrafficDiversion(normalizedSourceText)) {
    return containsAny(normalizedSourceText, WORKS_KEYWORDS) || disruption.kind === "works" ? { title: "Travaux" } : { title: "D\xE9viation" };
  }
  const labelledReason = extractLabelledTrafficReason(sourceText);
  if (labelledReason && !isGenericTrafficTitle(labelledReason)) {
    return splitTrafficSummaryCopy(labelledReason);
  }
  if (labelledReason && normalizeTrafficText(labelledReason) === "travaux") {
    const description = (_a = extractTrafficReasonContext(disruption.title)) != null ? _a : extractTrafficReasonContext(disruption.message);
    return description ? { title: "Travaux", description } : { title: "Travaux" };
  }
  const operationalSummary = extractOperationalTrafficSummary(sourceText);
  if (operationalSummary) return operationalSummary;
  const causalReason = extractCausalTrafficReason(sourceText);
  if (causalReason && !isGenericTrafficTitle(causalReason)) {
    return splitTrafficSummaryCopy(causalReason);
  }
  if (causalReason && normalizeTrafficText(causalReason) === "travaux") {
    const description = (_b = extractTrafficReasonContext(disruption.title)) != null ? _b : extractTrafficReasonContext(disruption.message);
    return description ? { title: "Travaux", description } : { title: "Travaux" };
  }
  const title = getConciseTrafficTitle(disruption.title);
  const lineStatusTitle = extractLineStatusTitle(sourceText);
  if (title && normalizeTrafficText(title) === "travaux" && /\b(?:non|pas)\s+desservi(?:e|s|es)?\b/iu.test(sourceText)) {
    return { title };
  }
  if (title && lineStatusTitle && isVerboseOperationalTrafficTitle(title)) {
    return {
      title: lineStatusTitle,
      description: title
    };
  }
  if (title && !isGenericTrafficTitle(title)) {
    return splitTrafficSummaryCopy(title);
  }
  const cause = getConciseTrafficTitle(disruption.cause);
  if (cause && !isGenericTrafficTitle(cause)) {
    return splitTrafficSummaryCopy(cause);
  }
  const messageLead = getConciseTrafficTitle(disruption.message);
  return messageLead && !isGenericTrafficTitle(messageLead) ? splitTrafficSummaryCopy(messageLead) : {};
}
const LINE_TITLE_PREFIX_PATTERN = /^(?:(?:m[eé]tro|rer|tram(?:way)?|transilien|ligne|bus)\s+)[a-z0-9][a-z0-9.+/-]{0,7}\s*:\s*/iu;
const COMPACT_LINE_STATUS_PATTERN = /^(?:interruptions?|trafic (?:interrompu|perturb[eé])|travaux|arr[eê]t\(s\) non desservi\(s\))$/iu;
function extractLineStatusTitle(value) {
  return normalizeMultilineTrafficText(value).split(/\r?\n/gu).map((line) => line.trim()).filter((line) => LINE_TITLE_PREFIX_PATTERN.test(line)).map((line) => cleanSummaryText(line.replace(LINE_TITLE_PREFIX_PATTERN, ""))).find((line) => Boolean(line && COMPACT_LINE_STATUS_PATTERN.test(line)));
}
function isVerboseOperationalTrafficTitle(value) {
  const normalized = normalizeTrafficText(value);
  return value.length > 88 && /^(?:le )?trafic (?:est|sera) (?:interrompu|perturbe)\b/u.test(normalized);
}
function getConciseTrafficTitle(value) {
  const lead = getConciseTextLead(value, true);
  if (!lead) return void 0;
  const withoutLinePrefix = lead.replace(LINE_TITLE_PREFIX_PATTERN, "").trim();
  const segments = withoutLinePrefix.split(/\s+[-–—]\s+/u);
  while (segments.length > 1 && isGenericTrafficTitle(segments[segments.length - 1])) {
    segments.pop();
  }
  return cleanSummaryText(segments.join(" \u2013 "));
}
function extractLabelledTrafficReason(value) {
  const plainText = normalizeMultilineTrafficText(value);
  if (!plainText) return void 0;
  const motifMarker = /\bmotif\s*:\s*/iu.exec(plainText);
  return motifMarker ? cleanSummaryText(
    extractTrafficClause(
      plainText,
      motifMarker.index + motifMarker[0].length
    )
  ) : void 0;
}
function extractCausalTrafficReason(value) {
  const plainText = normalizeMultilineTrafficText(value);
  if (!plainText) return void 0;
  const reasonMarker = /\b(?:en\s+raison\s+(?:de(?:s)?\s+|d['’])|pour\s+cause\s+de\s+|[àa]\s+cause\s+de\s+|(?:[àa]\s+la\s+)?suite\s+[àa]\s+)/iu.exec(
    plainText
  );
  return reasonMarker ? cleanSummaryText(extractTrafficClause(plainText, reasonMarker.index + reasonMarker[0].length)) : void 0;
}
function extractTrafficReasonContext(value) {
  if (!value) return void 0;
  const plainText = normalizeMultilineTrafficText(value);
  const marker = /\b(?:en\s+raison\s+(?:de(?:s)?\s+|d['’])|pour\s+cause\s+de\s+|[àa]\s+cause\s+de\s+|(?:[àa]\s+la\s+)?suite\s+[àa]\s+)/iu.exec(
    plainText
  );
  if (!marker) return void 0;
  let start = marker.index;
  while (start > 0 && !/[.!?\n]/u.test(plainText[start - 1])) {
    start -= 1;
  }
  let end = marker.index + marker[0].length;
  while (end < plainText.length && !/[.!?\n]/u.test(plainText[end])) {
    end += 1;
  }
  if (end < plainText.length && /[.!?]/u.test(plainText[end])) {
    end += 1;
  }
  return cleanSummaryText(plainText.slice(start, end));
}
function normalizeMultilineTrafficText(value) {
  return value.replace(/<[^>]+>/gu, " ").replace(/[^\S\r\n]+/gu, " ").replace(/\r?\n\s*/gu, "\n").trim();
}
function extractTrafficClause(value, start) {
  const line = value.slice(start).split(/\r?\n/u, 1)[0].trim();
  let parenthesisDepth = 0;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "(") {
      parenthesisDepth += 1;
      continue;
    }
    if (character === ")") {
      parenthesisDepth = Math.max(0, parenthesisDepth - 1);
      continue;
    }
    if (parenthesisDepth === 0 && /[.!?;]/u.test(character) && (index === line.length - 1 || /^(?:\s+(?:reprise|p[ée]riode|dates?|arr[êe]ts?|trafic|rer|ligne|bus|pour)\b)/iu.test(
      line.slice(index + 1)
    ))) {
      return line.slice(0, index);
    }
  }
  return line;
}
function splitTrafficSummaryCopy(value) {
  const cleaned = cleanSummaryText(value);
  if (!cleaned) return {};
  const parenthetical = splitTrailingParenthetical(cleaned);
  if (!parenthetical) {
    return { title: canonicalizeSummaryTitle(cleaned) };
  }
  return {
    title: canonicalizeSummaryTitle(parenthetical.title),
    description: sentenceCase(parenthetical.description)
  };
}
function canonicalizeSummaryTitle(value) {
  const normalized = normalizeTrafficText(value).replace(/[^a-z0-9]+/gu, " ").trim();
  if (normalized === "travaux sur le reseau ferre" || normalized === "travaux sur le reseau ferroviaire") {
    return "Travaux sur le r\xE9seau ferroviaire";
  }
  return value;
}
function splitTrailingParenthetical(value) {
  if (!value.endsWith(")")) return void 0;
  let depth = 0;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const character = value[index];
    if (character === ")") {
      depth += 1;
      continue;
    }
    if (character !== "(") continue;
    depth -= 1;
    if (depth !== 0) continue;
    const title = cleanSummaryText(value.slice(0, index));
    const description = cleanSummaryText(value.slice(index + 1, -1));
    return title && description ? { title, description } : void 0;
  }
  return void 0;
}
function extractOperationalTrafficSummary(value) {
  var _a;
  const plainText = normalizeMultilineTrafficText(value);
  const normalized = normalizeTrafficText(plainText);
  if (/\boffre de transport (?:est |sera )?(?:adaptee|reduite)\b/u.test(
    normalized
  ) || /\bservice (?:est |sera )?(?:adapte|reduit)\b/u.test(normalized)) {
    const trainNotice = (_a = plainText.match(
      /\bcertains trains ne circuleront pas[^.!?\r\n]*[.!?]?/iu
    )) == null ? void 0 : _a[0];
    return {
      title: "Offre r\xE9duite",
      description: trainNotice ? sentenceCase(trainNotice) : void 0
    };
  }
  return void 0;
}
function cleanSummaryText(value) {
  const cleaned = value.replace(LINE_TITLE_PREFIX_PATTERN, "").replace(/^[\s:–—-]+|[\s:–—-]+$/gu, "").replace(/[.!?;]+$/gu, "").replace(/(\d+(?:[.,]\d+)?)\s*(km|m)\b/giu, "$1 $2").replace(/\s+/gu, " ").trim();
  return cleaned ? sentenceCase(cleaned) : void 0;
}
function sentenceCase(value) {
  return value.replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase("fr-FR"));
}
function getConciseTextLead(value, skipScheduleOnly = false) {
  if (!value) return void 0;
  return value.replace(/<[^>]+>/gu, " ").split(/\r?\n|(?<=[.!?])\s+/u).map((part) => part.replace(/\s+/gu, " ").trim()).find((part) => Boolean(part) && (!skipScheduleOnly || !isScheduleOnlyText(part)));
}
function isGenericTrafficTitle(value) {
  const normalized = normalizeTrafficText(value).replace(/[^a-z0-9]+/gu, " ").trim();
  if ([
    "information trafic",
    "info trafic",
    "traffic information",
    "perturbation",
    "incident",
    "interruption",
    "travaux",
    "works"
  ].includes(normalized)) {
    return true;
  }
  if (/^(?:arrets?|stations?)(?: s)? non desservi(?:e|s|es)?(?: s)?$/u.test(normalized)) {
    return true;
  }
  return /^(?:le )?(?:trafic|circulation|service) (?:est )?(?:(?:tres|fortement|partiellement|legerement) )?(?:interrompu|interrompue|suspendu|suspendue|perturbe|perturbee|ralenti|ralentie)$/u.test(
    normalized
  );
}
function isScheduleOnlyText(value) {
  const normalized = normalizeTrafficText(value);
  return /^(?:dates?|horaires?|periode|du |de |a partir de|jusqu)/u.test(normalized);
}
function containsAny(value, keywords) {
  return keywords.some((keyword) => value.includes(keyword));
}
function containsTrafficDiversion(value) {
  return DIVERSION_PATTERNS.some((pattern) => pattern.test(value));
}

function extractTrafficModalDateTiles(disruption, fallbackTitle) {
  const normalizedFallbackTitle = fallbackTitle ? getTrafficTitleWithoutLinePrefix(fallbackTitle) : void 0;
  const fallbackTileTitle = getFallbackTileTitle(disruption, normalizedFallbackTitle);
  const endOnlyTileTitle = normalizedFallbackTitle || fallbackTileTitle;
  const candidates = getTrafficDisruptionTextDateSets(disruption).map((dateSet) => {
    var _a;
    const start = dateSet.explicitStart ? dateSet.start : void 0;
    const title = (_a = dateSet.titleHint) != null ? _a : dateSet.kind === "range" ? fallbackTileTitle : endOnlyTileTitle;
    const nonServedPresentation = getNonServedPresentation(disruption, title);
    return {
      mergeKey: dateSet.titleHint ? normalizeTrafficText(title) : void 0,
      tile: {
        id: dateSet.id,
        title,
        ...nonServedPresentation,
        start,
        end: dateSet.end,
        endLabel: dateSet.endLabel,
        periods: [
          {
            start,
            end: dateSet.end,
            endLabel: dateSet.endLabel
          }
        ],
        evening: dateSet.evening,
        replacementBus: hasReplacementBus(dateSet.sourceText),
        timeWindows: dateSet.explicitStart ? extractTrafficModalTimeWindows(dateSet.sourceText) : []
      }
    };
  });
  return mergeEquivalentTrafficModalDateTiles(candidates);
}
function mergeEquivalentTrafficModalDateTiles(candidates) {
  const merged = [];
  candidates.forEach((candidate) => {
    const existing = candidate.mergeKey ? merged.find(
      (entry) => entry.mergeKey === candidate.mergeKey && entry.tile.evening === candidate.tile.evening && entry.tile.replacementBus === candidate.tile.replacementBus
    ) : void 0;
    if (!existing) {
      merged.push({
        mergeKey: candidate.mergeKey,
        tile: {
          ...candidate.tile,
          periods: [...candidate.tile.periods],
          timeWindows: [...candidate.tile.timeWindows]
        }
      });
      return;
    }
    candidate.tile.periods.forEach((period) => {
      const duplicate = existing.tile.periods.some(
        (current) => {
          var _a, _b, _c, _d;
          return ((_a = current.start) == null ? void 0 : _a.getTime()) === ((_b = period.start) == null ? void 0 : _b.getTime()) && ((_c = current.end) == null ? void 0 : _c.getTime()) === ((_d = period.end) == null ? void 0 : _d.getTime()) && current.endLabel === period.endLabel;
        }
      );
      if (!duplicate) existing.tile.periods.push(period);
    });
    candidate.tile.timeWindows.forEach(
      (window) => pushTrafficModalTimeWindow(existing.tile.timeWindows, window)
    );
    existing.tile.id += "|" + candidate.tile.id;
  });
  return merged.map((entry) => entry.tile);
}
function getFallbackTileTitle(disruption, fallbackTitle) {
  const rawTitle = getTrafficTitleWithoutLinePrefix(disruption.title);
  const normalizedTitle = normalizeTrafficText(rawTitle);
  const normalizedFallbackTitle = fallbackTitle ? normalizeTrafficText(fallbackTitle) : void 0;
  const isRawTitleStatusVariant = Boolean(
    normalizedFallbackTitle && normalizedTitle.startsWith(normalizedFallbackTitle + " - ")
  );
  const isGenericTitle = /^(?:information trafic|trafic (?:interrompu|perturbe|ralenti)|travaux)$/u.test(
    normalizedTitle
  ) || /^(?:arrets?|stations?)(?: s)? non desservi(?:e|s|es)?(?: s)?$/u.test(normalizedTitle);
  return !isGenericTitle && !isRawTitleStatusVariant && rawTitle.length <= 100 ? rawTitle : fallbackTitle || rawTitle;
}
function getNonServedPresentation(disruption, title) {
  const searchable = [disruption.title, disruption.message, disruption.motif, title].filter((value) => Boolean(value)).join("\n");
  const hasNonServedMarker = /\b(?:non|pas)\s+desservi(?:e|s|es)?\b/iu.test(searchable);
  const titleStationName = extractNonServedStationName(title);
  if (titleStationName && disruption.impactedStopNames.length === 0) {
    return { stationNotServedName: titleStationName };
  }
  if (disruption.impactedStopNames.length === 1) {
    const stationName = disruption.impactedStopNames[0];
    if (stationName && (hasNonServedMarker || disruption.kind === "works" && titleMatchesStation(title, stationName))) {
      return {
        stationNotServedName: titleMatchesStation(title, stationName) ? title : stationName
      };
    }
    return {};
  }
  if (disruption.impactedStopNames.length > 1 && hasNonServedMarker) {
    return { multipleStationsNotServed: true };
  }
  return {};
}
function extractNonServedStationName(title) {
  var _a;
  const match = title.match(
    /^(.{2,100}?)\s+(?:n['’]est\s+pas\s+|non\s+)desservi(?:e|s|es)?\b/iu
  );
  const stationName = (_a = match == null ? void 0 : match[1]) == null ? void 0 : _a.trim();
  if (!stationName) return void 0;
  const normalizedStationName = normalizeTrafficStationLabel(stationName);
  return /^(?:arrets?|stations?)(?: s)?$/u.test(normalizedStationName) ? void 0 : stationName;
}
function titleMatchesStation(title, stationName) {
  const normalizedTitle = normalizeTrafficStationLabel(title);
  const normalizedStation = normalizeTrafficStationLabel(stationName);
  return Boolean(
    normalizedTitle && normalizedStation && (normalizedTitle === normalizedStation || normalizedTitle.startsWith(`${normalizedStation} `) || normalizedStation.startsWith(`${normalizedTitle} `))
  );
}
function normalizeTrafficStationLabel(value) {
  return normalizeTrafficText(value).replace(/\([^)]*\)/gu, " ").replace(/[^a-z0-9]+/gu, " ").trim();
}
function hasReplacementBus(value) {
  return /\b(?:bus|navette)s?\s+(?:de\s+)?remplacement\b/iu.test(value);
}
function extractTrafficModalTimeWindows(value) {
  const normalized = normalizeTrafficText(value);
  const windows = [];
  const rangePattern = /\b(?:de|entre)\s+(\d{1,2})\s*h\s*(\d{0,2})\s*(?:a|et|[-–])\s*(?:(\d{1,2})\s*h\s*(\d{0,2})|fin\s+de\s+service)\b/gu;
  for (const match of normalized.matchAll(rangePattern)) {
    const start = createClockTime(match[1], match[2]);
    if (!start) continue;
    const end = match[3] ? createClockTime(match[3], match[4]) : void 0;
    pushTrafficModalTimeWindow(windows, {
      start,
      end,
      untilEndOfService: !match[3]
    });
  }
  const fromPattern = /\b(?:a\s+partir\s+de|des)\s+(\d{1,2})\s*h\s*(\d{0,2})\b/gu;
  for (const match of normalized.matchAll(fromPattern)) {
    const start = createClockTime(match[1], match[2]);
    if (!start || windows.some((window) => sameClock(window.start, start))) {
      continue;
    }
    pushTrafficModalTimeWindow(windows, { start });
  }
  return windows;
}
function pushTrafficModalTimeWindow(windows, candidate) {
  const duplicate = windows.some(
    (window) => sameClock(window.start, candidate.start) && (!window.end && !candidate.end || window.end && candidate.end && sameClock(window.end, candidate.end)) && Boolean(window.untilEndOfService) === Boolean(candidate.untilEndOfService)
  );
  if (!duplicate) {
    windows.push(candidate);
  }
}
function createClockTime(hourText, minuteText = "") {
  const hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText || "0", 10);
  return Number.isFinite(hour) && Number.isFinite(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? { hour, minute } : void 0;
}
function sameClock(left, right) {
  return left.hour === right.hour && left.minute === right.minute;
}

function mergeEquivalentTrafficDisruptions(disruptions) {
  const merged = /* @__PURE__ */ new Map();
  disruptions.forEach((disruption, index) => {
    const identity = getTrafficDisruptionPresentationIdentity(disruption);
    const key = identity != null ? identity : `unique:${disruption.id}:${index}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, disruption);
      return;
    }
    merged.set(key, mergeTrafficDisruption(existing, disruption));
  });
  return Array.from(merged.values());
}
function getTrafficDisruptionPresentationIdentity(disruption) {
  var _a;
  const summary = getPatternTrafficSummaryCopy(disruption);
  const alertTitle = normalizeIdentityPart((_a = summary.title) != null ? _a : disruption.title);
  const tiles = extractTrafficModalDateTiles(disruption, summary.title);
  const eventNames = Array.from(
    new Set(tiles.map((tile) => normalizeIdentityPart(tile.title)).filter(Boolean))
  ).sort();
  const periods = Array.from(
    new Set(
      tiles.flatMap(
        (tile) => tile.periods.map(
          (period) => {
            var _a2, _b, _c, _d, _e;
            return [
              (_b = (_a2 = period.start) == null ? void 0 : _a2.getTime()) != null ? _b : "",
              (_d = (_c = period.end) == null ? void 0 : _c.getTime()) != null ? _d : "",
              normalizeIdentityPart((_e = period.endLabel) != null ? _e : "")
            ].join(":");
          }
        )
      )
    )
  ).sort();
  if (!alertTitle || eventNames.length === 0 || periods.length === 0) {
    return void 0;
  }
  return [alertTitle, eventNames.join(","), periods.join(",")].join("|");
}
function mergeTrafficDisruption(left, right) {
  var _a;
  return {
    ...left,
    title: (_a = pickRicherText(left.title, right.title)) != null ? _a : left.title,
    message: pickRicherText(left.message, right.message),
    motif: pickRicherText(left.motif, right.motif),
    cause: pickRicherText(left.cause, right.cause),
    severity: pickRicherText(left.severity, right.severity),
    status: pickRicherText(left.status, right.status),
    updatedAt: pickLatestTimestamp(left.updatedAt, right.updatedAt),
    applicationPeriods: mergeTrafficPeriods(
      left.applicationPeriods,
      right.applicationPeriods
    ),
    impactedLineRefs: mergeStrings(
      left.impactedLineRefs,
      right.impactedLineRefs
    ),
    impactedStopNames: mergeStrings(
      left.impactedStopNames,
      right.impactedStopNames
    )
  };
}
function normalizeIdentityPart(value) {
  return normalizeTrafficText(value).replace(/[^a-z0-9]+/gu, " ").trim();
}
function pickRicherText(left, right) {
  if (!left) return right;
  if (!right) return left;
  return normalizeTrafficText(right).length > normalizeTrafficText(left).length ? right : left;
}
function pickLatestTimestamp(left, right) {
  if (!left) return right;
  if (!right) return left;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
    return pickRicherText(left, right);
  }
  return rightTime > leftTime ? right : left;
}
function mergeTrafficPeriods(left, right) {
  const periods = /* @__PURE__ */ new Map();
  [...left, ...right].forEach((period) => {
    periods.set(`${period.begin}|${period.end}`, period);
  });
  return Array.from(periods.values());
}
function mergeStrings(left, right) {
  return Array.from(/* @__PURE__ */ new Set([...left, ...right]));
}

function normalizeNavitiaLineReportPayload(payload, fallbackLineRef) {
  const root = asRecord(payload);
  const lineReports = asArray$1(root.line_reports);
  const rootDisruptions = asArray$1(root.disruptions);
  const lineReportDisruptions = lineReports.flatMap((lineReport) => {
    const report = asRecord(lineReport);
    return asArray$1(report.disruptions);
  });
  const linkedDisruptionIds = extractLineReportDisruptionIds(lineReports);
  const linkedRootDisruptions = linkedDisruptionIds.size ? rootDisruptions.filter((item) => {
    const disruption = asRecord(item);
    const id = asText(disruption.id);
    return id ? linkedDisruptionIds.has(id) : false;
  }) : rootDisruptions;
  const sourceDisruptions = [...linkedRootDisruptions, ...lineReportDisruptions];
  const disruptionsById = /* @__PURE__ */ new Map();
  sourceDisruptions.forEach((item, index) => {
    const disruption = normalizeDisruption(item, fallbackLineRef, index);
    if (disruption) {
      disruptionsById.set(disruption.id, disruption);
    }
  });
  const normalizedLineRef = normalizeTrafficLineRef(fallbackLineRef);
  return mergeEquivalentTrafficDisruptions(
    enrichMissingWorkMotifs(Array.from(disruptionsById.values()))
  ).filter((disruption) => disruption.impactedLineRefs.includes(normalizedLineRef));
}
function normalizeIdfmGlobalTrafficPayload(payload) {
  const payloadRecord = asRecord(payload);
  const nestedData = asOptionalRecord(payloadRecord.data);
  const root = nestedData != null ? nestedData : payloadRecord;
  const lineRecords = asArray$1(root.lines).map(asOptionalRecord).filter((line) => Boolean(line));
  const disruptionRecords = asArray$1(root.disruptions);
  const lineRefs = /* @__PURE__ */ new Set();
  const disruptionIdsByLine = /* @__PURE__ */ new Map();
  const impactedStopNamesByLine = /* @__PURE__ */ new Map();
  lineRecords.forEach((line) => {
    const lineRef = normalizeBulkLineRef(line);
    if (!lineRef) return;
    lineRefs.add(lineRef);
    const linkedIds = extractLinkedDisruptionIds(line);
    extractBulkImpactedObjects(line).forEach((impactedObject) => {
      var _a, _b;
      const impactedIds = extractLinkedDisruptionIds(impactedObject);
      impactedIds.forEach((id) => linkedIds.add(id));
      const impactedType = normalizeText$2(
        (_b = (_a = asText(impactedObject.type)) != null ? _a : asText(impactedObject.objectType)) != null ? _b : ""
      );
      const impactedName = asText(impactedObject.name);
      if (impactedType !== "line" && impactedName) {
        impactedIds.forEach(
          (id) => addBulkStopName(
            impactedStopNamesByLine,
            lineRef,
            id,
            impactedName
          )
        );
      }
    });
    if (linkedIds.size > 0) disruptionIdsByLine.set(lineRef, linkedIds);
  });
  const normalizedDisruptions = disruptionRecords.flatMap((item, index) => {
    const disruption = normalizeDisruption(item, "", index);
    return disruption ? [disruption] : [];
  });
  const disruptionsById = new Map(
    normalizedDisruptions.map((disruption) => [disruption.id, disruption])
  );
  const disruptionsByLine = /* @__PURE__ */ new Map();
  normalizedDisruptions.forEach((disruption) => {
    disruption.impactedLineRefs.forEach((lineRef) => {
      lineRefs.add(lineRef);
      addDisruptionToLine(disruptionsByLine, lineRef, disruption);
    });
  });
  disruptionIdsByLine.forEach((ids, lineRef) => {
    ids.forEach((id) => {
      var _a, _b;
      const disruption = disruptionsById.get(id);
      if (!disruption) return;
      const stopNames = (_b = (_a = impactedStopNamesByLine.get(lineRef)) == null ? void 0 : _a.get(id)) != null ? _b : [];
      addDisruptionToLine(disruptionsByLine, lineRef, {
        ...disruption,
        impactedLineRefs: Array.from(
          /* @__PURE__ */ new Set([...disruption.impactedLineRefs, lineRef])
        ),
        impactedStopNames: Array.from(
          /* @__PURE__ */ new Set([...disruption.impactedStopNames, ...stopNames])
        )
      });
    });
  });
  return Array.from(lineRefs).sort().map((lineRef) => {
    var _a, _b;
    const disruptions = mergeEquivalentTrafficDisruptions(
      enrichMissingWorkMotifs(
        Array.from((_b = (_a = disruptionsByLine.get(lineRef)) == null ? void 0 : _a.values()) != null ? _b : [])
      )
    );
    return {
      lineRef,
      status: getTrafficLineStatus(disruptions),
      disruptions
    };
  });
}
function getTrafficLineStatus(disruptions, error) {
  if (disruptions.length === 0) {
    return "normal";
  }
  if (disruptions.some(
    (disruption) => disruption.kind === "incident" || isSevereTrafficIssue(disruption)
  )) {
    return "disrupted";
  }
  if (disruptions.every((disruption) => disruption.kind === "works")) {
    return "planned";
  }
  return "information";
}
function normalizeTrafficLineRef(value) {
  var _a, _b;
  const code = (_b = (_a = value.match(/C\d{5}/iu)) == null ? void 0 : _a[0]) == null ? void 0 : _b.toUpperCase();
  return code ? `line:IDFM:${code}` : value.trim();
}
function normalizeDisruption(value, fallbackLineRef, index) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
  const disruption = asRecord(value);
  if (!disruption) {
    return void 0;
  }
  const messages = extractMessageTexts(disruption.messages);
  const title = (_c = (_b = (_a = asDisplayText(disruption.title)) != null ? _a : asDisplayText(disruption.summary)) != null ? _b : messages[0]) != null ? _c : "Information trafic";
  const message = (_e = (_d = asDisplayText(disruption.message)) != null ? _d : asDisplayText(disruption.description)) != null ? _e : messages.slice(asText(disruption.title) ? 0 : 1).join("\n");
  const cause = (_g = (_f = asDisplayText(disruption.cause)) != null ? _f : asDisplayText(disruption.reason)) != null ? _g : asDisplayText(disruption.motif);
  const severity = getSeverityLabel(disruption.severity);
  const impactedLineRefs = extractImpactedLineRefs(
    disruption,
    fallbackLineRef
  );
  if (isIgnoredAccessibilityEquipmentIssue(`${title} ${message} ${cause}`)) {
    return void 0;
  }
  return {
    id: (_h = asText(disruption.id)) != null ? _h : createFallbackDisruptionId(title, index),
    title,
    message: message || void 0,
    kind: getDisruptionKind(disruption, `${title} ${message} ${cause}`),
    severity,
    cause,
    status: asText(disruption.status),
    updatedAt: (_k = (_j = (_i = asText(disruption.updated_at)) != null ? _i : asText(disruption.updatedAt)) != null ? _j : asText(disruption.last_update)) != null ? _k : asText(disruption.lastUpdate),
    applicationPeriods: extractApplicationPeriods(disruption),
    impactedLineRefs,
    impactedStopNames: extractImpactedStopNames(disruption)
  };
}
function enrichMissingWorkMotifs(disruptions) {
  const disruptionsWithMotifs = disruptions.flatMap((disruption) => {
    const motif = extractExplicitTrafficMotif(disruption.message);
    return motif ? [{ disruption, motif }] : [];
  });
  if (disruptionsWithMotifs.length === 0) {
    return disruptions;
  }
  return disruptions.map((disruption) => {
    if (disruption.kind !== "works" || extractExplicitTrafficMotif(disruption.message)) {
      return disruption;
    }
    const relatedMotifs = new Set(
      disruptionsWithMotifs.filter(
        ({ disruption: candidate }) => candidate.id !== disruption.id && candidate.kind === "works" && hasSameWorkCause(disruption, candidate) && hasOverlappingApplicationPeriods(disruption, candidate)
      ).map(({ motif }) => motif)
    );
    return relatedMotifs.size === 1 ? { ...disruption, motif: Array.from(relatedMotifs)[0] } : disruption;
  });
}
function extractExplicitTrafficMotif(value) {
  if (!value) return void 0;
  const match = /\bmotif\s*:\s*[^\r\n]+/iu.exec(value);
  return match == null ? void 0 : match[0].trim();
}
function hasSameWorkCause(left, right) {
  var _a, _b;
  const leftCause = normalizeText$2((_a = left.cause) != null ? _a : "");
  const rightCause = normalizeText$2((_b = right.cause) != null ? _b : "");
  return Boolean(leftCause) && leftCause === rightCause;
}
function hasOverlappingApplicationPeriods(left, right) {
  return left.applicationPeriods.some((leftPeriod) => {
    var _a, _b;
    const leftStart = (_a = parseTrafficDate(leftPeriod.begin)) == null ? void 0 : _a.getTime();
    const leftEnd = (_b = parseTrafficDate(leftPeriod.end)) == null ? void 0 : _b.getTime();
    if (leftStart === void 0 || leftEnd === void 0) return false;
    return right.applicationPeriods.some((rightPeriod) => {
      var _a2, _b2;
      const rightStart = (_a2 = parseTrafficDate(rightPeriod.begin)) == null ? void 0 : _a2.getTime();
      const rightEnd = (_b2 = parseTrafficDate(rightPeriod.end)) == null ? void 0 : _b2.getTime();
      return rightStart !== void 0 && rightEnd !== void 0 && leftStart < rightEnd && rightStart < leftEnd;
    });
  });
}
function getDisruptionKind(disruption, searchableText) {
  const category = asText(disruption.category);
  const normalized = normalizeText$2(`${category != null ? category : ""} ${searchableText}`);
  if (normalized.includes("travaux") || normalized.includes("work") || normalized.includes("maintenance")) {
    return "works";
  }
  if (normalized.includes("incident") || normalized.includes("interruption") || normalized.includes("perturb") || normalized.includes("greve") || normalized.includes("strike")) {
    return "incident";
  }
  if (normalized.includes("information") || normalized.includes("message") || normalized.includes("service")) {
    return "information";
  }
  return "unknown";
}
function isSevereTrafficIssue(disruption) {
  var _a, _b;
  const normalized = normalizeText$2(
    `${(_a = disruption.severity) != null ? _a : ""} ${(_b = disruption.status) != null ? _b : ""}`
  );
  return [
    "blocking",
    "bloquant",
    "no service",
    "no-service",
    "reduced service",
    "perturbed",
    "disturbed"
  ].some((needle) => normalized.includes(needle));
}
function isIgnoredAccessibilityEquipmentIssue(searchableText) {
  const normalized = normalizeText$2(searchableText).replace(
    /[^a-z0-9]+/gu,
    " "
  );
  return [
    "panne ascenseur",
    "panne de l ascenseur",
    "panne d un ascenseur",
    "panne d ascenseur",
    "panne de l elevateur",
    "ascenseur indisponible",
    "elevator outage",
    "lift outage"
  ].some((needle) => normalized.includes(needle));
}
function extractMessageTexts(value) {
  return asArray$1(value).map((item) => {
    var _a, _b;
    const message = asRecord(item);
    return (_b = (_a = asDisplayText(message.text)) != null ? _a : asDisplayText(message.value)) != null ? _b : asDisplayText(message.message);
  }).filter((item) => Boolean(item));
}
function getSeverityLabel(value) {
  var _a, _b, _c;
  const severity = asRecord(value);
  return (_c = (_b = (_a = asText(value)) != null ? _a : asText(severity.name)) != null ? _b : asText(severity.effect)) != null ? _c : asText(severity.label);
}
function extractApplicationPeriods(disruption) {
  return [
    ...asArray$1(disruption.application_periods),
    ...asArray$1(disruption.applicationPeriods)
  ].map((period) => {
    var _a, _b;
    const record = asRecord(period);
    return {
      begin: (_a = asText(record.begin)) != null ? _a : asText(record.start),
      end: (_b = asText(record.end)) != null ? _b : asText(record.finish)
    };
  }).filter((period) => period.begin || period.end);
}
function extractImpactedLineRefs(disruption, fallbackLineRef) {
  const lineRefs = /* @__PURE__ */ new Set();
  asArray$1(disruption.lines).forEach((line) => {
    var _a;
    const record = asRecord(line);
    const lineRef = (_a = asText(record.id)) != null ? _a : asText(record.ref);
    if (lineRef) {
      lineRefs.add(normalizeTrafficLineRef(lineRef));
    }
  });
  extractImpactedObjects(disruption).forEach((object) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const ptObject = (_a = asOptionalRecord(object.pt_object)) != null ? _a : object;
    const embeddedType = normalizeText$2(
      (_e = (_d = (_c = (_b = asText(ptObject.embedded_type)) != null ? _b : asText(ptObject.embeddedType)) != null ? _c : asText(ptObject.type)) != null ? _d : asText(ptObject.objectType)) != null ? _e : ""
    );
    const line = asRecord(ptObject.line);
    const lineRef = (_h = (_g = embeddedType === "line" ? (_f = asText(ptObject.id)) != null ? _f : asText(ptObject.ref) : void 0) != null ? _g : asText(line.id)) != null ? _h : asText(line.ref);
    if (lineRef) {
      lineRefs.add(normalizeTrafficLineRef(lineRef));
    }
  });
  if (lineRefs.size === 0 && fallbackLineRef) {
    lineRefs.add(normalizeTrafficLineRef(fallbackLineRef));
  }
  return Array.from(lineRefs);
}
function extractLineReportDisruptionIds(lineReports) {
  const disruptionIds = /* @__PURE__ */ new Set();
  lineReports.forEach((lineReport) => {
    const report = asRecord(lineReport);
    const line = asRecord(report.line);
    [...asArray$1(report.links), ...asArray$1(line.links)].forEach((link) => {
      var _a, _b;
      const record = asRecord(link);
      const relation = normalizeText$2((_b = (_a = asText(record.rel)) != null ? _a : asText(record.relationship)) != null ? _b : "");
      if (!relation.includes("disruption")) return;
      const id = asText(record.id);
      if (id) disruptionIds.add(id);
    });
  });
  return disruptionIds;
}
function extractImpactedStopNames(disruption) {
  const names = /* @__PURE__ */ new Set();
  extractImpactedObjects(disruption).forEach((object) => {
    var _a, _b, _c, _d, _e, _f, _g;
    const ptObject = (_a = asOptionalRecord(object.pt_object)) != null ? _a : object;
    const embeddedType = normalizeText$2(
      (_e = (_d = (_c = (_b = asText(ptObject.embedded_type)) != null ? _b : asText(ptObject.embeddedType)) != null ? _c : asText(ptObject.type)) != null ? _d : asText(ptObject.objectType)) != null ? _e : ""
    );
    const name = asText(ptObject.name);
    if (name && embeddedType !== "line") {
      names.add(name);
    }
    const impactedSection = (_f = asOptionalRecord(object.impacted_section)) != null ? _f : asOptionalRecord(object.impactedSection);
    for (const endpointKey of ["from", "to"]) {
      const endpoint = asOptionalRecord(impactedSection == null ? void 0 : impactedSection[endpointKey]);
      const stopArea = asOptionalRecord(endpoint == null ? void 0 : endpoint.stop_area);
      const endpointName = (_g = asText(endpoint == null ? void 0 : endpoint.name)) != null ? _g : asText(stopArea == null ? void 0 : stopArea.name);
      if (endpointName) {
        names.add(endpointName);
      }
    }
  });
  return Array.from(names);
}
function extractImpactedObjects(disruption) {
  return [
    ...asArray$1(disruption.impacted_objects),
    ...asArray$1(disruption.impactedObjects)
  ].map(asOptionalRecord).filter((object) => Boolean(object));
}
function extractBulkImpactedObjects(line) {
  return [
    ...asArray$1(line.impactedObjects),
    ...asArray$1(line.impacted_objects)
  ].map(asOptionalRecord).filter((object) => Boolean(object));
}
function normalizeBulkLineRef(line) {
  var _a, _b;
  const lineRef = (_b = (_a = asText(line.id)) != null ? _a : asText(line.ref)) != null ? _b : asText(line.lineRef);
  return lineRef ? normalizeTrafficLineRef(lineRef) : void 0;
}
function extractLinkedDisruptionIds(line) {
  const ids = /* @__PURE__ */ new Set();
  const values = [
    ...asArray$1(line.disruptions),
    ...asArray$1(line.disruptionIds),
    ...asArray$1(line.disruption_ids)
  ];
  values.forEach((value) => {
    var _a;
    const record = asOptionalRecord(value);
    const id = (_a = asText(record == null ? void 0 : record.id)) != null ? _a : asText(value);
    if (id) ids.add(id);
  });
  return ids;
}
function addBulkStopName(stopNamesByLine, lineRef, disruptionId, stopName) {
  var _a, _b;
  const lineStopNames = (_a = stopNamesByLine.get(lineRef)) != null ? _a : /* @__PURE__ */ new Map();
  const stopNames = (_b = lineStopNames.get(disruptionId)) != null ? _b : /* @__PURE__ */ new Set();
  stopNames.add(stopName);
  lineStopNames.set(disruptionId, stopNames);
  stopNamesByLine.set(lineRef, lineStopNames);
}
function addDisruptionToLine(disruptionsByLine, lineRef, disruption) {
  var _a;
  const disruptions = (_a = disruptionsByLine.get(lineRef)) != null ? _a : /* @__PURE__ */ new Map();
  disruptions.set(disruption.id, disruption);
  disruptionsByLine.set(lineRef, disruptions);
}
function createFallbackDisruptionId(title, index) {
  return `${normalizeText$2(title).replace(/[^a-z0-9]+/gu, "-")}-${index}`;
}
function asRecord(value) {
  var _a;
  return (_a = asOptionalRecord(value)) != null ? _a : {};
}
function asOptionalRecord(value) {
  return value && typeof value === "object" ? value : void 0;
}
function asArray$1(value) {
  return Array.isArray(value) ? value : [];
}
function asText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function asDisplayText(value) {
  const text = asText(value);
  return text ? cleanDisplayText(text) : void 0;
}
function cleanDisplayText(value) {
  return decodeHtmlEntities(value).replace(/<br\s*\/?>/giu, "\n").replace(/<\/p\s*>/giu, "\n").replace(/<p\s*[^>]*>/giu, "").replace(/<\/?[a-z][^>]*>/giu, "").replace(/\r\n?/gu, "\n").replace(/[ \t]+\n/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim();
}
function decodeHtmlEntities(value) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/giu, (match, entity) => {
    var _a, _b, _c;
    const normalizedEntity = String(entity).toLowerCase();
    if (normalizedEntity.startsWith("#x")) {
      return (_a = decodeCodePoint(normalizedEntity.slice(2), 16)) != null ? _a : match;
    }
    if (normalizedEntity.startsWith("#")) {
      return (_b = decodeCodePoint(normalizedEntity.slice(1), 10)) != null ? _b : match;
    }
    const namedEntities = {
      amp: "&",
      apos: "'",
      gt: ">",
      lt: "<",
      nbsp: " ",
      quot: '"'
    };
    return (_c = namedEntities[normalizedEntity]) != null ? _c : match;
  });
}
function decodeCodePoint(value, radix) {
  const codePoint = Number.parseInt(value, radix);
  if (!Number.isFinite(codePoint)) {
    return void 0;
  }
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return void 0;
  }
}
function normalizeText$2(value) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

const DEFAULT_TRAFFIC_LOCALE = "fr";
function isTrafficLocale(value) {
  return value === "fr" || value === "en";
}
function resolveTrafficLocale(value) {
  var _a;
  const normalized = String(
    Array.isArray(value) ? (_a = value[0]) != null ? _a : "" : value != null ? value : ""
  ).trim().toLowerCase();
  return normalized.startsWith("en") ? "en" : DEFAULT_TRAFFIC_LOCALE;
}
function getTrafficAcceptLanguage(locale) {
  return locale === "en" ? "en-US,en;q=0.9,fr;q=0.8" : "fr-FR,fr;q=0.9,en;q=0.8";
}

const TRAFFIC_GLOBAL_REFRESH_INTERVAL_MS = 15e4;
const TRAFFIC_DETAIL_REFRESH_AFTER_MS = 6e4;
const TRAFFIC_TIMEOUT_MS = 4e3;
const TRAFFIC_PERSISTENCE_TTL_SECONDS = 7 * 24 * 60 * 60;
const IDFM_MARKETPLACE_BASE$1 = "https://prim.iledefrance-mobilites.fr/marketplace";
const IDFM_TRAFFIC_GLOBAL_URL = `${IDFM_MARKETPLACE_BASE$1}/disruptions_bulk/disruptions/v2`;
const globalSnapshotMemory = /* @__PURE__ */ new Map();
const globalRequests = /* @__PURE__ */ new Map();
const lineReportCache = /* @__PURE__ */ new Map();
async function getTrafficSnapshot(event, options = {}) {
  var _a, _b;
  const credentials = getTrafficCredentials(event);
  if (!credentials.globalApiKey) {
    return {
      response: createUnconfiguredResponse()
    };
  }
  const locale = (_a = options.locale) != null ? _a : DEFAULT_TRAFFIC_LOCALE;
  const cacheKey = createTrafficCacheKey(credentials.globalApiKey, locale);
  const loaded = await loadSnapshot(event, cacheKey);
  const now = Date.now();
  const force = options.force === true;
  if (loaded && loaded.record.expiresAt > now && !force) {
    return createSnapshotResult(loaded.record, cacheKey, "hit", loaded.storage);
  }
  const existingRequest = globalRequests.get(cacheKey);
  if (existingRequest) return existingRequest;
  const lastAttemptAt = (_b = loaded == null ? void 0 : loaded.record.lastRefreshAttemptAt) != null ? _b : 0;
  const refreshTooRecent = lastAttemptAt > 0 && now - lastAttemptAt < TRAFFIC_GLOBAL_REFRESH_INTERVAL_MS;
  if (refreshTooRecent) {
    return createSnapshotResult(
      loaded == null ? void 0 : loaded.record,
      cacheKey,
      force || (loaded == null ? void 0 : loaded.record.lastError) ? "rate-limited" : "stale",
      loaded == null ? void 0 : loaded.storage
    );
  }
  const request = refreshGlobalSnapshot(
    event,
    credentials.globalApiKey,
    credentials.globalAuth,
    locale,
    cacheKey,
    loaded
  );
  globalRequests.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (globalRequests.get(cacheKey) === request) {
      globalRequests.delete(cacheKey);
    }
  }
}
function refreshTrafficSnapshot(event, locale = DEFAULT_TRAFFIC_LOCALE) {
  return getTrafficSnapshot(event, { force: true, locale });
}
async function getTrafficCacheStatus(event, locale = DEFAULT_TRAFFIC_LOCALE) {
  var _a, _b;
  const credentials = getTrafficCredentials(event);
  if (!credentials.globalApiKey) {
    const response = createUnconfiguredResponse();
    return {
      configured: false,
      generatedAt: response.generatedAt,
      source: response.source,
      cache: response.cache
    };
  }
  const cacheKey = createTrafficCacheKey(credentials.globalApiKey, locale);
  const loaded = await loadSnapshot(event, cacheKey);
  const refreshing = globalRequests.has(cacheKey);
  const cache = createCacheMetadata(
    loaded == null ? void 0 : loaded.record,
    refreshing,
    loaded == null ? void 0 : loaded.storage
  );
  return {
    configured: true,
    generatedAt: (_a = loaded == null ? void 0 : loaded.record.generatedAt) != null ? _a : (/* @__PURE__ */ new Date()).toISOString(),
    source: (_b = loaded == null ? void 0 : loaded.record.source) != null ? _b : "prim-disruptions-bulk",
    cache
  };
}
async function refreshTrafficLineDetail(event, lineRef, locale = DEFAULT_TRAFFIC_LOCALE) {
  const normalizedLineRef = normalizeTrafficLineRef(lineRef);
  const credentials = getTrafficCredentials(event);
  if (!credentials.lineApiKey) {
    return {
      disruptions: [],
      error: "IDFM_API_KEY or NUXT_IDFM_API_KEY is missing on the server.",
      lineRef: normalizedLineRef,
      status: "error"
    };
  }
  const report = await fetchTrafficLineReport(
    event,
    normalizedLineRef,
    credentials.lineApiKey,
    locale
  );
  if (report.status !== "error") {
    await mergeTrafficLineReport(
      event,
      credentials.globalApiKey,
      locale,
      report
    );
  }
  return report;
}
async function fetchTrafficLineReport(event, lineRef, apiKey, locale = DEFAULT_TRAFFIC_LOCALE) {
  const normalizedLineRef = normalizeTrafficLineRef(lineRef);
  const cacheKey = `${createTrafficCacheKey(apiKey, locale)}:${normalizedLineRef}`;
  const now = Date.now();
  const cached = lineReportCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.promise;
  const promise = fetchLineReport(normalizedLineRef, apiKey, locale);
  lineReportCache.set(cacheKey, {
    expiresAt: now + TRAFFIC_DETAIL_REFRESH_AFTER_MS,
    promise
  });
  promise.catch(() => lineReportCache.delete(cacheKey));
  return promise;
}
async function refreshGlobalSnapshot(event, apiKey, auth, locale, cacheKey, loaded) {
  var _a, _b;
  const now = Date.now();
  const previous = loaded == null ? void 0 : loaded.record;
  const attempted = previous ? {
    ...previous,
    lastRefreshAttemptAt: now
  } : {
    configured: true,
    locale,
    generatedAt: new Date(now).toISOString(),
    refreshedAt: new Date(now).toISOString(),
    expiresAt: 0,
    lastRefreshAttemptAt: now,
    source: "prim-disruptions-bulk",
    lines: []
  };
  globalSnapshotMemory.set(cacheKey, {
    record: attempted,
    storage: (_a = loaded == null ? void 0 : loaded.storage) != null ? _a : "memory"
  });
  try {
    const payload = await fetchGlobalTrafficPayload(event, apiKey, auth, locale);
    const lines = normalizeIdfmGlobalTrafficPayload(payload);
    const refreshedAt = new Date(Date.now()).toISOString();
    const record = {
      configured: true,
      locale,
      generatedAt: refreshedAt,
      refreshedAt,
      expiresAt: Date.now() + TRAFFIC_GLOBAL_REFRESH_INTERVAL_MS,
      lastRefreshAttemptAt: now,
      source: "prim-disruptions-bulk",
      lines
    };
    const storage = await persistSnapshot(event, cacheKey, record);
    globalSnapshotMemory.set(cacheKey, { record, storage });
    console.info(
      `[traffic] global cache-miss refreshed locale=${locale} lines=${lines.length} source=prim-disruptions-bulk`
    );
    return createSnapshotResult(record, cacheKey, "miss", storage);
  } catch (error) {
    const trafficError = toTrafficGlobalError(error);
    const staleRecord = {
      ...attempted,
      lastRefreshAttemptAt: now,
      retryAt: now + TRAFFIC_GLOBAL_REFRESH_INTERVAL_MS,
      lastError: trafficError.message
    };
    const storage = await persistSnapshot(event, cacheKey, staleRecord);
    globalSnapshotMemory.set(cacheKey, { record: staleRecord, storage });
    console.warn(
      `[traffic] global stale status=${(_b = trafficError.status) != null ? _b : "error"} hasSnapshot=${staleRecord.lines.length > 0}`
    );
    return createSnapshotResult(
      staleRecord,
      cacheKey,
      trafficError.status === 429 ? "rate-limited" : "error",
      storage
    );
  }
}
async function fetchGlobalTrafficPayload(event, apiKey, auth, locale) {
  const url = getTrafficGlobalUrl(event);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRAFFIC_TIMEOUT_MS);
  try {
    const headers = {
      accept: "application/json",
      "accept-language": getTrafficAcceptLanguage(locale)
    };
    if (auth === "authorization-apikey") {
      headers.Authorization = `apikey ${apiKey}`;
    } else {
      headers.apikey = apiKey;
    }
    const response = await fetch(url, {
      headers,
      signal: controller.signal
    });
    if (!response.ok) {
      const error = new Error(`${response.status} ${response.statusText}`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}
async function fetchLineReport(lineRef, apiKey, locale) {
  try {
    const searchParams = new URLSearchParams({
      count: "100",
      disable_geojson: "true"
    });
    const url = `${IDFM_MARKETPLACE_BASE$1}/v2/navitia/line_reports/lines/${encodeURIComponent(lineRef)}/line_reports?${searchParams}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TRAFFIC_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(url, {
        headers: {
          accept: "application/json",
          "accept-language": getTrafficAcceptLanguage(locale),
          apikey: apiKey
        },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      const error = new Error(`${response.status} ${response.statusText}`);
      error.status = response.status;
      throw error;
    }
    const disruptions = normalizeNavitiaLineReportPayload(
      await response.json(),
      lineRef
    );
    return {
      disruptions,
      lineRef,
      status: getTrafficLineStatus(disruptions)
    };
  } catch (error) {
    return {
      disruptions: [],
      error: error instanceof Error ? error.message : "Unable to load traffic information.",
      lineRef,
      status: "error"
    };
  }
}
async function mergeTrafficLineReport(event, apiKey, locale, report) {
  const cacheKey = createTrafficCacheKey(apiKey, locale);
  const loaded = await loadSnapshot(event, cacheKey);
  const previous = loaded == null ? void 0 : loaded.record;
  if (!previous) return;
  const normalizedLineRef = normalizeTrafficLineRef(report.lineRef);
  const lines = previous.lines.filter(
    (line) => normalizeTrafficLineRef(line.lineRef) !== normalizedLineRef
  );
  lines.push({ ...report, lineRef: normalizedLineRef });
  const record = {
    ...previous,
    source: "mixed-cache",
    lines,
    lastError: void 0,
    retryAt: void 0
  };
  const storage = await persistSnapshot(event, cacheKey, record);
  globalSnapshotMemory.set(cacheKey, { record, storage });
}
async function loadSnapshot(event, cacheKey) {
  const memory = globalSnapshotMemory.get(cacheKey);
  if (memory) return memory;
  const cloudflareKv = getTrafficCloudflareKv(event);
  if (cloudflareKv) {
    try {
      const stored = await cloudflareKv.get(
        `traffic:global:${cacheKey}`,
        "json"
      );
      if (isTrafficCacheRecord(stored)) {
        const entry = { record: stored, storage: "persistent" };
        globalSnapshotMemory.set(cacheKey, entry);
        return entry;
      }
    } catch {
    }
  }
  try {
    const stored = await useStorage("traffic").getItem(cacheKey);
    if (isTrafficCacheRecord(stored)) {
      const entry = { record: stored, storage: "persistent" };
      globalSnapshotMemory.set(cacheKey, entry);
      return entry;
    }
  } catch {
  }
  return void 0;
}
async function persistSnapshot(event, cacheKey, record) {
  const cloudflareKv = getTrafficCloudflareKv(event);
  if (cloudflareKv) {
    try {
      await cloudflareKv.put(
        `traffic:global:${cacheKey}`,
        JSON.stringify(record),
        { expirationTtl: TRAFFIC_PERSISTENCE_TTL_SECONDS }
      );
      return "persistent";
    } catch {
    }
  }
  try {
    await useStorage("traffic").setItem(cacheKey, record);
    return "persistent";
  } catch {
    return "memory";
  }
}
function createSnapshotResult(record, cacheKey, state, storage) {
  var _a, _b, _c;
  const generatedAt = (_a = record == null ? void 0 : record.generatedAt) != null ? _a : (/* @__PURE__ */ new Date()).toISOString();
  const response = {
    configured: true,
    generatedAt,
    lines: (_b = record == null ? void 0 : record.lines) != null ? _b : [],
    source: (_c = record == null ? void 0 : record.source) != null ? _c : "prim-disruptions-bulk",
    cache: createCacheMetadata(record, false, storage, state)
  };
  return { response, record, cacheKey };
}
function createUnconfiguredResponse() {
  return {
    configured: false,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    lines: [],
    source: "prim-disruptions-bulk",
    cache: {
      state: "error",
      refreshIntervalMs: TRAFFIC_GLOBAL_REFRESH_INTERVAL_MS,
      detailRefreshAfterMs: TRAFFIC_DETAIL_REFRESH_AFTER_MS,
      refreshing: false,
      lastError: "IDFM_DATASET_KEY/NUXT_IDFM_DATASET_KEY or IDFM_API_KEY/NUXT_IDFM_API_KEY is missing on the server."
    }
  };
}
function createCacheMetadata(record, refreshing, storage, explicitState) {
  var _a;
  const now = Date.now();
  const ageMs = record ? Math.max(0, now - Date.parse(record.refreshedAt)) : void 0;
  const state = explicitState != null ? explicitState : getCacheState(record, refreshing, now);
  const nextRefreshAt = record ? Math.max(record.expiresAt, (_a = record.retryAt) != null ? _a : 0) : void 0;
  return {
    state,
    refreshedAt: record == null ? void 0 : record.refreshedAt,
    nextRefreshAt: nextRefreshAt ? new Date(nextRefreshAt).toISOString() : void 0,
    refreshIntervalMs: TRAFFIC_GLOBAL_REFRESH_INTERVAL_MS,
    detailRefreshAfterMs: TRAFFIC_DETAIL_REFRESH_AFTER_MS,
    ageMs,
    refreshing,
    lastError: record == null ? void 0 : record.lastError,
    retryAt: (record == null ? void 0 : record.retryAt) ? new Date(record.retryAt).toISOString() : void 0,
    storage
  };
}
function getCacheState(record, refreshing, now) {
  if (refreshing) return "refreshing";
  if (!record) return "miss";
  if (record.lastError && record.retryAt && record.retryAt > now) return "rate-limited";
  if (record.expiresAt > now) return "hit";
  if (record.lastError) return "error";
  return "stale";
}
function isTrafficCacheRecord(value) {
  return Boolean(
    value && value.configured === true && isTrafficLocale(value.locale) && typeof value.generatedAt === "string" && typeof value.refreshedAt === "string" && typeof value.expiresAt === "number" && Array.isArray(value.lines)
  );
}
function getTrafficCredentials(event) {
  const lineApiKey = getServerIdfmApiKey(event);
  const datasetApiKey = getServerIdfmDatasetKey(event);
  const globalApiKey = lineApiKey || datasetApiKey;
  return {
    lineApiKey,
    // The regular PRIM API key is accepted by the working bulk endpoint and
    // must remain preferred when both credentials are present. Keep the
    // dataset credential as a deployment fallback only.
    globalApiKey,
    globalAuth: lineApiKey ? "apikey" : "authorization-apikey"
  };
}
function getTrafficGlobalUrl(event) {
  var _a, _b;
  const env = getTrafficRuntimeEnv(event);
  return ((_a = env.NUXT_IDFM_TRAFFIC_GLOBAL_URL) == null ? void 0 : _a.trim()) || ((_b = env.IDFM_TRAFFIC_GLOBAL_URL) == null ? void 0 : _b.trim()) || IDFM_TRAFFIC_GLOBAL_URL;
}
function getTrafficRuntimeEnv(event) {
  var _a, _b;
  const cloudflareEnv = (_a = event.context.cloudflare) == null ? void 0 : _a.env;
  const nodeEnv = (_b = globalThis.process) == null ? void 0 : _b.env;
  return { ...nodeEnv != null ? nodeEnv : {}, ...cloudflareEnv != null ? cloudflareEnv : {} };
}
function getTrafficCloudflareKv(event) {
  var _a, _b;
  return (_b = (_a = event.context.cloudflare) == null ? void 0 : _a.env) == null ? void 0 : _b.TRAFFIC_CACHE_KV;
}
function createTrafficCacheKey(apiKey, locale) {
  let hash = 2166136261;
  for (const character of apiKey) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `v1-${(hash >>> 0).toString(16)}-${locale}`;
}
function toTrafficGlobalError(error) {
  if (error && typeof error === "object" && "status" in error) {
    const candidate = error;
    if (candidate instanceof Error) return candidate;
  }
  return error instanceof Error ? error : new Error("Unable to load global traffic information.");
}

const OFFICIAL_LINE_IDENTITIES = {
  t1: { family: "TRAM", lineCode: "C01389" },
  c01389: { family: "TRAM", lineCode: "C01389" },
  c02404: { family: "BUS", lineCode: "C01389" }
};
function inferTransitFamilyFromLineIdentity(source) {
  var _a;
  const explicitFamily = (_a = source.family) != null ? _a : transitModeToFamily$1(source.mode);
  if (explicitFamily) {
    return explicitFamily;
  }
  return resolveLineIconIdentity(source).family;
}
function createRatpLineIconUrls(source) {
  var _a;
  const identity = resolveLineIconIdentity(source);
  const family = identity.family;
  const lineCode = identity.lineCode;
  const displayCode = (_a = source.code) == null ? void 0 : _a.trim();
  if (!family || !lineCode) {
    return [];
  }
  const modePaths = getRatpModePaths(family);
  return Array.from(
    new Set(
      modePaths.flatMap((modePath) => [
        `https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/${modePath}/picto-ligne-LIGIDFM${lineCode}.svg`,
        ...displayCode ? [
          `https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/${modePath}/picto-ligne-${displayCode}.svg`
        ] : []
      ])
    )
  );
}
function resolveLineIconIdentity(source) {
  var _a, _b;
  const rawLineCode = getRawLineCode(source);
  const normalizedLineCode = normalizeLineCode(rawLineCode);
  const identity = normalizedLineCode ? OFFICIAL_LINE_IDENTITIES[normalizedLineCode.toLowerCase()] : void 0;
  const explicitFamily = (_a = source.family) != null ? _a : transitModeToFamily$1(source.mode);
  return {
    family: explicitFamily != null ? explicitFamily : identity == null ? void 0 : identity.family,
    lineCode: (_b = identity == null ? void 0 : identity.lineCode) != null ? _b : normalizeLineCode(rawLineCode)
  };
}
function getRawLineCode(source) {
  var _a, _b, _c, _d, _e;
  const rawCode = (_e = (_d = (_a = source.id) == null ? void 0 : _a.split(":").pop()) != null ? _d : (_c = (_b = source.ref) == null ? void 0 : _b.match(/Line::([^:]+):/u)) == null ? void 0 : _c[1]) != null ? _e : source.code;
  return rawCode == null ? void 0 : rawCode.replace(/^LIGIDFM/u, "").trim();
}
function normalizeLineCode(value) {
  return value == null ? void 0 : value.trim();
}
function transitModeToFamily$1(mode) {
  const normalizedMode = mode == null ? void 0 : mode.trim().toLowerCase();
  if (normalizedMode == null ? void 0 : normalizedMode.includes("metro")) {
    return "METRO";
  }
  if (normalizedMode == null ? void 0 : normalizedMode.includes("rer")) {
    return "RER";
  }
  if (normalizedMode == null ? void 0 : normalizedMode.includes("tram")) {
    return "TRAM";
  }
  if (normalizedMode == null ? void 0 : normalizedMode.includes("bus")) {
    return "BUS";
  }
  if ((normalizedMode == null ? void 0 : normalizedMode.includes("train")) || (normalizedMode == null ? void 0 : normalizedMode.includes("rail")) || (normalizedMode == null ? void 0 : normalizedMode.includes("transilien"))) {
    return "TRANSILIEN";
  }
  return void 0;
}
function getRatpModePaths(family) {
  if (family === "METRO") {
    return ["metro"];
  }
  if (family === "RER") {
    return ["rer"];
  }
  if (family === "TRAM") {
    return ["tramway", "tram"];
  }
  if (family === "NOCTILIEN") {
    return ["noctilien"];
  }
  if (family === "TRANSILIEN") {
    return ["train"];
  }
  return [];
}

const DEFAULT_LINE_COLOR = "#0064ff";
const DEFAULT_LINE_TEXT_COLOR = "#ffffff";
const OFFICIAL_LINE_PRESENTATION = {
  "line-idfm-c01383": { color: "#6ec4e8", textColor: "#111827" },
  "metro-13": { color: "#6ec4e8", textColor: "#111827" },
  "line-idfm-c01374": { color: "#be418d", textColor: "#ffffff" },
  "metro-4": { color: "#be418d", textColor: "#ffffff" },
  "line-idfm-c01743": { color: "#4a90d9", textColor: "#ffffff" },
  "rer-b": { color: "#4a90d9", textColor: "#ffffff" },
  "line-idfm-c01742": { color: "#e2231a", textColor: "#ffffff" },
  "rer-a": { color: "#e2231a", textColor: "#ffffff" },
  "line-idfm-c01728": { color: "#008b5b", textColor: "#ffffff" },
  "rer-d": { color: "#008b5b", textColor: "#ffffff" },
  // Keep the canvas stroke aligned with the RATP/IDFM RER E pictogram.
  "line-idfm-c01729": { color: "#a0006e", textColor: "#ffffff" },
  "rer-e": { color: "#a0006e", textColor: "#ffffff" },
  "line-idfm-c01739": { color: "#d6cd00", textColor: "#111827" },
  "transilien-j": { color: "#d6cd00", textColor: "#111827" },
  "train-j": { color: "#d6cd00", textColor: "#111827" },
  "line-idfm-c01730": { color: "#ef8c2f", textColor: "#ffffff" },
  "transilien-p": { color: "#ef8c2f", textColor: "#ffffff" },
  "train-p": { color: "#ef8c2f", textColor: "#ffffff" },
  "line-idfm-c01731": { color: "#f49fb3", textColor: "#111827" },
  "transilien-r": { color: "#f49fb3", textColor: "#111827" },
  "train-r": { color: "#f49fb3", textColor: "#111827" },
  "line-idfm-c01736": { color: "#00b297", textColor: "#ffffff" },
  "transilien-n": { color: "#00b297", textColor: "#ffffff" },
  "train-n": { color: "#00b297", textColor: "#ffffff" },
  "line-idfm-c01737": { color: "#84653d", textColor: "#ffffff" },
  "transilien-h": { color: "#84653d", textColor: "#ffffff" },
  "train-h": { color: "#84653d", textColor: "#ffffff" },
  "line-idfm-c01738": { color: "#9b9842", textColor: "#ffffff" },
  "transilien-k": { color: "#9b9842", textColor: "#ffffff" },
  "train-k": { color: "#9b9842", textColor: "#ffffff" },
  "line-idfm-c01740": { color: "#c4a4cc", textColor: "#111827" },
  "transilien-l": { color: "#c4a4cc", textColor: "#111827" },
  "train-l": { color: "#c4a4cc", textColor: "#111827" },
  "line-idfm-c01741": { color: "#b6134c", textColor: "#ffffff" },
  "transilien-u": { color: "#b6134c", textColor: "#ffffff" },
  "train-u": { color: "#b6134c", textColor: "#ffffff" },
  "line-idfm-c02711": { color: "#9f9825", textColor: "#ffffff" },
  "transilien-v": { color: "#9f9825", textColor: "#ffffff" },
  "train-v": { color: "#9f9825", textColor: "#ffffff" },
  "line-idfm-c02528": { color: "#9acd32", textColor: "#10233f" },
  "tram-t10": { color: "#9acd32", textColor: "#10233f" },
  t10: { color: "#9acd32", textColor: "#10233f" }
};
function createLinePresentation(source) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const family = (_b = (_a = source.family) != null ? _a : transitModeToFamily(source.mode)) != null ? _b : inferTransitFamilyFromLineIdentity(source);
  const official = (_c = source.officialPalette) != null ? _c : resolveOfficialLinePresentation(source);
  const iconUrls = createRatpLineIconUrls({
    code: (_d = source.code) != null ? _d : source.shortName,
    family,
    id: source.id,
    mode: normalizeTransitMode(source.mode),
    ref: source.ref
  });
  return {
    color: (_f = (_e = official == null ? void 0 : official.color) != null ? _e : normalizeHexColor(source.color)) != null ? _f : DEFAULT_LINE_COLOR,
    textColor: (_h = (_g = official == null ? void 0 : official.textColor) != null ? _g : normalizeHexColor(source.textColor)) != null ? _h : DEFAULT_LINE_TEXT_COLOR,
    iconUrl: iconUrls[0],
    iconUrls
  };
}
function transitModeToFamily(mode) {
  const normalized = normalizeTransitMode(mode);
  if (normalized === "metro") return "METRO";
  if (normalized === "rer") return "RER";
  if (normalized === "tram") return "TRAM";
  if (normalized === "bus") return "BUS";
  if (normalized === "train") return "TRANSILIEN";
  return void 0;
}
function transitFamilyToMode(family) {
  if (family === "METRO") return "metro";
  if (family === "TRAM") return "tram";
  if (family === "RER") return "rer";
  if (family === "BUS" || family === "NOCTILIEN") return "bus";
  return "train";
}
function resolveOfficialLinePresentation(source) {
  const keys = [
    source.id,
    source.ref,
    source.code,
    source.shortName,
    source.mode && source.shortName ? `${source.mode}-${source.shortName}` : void 0,
    source.family && source.shortName ? `${source.family}-${source.shortName}` : void 0
  ].filter((value) => Boolean(value)).flatMap((value) => createLinePresentationKeys(value));
  return keys.map((key) => OFFICIAL_LINE_PRESENTATION[key]).find(Boolean);
}
function createLinePresentationKeys(value) {
  var _a, _b;
  const normalized = normalizeKey(value);
  const code = (_b = (_a = value.match(/C\d{5}/iu)) == null ? void 0 : _a[0]) == null ? void 0 : _b.toLowerCase();
  return [
    normalized,
    ...code ? [code, `line-idfm-${code}`] : []
  ];
}
function normalizeTransitMode(mode) {
  const normalized = normalizeKey(mode != null ? mode : "");
  if (normalized.includes("metro")) return "metro";
  if (normalized.includes("rer")) return "rer";
  if (normalized.includes("tram")) return "tram";
  if (normalized.includes("bus")) return "bus";
  if (normalized.includes("rail") || normalized.includes("train") || normalized.includes("transilien")) {
    return "train";
  }
  return void 0;
}
function normalizeHexColor(value) {
  const trimmed = value == null ? void 0 : value.trim();
  if (!trimmed) return void 0;
  return trimmed.startsWith("#") ? trimmed.toLowerCase() : `#${trimmed.toLowerCase()}`;
}
function normalizeKey(value) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/giu, "-").replace(/^-|-$/gu, "").toLowerCase();
}

const configuredServerApiBaseUrl = typeof __SERVER_API_BASE_URL__ === "undefined" ? "" : __SERVER_API_BASE_URL__;
const SERVER_API_BASE_URL = configuredServerApiBaseUrl.trim().replace(/\/+$/u, "");
function toServerApiUrl(path) {
  if (!SERVER_API_BASE_URL || /^https?:\/\//iu.test(path)) {
    return path;
  }
  return `${SERVER_API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function createTransferLineOption(source) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
  const family = (_c = (_b = (_a = source.family) != null ? _a : transitModeToFamily(source.mode)) != null ? _b : inferTransitFamilyFromLineIdentity(source)) != null ? _c : inferTransferFamily(source);
  const label = normalizeTransferLabel(
    (_g = (_f = (_e = (_d = source.code) != null ? _d : source.label) != null ? _e : source.name) != null ? _f : source.longName) != null ? _g : source.id
  );
  const id = (_i = normalizeTransferLineId((_h = source.id) != null ? _h : source.ref)) != null ? _i : `transfer:${family.toLowerCase()}:${normalizeTransferKey(label)}`;
  const ref = (_l = (_k = normalizeTransferLineId((_j = source.ref) != null ? _j : source.id)) != null ? _k : source.ref) != null ? _l : source.id;
  const mode = (_m = source.mode) != null ? _m : familyToDisplayMode(family);
  const presentation = createLinePresentation({
    code: label,
    color: source.color,
    family,
    id,
    longName: (_n = source.longName) != null ? _n : source.name,
    mode: transitFamilyToMode(family),
    ref,
    shortName: label,
    textColor: source.textColor
  });
  return {
    id,
    label,
    family,
    mode,
    ref,
    color: presentation.color,
    textColor: presentation.textColor,
    iconUrl: presentation.iconUrl,
    iconUrls: presentation.iconUrls
  };
}
function mergeTransferLineOptionPresentation(current, source) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i;
  const enriched = createTransferLineOption({
    code: (_a = source.code) != null ? _a : current.label,
    color: (_b = source.color) != null ? _b : current.color,
    family: (_c = source.family) != null ? _c : current.family,
    id: (_d = source.id) != null ? _d : current.id,
    label: (_e = source.label) != null ? _e : current.label,
    longName: source.longName,
    mode: (_f = source.mode) != null ? _f : current.mode,
    name: source.name,
    ref: (_g = source.ref) != null ? _g : current.ref,
    textColor: (_h = source.textColor) != null ? _h : current.textColor
  });
  return {
    ...current,
    ...enriched,
    id: enriched.id || current.id,
    ref: (_i = enriched.ref) != null ? _i : current.ref
  };
}
function dedupeTransferLineOptions(transfers) {
  const deduped = /* @__PURE__ */ new Map();
  transfers.forEach((transfer) => {
    const key = createTransferDedupeKey(transfer);
    const existing = deduped.get(key);
    if (!existing || scoreTransferCompleteness(transfer) > scoreTransferCompleteness(existing)) {
      deduped.set(key, transfer);
    }
  });
  return Array.from(deduped.values());
}
function getTransferLineId(transfer) {
  var _a;
  return (_a = normalizeTransferLineId(transfer.id)) != null ? _a : normalizeTransferLineId(transfer.ref);
}
function createTransferDedupeKey(transfer) {
  var _a, _b;
  return [
    normalizeText$1((_b = (_a = transfer.family) != null ? _a : transfer.mode) != null ? _b : ""),
    normalizeTransferKey(transfer.label || transfer.id.split(":").pop() || transfer.id)
  ].join(":");
}
function scoreTransferCompleteness(transfer) {
  var _a, _b;
  let score = 0;
  if ((_a = transfer.id) == null ? void 0 : _a.startsWith("line:IDFM:")) score += 4;
  if (transfer.color && transfer.color !== "#0064ff") score += 3;
  if (transfer.textColor && transfer.textColor !== "#ffffff") score += 2;
  if (transfer.iconUrl || ((_b = transfer.iconUrls) == null ? void 0 : _b.length)) score += 1;
  return score;
}
function inferTransferFamily(source) {
  var _a, _b, _c;
  const mode = normalizeText$1(
    [source.mode, source.longName, source.name, source.label, source.code].join(" ")
  );
  const label = normalizeTransferKey((_c = (_b = (_a = source.code) != null ? _a : source.label) != null ? _b : source.name) != null ? _c : "");
  if (mode.includes("metro")) return "METRO";
  if (mode.includes("rer") || mode.includes("rapidtransit")) return "RER";
  if (mode.includes("tram")) return "TRAM";
  if (mode.includes("localtrain") || mode.includes("train") || mode.includes("rail")) {
    return "TRANSILIEN";
  }
  if (mode.includes("cable") || mode.includes("funicular")) return "CABLE";
  return label.startsWith("n") ? "NOCTILIEN" : "BUS";
}
function familyToDisplayMode(family) {
  if (family === "METRO") return "Metro";
  if (family === "RER") return "RER";
  if (family === "TRAM") return "Tram";
  if (family === "TRANSILIEN") return "Train";
  if (family === "CABLE") return "Cable";
  if (family === "NOCTILIEN") return "Noctilien";
  return "Bus";
}
function normalizeTransferLineId(value) {
  var _a;
  const trimmed = value == null ? void 0 : value.trim();
  if (!trimmed) {
    return void 0;
  }
  const idfmMatch = (_a = trimmed.match(/C\d{5}/iu)) == null ? void 0 : _a[0];
  if (idfmMatch) {
    return `line:IDFM:${idfmMatch.toUpperCase()}`;
  }
  return trimmed.toLowerCase().startsWith("line:") ? trimmed : void 0;
}
function normalizeTransferLabel(value) {
  const trimmed = value == null ? void 0 : value.trim();
  if (!trimmed) {
    return "?";
  }
  return trimmed.replace(/^ligne\s+/iu, "").replace(/^m(?:etro|Ã©tro)\s+/iu, "").replace(/^rer\s+/iu, "").replace(/^tram(?:way)?\s+/iu, "").trim();
}
function normalizeTransferKey(value) {
  return normalizeText$1(value).replace(/\s+/gu, "");
}
function normalizeText$1(value) {
  return (value != null ? value : "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[\u2019']/gu, " ").replace(/[^a-z0-9]+/gu, " ").replace(/\s+/gu, " ").trim();
}

const API_BASE = toServerApiUrl("/api/idfm");
const NAVITIA_API_BASE = toServerApiUrl("/api/idfm/v2/navitia");
const familyMatchers = {
  METRO: ["metro", "m\xE9tro"],
  RER: ["rer"],
  BUS: ["bus"],
  TRAM: ["tram", "tramway"],
  NOCTILIEN: ["noctilien"],
  TRANSILIEN: ["transilien", "train"],
  CABLE: ["cable", "telepherique", "t\xE9l\xE9ph\xE9rique", "funiculaire"]
};
const familyOrder = [
  "METRO",
  "RER",
  "TRANSILIEN",
  "TRAM",
  "BUS",
  "NOCTILIEN",
  "CABLE"
];
const MAX_LINE_RESULTS = 1500;
const MAX_STATION_RESULTS = 500;
const MAX_DIRECTION_SCHEDULES = 500;
function navitiaApiBase(options) {
  var _a;
  return (_a = options.apiBase) != null ? _a : NAVITIA_API_BASE;
}
function siriApiBase(options) {
  var _a;
  return (_a = options.siriApiBase) != null ? _a : API_BASE;
}
function navitiaFetch(input, options, init) {
  var _a, _b;
  return ((_a = options.fetcher) != null ? _a : fetch)(input, {
    ...init,
    signal: (_b = void 0 ) != null ? _b : options.signal
  });
}
async function navitiaFetchWithRetry(input, options, init) {
  return navitiaFetch(input, options, init);
}
async function fetchTransitFamilyOptions(options = {}) {
  var _a;
  const searchParams = new URLSearchParams({
    count: "100",
    disable_disruption: "true"
  });
  const response = await navitiaFetchWithRetry(
    `${navitiaApiBase(options)}/commercial_modes?${searchParams}`,
    options
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = await response.json();
  const familyOptions = ((_a = payload.commercial_modes) != null ? _a : []).map((mode) => mapCommercialModeToFamily(mode)).filter((option) => option !== null);
  const dedupedOptions = /* @__PURE__ */ new Map();
  familyOptions.forEach((option) => {
    var _a2, _b;
    const existing = dedupedOptions.get(option.family);
    if (!existing) {
      dedupedOptions.set(option.family, option);
      return;
    }
    const commercialModeIds = Array.from(
      /* @__PURE__ */ new Set([
        ...(_a2 = existing.commercialModeIds) != null ? _a2 : [existing.id],
        ...(_b = option.commercialModeIds) != null ? _b : [option.id]
      ])
    );
    dedupedOptions.set(option.family, {
      ...existing,
      commercialModeIds: commercialModeIds.length > 1 ? commercialModeIds : void 0
    });
  });
  return Array.from(dedupedOptions.values()).sort(
    (left, right) => familyOrder.indexOf(left.family) - familyOrder.indexOf(right.family)
  );
}
async function searchTransitLines(network, query, options = {}) {
  const trimmedQuery = query.trim();
  const normalizedQuery = normalizeText(trimmedQuery);
  const primaryLines = trimmedQuery ? await searchLinesWithPtObjects(network, trimmedQuery, options) : await fetchLinesForCommercialModes(network, options);
  const primaryResults = mapSearchLines(primaryLines, network, normalizedQuery);
  if (primaryResults.length > 0 || !trimmedQuery) {
    return primaryResults;
  }
  const modeLines = await fetchLinesForCommercialModes(network, options);
  return mapSearchLines(modeLines, network, normalizedQuery);
}
function mapSearchLines(lines, network, normalizedQuery) {
  return dedupeLines(lines).filter((line) => lineMatchesTransitFamily(line, network.family)).filter((line) => {
    var _a, _b;
    if (!normalizedQuery) {
      return true;
    }
    return normalizeText(`${(_a = line.code) != null ? _a : ""} ${(_b = line.name) != null ? _b : ""}`).includes(
      normalizedQuery
    );
  }).sort(compareLines).map((line) => mapLineToSearchOption(line, network));
}
async function searchLineStations(line, query, options = {}) {
  const stations = await fetchLineStationsByLineId(line.navitiaId, options);
  const normalizedQuery = normalizeText(query.trim());
  return stations.filter((station) => {
    var _a;
    if (!normalizedQuery) {
      return true;
    }
    return normalizeText(`${station.label} ${(_a = station.city) != null ? _a : ""}`).includes(
      normalizedQuery
    );
  }).sort((left, right) => left.label.localeCompare(right.label, "fr"));
}
async function fetchLineStationsByLineId(lineId, options = {}) {
  const searchParams = new URLSearchParams({
    count: "100",
    disable_disruption: "true",
    disable_geojson: "true"
  });
  const stopAreas = await fetchPaginatedCollection(
    `${navitiaApiBase(options)}/lines/${encodeURIComponent(lineId)}/stop_areas`,
    searchParams,
    "stop_areas",
    MAX_STATION_RESULTS,
    options
  );
  return dedupeStations$1(stopAreas.map(mapStopAreaToStation));
}
async function fetchLinesForCommercialModes(network, options = {}) {
  var _a;
  const commercialModeIds = Array.from(
    /* @__PURE__ */ new Set([network.id, ...(_a = network.commercialModeIds) != null ? _a : []])
  );
  const lineBatches = await Promise.all(
    commercialModeIds.map((commercialModeId) => {
      const searchParams = new URLSearchParams({
        count: "100",
        disable_disruption: "true",
        disable_geojson: "true"
      });
      return fetchPaginatedCollection(
        `${navitiaApiBase(options)}/commercial_modes/${encodeURIComponent(commercialModeId)}/lines`,
        searchParams,
        "lines",
        MAX_LINE_RESULTS,
        options
      );
    })
  );
  return lineBatches.flat();
}
async function searchLinesWithPtObjects(network, query, options = {}) {
  var _a;
  const searchParams = new URLSearchParams({
    count: "100",
    disable_disruption: "true",
    disable_geojson: "true",
    q: query
  });
  searchParams.append("type[]", "line");
  const response = await navitiaFetchWithRetry(
    `${navitiaApiBase(options)}/pt_objects?${searchParams}`,
    options
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = await response.json();
  const lines = ((_a = payload.pt_objects) != null ? _a : []).filter((object) => object.embedded_type === "line").map((object) => object.line).filter((line) => Boolean(line));
  if (lines.length > 0) {
    return lines;
  }
  return fetchLinesForCommercialModes(network, options);
}
async function fetchPaginatedCollection(endpoint, baseSearchParams, collectionKey, maxResults, options = {}) {
  var _a, _b, _c, _d, _e;
  const items = [];
  let page = 0;
  let totalResult;
  while (items.length < maxResults) {
    const searchParams = new URLSearchParams(baseSearchParams);
    searchParams.set("start_page", String(page));
    const response = await navitiaFetchWithRetry(`${endpoint}?${searchParams}`, options);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    const pageItems = (_a = payload[collectionKey]) != null ? _a : [];
    const pagination = payload.pagination;
    items.push(...pageItems);
    totalResult = (_b = pagination == null ? void 0 : pagination.total_result) != null ? _b : totalResult;
    const loadedCount = ((_c = pagination == null ? void 0 : pagination.start_page) != null ? _c : page) * ((_d = pagination == null ? void 0 : pagination.items_per_page) != null ? _d : pageItems.length) + ((_e = pagination == null ? void 0 : pagination.items_on_page) != null ? _e : pageItems.length);
    if (pageItems.length === 0 || typeof totalResult === "number" && loadedCount >= totalResult) {
      break;
    }
    page += 1;
  }
  return items.slice(0, maxResults);
}
async function fetchDirectionGroupsForStation(line, station, options = {}) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  if (!station.scheduleStopAreaRef) {
    return [createFallbackDirectionGroup(station.label)];
  }
  const serviceDay = getParisServiceDayWindow();
  const searchParams = new URLSearchParams({
    data_freshness: "base_schedule",
    from_datetime: serviceDay.fromParam,
    duration: "108000",
    // The API defaults to 10 schedule rows. They are not ordered by
    // direction, so a busy direction can otherwise hide the opposite one.
    count: "100",
    items_per_schedule: "8"
  });
  const schedules = await fetchPaginatedCollection(
    `${navitiaApiBase(options)}/lines/${encodeURIComponent(line.navitiaId)}/stop_areas/${encodeURIComponent(station.scheduleStopAreaRef)}/stop_schedules`,
    searchParams,
    "stop_schedules",
    MAX_DIRECTION_SCHEDULES,
    options
  );
  const groups = /* @__PURE__ */ new Map();
  for (const schedule of schedules) {
    const destination = cleanNavitiaDirection(
      (_d = (_c = (_a = schedule.display_informations) == null ? void 0 : _a.direction) != null ? _c : (_b = schedule.display_informations) == null ? void 0 : _b.headsign) != null ? _d : ""
    );
    if (!destination) {
      continue;
    }
    const id = createStableId(destination);
    const existing = groups.get(id);
    const navitiaStopPointRefs = Array.from(
      /* @__PURE__ */ new Set([
        ...(_e = existing == null ? void 0 : existing.match.navitiaStopPointRefs) != null ? _e : [],
        ...((_f = schedule.stop_point) == null ? void 0 : _f.id) ? [schedule.stop_point.id] : []
      ])
    );
    groups.set(id, {
      id,
      label: (_g = existing == null ? void 0 : existing.label) != null ? _g : destination,
      match: {
        destinationIncludes: Array.from(
          /* @__PURE__ */ new Set([
            ...(_h = existing == null ? void 0 : existing.match.destinationIncludes) != null ? _h : [],
            destination
          ])
        ),
        navitiaStopPointRefs: navitiaStopPointRefs.length > 0 ? navitiaStopPointRefs : void 0
      }
    });
  }
  return groups.size > 0 ? Array.from(groups.values()) : [createFallbackDirectionGroup(station.label)];
}
async function fetchBoardDepartures(board, options = {}) {
  const [batches, scheduleInfo] = await Promise.all([
    Promise.all(
      getEffectiveMonitoringPoints(board).map(
        (point) => fetchMonitoringPoint(board, point, options).catch((cause) => {
          if (isAbortError(cause)) throw cause;
          return [];
        })
      )
    ),
    fetchBoardScheduleInfo(board, options).catch((cause) => {
      if (isAbortError(cause)) throw cause;
      return {
        lastDepartures: [],
        scheduledDepartures: []
      };
    })
  ]);
  const uniqueDepartures = /* @__PURE__ */ new Map();
  batches.flat().filter(isUpcomingDeparture).sort(compareDepartures).forEach((departure) => {
    uniqueDepartures.set(departure.id, departure);
  });
  const departures = Array.from(uniqueDepartures.values()).sort(compareDepartures);
  return buildBoardDeparturesResult(
    board,
    departures,
    scheduleInfo.lastDepartures,
    scheduleInfo.scheduledDepartures
  );
}
function isAbortError(cause) {
  return cause instanceof DOMException ? cause.name === "AbortError" : cause instanceof Error && cause.name === "AbortError";
}
function getEffectiveMonitoringPoints(board) {
  const monitoringPoints = /* @__PURE__ */ new Map();
  board.directionGroups.forEach((group) => {
    var _a, _b;
    const directMonitoringRefs = (_a = group.match.monitoringRefs) != null ? _a : [];
    directMonitoringRefs.forEach((monitoringRef) => {
      if (monitoringRef && !monitoringPoints.has(monitoringRef)) {
        monitoringPoints.set(monitoringRef, {
          ref: monitoringRef,
          label: group.label
        });
      }
    });
    if (directMonitoringRefs.length > 0) return;
    (_b = group.match.navitiaStopPointRefs) == null ? void 0 : _b.forEach((stopPointRef) => {
      const monitoringRef = navitiaStopPointToMonitoringRef(stopPointRef);
      if (monitoringRef && !monitoringPoints.has(monitoringRef)) {
        monitoringPoints.set(monitoringRef, {
          ref: monitoringRef,
          label: group.label
        });
      }
    });
  });
  return monitoringPoints.size > 0 ? Array.from(monitoringPoints.values()) : board.monitoringPoints;
}
async function fetchMonitoringPoint(board, point, options) {
  var _a, _b;
  const searchParams = new URLSearchParams({
    MonitoringRef: point.ref,
    LineRef: board.line.ref
  });
  const response = await navitiaFetchWithRetry(
    `${siriApiBase(options)}/stop-monitoring?${searchParams}`,
    options
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = await response.json();
  const deliveries = asArray(
    (_b = (_a = payload.Siri) == null ? void 0 : _a.ServiceDelivery) == null ? void 0 : _b.StopMonitoringDelivery
  );
  const visits = deliveries.flatMap(
    (delivery) => asArray(delivery.MonitoredStopVisit)
  );
  return visits.map((visit) => mapVisitToDeparture(visit, point)).filter((departure) => departure !== null);
}
function mapVisitToDeparture(visit, point) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
  const journey = visit.MonitoredVehicleJourney;
  const call = journey == null ? void 0 : journey.MonitoredCall;
  if (!journey || !call) {
    return null;
  }
  const expectedDepartureTime = (_b = (_a = call.ExpectedDepartureTime) != null ? _a : call.ExpectedArrivalTime) != null ? _b : call.AimedDepartureTime;
  const destination = (_d = (_c = firstValue(journey.DestinationName)) != null ? _c : firstValue(call.DestinationDisplay)) != null ? _d : "Destination inconnue";
  const stopName = (_e = firstValue(call.StopPointName)) != null ? _e : "";
  const journeyName = (_h = (_g = firstValue(journey.VehicleJourneyName)) != null ? _g : firstValue(asArray((_f = journey.TrainNumbers) == null ? void 0 : _f.TrainNumberRef))) != null ? _h : firstValue(journey.JourneyNote);
  const platform = cleanPlatformName(
    (_i = siriValue(call.DeparturePlatformName)) != null ? _i : siriValue(call.ArrivalPlatformName)
  );
  const lineRef = (_j = siriValue(journey.LineRef)) != null ? _j : "";
  const monitoringRef = (_k = siriValue(visit.MonitoringRef)) != null ? _k : point.ref;
  const id = [
    visit.ItemIdentifier,
    lineRef,
    destination,
    expectedDepartureTime,
    platform
  ].filter(Boolean).join("|");
  return {
    id,
    lineRef,
    monitoringRef,
    stopName,
    destination,
    direction: firstValue(journey.DirectionName),
    platform,
    monitoringLabel: point.label,
    expectedDepartureTime,
    expectedArrivalTime: call.ExpectedArrivalTime,
    aimedDepartureTime: call.AimedDepartureTime,
    status: call.DepartureStatus,
    vehicleAtStop: Boolean(call.VehicleAtStop),
    journeyName,
    journeyRef: (_l = journey.FramedVehicleJourneyRef) == null ? void 0 : _l.DatedVehicleJourneyRef,
    callOrder: call.Order,
    navitiaStopPointRef: monitoringRefToNavitiaStopPointRef(monitoringRef)
  };
}
function cleanPlatformName(value) {
  const trimmedValue = value == null ? void 0 : value.trim();
  if (!trimmedValue) {
    return void 0;
  }
  const normalizedValue = normalizeText(trimmedValue);
  if (normalizedValue === "unknown" || normalizedValue === "inconnu" || normalizedValue === "unknown platform") {
    return void 0;
  }
  return trimmedValue.replace(/^quai\s+/iu, "");
}
async function fetchBoardScheduleInfo(board, options) {
  var _a, _b, _c, _d, _e, _f;
  if (!board.schedule) {
    return {
      lastDepartures: [],
      scheduledDepartures: []
    };
  }
  const serviceDay = getParisServiceDayWindow();
  const lineRef = encodeURIComponent(board.schedule.lineRef);
  const stopAreaRef = encodeURIComponent(board.schedule.stopAreaRef);
  const searchParams = new URLSearchParams({
    data_freshness: "base_schedule",
    from_datetime: formatParisNavitiaDateTime(/* @__PURE__ */ new Date()),
    duration: "108000",
    items_per_schedule: "12"
  });
  const response = await navitiaFetchWithRetry(
    `${navitiaApiBase(options)}/lines/${lineRef}/stop_areas/${stopAreaRef}/stop_schedules?${searchParams}`,
    options
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = await response.json();
  const latestByGroup = /* @__PURE__ */ new Map();
  const scheduledDepartures = [];
  for (const schedule of (_a = payload.stop_schedules) != null ? _a : []) {
    const destination = (_e = (_d = (_b = schedule.display_informations) == null ? void 0 : _b.direction) != null ? _d : (_c = schedule.display_informations) == null ? void 0 : _c.headsign) != null ? _e : "";
    const group = findDirectionGroup(board, {
      destination,
      navitiaStopPointRef: (_f = schedule.stop_point) == null ? void 0 : _f.id
    });
    const lastTime = findLatestNavitiaTime(schedule, serviceDay);
    if (!group) {
      continue;
    }
    if (lastTime) {
      const currentLast = latestByGroup.get(group.id);
      if (!currentLast || new Date(lastTime).getTime() > new Date(currentLast.time).getTime()) {
        latestByGroup.set(group.id, {
          groupId: group.id,
          time: lastTime,
          destination: cleanNavitiaDirection(destination)
        });
      }
    }
    scheduledDepartures.push(
      ...await mapScheduleToDepartures(board, schedule, group, serviceDay)
    );
  }
  return {
    lastDepartures: Array.from(latestByGroup.values()),
    scheduledDepartures: scheduledDepartures.sort(compareDepartures)
  };
}
function mapScheduleToDepartures(board, schedule, group, serviceDay) {
  var _a, _b, _c, _d, _e;
  const destination = cleanNavitiaDirection(
    (_d = (_c = (_a = schedule.display_informations) == null ? void 0 : _a.direction) != null ? _c : (_b = schedule.display_informations) == null ? void 0 : _b.headsign) != null ? _d : group.label
  );
  return findUpcomingNavitiaTimeEntries(schedule, serviceDay).slice(0, (_e = board.maxDeparturesPerDirection) != null ? _e : 4).map((entry) => {
    var _a2, _b2, _c2, _d2, _e2;
    return {
      id: `schedule|${board.id}|${group.id}|${entry.time}`,
      lineRef: board.line.ref,
      monitoringRef: (_d2 = (_c2 = (_a2 = schedule.stop_point) == null ? void 0 : _a2.id) != null ? _c2 : (_b2 = board.schedule) == null ? void 0 : _b2.stopAreaRef) != null ? _d2 : "",
      stopName: board.title,
      destination,
      monitoringLabel: "Horaire IDFM",
      expectedDepartureTime: entry.time,
      aimedDepartureTime: entry.time,
      vehicleAtStop: false,
      navitiaStopPointRef: (_e2 = schedule.stop_point) == null ? void 0 : _e2.id
    };
  });
}
function buildBoardDeparturesResult(board, departures, lastDepartures, scheduledDepartures) {
  var _a;
  const perDirectionLimit = (_a = board.maxDeparturesPerDirection) != null ? _a : Math.max(3, Math.ceil(board.maxDepartures / board.directionGroups.length));
  const lastDeparturesByGroup = new Map(
    lastDepartures.map((departure) => [departure.groupId, departure])
  );
  const visibleDepartures = /* @__PURE__ */ new Map();
  const realtimeDeparturesByGroup = /* @__PURE__ */ new Map();
  board.directionGroups.forEach((group) => {
    realtimeDeparturesByGroup.set(
      group.id,
      departures.filter((departure) => {
        var _a2;
        return ((_a2 = findDirectionGroup(board, departure)) == null ? void 0 : _a2.id) === group.id;
      }).slice(0, perDirectionLimit)
    );
  });
  const directionGroups = board.directionGroups.map(
    (group) => {
      var _a2;
      const realtimeDepartures = (_a2 = realtimeDeparturesByGroup.get(group.id)) != null ? _a2 : [];
      const scheduledGroupDepartures = scheduledDepartures.filter(
        (departure) => {
          var _a3;
          return ((_a3 = findDirectionGroup(board, departure)) == null ? void 0 : _a3.id) === group.id;
        }
      );
      const groupDepartures = (realtimeDepartures.length > 0 ? enrichDeparturesWithScheduledStopCounts(
        realtimeDepartures,
        scheduledGroupDepartures
      ) : scheduledGroupDepartures.slice(0, perDirectionLimit)).map((departure) => inferDeparturePlatformForGroup(departure, group));
      groupDepartures.forEach(
        (departure) => visibleDepartures.set(departure.id, departure)
      );
      return {
        id: group.id,
        label: group.label,
        subtitle: group.subtitle,
        isTerminal: group.isTerminal,
        departures: groupDepartures,
        lastDeparture: lastDeparturesByGroup.get(group.id),
        serviceEnded: hasServiceEnded(lastDeparturesByGroup.get(group.id))
      };
    }
  );
  const visibleFlatDepartures = Array.from(visibleDepartures.values()).sort(
    compareDepartures
  );
  return {
    departures: visibleFlatDepartures,
    directionGroups
  };
}
function inferDeparturePlatformForGroup(departure, group) {
  var _a;
  const platforms = (_a = group.match.platforms) != null ? _a : [];
  if (departure.platform || platforms.length !== 1 || !platforms[0]) {
    return departure;
  }
  return {
    ...departure,
    platform: platforms[0]
  };
}
function enrichDeparturesWithScheduledStopCounts(realtimeDepartures, scheduledDepartures) {
  return realtimeDepartures.map((departure) => {
    if (typeof departure.remainingStopCount === "number") {
      return departure;
    }
    const scheduledMatch = findScheduledStopCountMatch(
      departure,
      scheduledDepartures
    );
    return typeof (scheduledMatch == null ? void 0 : scheduledMatch.remainingStopCount) === "number" ? {
      ...departure,
      remainingStopCount: scheduledMatch.remainingStopCount
    } : departure;
  });
}
function findScheduledStopCountMatch(departure, scheduledDepartures) {
  var _a;
  const departureTime = getDepartureTimestamp(departure);
  return (_a = scheduledDepartures.filter(
    (candidate) => typeof candidate.remainingStopCount === "number" && directionsAreComparable(candidate.destination, departure.destination)
  ).map((candidate) => ({
    departure: candidate,
    delta: Math.abs(getDepartureTimestamp(candidate) - departureTime)
  })).filter(({ delta }) => delta <= 10 * 60 * 1e3).sort((left, right) => left.delta - right.delta)[0]) == null ? void 0 : _a.departure;
}
function directionsAreComparable(left, right) {
  if (!left || !right) {
    return true;
  }
  return directionMatchesRule(left, right) || directionMatchesRule(right, left);
}
function findDirectionGroup(board, candidate) {
  return board.directionGroups.find(
    (group) => matchesDirectionGroup(group, candidate)
  );
}
function matchesDirectionGroup(group, candidate) {
  var _a;
  const match = group.match;
  const label = normalizeText(candidate.monitoringLabel);
  const destinationRules = (_a = match.destinationIncludes) != null ? _a : [];
  const comparableLocationChecks = [
    matchMonitoringRef(candidate.monitoringRef, match.monitoringRefs),
    candidate.monitoringLabel && match.monitoringLabels ? match.monitoringLabels.some((value) => normalizeText(value) === label) : void 0,
    candidate.platform && match.platforms ? match.platforms.includes(candidate.platform) : void 0,
    candidate.navitiaStopPointRef && match.navitiaStopPointRefs ? match.navitiaStopPointRefs.includes(candidate.navitiaStopPointRef) : void 0
  ].filter((value) => typeof value === "boolean");
  const matchesDestination = destinationRules.length === 0 || destinationRules.some((value) => directionMatchesRule(candidate.destination, value));
  const matchesLocation = comparableLocationChecks.length === 0 || comparableLocationChecks.some(Boolean);
  return matchesDestination && matchesLocation;
}
function matchMonitoringRef(candidate, configured) {
  if (!candidate || !configured) return void 0;
  const candidateKind = monitoringReferenceKind(candidate);
  const comparable = configured.filter(
    (reference) => monitoringReferenceKind(reference) === candidateKind
  );
  return comparable.length > 0 ? comparable.includes(candidate) : void 0;
}
function monitoringReferenceKind(reference) {
  if (/:StopArea:SP:/iu.test(reference)) return "area";
  if (/:StopPoint:Q:/iu.test(reference)) return "point";
  return "other";
}
function directionMatchesRule(destination, rule) {
  const normalizedDestination = normalizeText(destination);
  const normalizedRule = normalizeText(rule);
  if (normalizedDestination.includes(normalizedRule)) {
    return true;
  }
  const comparableDestination = normalizeDirectionName(destination);
  const comparableRule = normalizeDirectionName(rule);
  return Boolean(comparableDestination) && Boolean(comparableRule) && (comparableDestination.includes(comparableRule) || comparableRule.includes(comparableDestination));
}
function findLatestNavitiaTime(schedule, serviceDay) {
  const candidates = [
    ...asArray(schedule.date_times),
    schedule.last_datetime
  ].flatMap((value) => [value == null ? void 0 : value.date_time, value == null ? void 0 : value.base_date_time]);
  const latestRawTime = candidates.filter(
    (value) => typeof value === "string" && value >= serviceDay.fromParam && value < serviceDay.cutoffParam
  ).sort((left, right) => right.localeCompare(left))[0];
  return latestRawTime ? parseNavitiaDateTime(latestRawTime) : void 0;
}
function findUpcomingNavitiaTimeEntries(schedule, serviceDay) {
  const nowRaw = formatParisNavitiaDateTime(/* @__PURE__ */ new Date());
  const seen = /* @__PURE__ */ new Set();
  const entries = [];
  asArray(schedule.date_times).forEach((value) => {
    [value.date_time, value.base_date_time].forEach((rawTime) => {
      if (typeof rawTime !== "string" || rawTime < nowRaw || rawTime < serviceDay.fromParam || rawTime >= serviceDay.cutoffParam || seen.has(rawTime)) {
        return;
      }
      const time = parseNavitiaDateTime(rawTime);
      if (!time) {
        return;
      }
      seen.add(rawTime);
      entries.push({
        rawTime,
        time
      });
    });
  });
  return entries.sort((left, right) => left.rawTime.localeCompare(right.rawTime));
}
function parseNavitiaDateTime(value) {
  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/
  );
  if (!match) {
    return void 0;
  }
  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ).toISOString();
}
function getParisServiceDayWindow() {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    month: "2-digit",
    timeZone: "Europe/Paris",
    year: "numeric"
  }).formatToParts(/* @__PURE__ */ new Date());
  const partMap = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );
  const year = Number(partMap.year);
  const month = Number(partMap.month);
  const day = Number(partMap.day);
  const hour = Number(partMap.hour);
  const serviceStart = new Date(
    Date.UTC(year, month - 1, day + (hour < 3 ? -1 : 0))
  );
  const cutoff = new Date(
    Date.UTC(
      serviceStart.getUTCFullYear(),
      serviceStart.getUTCMonth(),
      serviceStart.getUTCDate() + 1
    )
  );
  const pad = (value) => value.toString().padStart(2, "0");
  const formatDate = (date) => [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate())
  ].join("");
  return {
    fromParam: `${formatDate(serviceStart)}T000000`,
    cutoffParam: `${formatDate(cutoff)}T030000`
  };
}
function formatParisNavitiaDateTime(date) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Paris",
    year: "numeric"
  }).formatToParts(date);
  const partMap = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );
  return `${partMap.year}${partMap.month}${partMap.day}T${partMap.hour}${partMap.minute}${partMap.second}`;
}
function normalizeText(value) {
  return (value != null ? value : "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}
function normalizeDirectionName(value) {
  return normalizeText(cleanNavitiaDirection(value != null ? value : "")).replace(/\b(gare|paris|terminus)\b/gu, " ").replace(/[^a-z0-9]+/gu, " ").replace(/\s+/g, " ").trim();
}
function cleanNavitiaDirection(value) {
  return value.replace(/\s+\([^)]*\)$/u, "");
}
function hasServiceEnded(lastDeparture) {
  if (!lastDeparture) {
    return false;
  }
  return new Date(lastDeparture.time).getTime() < Date.now() - 6e4;
}
function mapCommercialModeToFamily(mode) {
  const family = familyOrder.find(
    (item) => commercialModeMatchesFamily(mode.name, item)
  );
  if (!family) {
    return null;
  }
  return {
    id: mode.id,
    label: formatFamilyLabel(family),
    family
  };
}
function formatFamilyLabel(family) {
  if (family === "METRO") {
    return "Metro";
  }
  if (family === "TRAM") {
    return "Tramway";
  }
  if (family === "CABLE") {
    return "Cable";
  }
  return family.charAt(0) + family.slice(1).toLowerCase();
}
function commercialModeMatchesFamily(commercialModeName, family) {
  const normalizedName = normalizeText(commercialModeName);
  return familyMatchers[family].some(
    (matcher) => normalizedName.includes(normalizeText(matcher))
  );
}
function lineMatchesTransitFamily(line, family) {
  var _a, _b;
  const modeName = (_a = line.commercial_mode) == null ? void 0 : _a.name;
  const modeId = (_b = line.commercial_mode) == null ? void 0 : _b.id;
  if (!modeName && !modeId) {
    return true;
  }
  return commercialModeMatchesFamily(modeName, family) || commercialModeMatchesFamily(modeId, family);
}
function mapLineToSearchOption(line, network) {
  var _a, _b, _c, _d, _e;
  const label = (_b = (_a = line.code) != null ? _a : line.name) != null ? _b : line.id;
  const presentation = createLinePresentation({
    code: (_c = line.code) != null ? _c : line.name,
    color: line.color,
    family: network.family,
    id: line.id,
    shortName: label,
    textColor: line.text_color
  });
  return {
    family: network.family,
    id: line.id,
    navitiaId: line.id,
    label,
    ref: navitiaLineIdToSiriRef(line.id),
    commercialModeId: (_e = (_d = line.commercial_mode) == null ? void 0 : _d.id) != null ? _e : network.id,
    color: presentation.color,
    textColor: presentation.textColor,
    iconUrl: presentation.iconUrl,
    iconUrls: presentation.iconUrls,
    displayName: line.name && line.code && line.name !== line.code ? `${line.code} \xB7 ${line.name}` : label
  };
}
function mapStopAreaToStation(stopArea) {
  var _a, _b, _c, _d, _e;
  const navitiaId = stopArea.id.startsWith("stop_area:") ? stopArea.id : `stop_area:IDFM:${stopArea.id}`;
  const rawLabel = (_b = (_a = stopArea.label) != null ? _a : stopArea.name) != null ? _b : navitiaId;
  const stopAreaId = (_c = getStopAreaReferentialId(stopArea)) != null ? _c : navitiaId.split(":").pop();
  const city = getStopAreaCity(stopArea, rawLabel);
  const lon = parseCoordinate((_d = stopArea.coord) == null ? void 0 : _d.lon);
  const lat = parseCoordinate((_e = stopArea.coord) == null ? void 0 : _e.lat);
  return {
    id: navitiaId,
    label: rawLabel.replace(/\s+\([^)]*\)$/u, ""),
    city,
    lon,
    lat,
    monitoringRef: `STIF:StopArea:SP:${stopAreaId != null ? stopAreaId : navitiaId}:`,
    scheduleStopAreaRef: navitiaId
  };
}
function getStopAreaCity(stopArea, label) {
  var _a, _b, _c;
  const cityMatch = label.match(/\(([^)]+)\)$/u);
  return (_c = cityMatch == null ? void 0 : cityMatch[1]) != null ? _c : (_b = (_a = stopArea.administrative_regions) == null ? void 0 : _a[0]) == null ? void 0 : _b.name;
}
function getStopAreaReferentialId(stopArea) {
  var _a, _b;
  const codeCandidate = (_b = (_a = stopArea.codes) == null ? void 0 : _a.find((code) => {
    const normalizedType = normalizeText(code.type);
    return Boolean(code.value) && (normalizedType.includes("source") || normalizedType.includes("stif") || normalizedType.includes("idfm"));
  })) == null ? void 0 : _b.value;
  const rawId = codeCandidate != null ? codeCandidate : stopArea.id;
  const stopPlaceMatch = rawId.match(
    /(?:multi|mono)modalStopPlace:(\d+)/u
  );
  if (stopPlaceMatch == null ? void 0 : stopPlaceMatch[1]) {
    return stopPlaceMatch[1];
  }
  const numericMatch = rawId.match(/(\d+)$/u);
  return numericMatch == null ? void 0 : numericMatch[1];
}
function parseCoordinate(value) {
  if (typeof value !== "string") {
    return void 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : void 0;
}
function dedupeLines(lines) {
  const deduped = /* @__PURE__ */ new Map();
  lines.forEach((line) => deduped.set(line.id, line));
  return Array.from(deduped.values());
}
function dedupeStations$1(stations) {
  const deduped = /* @__PURE__ */ new Map();
  stations.forEach((station) => deduped.set(station.id, station));
  return Array.from(deduped.values());
}
function compareLines(left, right) {
  var _a, _b, _c, _d;
  return compareLineLabels((_b = (_a = left.code) != null ? _a : left.name) != null ? _b : left.id, (_d = (_c = right.code) != null ? _c : right.name) != null ? _d : right.id);
}
function compareLineLabels(left, right) {
  return left.localeCompare(right, "fr", {
    numeric: true,
    sensitivity: "base"
  });
}
function navitiaLineIdToSiriRef(id) {
  var _a;
  const lineId = (_a = id.split(":").pop()) != null ? _a : id;
  return `STIF:Line::${lineId}:`;
}
function createFallbackDirectionGroup(label) {
  return {
    id: "all-directions",
    label: "All directions",
    subtitle: label,
    match: {}
  };
}
function createStableId(value) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}
function asArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}
function firstValue(values) {
  return asArray(values).map(siriValue).find((value) => Boolean(value));
}
function siriValue(value) {
  if (typeof value === "string") {
    return value || void 0;
  }
  return (value == null ? void 0 : value.value) || void 0;
}
function compareDepartures(left, right) {
  return getDepartureTimestamp(left) - getDepartureTimestamp(right);
}
function isUpcomingDeparture(departure) {
  const timestamp = getDepartureTimestamp(departure);
  if (timestamp === Number.MAX_SAFE_INTEGER) {
    return true;
  }
  return timestamp >= Date.now() - 6e4;
}
function getDepartureTimestamp(departure) {
  var _a, _b;
  const value = (_b = (_a = departure.expectedDepartureTime) != null ? _a : departure.expectedArrivalTime) != null ? _b : departure.aimedDepartureTime;
  return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
}

function createBoardFromDraft(draft, directionGroups) {
  var _a, _b, _c;
  const mode = transitFamilyToMode(draft.family);
  const presentation = createLinePresentation({
    code: draft.line.label,
    color: draft.line.color,
    family: draft.family,
    id: (_a = draft.line.navitiaId) != null ? _a : draft.line.id,
    mode,
    ref: draft.line.ref,
    shortName: draft.line.label,
    textColor: draft.line.textColor
  });
  return {
    id: createBoardId(draft.line, draft.station),
    title: draft.station.label,
    city: (_b = draft.station.city) != null ? _b : "",
    line: {
      ref: draft.line.ref,
      shortName: draft.line.label,
      longName: `${draft.family} ${draft.line.label}`,
      mode,
      color: presentation.color,
      textColor: presentation.textColor,
      iconUrl: (_c = draft.line.iconUrl) != null ? _c : presentation.iconUrl,
      iconUrls: mergeIconUrls(draft.line.iconUrls, presentation.iconUrls)
    },
    monitoringPoints: createMonitoringPoints(draft.station, directionGroups),
    directionGroups,
    schedule: draft.station.scheduleStopAreaRef ? {
      lineRef: draft.line.navitiaId,
      stopAreaRef: draft.station.scheduleStopAreaRef
    } : void 0,
    maxDepartures: 8
  };
}
function createMonitoringPoints(station, directionGroups) {
  const monitoringPoints = /* @__PURE__ */ new Map();
  directionGroups.forEach((group) => {
    var _a, _b;
    const directMonitoringRefs = (_a = group.match.monitoringRefs) != null ? _a : [];
    directMonitoringRefs.forEach((monitoringRef) => {
      if (monitoringRef && !monitoringPoints.has(monitoringRef)) {
        monitoringPoints.set(monitoringRef, {
          ref: monitoringRef,
          label: group.label
        });
      }
    });
    if (directMonitoringRefs.length > 0) return;
    (_b = group.match.navitiaStopPointRefs) == null ? void 0 : _b.forEach((stopPointRef) => {
      const monitoringRef = navitiaStopPointToMonitoringRef(stopPointRef);
      if (monitoringRef && !monitoringPoints.has(monitoringRef)) {
        monitoringPoints.set(monitoringRef, {
          ref: monitoringRef,
          label: group.label
        });
      }
    });
  });
  return monitoringPoints.size > 0 ? Array.from(monitoringPoints.values()) : [
    {
      ref: station.monitoringRef,
      label: "Tous quais"
    }
  ];
}
function createBoardId(line, station) {
  return `${line.id}-${station.id}`.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}
function mergeIconUrls(primary, fallback) {
  const urls = Array.from(/* @__PURE__ */ new Set([...primary != null ? primary : [], ...fallback != null ? fallback : []]));
  return urls.length > 0 ? urls : void 0;
}

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const STRUCTURAL_CACHE_TTL_MS = 6 * 60 * 6e4;
const BOARD_CACHE_TTL_MS = 8e3;
const MAX_BOARDS_PER_REQUEST = 20;
const VALID_FAMILIES = /* @__PURE__ */ new Set([
  "BUS",
  "CABLE",
  "METRO",
  "NOCTILIEN",
  "RER",
  "TRAM",
  "TRANSILIEN"
]);
class HomeAssistantTransitApi {
  constructor(dependencies) {
    __publicField(this, "dependencies", dependencies);
    __publicField(this, "boardCache", /* @__PURE__ */ new Map());
    __publicField(this, "structuralCache", /* @__PURE__ */ new Map());
  }
  async listFamilies() {
    const items = await this.getFamilies();
    return catalog(items.map(mapFamily));
  }
  async searchLines(family, query) {
    const familyOption = await this.resolveFamily(family);
    const lines = query.trim() ? await searchTransitLines(
      familyOption,
      query.trim(),
      this.dependencies.requestOptions
    ) : await this.getLines(familyOption);
    return catalog(lines.map((line) => mapLine(line, familyOption.family)));
  }
  async searchStations(family, lineId, query) {
    const line = await this.resolveLine(family, lineId);
    const stations = query.trim() ? await searchLineStations(
      line,
      query.trim(),
      this.dependencies.requestOptions
    ) : await this.getStations(line);
    return catalog(stations.map(mapStation));
  }
  async listDirections(family, lineId, stationId) {
    const line = await this.resolveLine(family, lineId);
    const station = await this.resolveStation(line, stationId);
    const directions = await this.getDirections(line, station);
    return catalog(directions.map(mapDirection));
  }
  async getBoards(requests) {
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new HomeAssistantApiInputError("At least one board is required.");
    }
    if (requests.length > MAX_BOARDS_PER_REQUEST) {
      throw new HomeAssistantApiInputError(
        `A maximum of ${MAX_BOARDS_PER_REQUEST} boards is allowed.`
      );
    }
    return {
      boards: await Promise.all(
        requests.map(async (request) => {
          try {
            validateBoardRequest(request);
            return await this.getCachedBoard(request);
          } catch (error) {
            return createErrorBoard(request, error);
          }
        })
      ),
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  getCachedBoard(request) {
    const cacheKey = JSON.stringify({
      directionIds: [...request.directionIds].sort(),
      family: request.family,
      limit: request.limit,
      lineId: request.lineId,
      stationId: request.stationId
    });
    return this.getCached(
      this.boardCache,
      cacheKey,
      BOARD_CACHE_TTL_MS,
      () => this.buildBoard(request)
    );
  }
  async buildBoard(request) {
    var _a, _b;
    const family = await this.resolveFamily(request.family);
    const line = await this.resolveLine(request.family, request.lineId);
    const station = await this.resolveStation(line, request.stationId);
    const availableDirections = await this.getDirections(line, station);
    const requestedIds = new Set(request.directionIds);
    const directions = availableDirections.filter(
      (direction) => requestedIds.has(direction.id)
    );
    if (directions.length === 0) {
      throw new HomeAssistantApiInputError(
        "None of the requested directions exists for this station."
      );
    }
    const board = createBoardFromDraft(
      {
        family: family.family,
        line,
        station
      },
      directions
    );
    board.maxDepartures = Math.max(
      request.limit * directions.length,
      request.limit
    );
    board.maxDeparturesPerDirection = request.limit;
    const lineRef = normalizeTrafficLineRef(
      (_b = (_a = board.schedule) == null ? void 0 : _a.lineRef) != null ? _b : board.line.ref
    );
    const [departures, traffic] = await Promise.all([
      fetchBoardDepartures(board, this.dependencies.requestOptions),
      this.dependencies.fetchTraffic(lineRef)
    ]);
    return {
      city: board.city || void 0,
      color: board.line.color,
      directions: departures.directionGroups.map((direction) => ({
        departures: direction.departures.slice(0, request.limit).map((item) => {
          var _a2;
          return {
            aimedTime: item.aimedDepartureTime,
            destination: item.destination,
            expectedTime: (_a2 = item.expectedDepartureTime) != null ? _a2 : item.expectedArrivalTime,
            id: item.id,
            platform: item.platform,
            status: item.status,
            vehicleAtStop: item.vehicleAtStop
          };
        }),
        id: direction.id,
        label: direction.label,
        serviceEnded: direction.serviceEnded,
        subtitle: direction.subtitle
      })),
      family: family.family,
      iconUrl: board.line.iconUrl,
      id: board.id,
      lineId: line.id,
      lineLabel: line.label,
      stationId: station.id,
      stationLabel: station.label,
      textColor: board.line.textColor,
      traffic: {
        disruptions: traffic.disruptions,
        status: traffic.status
      }
    };
  }
  getFamilies() {
    return this.getStructural(
      "families",
      () => fetchTransitFamilyOptions(this.dependencies.requestOptions)
    );
  }
  getLines(family) {
    return this.getStructural(
      `lines:${family.family}`,
      () => searchTransitLines(family, "", this.dependencies.requestOptions)
    );
  }
  getStations(line) {
    return this.getStructural(
      `stations:${line.id}`,
      () => searchLineStations(line, "", this.dependencies.requestOptions)
    );
  }
  getDirections(line, station) {
    return this.getStructural(
      `directions:${line.id}:${station.id}`,
      () => fetchDirectionGroupsForStation(
        line,
        station,
        this.dependencies.requestOptions
      )
    );
  }
  async resolveFamily(value) {
    if (!VALID_FAMILIES.has(value)) {
      throw new HomeAssistantApiInputError(`Unsupported family: ${value}`);
    }
    const family = (await this.getFamilies()).find(
      (candidate) => candidate.family === value
    );
    if (!family) {
      throw new HomeAssistantApiNotFoundError(`Family not found: ${value}`);
    }
    return family;
  }
  async resolveLine(familyValue, lineId) {
    const family = await this.resolveFamily(familyValue);
    const line = (await this.getLines(family)).find(
      (candidate) => candidate.id === lineId || candidate.navitiaId === lineId
    );
    if (!line) {
      throw new HomeAssistantApiNotFoundError(`Line not found: ${lineId}`);
    }
    return line;
  }
  async resolveStation(line, stationId) {
    const station = (await this.getStations(line)).find(
      (candidate) => candidate.id === stationId
    );
    if (!station) {
      throw new HomeAssistantApiNotFoundError(
        `Station not found: ${stationId}`
      );
    }
    return station;
  }
  getStructural(key, factory) {
    return this.getCached(
      this.structuralCache,
      key,
      STRUCTURAL_CACHE_TTL_MS,
      factory
    );
  }
  getCached(cache, key, ttl, factory) {
    const existing = cache.get(key);
    if (existing && existing.expiresAt > Date.now()) {
      return existing.promise;
    }
    const promise = factory();
    cache.set(key, {
      expiresAt: Date.now() + ttl,
      promise
    });
    promise.catch(() => cache.delete(key));
    return promise;
  }
}
class HomeAssistantApiInputError extends Error {
}
class HomeAssistantApiNotFoundError extends Error {
}
function catalog(items) {
  return {
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    items
  };
}
function mapFamily(family) {
  return {
    family: family.family,
    id: family.id,
    label: family.label
  };
}
function mapLine(line, family) {
  return {
    color: line.color,
    displayName: line.displayName,
    family,
    iconUrl: line.iconUrl,
    id: line.id,
    label: line.label,
    textColor: line.textColor
  };
}
function mapStation(station) {
  return {
    city: station.city,
    id: station.id,
    label: station.label,
    latitude: station.lat,
    longitude: station.lon
  };
}
function mapDirection(direction) {
  return {
    id: direction.id,
    label: direction.label,
    subtitle: direction.subtitle
  };
}
function validateBoardRequest(request) {
  var _a, _b;
  if (!request || typeof request !== "object") {
    throw new HomeAssistantApiInputError("Invalid board request.");
  }
  if (!VALID_FAMILIES.has(request.family)) {
    throw new HomeAssistantApiInputError("Invalid transit family.");
  }
  if (!((_a = request.lineId) == null ? void 0 : _a.trim()) || !((_b = request.stationId) == null ? void 0 : _b.trim())) {
    throw new HomeAssistantApiInputError(
      "lineId and stationId are required."
    );
  }
  if (!Array.isArray(request.directionIds) || request.directionIds.length === 0) {
    throw new HomeAssistantApiInputError(
      "At least one directionId is required."
    );
  }
  if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 5) {
    throw new HomeAssistantApiInputError("limit must be between 1 and 5.");
  }
}
function createErrorBoard(request, error) {
  var _a, _b, _c, _d, _e, _f;
  return {
    directions: [],
    error: error instanceof Error ? error.message : "Unknown board error.",
    family: VALID_FAMILIES.has(request.family) ? request.family : "BUS",
    id: `${(_a = request.lineId) != null ? _a : "unknown"}:${(_b = request.stationId) != null ? _b : "unknown"}`,
    lineId: (_c = request.lineId) != null ? _c : "",
    lineLabel: (_d = request.lineId) != null ? _d : "Unknown line",
    stationId: (_e = request.stationId) != null ? _e : "",
    stationLabel: (_f = request.stationId) != null ? _f : "Unknown station",
    traffic: {
      disruptions: [],
      status: "error"
    }
  };
}

const apiInstances = /* @__PURE__ */ new Map();
function getHomeAssistantTransitApi(event) {
  const apiKey = getServerIdfmApiKey(event);
  if (!apiKey) {
    throw createError({
      statusCode: 503,
      statusMessage: "IDFM_API_KEY is not configured on this deployment."
    });
  }
  const cached = apiInstances.get(apiKey);
  if (cached) {
    return cached;
  }
  const api = new HomeAssistantTransitApi({
    fetchTraffic: async (lineRef) => {
      var _a;
      const snapshot = await getTrafficSnapshot(event);
      const normalizedLineRef = normalizeTrafficLineRef(lineRef);
      const report = snapshot.response.lines.find(
        (candidate) => normalizeTrafficLineRef(candidate.lineRef) === normalizedLineRef
      );
      return report != null ? report : {
        disruptions: [],
        error: snapshot.response.configured ? void 0 : (_a = snapshot.response.cache) == null ? void 0 : _a.lastError,
        lineRef: normalizedLineRef,
        status: snapshot.response.configured ? "normal" : "error"
      };
    },
    requestOptions: createServerIdfmRequestOptions(apiKey)
  });
  apiInstances.set(apiKey, api);
  return api;
}
function assertHomeAssistantAuthorized(event) {
  var _a;
  const token = getHomeAssistantToken(event);
  if (!token) {
    return;
  }
  const authorization = (_a = getRequestHeader(event, "authorization")) != null ? _a : "";
  if (!isHomeAssistantAuthorized(token, authorization)) {
    throw createError({
      data: {
        code: "invalid_auth"
      },
      statusCode: 401,
      statusMessage: "A valid Transport Clock bearer token is required."
    });
  }
}
function isHomeAssistantAuthorized(configuredToken, authorizationHeader) {
  if (!configuredToken) {
    return true;
  }
  const providedToken = authorizationHeader.startsWith("Bearer ") ? authorizationHeader.slice("Bearer ".length) : "";
  return constantTimeEqual(configuredToken, providedToken);
}
function getHomeAssistantInfo(event) {
  const requestUrl = getRequestURL(event);
  const configuredInstanceId = getRuntimeValue(
    event,
    "TRANSPORT_CLOCK_INSTANCE_ID"
  );
  return {
    authenticationRequired: Boolean(getHomeAssistantToken(event)),
    canonicalUrl: requestUrl.origin,
    instanceId: configuredInstanceId || requestUrl.origin
  };
}
async function runHomeAssistantRequest(request) {
  try {
    return await request();
  } catch (error) {
    if (error instanceof HomeAssistantApiInputError) {
      throw createError({
        data: { code: "invalid_request" },
        statusCode: 400,
        statusMessage: error.message
      });
    }
    if (error instanceof HomeAssistantApiNotFoundError) {
      throw createError({
        data: { code: "not_found" },
        statusCode: 404,
        statusMessage: error.message
      });
    }
    throw error;
  }
}
function getHomeAssistantToken(event) {
  return getRuntimeValue(event, "TRANSPORT_CLOCK_HA_TOKEN");
}
function getRuntimeValue(event, key) {
  var _a, _b, _c, _d;
  const cloudflareEnv = (_a = event.context.cloudflare) == null ? void 0 : _a.env;
  const nodeEnv = (_b = globalThis.process) == null ? void 0 : _b.env;
  return ((_d = (_c = cloudflareEnv == null ? void 0 : cloudflareEnv[key]) != null ? _c : nodeEnv == null ? void 0 : nodeEnv[key]) != null ? _d : "").trim();
}
function constantTimeEqual(expected, actual) {
  const maxLength = Math.max(expected.length, actual.length);
  let difference = expected.length ^ actual.length;
  for (let index = 0; index < maxLength; index += 1) {
    difference |= (expected.charCodeAt(index) || 0) ^ (actual.charCodeAt(index) || 0);
  }
  return difference === 0;
}

const boards_post = defineEventHandler(
  async (event) => {
    assertHomeAssistantAuthorized(event);
    setHeader(event, "Cache-Control", "no-store");
    const body = await readBody(event);
    return runHomeAssistantRequest(
      () => getHomeAssistantTransitApi(event).getBoards(body == null ? void 0 : body.boards)
    );
  }
);

const boards_post$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: boards_post
}, Symbol.toStringTag, { value: 'Module' }));

const directions_get = defineEventHandler(
  async (event) => {
    assertHomeAssistantAuthorized(event);
    setHeader(event, "Cache-Control", "private, max-age=3600");
    const query = getQuery$1(event);
    return runHomeAssistantRequest(
      () => {
        var _a, _b, _c;
        return getHomeAssistantTransitApi(event).listDirections(
          String((_a = query.family) != null ? _a : ""),
          String((_b = query.lineId) != null ? _b : ""),
          String((_c = query.stationId) != null ? _c : "")
        );
      }
    );
  }
);

const directions_get$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: directions_get
}, Symbol.toStringTag, { value: 'Module' }));

const families_get = defineEventHandler(
  async (event) => {
    assertHomeAssistantAuthorized(event);
    setHeader(event, "Cache-Control", "private, max-age=3600");
    return runHomeAssistantRequest(
      () => getHomeAssistantTransitApi(event).listFamilies()
    );
  }
);

const families_get$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: families_get
}, Symbol.toStringTag, { value: 'Module' }));

const lines_get = defineEventHandler(
  async (event) => {
    assertHomeAssistantAuthorized(event);
    setHeader(event, "Cache-Control", "private, max-age=3600");
    const query = getQuery$1(event);
    return runHomeAssistantRequest(
      () => {
        var _a, _b;
        return getHomeAssistantTransitApi(event).searchLines(
          String((_a = query.family) != null ? _a : ""),
          String((_b = query.q) != null ? _b : "")
        );
      }
    );
  }
);

const lines_get$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: lines_get
}, Symbol.toStringTag, { value: 'Module' }));

const stations_get = defineEventHandler(
  async (event) => {
    assertHomeAssistantAuthorized(event);
    setHeader(event, "Cache-Control", "private, max-age=3600");
    const query = getQuery$1(event);
    return runHomeAssistantRequest(
      () => {
        var _a, _b, _c;
        return getHomeAssistantTransitApi(event).searchStations(
          String((_a = query.family) != null ? _a : ""),
          String((_b = query.lineId) != null ? _b : ""),
          String((_c = query.q) != null ? _c : "")
        );
      }
    );
  }
);

const stations_get$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: stations_get
}, Symbol.toStringTag, { value: 'Module' }));

const info_get = defineEventHandler((event) => {
  setHeader(event, "Cache-Control", "no-store");
  const info = getHomeAssistantInfo(event);
  return {
    apiVersion: "v1",
    authenticationRequired: info.authenticationRequired,
    canonicalUrl: info.canonicalUrl,
    capabilities: {
      catalog: true,
      departures: true,
      traffic: true
    },
    instanceId: info.instanceId,
    name: "Transport Clock"
  };
});

const info_get$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: info_get
}, Symbol.toStringTag, { value: 'Module' }));

const MARKETPLACE_ROOT = "https://prim.iledefrance-mobilites.fr/marketplace";
const HEALTH_TIMEOUT_MS = 2800;
const MAP_TILE_HEALTH_URL = "https://a.basemaps.cartocdn.com/rastertiles/voyager/12/2074/1408.png";
const SATELLITE_TILE_HEALTH_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/12/1408/2074";
const OPEN_METEO_HEALTH_URL = "https://api.open-meteo.com/v1/forecast?latitude=48.8566&longitude=2.3522&current=temperature_2m,weather_code&forecast_days=1&timezone=Europe%2FParis";
const IGN_GEOCODING_HEALTH_URL = "https://data.geopf.fr/geocodage/completion/?text=10%20avenue%20de%20Paris%20Versailles&maximumResponses=1&type=StreetAddress&bbox=1.4,48.1,3.6,49.3";
const PRIM_API_STATUS_URL = "https://prim.iledefrance-mobilites.fr/fr/etat-des-api";
const PRIM_API_STATUS_CACHE_TTL_MS = 10 * 6e4;
const MARKETPLACE_HEALTH_CACHE_TTL_MS = 10 * 6e4;
const marketplaceHealthCache = /* @__PURE__ */ new Map();
const BROWSER_LIKE_HEALTH_HEADERS = {
  accept: "application/json",
  "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
};
const NETEX_UPDATE_RECOMMENDED_AFTER_MONTHS = 6;
const NETEX_OUTDATED_AFTER_MONTHS = 12;
let primGlobalStatusPageCache;
let primGlobalStatusPageRequest;
const health_get = defineEventHandler(async (event) => {
  const checks = await Promise.all([
    checkNetexCache(event),
    checkGtfsCache(event),
    ...transportClockPluginHealthChecks.map((check) => check(event)),
    checkR2Cache(event),
    checkMarketplaceApi(
      event,
      "prim",
      "PRIM live API",
      "/stop-monitoring?MonitoringRef=STIF%3AStopPoint%3AQ%3A463401%3A&count=1"
    ),
    checkMarketplaceApi(
      event,
      "navitia",
      "Navitia API",
      "/v2/navitia/commercial_modes?count=1&disable_disruption=true&disable_geojson=true"
    ),
    checkNavitiaJourneys(event),
    checkTrafficCache(event),
    checkPrimGlobalStatus(),
    checkOpenMeteoWeather(),
    checkMapTiles(),
    checkSatelliteTiles(),
    checkIgnGeocoding()
  ]);
  return {
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    checks
  };
});
function checkNavitiaJourneys(event) {
  return checkMarketplaceApi(
    event,
    "navitia-journeys",
    "Navitia journeys",
    "/v2/navitia/journeys?from=2.333974%3B48.829464&to=2.333974%3B48.829464&count=1&data_freshness=base_schedule&disable_disruption=true&disable_geojson=true"
  );
}
async function checkPrimGlobalStatus() {
  return timedCheck(
    "prim-global-status",
    "PRIM global request status",
    "Realtime",
    false,
    async () => {
      const snapshot = await loadPrimGlobalStatusPage();
      if (!snapshot.responseOk) {
        return {
          status: "warning",
          message: `${snapshot.status} ${snapshot.statusText}`.trim(),
          detail: "The official PRIM status page responded without an OK status.",
          detailKey: "health.messages.primGlobalStatusBadStatus"
        };
      }
      if (snapshot.availability === void 0) {
        return {
          status: "warning",
          message: "Unable to parse global request availability",
          messageKey: "health.messages.primGlobalStatusParseFailed",
          detail: "Official PRIM status page, cached for 10 minutes.",
          detailKey: "health.messages.primGlobalStatusDetail"
        };
      }
      const available = snapshot.availability >= 99.5;
      return {
        status: available ? "ok" : "warning",
        message: available ? `Global request service available at ${snapshot.availability}%` : `Global request service degraded: ${snapshot.availability}% availability`,
        messageKey: available ? "health.messages.primGlobalStatusAvailable" : "health.messages.primGlobalStatusDegraded",
        messageParams: { value: snapshot.availability },
        detail: "Official PRIM status page, cached for 10 minutes.",
        detailKey: "health.messages.primGlobalStatusDetail"
      };
    }
  );
}
async function loadPrimGlobalStatusPage() {
  const now = Date.now();
  if (primGlobalStatusPageCache && primGlobalStatusPageCache.expiresAt > now) {
    return primGlobalStatusPageCache.snapshot;
  }
  if (primGlobalStatusPageRequest) {
    return primGlobalStatusPageRequest;
  }
  primGlobalStatusPageRequest = (async () => {
    const response = await fetchWithTimeout$2(PRIM_API_STATUS_URL, {
      headers: {
        ...BROWSER_LIKE_HEALTH_HEADERS,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"
      }
    });
    const snapshot = {
      responseOk: response.ok,
      status: response.status,
      statusText: response.statusText,
      availability: response.ok ? parsePrimGlobalRequestAvailability(await response.text()) : void 0
    };
    primGlobalStatusPageCache = {
      expiresAt: Date.now() + PRIM_API_STATUS_CACHE_TTL_MS,
      snapshot
    };
    return snapshot;
  })();
  try {
    return await primGlobalStatusPageRequest;
  } finally {
    primGlobalStatusPageRequest = void 0;
  }
}
function parsePrimGlobalRequestAvailability(html) {
  const text = decodeHealthStatusHtml(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
  const headingMatch = /prochains passages(?:\s|[-–—:|/])*requete globale/.exec(text);
  if (!headingMatch) {
    return void 0;
  }
  const match = text.slice(
    headingMatch.index + headingMatch[0].length,
    headingMatch.index + headingMatch[0].length + 450
  ).match(/disponibilite actuelle\s*(\d+(?:[.,]\d+)?)\s*%/);
  if (!match) {
    return void 0;
  }
  const availability = Number.parseFloat(match[1].replace(",", "."));
  return Number.isFinite(availability) && availability >= 0 && availability <= 100 ? availability : void 0;
}
function decodeHealthStatusHtml(value) {
  const namedEntities = {
    amp: "&",
    apos: "'",
    ccedil: "\xE7",
    eacute: "\xE9",
    ecirc: "\xEA",
    egrave: "\xE8",
    gt: ">",
    laquo: "\xAB",
    lt: "<",
    nbsp: " ",
    quot: '"',
    raquo: "\xBB"
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
    var _a;
    if (code.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    }
    return (_a = namedEntities[code.toLowerCase()]) != null ? _a : entity;
  });
}
async function checkGtfsCache(event) {
  return timedCheck("gtfs", "GTFS geometry", "Data", false, async () => {
    var _a, _b, _c, _d, _e, _f;
    const status = await getGtfsPublicStatus(event);
    if (!status.enabled) {
      return {
        status: "not_configured",
        message: "GTFS geometry disabled",
        messageKey: "health.messages.gtfsDisabled"
      };
    }
    if (!status.available) {
      return {
        status: "warning",
        message: "GTFS geometry unavailable",
        messageKey: "health.messages.gtfsUnavailable"
      };
    }
    return {
      status: status.stale ? "warning" : "ok",
      message: `${(_a = status.lineCount) != null ? _a : 0} lines indexed`,
      messageKey: "health.messages.gtfsAvailable",
      messageParams: { count: (_b = status.lineCount) != null ? _b : 0 },
      detail: status.stale ? `Dataset is ${(_c = status.ageDays) != null ? _c : 20} days old.` : `Dataset ${(_d = status.datasetVersion) != null ? _d : "unknown"}.`,
      detailKey: status.stale ? "health.messages.gtfsStaleDetail" : "health.messages.gtfsVersion",
      detailParams: status.stale ? { days: (_e = status.ageDays) != null ? _e : 20 } : { version: (_f = status.datasetVersion) != null ? _f : "unknown" }
    };
  });
}
async function checkNetexCache(event) {
  return timedCheck("netex", "NeTEx data", "Data", true, async () => {
    var _a, _b, _c, _d;
    const status = await getNetexCacheStatus(getNetexRuntimeEnv(event));
    if (!status.available) {
      return {
        status: "error",
        message: "NeTEx cache not found",
        messageKey: "health.messages.netexMissing",
        detail: (_a = status.message) != null ? _a : "No NeTEx index loaded.",
        detailKey: status.message ? void 0 : "health.messages.netexIndexMissing"
      };
    }
    const freshness = getNetexDatasetFreshness(status.generatedAt);
    return {
      status: (_b = freshness == null ? void 0 : freshness.status) != null ? _b : status.warning ? "warning" : "ok",
      message: [`${(_c = status.lineCount) != null ? _c : 0} lines loaded`, freshness == null ? void 0 : freshness.message].filter(Boolean).join(" \xB7 "),
      detail: [
        `Source ${formatNetexSource((_d = status.source) == null ? void 0 : _d.kind)}`,
        status.generatedAt ? `generated at ${formatDate(status.generatedAt)}` : "",
        freshness == null ? void 0 : freshness.detail,
        status.warning
      ].filter(Boolean).join(" \xB7 ")
    };
  });
}
async function checkR2Cache(event) {
  return timedCheck("r2", "Cloudflare R2", "Storage", false, async () => {
    var _a, _b, _c;
    const runtimeEnv = getNetexRuntimeEnv(event);
    const remote = (_a = runtimeEnv.IDFM_NETEX_CACHE_REMOTE) == null ? void 0 : _a.trim();
    if (!remote || !remote.startsWith("r2://")) {
      return {
        status: "not_configured",
        message: "R2 not configured",
        messageKey: "health.messages.r2NotConfigured",
        detail: "IDFM_NETEX_CACHE_REMOTE does not point to an r2:// source for this deployment.",
        detailKey: "health.messages.r2NotConfiguredDetail"
      };
    }
    const missing = getMissingR2Variables(runtimeEnv);
    if (missing.length > 0) {
      return {
        status: "error",
        message: "Incomplete R2 credentials",
        messageKey: "health.messages.r2MissingCredentials",
        detail: `Missing variables: ${missing.join(", ")}`,
        detailKey: "health.messages.missingVariables",
        detailParams: { variables: missing.join(", ") }
      };
    }
    const status = await getNetexCacheStatus(runtimeEnv);
    if (!status.available) {
      return {
        status: "error",
        message: "Unable to read R2",
        messageKey: "health.messages.r2ReadFailed",
        detail: (_b = status.message) != null ? _b : "The index.json file could not be read.",
        detailKey: status.message ? void 0 : "health.messages.indexReadFailed"
      };
    }
    return {
      status: "ok",
      message: "R2 bucket accessible",
      messageKey: "health.messages.r2Accessible",
      detail: sanitizeNetexLocation((_c = status.source) == null ? void 0 : _c.location)
    };
  });
}
async function checkMarketplaceApi(event, id, label, path) {
  const cached = marketplaceHealthCache.get(id);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.check, latencyMs: 0 };
  }
  const result = await timedCheck(id, label, "Realtime", true, async () => {
    const apiKey = getServerIdfmApiKey(event);
    if (!apiKey) {
      return {
        status: "error",
        message: "Missing API key",
        messageKey: "health.messages.missingApiKey",
        detail: "Configure IDFM_API_KEY or NUXT_IDFM_API_KEY on the server.",
        detailKey: "health.messages.missingApiKeyDetail",
        quota: { exposed: false }
      };
    }
    const response = await fetchWithTimeout$2(`${MARKETPLACE_ROOT}${path}`, {
      headers: {
        apikey: apiKey,
        accept: "application/json"
      }
    });
    const quota = extractQuota(response.headers);
    if (!response.ok) {
      return {
        status: "error",
        message: `${response.status} ${response.statusText}`,
        detail: "The IDFM endpoint responded without an OK status.",
        detailKey: "health.messages.idfmEndpointBadStatus",
        quota
      };
    }
    return {
      status: "ok",
      message: "Endpoint reachable",
      messageKey: "health.messages.endpointReachable",
      detail: "Short test through the IDFM marketplace proxy.",
      detailKey: "health.messages.idfmProxyTest",
      quota
    };
  });
  marketplaceHealthCache.set(id, {
    expiresAt: Date.now() + MARKETPLACE_HEALTH_CACHE_TTL_MS,
    check: result
  });
  return result;
}
async function checkTrafficCache(event) {
  return timedCheck("prim-traffic", "PRIM info trafic", "Realtime", true, async () => {
    const status = await getTrafficCacheStatus(event);
    if (!status.configured) {
      return {
        status: "error",
        message: "Missing API key",
        messageKey: "health.messages.missingApiKey",
        detail: status.cache.lastError,
        detailKey: "health.messages.missingApiKeyDetail",
        quota: { exposed: false }
      };
    }
    const cacheState = status.cache.state;
    const cacheHealthy = cacheState === "hit" || cacheState === "refreshing";
    const cacheWarning = cacheState === "miss" || cacheState === "stale" || cacheState === "rate-limited";
    return {
      status: cacheHealthy ? "ok" : cacheWarning ? "warning" : "error",
      message: cacheHealthy ? "Global traffic cache available" : cacheWarning ? cacheState === "miss" ? "Global traffic cache is not warmed" : "Global traffic cache is stale" : "Global traffic cache unavailable",
      messageKey: cacheHealthy ? "health.messages.endpointReachable" : "health.messages.idfmEndpointBadStatus",
      detail: [
        `state=${cacheState}`,
        status.cache.ageMs !== void 0 ? `age=${Math.round(status.cache.ageMs / 1e3)}s` : "no snapshot",
        status.cache.lastError
      ].filter(Boolean).join(" \xB7 "),
      detailKey: "health.messages.idfmProxyTest",
      quota: { exposed: false }
    };
  });
}
async function checkOpenMeteoWeather() {
  return timedCheck("open-meteo", "Open-Meteo weather", "Weather", false, async () => {
    const response = await fetchWithTimeout$2(OPEN_METEO_HEALTH_URL, {
      headers: {
        accept: "application/json"
      }
    });
    if (!response.ok) {
      return {
        status: "warning",
        message: `${response.status} ${response.statusText}`,
        detail: "The weather API responded without an OK status.",
        detailKey: "health.messages.weatherBadStatus",
        quota: extractQuota(response.headers)
      };
    }
    return {
      status: "ok",
      message: "Weather forecast reachable",
      messageKey: "health.messages.weatherReachable",
      detail: "Short Open-Meteo test on Paris, without an API key.",
      detailKey: "health.messages.weatherTest",
      quota: extractQuota(response.headers)
    };
  });
}
async function checkMapTiles() {
  return timedCheck("map-tiles", "Vector map", "Map", false, async () => {
    const response = await fetchWithTimeout$2(MAP_TILE_HEALTH_URL, {
      headers: {
        accept: "image/png,image/*;q=0.8,*/*;q=0.5"
      }
    });
    if (!response.ok) {
      return {
        status: "warning",
        message: `${response.status} ${response.statusText}`,
        detail: "The Carto basemap did not respond correctly.",
        detailKey: "health.messages.mapBadStatus",
        quota: extractQuota(response.headers)
      };
    }
    return {
      status: "ok",
      message: "Map background reachable",
      messageKey: "health.messages.mapReachable",
      detail: "Carto basemap Voyager responds correctly.",
      detailKey: "health.messages.mapTest",
      quota: extractQuota(response.headers)
    };
  });
}
async function checkIgnGeocoding() {
  return timedCheck("ign-geocoding", "IGN address search", "Map", false, async () => {
    const response = await fetchWithTimeout$2(IGN_GEOCODING_HEALTH_URL, {
      headers: { accept: "application/json", "accept-language": "fr-FR,fr;q=0.9" }
    });
    if (!response.ok) {
      return {
        status: "warning",
        message: `${response.status} ${response.statusText}`,
        detail: "The IGN geocoding API responded without an OK status.",
        detailKey: "health.messages.ignGeocodingBadStatus",
        quota: extractQuota(response.headers)
      };
    }
    return {
      status: "ok",
      message: "Address search reachable",
      messageKey: "health.messages.ignGeocodingReachable",
      detail: "Public IGN G\xE9oplateforme completion test on a fixed address.",
      detailKey: "health.messages.ignGeocodingTest",
      quota: extractQuota(response.headers)
    };
  });
}
async function checkSatelliteTiles() {
  return timedCheck("satellite-tiles", "Satellite imagery", "Map", false, async () => {
    const response = await fetchWithTimeout$2(SATELLITE_TILE_HEALTH_URL, {
      headers: {
        accept: "image/jpeg,image/png,image/*;q=0.8,*/*;q=0.5"
      }
    });
    if (!response.ok) {
      return {
        status: "warning",
        message: `${response.status} ${response.statusText}`,
        detail: "The Esri World Imagery basemap did not respond correctly.",
        detailKey: "health.messages.satelliteBadStatus",
        quota: extractQuota(response.headers)
      };
    }
    return {
      status: "ok",
      message: "Satellite imagery reachable",
      messageKey: "health.messages.satelliteReachable",
      detail: "Esri World Imagery tile responds correctly.",
      detailKey: "health.messages.satelliteTest",
      quota: extractQuota(response.headers)
    };
  });
}
async function timedCheck(id, label, category, required, check) {
  var _a;
  const startedAt = performance.now();
  try {
    const result = await check();
    return {
      id,
      label,
      labelKey: getHealthCheckLabelKey(id),
      category,
      categoryKey: getHealthCategoryKey(category),
      required,
      latencyMs: Math.round(performance.now() - startedAt),
      ...result,
      quota: (_a = result.quota) != null ? _a : { exposed: false }
    };
  } catch (error) {
    return {
      id,
      label,
      labelKey: getHealthCheckLabelKey(id),
      category,
      categoryKey: getHealthCategoryKey(category),
      required,
      status: required ? "error" : "warning",
      latencyMs: Math.round(performance.now() - startedAt),
      message: "Service unreachable",
      messageKey: "health.messages.serviceUnreachable",
      detail: error instanceof Error ? error.message : "Unknown error",
      detailKey: error instanceof Error ? void 0 : "health.messages.unknownError",
      quota: { exposed: false }
    };
  }
}
function getHealthCheckLabelKey(id) {
  return {
    netex: "health.checks.netex",
    gtfs: "health.checks.gtfs",
    r2: "health.checks.r2",
    prim: "health.checks.prim",
    navitia: "health.checks.navitia",
    "navitia-journeys": "health.checks.navitiaJourneys",
    "prim-traffic": "health.checks.primTraffic",
    "prim-global-status": "health.checks.primGlobalStatus",
    "open-meteo": "health.checks.openMeteo",
    "map-tiles": "health.checks.mapTiles",
    "satellite-tiles": "health.checks.satelliteTiles",
    "ign-geocoding": "health.checks.ignGeocoding"
  }[id];
}
function getHealthCategoryKey(category) {
  return {
    Data: "health.categories.data",
    Storage: "health.categories.storage",
    Realtime: "health.categories.realtime",
    Weather: "health.categories.weather",
    Map: "health.categories.map"
  }[category];
}
async function fetchWithTimeout$2(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}
function extractQuota(headers) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i;
  const quota = {
    limit: (_c = (_b = (_a = headers.get("x-ratelimit-limit")) != null ? _a : headers.get("x-rate-limit-limit")) != null ? _b : headers.get("ratelimit-limit")) != null ? _c : void 0,
    remaining: (_f = (_e = (_d = headers.get("x-ratelimit-remaining")) != null ? _d : headers.get("x-rate-limit-remaining")) != null ? _e : headers.get("ratelimit-remaining")) != null ? _f : void 0,
    reset: (_i = (_h = (_g = headers.get("x-ratelimit-reset")) != null ? _g : headers.get("x-rate-limit-reset")) != null ? _h : headers.get("ratelimit-reset")) != null ? _i : void 0
  };
  return {
    ...quota,
    exposed: Boolean(quota.limit || quota.remaining || quota.reset)
  };
}
function getMissingR2Variables(runtimeEnv) {
  return ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"].filter(
    (key) => {
      var _a;
      return !((_a = runtimeEnv[key]) == null ? void 0 : _a.trim());
    }
  );
}
function formatNetexSource(kind) {
  if (!kind) {
    return "unknown";
  }
  return kind === "directory" ? "local" : kind.toUpperCase();
}
function getNetexDatasetFreshness(generatedAt, now = /* @__PURE__ */ new Date()) {
  if (!generatedAt) {
    return void 0;
  }
  const generatedDate = new Date(generatedAt);
  if (Number.isNaN(generatedDate.getTime()) || Number.isNaN(now.getTime())) {
    return void 0;
  }
  if (now.getTime() > addUtcMonths(generatedDate, NETEX_OUTDATED_AFTER_MONTHS).getTime()) {
    return {
      status: "error",
      message: "dataset outdated",
      detail: "NeTEx dataset is over one year old and must be regenerated."
    };
  }
  if (now.getTime() > addUtcMonths(generatedDate, NETEX_UPDATE_RECOMMENDED_AFTER_MONTHS).getTime()) {
    return {
      status: "warning",
      message: "update recommended",
      detail: "NeTEx dataset is over six months old; updating it is recommended."
    };
  }
  return void 0;
}
function addUtcMonths(date, months) {
  const next = new Date(date.getTime());
  const originalDay = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDayInTargetMonth = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)
  ).getUTCDate();
  next.setUTCDate(Math.min(originalDay, lastDayInTargetMonth));
  return next;
}
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}
function sanitizeNetexLocation(location) {
  if (!location) {
    return "Source configured";
  }
  if (location.startsWith("r2://")) {
    const withoutScheme = location.slice("r2://".length);
    const [bucket, ...prefixParts] = withoutScheme.split("/");
    const prefix = prefixParts.filter(Boolean).join("/");
    return prefix ? `r2://${bucket}/${prefix}` : `r2://${bucket}`;
  }
  if (location.startsWith("http://") || location.startsWith("https://")) {
    try {
      const parsed = new URL(location);
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    } catch {
      return "Remote URL configured";
    }
  }
  return "Local folder configured";
}

const health_get$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  checkGtfsCache: checkGtfsCache,
  checkNavitiaJourneys: checkNavitiaJourneys,
  checkPrimGlobalStatus: checkPrimGlobalStatus,
  checkSatelliteTiles: checkSatelliteTiles,
  default: health_get,
  getNetexDatasetFreshness: getNetexDatasetFreshness,
  parsePrimGlobalRequestAvailability: parsePrimGlobalRequestAvailability
}, Symbol.toStringTag, { value: 'Module' }));

const GET_CACHE_MAX_ENTRIES = 2200;
const GET_CACHE_DEFAULT_TTL_MS = 6e4;
const GET_CACHE_STRUCTURAL_TTL_MS = 6 * 60 * 6e4;
const GET_CACHE_REALTIME_TTL_MS = 8e3;
const GET_CACHE_SCHEDULE_TTL_MS = 5 * 6e4;
const GET_CACHE_REALTIME_STALE_TTL_MS = 2 * 6e4;
const GET_CACHE_SCHEDULE_STALE_TTL_MS = 6 * 60 * 6e4;
const GET_CACHE_STRUCTURAL_STALE_TTL_MS = 24 * 60 * 6e4;
const GET_CACHE_DEFAULT_STALE_TTL_MS = 30 * 6e4;
const getResponseCache = /* @__PURE__ */ new Map();
const inFlightGetRequests = /* @__PURE__ */ new Map();
const ____path_ = defineEventHandler(async (event) => {
  var _a, _b;
  const apiKey = getServerIdfmApiKey(event);
  if (!apiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: "IDFM_API_KEY is not configured on this deployment."
    });
  }
  const method = getMethod(event);
  if (method === "OPTIONS") {
    setResponseHeaders(event, {
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
      "Access-Control-Allow-Origin": "*"
    });
    return null;
  }
  const sourceUrl = getRequestURL(event);
  const upstreamPath = (_a = getRouterParam(event, "path")) != null ? _a : "";
  const upstreamUrl = new URL(
    `${IDFM_MARKETPLACE_BASE_URL}/${upstreamPath}`
  );
  upstreamUrl.search = sourceUrl.search;
  const requestHeaders = getRequestHeaders(event);
  const headers = new Headers({
    accept: (_b = requestHeaders.accept) != null ? _b : "application/json",
    "accept-encoding": "gzip, deflate"
  });
  if (requestHeaders["content-type"]) {
    headers.set("content-type", requestHeaders["content-type"]);
  }
  headers.set("apikey", apiKey);
  if (method === "GET" || method === "HEAD") {
    const cachedResponse = await fetchCachedGetResponse(
      `${method}:${upstreamUrl.href}`,
      upstreamUrl,
      headers,
      method
    );
    return createResponseFromCache(cachedResponse);
  }
  const response = await fetchIdfmMarketplaceWithRetry(upstreamUrl, {
    body: await readRawBody(event),
    headers,
    method,
    redirect: "follow"
  });
  return createPassthroughResponse(response);
});
async function fetchCachedGetResponse(cacheKey, upstreamUrl, headers, method) {
  const cached = getResponseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }
  const inFlight = inFlightGetRequests.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }
  const request = fetchAndCacheGetResponse(cacheKey, upstreamUrl, headers, method);
  inFlightGetRequests.set(cacheKey, request);
  try {
    return await request;
  } finally {
    inFlightGetRequests.delete(cacheKey);
  }
}
async function fetchAndCacheGetResponse(cacheKey, upstreamUrl, headers, method) {
  const response = await fetchIdfmMarketplaceWithRetry(upstreamUrl, {
    headers,
    method,
    redirect: "follow"
  });
  const cachedResponse = await createCachedResponse(response);
  if (response.ok) {
    const now = Date.now();
    getResponseCache.set(cacheKey, {
      ...cachedResponse,
      expiresAt: now + getCacheTtl(upstreamUrl),
      staleUntil: now + getStaleCacheTtl(upstreamUrl)
    });
    trimGetResponseCache();
  } else if (response.status === 429) {
    const staleResponse = getResponseCache.get(cacheKey);
    if (staleResponse && staleResponse.staleUntil > Date.now()) {
      return createStaleRateLimitResponse(staleResponse);
    }
  }
  return cachedResponse;
}
async function createCachedResponse(response) {
  return {
    body: response.body ? await response.arrayBuffer() : null,
    expiresAt: 0,
    headers: createForwardedResponseHeaders(response.headers),
    staleUntil: 0,
    status: response.status,
    statusText: response.statusText
  };
}
function createStaleRateLimitResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("warning", '110 - "IDFM response is stale because the upstream is rate-limited"');
  headers.set("x-idfm-cache", "stale-rate-limit");
  return {
    ...response,
    headers: Array.from(headers.entries())
  };
}
function createPassthroughResponse(response) {
  return new Response(response.body, {
    headers: createForwardedResponseHeaders(response.headers),
    status: response.status,
    statusText: response.statusText
  });
}
function createResponseFromCache(response) {
  return new Response(response.body ? response.body.slice(0) : null, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText
  });
}
function createForwardedResponseHeaders(sourceHeaders) {
  const responseHeaders = new Headers(sourceHeaders);
  responseHeaders.set("Access-Control-Allow-Origin", "*");
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.delete("transfer-encoding");
  responseHeaders.delete("connection");
  responseHeaders.delete("keep-alive");
  responseHeaders.delete("proxy-authenticate");
  responseHeaders.delete("proxy-authorization");
  responseHeaders.delete("te");
  responseHeaders.delete("trailer");
  responseHeaders.delete("upgrade");
  return Array.from(responseHeaders.entries());
}
function getCacheTtl(upstreamUrl) {
  const pathname = upstreamUrl.pathname;
  if (pathname.includes("/stop-monitoring")) {
    return GET_CACHE_REALTIME_TTL_MS;
  }
  if (pathname.includes("/stop_schedules")) {
    return GET_CACHE_SCHEDULE_TTL_MS;
  }
  if (pathname.includes("/journeys")) {
    return GET_CACHE_SCHEDULE_TTL_MS;
  }
  if (pathname.includes("/commercial_modes") || pathname.includes("/connections") || pathname.includes("/lines") || pathname.includes("/places_nearby") || pathname.includes("/routes") || pathname.includes("/stop_areas")) {
    return GET_CACHE_STRUCTURAL_TTL_MS;
  }
  return GET_CACHE_DEFAULT_TTL_MS;
}
function getStaleCacheTtl(upstreamUrl) {
  const pathname = upstreamUrl.pathname;
  if (pathname.includes("/stop-monitoring")) {
    return GET_CACHE_REALTIME_STALE_TTL_MS;
  }
  if (pathname.includes("/stop_schedules") || pathname.includes("/journeys")) {
    return GET_CACHE_SCHEDULE_STALE_TTL_MS;
  }
  if (pathname.includes("/commercial_modes") || pathname.includes("/connections") || pathname.includes("/lines") || pathname.includes("/places_nearby") || pathname.includes("/routes") || pathname.includes("/stop_areas")) {
    return GET_CACHE_STRUCTURAL_STALE_TTL_MS;
  }
  return GET_CACHE_DEFAULT_STALE_TTL_MS;
}
function trimGetResponseCache() {
  while (getResponseCache.size > GET_CACHE_MAX_ENTRIES) {
    const oldestKey = getResponseCache.keys().next().value;
    if (!oldestKey) {
      return;
    }
    getResponseCache.delete(oldestKey);
  }
}

const ____path_$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: ____path_
}, Symbol.toStringTag, { value: 'Module' }));

const GTFS_LINE_ALIASES = {
  // NeTEx keeps the legacy 30-46 identifier. The current GTFS snapshot
  // publishes this same Cormeilles corridor as 1425 (IDFM:C02851).
  "IDFM:C01876": ["IDFM:C02851"]
};
function getGtfsLineAliasCandidates(lineId) {
  var _a;
  const normalizedLineId = lineId.trim().replace(/^line:/iu, "").toLocaleUpperCase("en-US");
  return [...(_a = GTFS_LINE_ALIASES[normalizedLineId]) != null ? _a : []];
}

const MAX_PROJECTION_ERROR_METERS = 300;
const MIN_PATH_RATIO = 0.35;
const MAX_PATH_RATIO = 8;
const MAX_PREFERRED_PATH_RATIO = 1.8;
const MAX_DEGENERATE_EDGE_METERS = 50;
function createSegmentsFromTraces(request, traces) {
  const stops = new Map(request.stops.map((stop) => [stop.id, stop]));
  const segments = /* @__PURE__ */ new Map();
  for (const branch of request.branches) {
    const branchStops = branch.stopIds.map((stopId) => stops.get(stopId)).filter((stop) => Boolean(stop));
    if (branchStops.length !== branch.stopIds.length || branchStops.length < 2) {
      return void 0;
    }
    const projectedBranch = projectStopsMonotonically(branchStops, traces);
    for (let index = 0; index < branch.stopIds.length - 1; index += 1) {
      const fromStopId = branch.stopIds[index];
      const toStopId = branch.stopIds[index + 1];
      const key = createUndirectedEdgeKey(fromStopId, toStopId);
      if (segments.has(key)) continue;
      const projected = projectedBranch != null ? projectedBranch : projectStopsMonotonically([branchStops[index], branchStops[index + 1]], traces);
      const from = branchStops[index];
      const to = branchStops[index + 1];
      let coordinates = projected ? sliceTraceBetween(
        projected.trace,
        projected.projections[projectedBranch ? index : 0],
        projected.projections[projectedBranch ? index + 1 : 1]
      ) : [];
      if (coordinates.length < 2) {
        if (distanceMeters$1(from, to) > MAX_DEGENERATE_EDGE_METERS) return void 0;
        coordinates = [
          { lon: from.lon, lat: from.lat },
          { lon: to.lon, lat: to.lat }
        ];
      }
      segments.set(key, {
        id: key,
        fromStopId,
        toStopId,
        coordinates
      });
    }
  }
  return [...segments.values()];
}
function createCompleteSegmentsFromTraces(request, traces) {
  var _a;
  const stops = new Map(request.stops.map((stop) => [stop.id, stop]));
  const segments = /* @__PURE__ */ new Map();
  for (const branch of request.branches) {
    for (let index = 0; index < branch.stopIds.length - 1; index += 1) {
      const fromStopId = branch.stopIds[index];
      const toStopId = branch.stopIds[index + 1];
      const key = createUndirectedEdgeKey(fromStopId, toStopId);
      if (segments.has(key)) continue;
      const from = stops.get(fromStopId);
      const to = stops.get(toStopId);
      if (!from || !to) return void 0;
      const projected = (_a = createSegmentsFromTraces(
        {
          ...request,
          branches: [{ id: key, stopIds: [fromStopId, toStopId] }]
        },
        traces
      )) == null ? void 0 : _a[0];
      if (!projected) return void 0;
      segments.set(key, projected);
    }
  }
  return segments.size > 0 ? [...segments.values()] : void 0;
}
function projectStopsMonotonically(stops, traces, maximumErrorMeters = MAX_PROJECTION_ERROR_METERS) {
  if (stops.length < 2) return void 0;
  const directDistance = stops.slice(1).reduce((total, stop, index) => total + distanceMeters$1(stops[index], stop), 0);
  const candidates = traces.flatMap((trace) => {
    if (trace.length < 2) return [];
    return [
      [false, trace],
      [true, [...trace].reverse()]
    ].flatMap(([reversed, orientedTrace]) => {
      const defined = selectMonotonicProjections(
        stops,
        orientedTrace,
        directDistance,
        maximumErrorMeters
      );
      if (!defined) return [];
      const errorMeters = Math.max(...defined.map((projection) => projection.errorMeters));
      const meanErrorMeters = defined.reduce((total, projection) => total + projection.errorMeters, 0) / defined.length;
      const pathDistance = defined[defined.length - 1].along - defined[0].along;
      const pathRatio = pathDistance / Math.max(directDistance, 1);
      const score = meanErrorMeters + errorMeters * 0.35 + Math.max(0, pathRatio - 2.5) * 40;
      return [
        {
          trace: orientedTrace,
          projections: defined,
          errorMeters,
          meanErrorMeters,
          pathRatio,
          score,
          reversed
        }
      ];
    });
  });
  return candidates.sort(
    (left, right) => getTracePathRatioPenalty(left.pathRatio) - getTracePathRatioPenalty(right.pathRatio) || left.score - right.score || left.errorMeters - right.errorMeters || left.trace.length - right.trace.length
  )[0];
}
function getTracePathRatioPenalty(pathRatio) {
  return pathRatio > MAX_PREFERRED_PATH_RATIO ? 1 : 0;
}
function selectMonotonicProjections(points, trace, directDistance, maximumErrorMeters) {
  var _a;
  const candidateLayers = points.map(
    (point) => projectPointCandidatesOnTrace(point, trace).filter(
      (candidate) => candidate.errorMeters <= maximumErrorMeters
    )
  );
  if (candidateLayers.some((candidates) => candidates.length === 0)) {
    return void 0;
  }
  if (candidateLayers.length === 2) {
    return selectTwoPointProjectionPath(
      candidateLayers[0],
      candidateLayers[1],
      directDistance
    );
  }
  const stateLayers = [
    candidateLayers[0].map((projection) => ({
      projection,
      previousIndex: -1,
      totalErrorMeters: projection.errorMeters,
      maximumErrorMeters: projection.errorMeters
    }))
  ];
  for (let layerIndex = 1; layerIndex < candidateLayers.length; layerIndex += 1) {
    const previousStates = stateLayers[layerIndex - 1];
    const currentCandidates = candidateLayers[layerIndex];
    const currentStates = [];
    let previousCursor = 0;
    let bestPreviousIndex = -1;
    for (const projection of currentCandidates) {
      while (previousCursor < previousStates.length && candidateLayers[layerIndex - 1][previousCursor].along <= projection.along) {
        const candidateState = previousStates[previousCursor];
        const bestState = bestPreviousIndex >= 0 ? previousStates[bestPreviousIndex] : void 0;
        if (candidateState && (!bestState || compareProjectionStates(candidateState, bestState, points.length) < 0)) {
          bestPreviousIndex = previousCursor;
        }
        previousCursor += 1;
      }
      const previousState = bestPreviousIndex >= 0 ? previousStates[bestPreviousIndex] : void 0;
      currentStates.push(
        previousState ? {
          projection,
          previousIndex: bestPreviousIndex,
          totalErrorMeters: previousState.totalErrorMeters + projection.errorMeters,
          maximumErrorMeters: Math.max(
            previousState.maximumErrorMeters,
            projection.errorMeters
          )
        } : void 0
      );
    }
    if (currentStates.every((state) => !state)) return void 0;
    stateLayers.push(currentStates);
  }
  const lastLayerIndex = stateLayers.length - 1;
  const viablePaths = stateLayers[lastLayerIndex].flatMap((state, stateIndex) => {
    if (!state) return [];
    const projections = reconstructProjectionPath(stateLayers, lastLayerIndex, stateIndex);
    const pathDistance = projections[projections.length - 1].along - projections[0].along;
    const pathRatio = pathDistance / Math.max(directDistance, 1);
    return pathRatio >= MIN_PATH_RATIO && pathRatio <= MAX_PATH_RATIO ? [{ projections, pathRatio }] : [];
  });
  return (_a = viablePaths.sort(
    (left, right) => getTracePathRatioPenalty(left.pathRatio) - getTracePathRatioPenalty(right.pathRatio) || compareProjectionPaths(left.projections, right.projections)
  )[0]) == null ? void 0 : _a.projections;
}
function selectTwoPointProjectionPath(fromCandidates, toCandidates, directDistance) {
  var _a;
  const normalizedDirectDistance = Math.max(directDistance, 1);
  const minimumPathMeters = MIN_PATH_RATIO * normalizedDirectDistance;
  const preferredMaximumPathMeters = MAX_PREFERRED_PATH_RATIO * normalizedDirectDistance;
  const maximumPathMeters = MAX_PATH_RATIO * normalizedDirectDistance;
  return (_a = selectBestProjectionPairWithinPathRange(
    fromCandidates,
    toCandidates,
    minimumPathMeters,
    preferredMaximumPathMeters
  )) != null ? _a : selectBestProjectionPairWithinPathRange(
    fromCandidates,
    toCandidates,
    minimumPathMeters,
    maximumPathMeters
  );
}
function selectBestProjectionPairWithinPathRange(fromCandidates, toCandidates, minimumPathMeters, maximumPathMeters) {
  const activeFromIndexes = [];
  let nextFromIndex = 0;
  const pairs = [];
  for (const to of toCandidates) {
    const latestAllowedAlong = to.along - minimumPathMeters;
    const earliestAllowedAlong = to.along - maximumPathMeters;
    while (nextFromIndex < fromCandidates.length && fromCandidates[nextFromIndex].along <= latestAllowedAlong) {
      pushProjectionCandidateIndex(
        activeFromIndexes,
        nextFromIndex,
        fromCandidates
      );
      nextFromIndex += 1;
    }
    while (activeFromIndexes.length > 0 && fromCandidates[activeFromIndexes[0]].along < earliestAllowedAlong) {
      popProjectionCandidateIndex(activeFromIndexes, fromCandidates);
    }
    const bestFromIndex = activeFromIndexes[0];
    if (bestFromIndex !== void 0) {
      pairs.push([fromCandidates[bestFromIndex], to]);
    }
  }
  return pairs.sort(compareProjectionPaths)[0];
}
function pushProjectionCandidateIndex(heap, candidateIndex, candidates) {
  heap.push(candidateIndex);
  let index = heap.length - 1;
  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2);
    if (compareProjectionCandidates(
      candidates[heap[parentIndex]],
      candidates[heap[index]]
    ) <= 0) {
      break;
    }
    [heap[parentIndex], heap[index]] = [heap[index], heap[parentIndex]];
    index = parentIndex;
  }
}
function popProjectionCandidateIndex(heap, candidates) {
  const last = heap.pop();
  if (last === void 0 || heap.length === 0) return;
  heap[0] = last;
  let index = 0;
  while (true) {
    const leftIndex = index * 2 + 1;
    const rightIndex = leftIndex + 1;
    let bestIndex = index;
    if (leftIndex < heap.length && compareProjectionCandidates(
      candidates[heap[leftIndex]],
      candidates[heap[bestIndex]]
    ) < 0) {
      bestIndex = leftIndex;
    }
    if (rightIndex < heap.length && compareProjectionCandidates(
      candidates[heap[rightIndex]],
      candidates[heap[bestIndex]]
    ) < 0) {
      bestIndex = rightIndex;
    }
    if (bestIndex === index) return;
    [heap[index], heap[bestIndex]] = [heap[bestIndex], heap[index]];
    index = bestIndex;
  }
}
function compareProjectionCandidates(left, right) {
  return left.errorMeters - right.errorMeters || left.along - right.along;
}
function compareProjectionStates(left, right, stopCount) {
  return left.totalErrorMeters / stopCount + left.maximumErrorMeters * 0.35 - (right.totalErrorMeters / stopCount + right.maximumErrorMeters * 0.35) || left.projection.along - right.projection.along;
}
function compareProjectionPaths(left, right) {
  const leftMaximum = Math.max(...left.map(({ errorMeters }) => errorMeters));
  const rightMaximum = Math.max(...right.map(({ errorMeters }) => errorMeters));
  const leftMean = left.reduce((total, { errorMeters }) => total + errorMeters, 0) / left.length;
  const rightMean = right.reduce((total, { errorMeters }) => total + errorMeters, 0) / right.length;
  return leftMean + leftMaximum * 0.35 - (rightMean + rightMaximum * 0.35) || left[0].along - right[0].along;
}
function reconstructProjectionPath(stateLayers, layerIndex, stateIndex) {
  const projections = [];
  let currentStateIndex = stateIndex;
  for (let currentLayerIndex = layerIndex; currentLayerIndex >= 0; currentLayerIndex -= 1) {
    const state = stateLayers[currentLayerIndex][currentStateIndex];
    projections.push(state.projection);
    currentStateIndex = state.previousIndex;
  }
  return projections.reverse();
}
function projectPointCandidatesOnTrace(point, trace) {
  let travelled = 0;
  const candidates = [];
  for (let index = 0; index < trace.length - 1; index += 1) {
    const start = trace[index];
    const end = trace[index + 1];
    const segmentMeters = distanceMeters$1(start, end);
    if (segmentMeters <= 0) continue;
    const projected = projectOnSegment(point, start, end);
    const candidate = {
      point: projected.point,
      segmentIndex: index,
      progress: projected.progress,
      along: travelled + projected.progress * segmentMeters,
      errorMeters: distanceMeters$1(point, projected.point)
    };
    candidates.push(candidate);
    travelled += segmentMeters;
  }
  return candidates;
}
function sliceTraceBetween(trace, from, to) {
  if (to.along < from.along) return [];
  const points = [from.point];
  for (let index = from.segmentIndex + 1; index <= to.segmentIndex; index += 1) {
    points.push(trace[index]);
  }
  points.push(to.point);
  return dedupeCoordinates(points);
}
function projectOnSegment(point, start, end) {
  const latitudeRadians = point.lat * Math.PI / 180;
  const xScale = Math.max(0.1, Math.cos(latitudeRadians));
  const dx = (end.lon - start.lon) * xScale;
  const dy = end.lat - start.lat;
  const px = (point.lon - start.lon) * xScale;
  const py = point.lat - start.lat;
  const denominator = dx * dx + dy * dy;
  const progress = denominator ? Math.min(1, Math.max(0, (px * dx + py * dy) / denominator)) : 0;
  return {
    progress,
    point: {
      lon: start.lon + (end.lon - start.lon) * progress,
      lat: start.lat + (end.lat - start.lat) * progress
    }
  };
}
function dedupeCoordinates(coordinates) {
  return coordinates.filter((coordinate, index) => {
    const previous = coordinates[index - 1];
    return !previous || distanceMeters$1(previous, coordinate) >= 0.25;
  });
}
function distanceMeters$1(left, right) {
  const latitudeRadians = (left.lat + right.lat) / 2 * Math.PI / 180;
  const x = (right.lon - left.lon) * Math.cos(latitudeRadians);
  const y = right.lat - left.lat;
  return Math.hypot(x, y) * 111320;
}

const MAX_PARENT_STATION_DISTANCE_METERS = 200;
function matchGtfsEntrancesToRequestStops(entrances, patterns, requestStops) {
  var _a;
  const projectionsByParent = /* @__PURE__ */ new Map();
  for (const projection of patterns.flatMap((pattern) => pattern.projections)) {
    const projections = (_a = projectionsByParent.get(projection.stopId)) != null ? _a : [];
    projections.push(projection.coordinate);
    projectionsByParent.set(projection.stopId, projections);
  }
  return entrances.flatMap((entrance) => {
    const exact = requestStops.find(
      (stop) => areSameStopReferences(entrance.parentStopId, stop.id)
    );
    if (exact) return [{ ...entrance, parentStopId: exact.id }];
    const parentProjections = projectionsByParent.get(entrance.parentStopId);
    if (!(parentProjections == null ? void 0 : parentProjections.length)) return [];
    const nearest = requestStops.map((stop) => ({
      stop,
      distance: Math.min(
        ...parentProjections.map((projection) => distanceMeters(projection, stop))
      )
    })).sort((left, right) => left.distance - right.distance)[0];
    return nearest && nearest.distance <= MAX_PARENT_STATION_DISTANCE_METERS ? [{ ...entrance, parentStopId: nearest.stop.id }] : [];
  });
}
function areSameStopReferences(left, right) {
  const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]/gu, "");
  return normalize(left) === normalize(right);
}
function distanceMeters(left, right) {
  const latitudeRadians = (left.lat + right.lat) / 2 * Math.PI / 180;
  return Math.hypot((right.lon - left.lon) * Math.cos(latitudeRadians), right.lat - left.lat) * 111320;
}

const IDFM_LINE_TRACES_ROOT = "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/traces-des-lignes-de-transport-en-commun-idfm/records";
const IDFM_RAIL_TRACES_ROOT = "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/traces-du-reseau-ferre-idf/records";
const PROVIDER_TIMEOUT_MS = 4500;
const PUBLIC_TRACE_CACHE_TTL_MS = 7 * 24 * 60 * 6e4;
const NAVITIA_CACHE_TTL_MS = 30 * 24 * 60 * 6e4;
const NAVITIA_BREAKER_FAILURES = 3;
const NAVITIA_BREAKER_DURATION_MS = 5 * 6e4;
const GTFS_GEOMETRY_CACHE_ENTRIES = 128;
const GTFS_GEOMETRY_ALGORITHM_VERSION = 11;
const GTFS_SIBLING_RELEVANCE_METERS = 2e3;
const traceCache = /* @__PURE__ */ new Map();
const navitiaCache = /* @__PURE__ */ new Map();
const gtfsGeometryCache = /* @__PURE__ */ new Map();
let navitiaFailureCount = 0;
let navitiaCircuitOpenUntil = 0;
async function resolveLineGeometry(event, request) {
  const providers = createDefaultLineGeometryProviders(event);
  const resolution = await resolveLineGeometryWithProviders(request, providers);
  if (request.useGtfs !== false && resolution.source !== "gtfs") {
    const artifact = await loadGtfsLineArtifact(event, request.lineId).catch(
      () => void 0
    );
    if (artifact == null ? void 0 : artifact.entrances.length) {
      resolution.entrances = matchGtfsEntrancesToRequestStops(
        artifact.entrances,
        artifact.patterns,
        request.stops
      );
    }
  }
  resolution.attempts.filter((attempt) => attempt.status === "error").forEach((attempt) => {
    var _a;
    console.warn(
      `[line-geometry] provider=${attempt.source} failed reason=${(_a = attempt.reason) != null ? _a : "unknown"}`
    );
  });
  const continuity = measureLineGeometryContinuity(resolution.segments);
  console.info(
    `[line-geometry] line=${request.lineId} source=${resolution.source} points=${continuity.pointCount} maxStep=${continuity.maxCoordinateStepMeters.toFixed(1)}m maxJoinGap=${continuity.maxSharedStopGapMeters.toFixed(1)}m attempts=${resolution.attempts.map((attempt) => `${attempt.source}:${attempt.status}`).join(",")}`
  );
  return resolution;
}
function createDefaultLineGeometryProviders(event) {
  return [
    createGtfsProvider(event),
    createIdfmLineTracesProvider(event),
    createPrimNavitiaProvider(event),
    createDirectLineGeometryProvider()
  ];
}
function createGtfsProvider(event) {
  return {
    source: "gtfs",
    enabled: (request) => request.useGtfs !== false && isGtfsEnabled(event),
    resolve: async (request) => {
      var _a;
      const [manifest, exactArtifact, exactCompiled, labelArtifacts, aliasArtifacts] = await Promise.all([
        getGtfsManifest(event),
        loadGtfsLineArtifact(event, request.lineId),
        loadCompiledGtfsLineArtifact(event, request.lineId),
        request.lineLabel ? loadGtfsLineArtifactsByLabel(event, request.lineLabel) : Promise.resolve([]),
        Promise.all(
          getGtfsLineAliasCandidates(request.lineId).map(
            (lineId) => loadGtfsLineArtifact(event, lineId)
          )
        )
      ]);
      const artifact = (_a = exactArtifact != null ? exactArtifact : aliasArtifacts.find(
        (candidate) => candidate !== void 0 && isGtfsArtifactRelevantToRequest(candidate, request)
      )) != null ? _a : labelArtifacts.find((candidate) => isGtfsArtifactRelevantToRequest(candidate, request));
      const compiled = (artifact == null ? void 0 : artifact.lineId) === (exactArtifact == null ? void 0 : exactArtifact.lineId) ? exactCompiled : artifact ? await loadCompiledGtfsLineArtifact(event, artifact.lineId) : void 0;
      if (!manifest || !artifact || !compiled) {
        return { status: "unavailable", reason: "not_installed" };
      }
      const artifacts = dedupeGtfsArtifacts([
        artifact,
        exactArtifact,
        ...aliasArtifacts,
        ...labelArtifacts
      ].filter((candidate) => Boolean(candidate))).filter(
        (candidate) => candidate.lineId === artifact.lineId || isGtfsArtifactCompatibleWithRequestedLine(candidate, artifact) && isGtfsArtifactRelevantToRequest(candidate, request)
      );
      const cacheKey = createGtfsGeometryCacheKey(manifest, request);
      const cached = readGtfsGeometryCache(cacheKey);
      if (cached) return { status: "success", geometry: cached };
      const segments = createSegmentsFromIndexedGtfs(request, compiled);
      const entrances = matchGtfsEntrancesToRequestStops(
        artifacts.flatMap((candidate) => candidate.entrances),
        artifacts.flatMap((candidate) => candidate.patterns),
        request.stops
      );
      const traces = artifacts.flatMap(
        (candidate) => Object.values(candidate.shapes)
      );
      let geometry;
      if (segments) {
        geometry = {
          schemaVersion: 1,
          source: "gtfs",
          topology: "requested",
          datasetVersion: manifest.datasetVersion,
          generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          stops: request.stops,
          branches: request.branches,
          segments,
          entrances
        };
      } else {
        geometry = createGeometryFromTraces("gtfs", request, traces, {
          datasetVersion: manifest.datasetVersion,
          entrances
        });
        if (!geometry) {
          const railTraces = await loadIdfmRailTraces(
            event,
            normalizeIdfmRouteId(request.lineId)
          ).catch(() => []);
          geometry = createPartiallyResolvedGtfsGeometry(
            request,
            compiled,
            traces,
            railTraces,
            manifest.datasetVersion,
            entrances
          );
        }
      }
      if (!geometry) return { status: "miss", reason: "shape_projection_failed" };
      writeGtfsGeometryCache(cacheKey, geometry);
      return {
        status: "success",
        geometry
      };
    }
  };
}
function createPartiallyResolvedGtfsGeometry(request, compiled, traces, railTraces, datasetVersion, entrances) {
  var _a, _b, _c, _d;
  const gtfsSegments = /* @__PURE__ */ new Map();
  for (const branch of request.branches) {
    for (let index = 0; index < branch.stopIds.length - 1; index += 1) {
      const fromStopId = branch.stopIds[index];
      const toStopId = branch.stopIds[index + 1];
      const edgeKey = createUndirectedEdgeKey(fromStopId, toStopId);
      if (gtfsSegments.has(edgeKey)) continue;
      const edgeRequest = {
        ...request,
        branches: [
          {
            id: edgeKey,
            direction: branch.direction,
            stopIds: [fromStopId, toStopId]
          }
        ]
      };
      const gtfsSegment = (_c = (_a = createSegmentsFromIndexedGtfs(edgeRequest, compiled)) == null ? void 0 : _a[0]) != null ? _c : (_b = createSegmentsFromTraces(edgeRequest, traces)) == null ? void 0 : _b[0];
      const segment = gtfsSegment != null ? gtfsSegment : (_d = createSegmentsFromTraces(edgeRequest, railTraces)) == null ? void 0 : _d[0];
      if (segment) {
        gtfsSegments.set(
          edgeKey,
          gtfsSegment ? segment : { ...segment, fallback: true }
        );
      }
    }
  }
  if (gtfsSegments.size === 0) return void 0;
  return {
    schemaVersion: 1,
    source: "gtfs",
    topology: "requested",
    datasetVersion,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    stops: request.stops,
    branches: request.branches,
    segments: createDirectLineGeometry(request).segments.map(
      (segment) => {
        var _a2;
        return (_a2 = gtfsSegments.get(
          createUndirectedEdgeKey(segment.fromStopId, segment.toStopId)
        )) != null ? _a2 : { ...segment, fallback: true };
      }
    ),
    entrances
  };
}
function createGtfsGeometryCacheKey(manifest, request) {
  var _a;
  return JSON.stringify([
    GTFS_GEOMETRY_ALGORITHM_VERSION,
    manifest.sha256,
    manifest.cacheGeneration,
    request.lineId,
    (_a = request.lineLabel) != null ? _a : "",
    request.stops.map(({ id, lon, lat }) => [
      id,
      Number(lon.toFixed(7)),
      Number(lat.toFixed(7))
    ]),
    request.branches.map(({ id, direction, stopIds }) => [
      id,
      direction != null ? direction : "",
      stopIds
    ])
  ]);
}
function dedupeGtfsArtifacts(artifacts) {
  return [...new Map(artifacts.map((artifact) => [artifact.lineId, artifact])).values()];
}
function isGtfsArtifactCompatibleWithRequestedLine(candidate, requested) {
  if (!isReplacementGtfsArtifact(requested) && isReplacementGtfsArtifact(candidate)) {
    return false;
  }
  if (requested.routeTypes.length === 0 || candidate.routeTypes.length === 0) {
    return true;
  }
  const requestedRouteTypes = new Set(requested.routeTypes);
  return candidate.routeTypes.some(
    (routeType) => requestedRouteTypes.has(routeType)
  );
}
function isReplacementGtfsArtifact(artifact) {
  return artifact.labels.some(
    (label) => normalizeGtfsLineLabel(label).split(" ").includes("remplacement")
  );
}
function isGtfsArtifactRelevantToRequest(artifact, request) {
  return Object.values(artifact.shapes).some(
    (shape) => shape.some(
      (coordinate) => request.stops.some(
        (stop) => coordinateDistanceMeters(coordinate, stop) <= GTFS_SIBLING_RELEVANCE_METERS
      )
    )
  );
}
function coordinateDistanceMeters(left, right) {
  const averageLatRadians = (left.lat + right.lat) * Math.PI / 360;
  const dx = (left.lon - right.lon) * 111320 * Math.cos(averageLatRadians);
  const dy = (left.lat - right.lat) * 110540;
  return Math.hypot(dx, dy);
}
function readGtfsGeometryCache(key) {
  const cached = gtfsGeometryCache.get(key);
  if (!cached) return void 0;
  gtfsGeometryCache.delete(key);
  gtfsGeometryCache.set(key, cached);
  return cached;
}
function writeGtfsGeometryCache(key, geometry) {
  gtfsGeometryCache.set(key, geometry);
  while (gtfsGeometryCache.size > GTFS_GEOMETRY_CACHE_ENTRIES) {
    const oldestKey = gtfsGeometryCache.keys().next().value;
    if (oldestKey === void 0) break;
    gtfsGeometryCache.delete(oldestKey);
  }
}
function createIdfmLineTracesProvider(event) {
  return {
    source: "idfm-line-traces",
    resolve: async (request) => {
      const routeId = normalizeIdfmRouteId(request.lineId);
      const traces = await loadIdfmLineTraces(event, routeId);
      if (traces.length === 0) return { status: "miss", reason: "no_public_trace" };
      const geometry = createGeometryFromTraces("idfm-line-traces", request, traces);
      if (!geometry) return { status: "miss", reason: "trace_projection_failed" };
      return {
        status: "success",
        geometry
      };
    }
  };
}
function createPrimNavitiaProvider(event) {
  return {
    source: "prim-navitia",
    resolve: async (request) => {
      const apiKey = getServerIdfmApiKey(event);
      if (!apiKey) return { status: "unavailable", reason: "api_key_missing" };
      const lineId = normalizeNavitiaLineId(request.lineId);
      const traces = await loadNavitiaLineTraces(event, lineId, apiKey);
      if (traces.length === 0) return { status: "miss", reason: "no_geojson" };
      const geometry = createGeometryFromTraces("prim-navitia", request, traces);
      if (!geometry) return { status: "miss", reason: "geojson_projection_failed" };
      return {
        status: "success",
        geometry
      };
    }
  };
}
function createGeometryFromTraces(source, request, traces, options = {}) {
  var _a;
  const projectedSegments = createSegmentsFromTraces(request, traces);
  const completeSegments = projectedSegments != null ? projectedSegments : createCompleteSegmentsFromTraces(request, traces);
  if (!completeSegments) return void 0;
  return {
    schemaVersion: 1,
    source,
    topology: "requested",
    datasetVersion: options.datasetVersion,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    stops: request.stops,
    branches: request.branches,
    segments: completeSegments,
    entrances: (_a = options.entrances) != null ? _a : []
  };
}
async function loadIdfmLineTraces(event, routeId) {
  const cacheKey = await createPersistentTraceCacheKey(event, "idfm", routeId);
  const cached = await readPersistentTraceCache(event, traceCache, cacheKey);
  if (cached) return cached;
  const url = new URL(IDFM_LINE_TRACES_ROOT);
  url.searchParams.set("select", "route_id,shape");
  url.searchParams.set("where", `route_id="${routeId}"`);
  url.searchParams.set("limit", "20");
  const response = await fetchWithTimeout$1(url.toString(), {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`IDFM line traces HTTP ${response.status}`);
  const traces = extractGeoJsonTraces(await response.json());
  await writePersistentTraceCache(event, traceCache, cacheKey, traces, PUBLIC_TRACE_CACHE_TTL_MS);
  return traces;
}
async function loadIdfmRailTraces(event, routeId) {
  const commercialLineRef = routeId.replace(/^IDFM:/iu, "");
  const cacheKey = await createPersistentTraceCacheKey(
    event,
    "idfm-rail",
    commercialLineRef
  );
  const cached = await readPersistentTraceCache(event, traceCache, cacheKey);
  if (cached) return cached;
  const url = new URL(IDFM_RAIL_TRACES_ROOT);
  url.searchParams.set("select", "idrefligc,geo_shape");
  url.searchParams.set("where", `idrefligc="${commercialLineRef}"`);
  url.searchParams.set("limit", "100");
  const response = await fetchWithTimeout$1(url.toString(), {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`IDFM rail traces HTTP ${response.status}`);
  const traces = extractGeoJsonTraces(await response.json());
  await writePersistentTraceCache(
    event,
    traceCache,
    cacheKey,
    traces,
    PUBLIC_TRACE_CACHE_TTL_MS
  );
  return traces;
}
async function loadNavitiaLineTraces(event, lineId, apiKey) {
  const cacheKey = await createPersistentTraceCacheKey(event, "navitia", lineId);
  const cached = await readPersistentTraceCache(event, navitiaCache, cacheKey);
  if (cached) return cached;
  if (navitiaCircuitOpenUntil > Date.now()) {
    throw new Error("PRIM Navitia geometry circuit is temporarily open.");
  }
  const url = `https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/lines/${encodeURIComponent(lineId)}?disable_disruption=true`;
  const response = await fetchWithTimeout$1(url, {
    headers: { Accept: "application/json", apikey: apiKey }
  });
  if (!response.ok) {
    navitiaFailureCount += 1;
    if (navitiaFailureCount >= NAVITIA_BREAKER_FAILURES) {
      navitiaCircuitOpenUntil = Date.now() + NAVITIA_BREAKER_DURATION_MS;
    }
    throw new Error(`PRIM Navitia geometry HTTP ${response.status}`);
  }
  const traces = extractGeoJsonTraces(await response.json());
  navitiaFailureCount = 0;
  navitiaCircuitOpenUntil = 0;
  await writePersistentTraceCache(event, navitiaCache, cacheKey, traces, NAVITIA_CACHE_TTL_MS);
  return traces;
}
async function createPersistentTraceCacheKey(event, provider, lineId) {
  var _a, _b;
  const generation = (_b = (_a = await getGtfsManifest(event).catch(() => void 0)) == null ? void 0 : _a.cacheGeneration) != null ? _b : 0;
  return `${provider}:${generation}:${encodeURIComponent(lineId)}`;
}
async function readPersistentTraceCache(event, memory, key) {
  const cached = memory.get(key);
  if ((cached == null ? void 0 : cached.expiresAt) && cached.expiresAt > Date.now()) return cached.traces;
  const cloudflareKv = getLineGeometryCloudflareKv(event);
  if (cloudflareKv) {
    try {
      const stored = await cloudflareKv.get(`line-geometry:${key}`, "json");
      if (isFreshTraceCache(stored)) {
        memory.set(key, stored);
        return stored.traces;
      }
    } catch {
    }
  }
  try {
    const stored = await useStorage("lineGeometry").getItem(key);
    if ((stored == null ? void 0 : stored.expiresAt) && stored.expiresAt > Date.now() && Array.isArray(stored.traces)) {
      memory.set(key, stored);
      return stored.traces;
    }
  } catch {
  }
  return void 0;
}
async function writePersistentTraceCache(event, memory, key, traces, ttlMs) {
  const value = { expiresAt: Date.now() + ttlMs, traces };
  memory.set(key, value);
  const cloudflareKv = getLineGeometryCloudflareKv(event);
  if (cloudflareKv) {
    try {
      await cloudflareKv.put(`line-geometry:${key}`, JSON.stringify(value), {
        expirationTtl: Math.ceil(ttlMs / 1e3)
      });
      return;
    } catch {
    }
  }
  try {
    await useStorage("lineGeometry").setItem(key, value);
  } catch {
  }
}
function isFreshTraceCache(value) {
  return Boolean((value == null ? void 0 : value.expiresAt) && value.expiresAt > Date.now() && Array.isArray(value.traces));
}
function getLineGeometryCloudflareKv(event) {
  var _a, _b;
  return (_b = (_a = event.context.cloudflare) == null ? void 0 : _a.env) == null ? void 0 : _b.LINE_GEOMETRY_CACHE_KV;
}
function extractGeoJsonTraces(payload) {
  const traces = [];
  visit(payload);
  return traces;
  function visit(value) {
    if (Array.isArray(value)) {
      if (isCoordinateLine(value)) {
        const line = value.map(([lon, lat]) => ({ lon: Number(lon), lat: Number(lat) }));
        if (line.length >= 2) traces.push(line);
        return;
      }
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    Object.values(value).forEach(visit);
  }
}
function isCoordinateLine(value) {
  return value.length >= 2 && value.every(
    (coordinate) => Array.isArray(coordinate) && coordinate.length >= 2 && Number.isFinite(Number(coordinate[0])) && Number.isFinite(Number(coordinate[1])) && Math.abs(Number(coordinate[0])) <= 180 && Math.abs(Number(coordinate[1])) <= 90
  );
}
function normalizeNavitiaLineId(value) {
  return value.startsWith("line:") ? value : `line:${value}`;
}
async function fetchWithTimeout$1(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
function normalizeIdfmRouteId(value) {
  return value.replace(/^line:/iu, "");
}

const MAX_STOPS = 240;
const MAX_BRANCHES = 100;
const MAX_BATCH_LINES = 12;
const MAX_BATCH_STOPS = 600;
const MAX_BODY_BYTES = 128e3;
const resolve_post = defineEventHandler(async (event) => {
  const startedAt = performance.now();
  setHeader(event, "Cache-Control", "no-store");
  const declaredLength = Number(getRequestHeader(event, "content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    throw invalidRequest("Request body is too large.", 413);
  }
  const body = await readBody(event);
  if (JSON.stringify(body).length > MAX_BODY_BYTES) {
    throw invalidRequest("Request body is too large.", 413);
  }
  const payload = parseResolveRequests(body);
  const results = [];
  for (const request of payload.requests) {
    results.push(await resolveLineGeometry(event, request));
  }
  setHeader(
    event,
    "Server-Timing",
    `line-geometry;dur=${(performance.now() - startedAt).toFixed(1)}`
  );
  return payload.batched ? { results } : results[0];
});
function parseResolveRequests(value) {
  if (isRecord(value) && Array.isArray(value.requests)) {
    if (value.requests.length === 0 || value.requests.length > MAX_BATCH_LINES) {
      throw invalidRequest(`requests must contain 1 to ${MAX_BATCH_LINES} lines.`);
    }
    const requests = value.requests.map(parseRequest);
    const stopCount = requests.reduce((total, request) => total + request.stops.length, 0);
    if (stopCount > MAX_BATCH_STOPS) {
      throw invalidRequest(`A batch cannot contain more than ${MAX_BATCH_STOPS} stops.`);
    }
    return { batched: true, requests };
  }
  return { batched: false, requests: [parseRequest(value)] };
}
function parseRequest(value) {
  if (!isRecord(value) || typeof value.lineId !== "string") {
    throw invalidRequest("lineId is required.");
  }
  if (!Array.isArray(value.stops) || value.stops.length < 2 || value.stops.length > MAX_STOPS) {
    throw invalidRequest(`stops must contain between 2 and ${MAX_STOPS} entries.`);
  }
  if (!Array.isArray(value.branches) || value.branches.length < 1 || value.branches.length > MAX_BRANCHES) {
    throw invalidRequest(`branches must contain between 1 and ${MAX_BRANCHES} entries.`);
  }
  const stops = value.stops.map((stop) => {
    if (!isRecord(stop) || typeof stop.id !== "string" || !Number.isFinite(Number(stop.lon)) || !Number.isFinite(Number(stop.lat))) {
      throw invalidRequest("Every stop requires id, lon and lat.");
    }
    const lon = Number(stop.lon);
    const lat = Number(stop.lat);
    if (Math.abs(lon) > 180 || Math.abs(lat) > 90) {
      throw invalidRequest("Stop coordinates are outside WGS84 bounds.");
    }
    return {
      id: stop.id.slice(0, 180),
      ...typeof stop.label === "string" ? { label: stop.label.slice(0, 240) } : {},
      lon,
      lat
    };
  });
  const knownStops = new Set(stops.map((stop) => stop.id));
  const branches = value.branches.map((branch) => {
    if (!isRecord(branch) || typeof branch.id !== "string" || !Array.isArray(branch.stopIds)) {
      throw invalidRequest("Every branch requires id and stopIds.");
    }
    const stopIds = branch.stopIds.filter((id) => typeof id === "string");
    if (stopIds.length < 2 || stopIds.length !== branch.stopIds.length || stopIds.some((id) => !knownStops.has(id))) {
      throw invalidRequest("Branch stopIds must reference submitted stops.");
    }
    return {
      id: branch.id.slice(0, 180),
      ...typeof branch.direction === "string" ? { direction: branch.direction.slice(0, 240) } : {},
      stopIds
    };
  });
  return {
    lineId: value.lineId.slice(0, 180),
    ...typeof value.lineLabel === "string" ? { lineLabel: value.lineLabel.slice(0, 120) } : {},
    useGtfs: value.useGtfs !== false,
    stops,
    branches
  };
}
function invalidRequest(message, statusCode = 400) {
  return createError({
    statusCode,
    statusMessage: message,
    data: { code: "invalid_request" }
  });
}
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const resolve_post$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: resolve_post,
  parseRequest: parseRequest,
  parseResolveRequests: parseResolveRequests
}, Symbol.toStringTag, { value: 'Module' }));

const MAX_STOP_MATCH_DISTANCE_METERS = 450;
function attachGtfsMonitoringRefs(topology, artifact) {
  const stations = new Map(topology.stations.map((station) => [station.id, station]));
  return {
    ...topology,
    patterns: topology.patterns.map(
      (pattern) => attachPatternMonitoringRefs(pattern, stations, artifact.patterns)
    )
  };
}
function attachPatternMonitoringRefs(pattern, stations, gtfsPatterns) {
  const coordinates = pattern.stops.map(
    (stationId, index) => {
      var _a;
      return resolvePatternStopCoordinate(stations.get(stationId), (_a = pattern.quayIds) == null ? void 0 : _a[index]);
    }
  );
  const alignment = gtfsPatterns.map((gtfsPattern) => alignStops(coordinates, gtfsPattern)).filter((candidate) => candidate.matches.length > 0).sort(compareAlignments)[0];
  if (!alignment) return pattern;
  const monitoringRefs = Array(pattern.stops.length).fill(void 0);
  for (const match of alignment.matches) {
    monitoringRefs[match.topologyIndex] = createSiriStopAreaRef(match.stopId);
  }
  return monitoringRefs.some(Boolean) ? { ...pattern, monitoringRefs } : pattern;
}
function resolvePatternStopCoordinate(station, quayId) {
  var _a;
  if (!station) return void 0;
  const quay = quayId ? (_a = station.quays) == null ? void 0 : _a.find((candidate) => candidate.id === quayId) : void 0;
  return resolveTransitLonLat(quay != null ? quay : station);
}
function alignStops(topologyCoordinates, gtfsPattern) {
  var _a, _b, _c;
  const rowCount = topologyCoordinates.length + 1;
  const columnCount = gtfsPattern.projections.length + 1;
  const table = Array.from(
    { length: rowCount },
    () => Array(columnCount).fill(void 0)
  );
  table[0][0] = { matches: [], distanceMeters: 0 };
  for (let topologyIndex = 0; topologyIndex < rowCount; topologyIndex += 1) {
    for (let gtfsIndex = 0; gtfsIndex < columnCount; gtfsIndex += 1) {
      const current = (_a = table[topologyIndex]) == null ? void 0 : _a[gtfsIndex];
      if (!current) continue;
      if (topologyIndex + 1 < rowCount) {
        keepBetterAlignment(table, topologyIndex + 1, gtfsIndex, current);
      }
      if (gtfsIndex + 1 < columnCount) {
        keepBetterAlignment(table, topologyIndex, gtfsIndex + 1, current);
      }
      const coordinate = topologyCoordinates[topologyIndex];
      const projection = gtfsPattern.projections[gtfsIndex];
      if (!coordinate || !projection) continue;
      const distanceMeters = getCoordinatesDistanceMeters(
        coordinate.lat,
        coordinate.lon,
        projection.coordinate.lat,
        projection.coordinate.lon
      );
      if (distanceMeters > MAX_STOP_MATCH_DISTANCE_METERS) continue;
      keepBetterAlignment(table, topologyIndex + 1, gtfsIndex + 1, {
        matches: [
          ...current.matches,
          { topologyIndex, stopId: projection.stopId, distanceMeters }
        ],
        distanceMeters: current.distanceMeters + distanceMeters
      });
    }
  }
  return (_c = (_b = table.at(-1)) == null ? void 0 : _b.at(-1)) != null ? _c : { matches: [], distanceMeters: 0 };
}
function keepBetterAlignment(table, row, column, candidate) {
  var _a;
  const existing = (_a = table[row]) == null ? void 0 : _a[column];
  if (!existing || compareAlignments(candidate, existing) < 0) {
    table[row][column] = candidate;
  }
}
function compareAlignments(left, right) {
  return right.matches.length - left.matches.length || left.distanceMeters - right.distanceMeters;
}
function createSiriStopAreaRef(stopId) {
  var _a, _b;
  const code = (_b = (_a = stopId.match(/^IDFM:(.+)$/iu)) == null ? void 0 : _a[1]) == null ? void 0 : _b.trim();
  return code ? `STIF:StopArea:SP:${code}:` : void 0;
}

const topologyCache = /* @__PURE__ */ new Map();
function getLineTopology(lineId, runtimeEnv) {
  const cacheKey = `${createNetexCacheEnvironmentKey(runtimeEnv)}:${lineId}`;
  const cached = topologyCache.get(cacheKey);
  if (cached && Date.now() <= cached.expiresAt) {
    return cached.promise;
  }
  if (cached) {
    topologyCache.delete(cacheKey);
  }
  const request = getLineTopologyFromNetexCache(lineId, runtimeEnv);
  topologyCache.set(cacheKey, {
    expiresAt: Date.now() + getNetexMemoryCacheTtlMs(runtimeEnv),
    promise: request
  });
  request.catch(() => {
    var _a;
    if (((_a = topologyCache.get(cacheKey)) == null ? void 0 : _a.promise) === request) {
      topologyCache.delete(cacheKey);
    }
  });
  return request;
}

const topology_get = defineEventHandler(async (event) => {
  const lineId = getRouterParam(event, "lineId");
  if (!lineId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing line id."
    });
  }
  try {
    const [topology, gtfsArtifact] = await Promise.all([
      getLineTopology(lineId, getNetexRuntimeEnv(event)),
      loadGtfsLineArtifact(event, lineId).catch(() => void 0)
    ]);
    setHeader(event, "Cache-Control", "public, max-age=21600");
    return gtfsArtifact ? attachGtfsMonitoringRefs(topology, gtfsArtifact) : topology;
  } catch (error) {
    throw createError({
      cause: error,
      statusCode: 404,
      statusMessage: `No topology fixture found for line ${lineId}.`
    });
  }
});

const topology_get$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: topology_get
}, Symbol.toStringTag, { value: 'Module' }));

function segmentId(left, right) {
  return [left, right].sort().join("__");
}

const LINE_PATTERN_VIEW_SCHEMA_VERSION = "topology-layout-v1";

const MAX_PATTERN_VIEW_CACHE_ENTRIES = 512;
const IDFM_MARKETPLACE_BASE = "https://prim.iledefrance-mobilites.fr/marketplace";
const patternViewCache = /* @__PURE__ */ new Map();
const navitiaLinePresentationCache = /* @__PURE__ */ new Map();
async function buildLinePatternView(params) {
  const resolvedLineId = resolveHumanLineId(params.transportType, params.lineId);
  const cacheKey = createPatternViewCacheKey(resolvedLineId, params);
  const cached = patternViewCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const request = (async () => {
    const topology = await getLineTopology(resolvedLineId, params.runtimeEnv);
    const response = buildLinePatternViewFromTopology(params, topology);
    return applyNavitiaLinePresentation(response, topology, params);
  })();
  patternViewCache.set(cacheKey, request);
  trimPatternViewCache();
  request.catch(() => {
    patternViewCache.delete(cacheKey);
  });
  return request;
}
function buildLinePatternViewFromTopology(params, topology) {
  var _a, _b, _c, _d;
  const orientedPattern = resolveOrientedPattern(
    topology,
    (_a = params.directionId) != null ? _a : ""
  );
  const startStation = (_c = findStationInPattern(orientedPattern.stops, [
    ...(_b = params.startStationCandidates) != null ? _b : [],
    params.startStationId
  ])) != null ? _c : orientedPattern.stops[0];
  const startIndex = Math.max(
    0,
    orientedPattern.stops.findIndex((station) => station.id === startStation.id)
  );
  const activeStops = orientedPattern.stops.slice(startIndex);
  const activeIds = new Set(activeStops.map((station) => station.id));
  const currentId = (_d = activeStops[0]) == null ? void 0 : _d.id;
  const stationStatuses = topology.stations.map(
    (station) => createStationStatus(station, activeIds, currentId, activeStops)
  );
  const calls = createPatternCalls(topology.stations, activeStops, stationStatuses);
  const lineTopology = convertTopologyToLineRouteSequences(topology);
  const activeSegmentIds = createActiveSegmentIds(activeStops);
  const line = createLineConfig(topology, params.transportType);
  const board = createBoard(topology, line, startStation);
  const departure = createDeparture(
    topology,
    board,
    orientedPattern.destination,
    startStation
  );
  const pattern = {
    departureId: departure.id,
    destination: orientedPattern.destination.name,
    serviceType: inferPatternServiceType(activeStops, lineTopology),
    calls,
    lineTopology,
    lineTopologyLayout: createLineTopologyLayout(topology)
  };
  return {
    lineId: topology.line.id,
    transportType: params.transportType,
    directionId: orientedPattern.directionId,
    directionOptions: createDirectionOptions(topology),
    startStationId: startStation.id,
    activeSegmentIds,
    stationStatuses,
    board,
    departure,
    pattern
  };
}
function createLineTopologyLayout(topology) {
  var _a;
  return {
    loops: topology.loops.map(
      (loop) => ({
        id: loop.id,
        kind: loop.kind,
        anchorStationIds: [...loop.anchorStationIds],
        segmentIds: [...loop.segmentIds],
        stationIds: [...loop.stationIds],
        orderedAnchorStationIds: [...loop.orderedAnchorStationIds],
        orderedSegmentIds: [...loop.orderedSegmentIds],
        orderedStationIds: [...loop.orderedStationIds],
        laneHints: loop.laneHints.map((hint) => ({
          id: hint.id,
          role: hint.role,
          anchorStationIds: [...hint.anchorStationIds],
          segmentIds: [...hint.segmentIds],
          stationIds: [...hint.stationIds],
          lane: hint.lane,
          side: hint.side
        }))
      })
    ),
    terminalJunctions: ((_a = topology.terminalJunctions) != null ? _a : []).map(
      (junction) => ({
        id: junction.id,
        junctionStationId: junction.junctionStationId,
        direction: junction.direction,
        axisDegrees: junction.axisDegrees,
        arms: junction.arms.map((arm) => ({
          id: arm.id,
          anchorStationId: arm.anchorStationId,
          stationIds: [...arm.stationIds],
          direction: arm.direction,
          side: arm.side,
          angleDegrees: arm.angleDegrees
        }))
      })
    )
  };
}
function createDirectionOptions(topology) {
  const stations = new Map(topology.stations.map((station) => [station.id, station]));
  const directions = /* @__PURE__ */ new Map();
  topology.patterns.forEach((pattern) => {
    [pattern.stops[0], pattern.stops[pattern.stops.length - 1]].forEach(
      (stationId) => {
        const station = stations.get(stationId);
        if (station) {
          directions.set(station.id, {
            id: station.id,
            label: station.name,
            isTerminal: true
          });
        }
      }
    );
  });
  return Array.from(directions.values()).sort(
    (left, right) => left.label.localeCompare(right.label, "fr")
  );
}
function inferPatternServiceType(activeStops, lineTopology) {
  var _a;
  const servedStopsCount = activeStops.length;
  const routeStopsCount = (_a = countTopologyCorridorStops(activeStops, lineTopology)) != null ? _a : servedStopsCount;
  return getServiceType(servedStopsCount, routeStopsCount);
}
function getServiceType(servedStopsCount, routeStopsCount) {
  if (servedStopsCount <= 2 && routeStopsCount > 2) {
    return "direct";
  }
  if (servedStopsCount < Math.max(2, routeStopsCount - 1)) {
    return "semi-direct";
  }
  return "omnibus";
}
function countTopologyCorridorStops(activeStops, lineTopology) {
  var _a, _b;
  if (activeStops.length <= 1) {
    return activeStops.length;
  }
  const firstStopId = (_a = activeStops[0]) == null ? void 0 : _a.id;
  const lastStopId = (_b = activeStops[activeStops.length - 1]) == null ? void 0 : _b.id;
  if (!firstStopId || !lastStopId) {
    return void 0;
  }
  const activeIds = new Set(activeStops.map((station) => station.id));
  const sameSequenceCandidate = lineTopology.map((sequence) => sequence.stops.map((stop) => stop.id)).flatMap((stationIds) => {
    const firstIndex = stationIds.indexOf(firstStopId);
    const lastIndex = stationIds.indexOf(lastStopId);
    if (firstIndex < 0 || lastIndex < 0 || firstIndex === lastIndex) {
      return [];
    }
    const startIndex = Math.min(firstIndex, lastIndex);
    const endIndex = Math.max(firstIndex, lastIndex);
    const corridor = stationIds.slice(startIndex, endIndex + 1);
    return [
      {
        count: corridor.length,
        activeMatches: corridor.filter((stationId) => activeIds.has(stationId)).length
      }
    ];
  }).sort(
    (left, right) => right.activeMatches - left.activeMatches || right.count - left.count
  )[0];
  if (sameSequenceCandidate) {
    return sameSequenceCandidate.count;
  }
  return findShortestTopologyPathLength(firstStopId, lastStopId, lineTopology);
}
function findShortestTopologyPathLength(source, target, lineTopology) {
  var _a;
  if (source === target) {
    return 1;
  }
  const neighbors = /* @__PURE__ */ new Map();
  lineTopology.forEach((sequence) => {
    sequence.stops.slice(0, -1).forEach((stop, index) => {
      addTopologyNeighbor(neighbors, stop.id, sequence.stops[index + 1].id);
      addTopologyNeighbor(neighbors, sequence.stops[index + 1].id, stop.id);
    });
  });
  const queue = [
    { stationId: source, distance: 1 }
  ];
  const visited = /* @__PURE__ */ new Set([source]);
  while (queue.length > 0) {
    const current = queue.shift();
    for (const neighbor of (_a = neighbors.get(current.stationId)) != null ? _a : []) {
      if (visited.has(neighbor)) {
        continue;
      }
      const distance = current.distance + 1;
      if (neighbor === target) {
        return distance;
      }
      visited.add(neighbor);
      queue.push({ stationId: neighbor, distance });
    }
  }
  return void 0;
}
function addTopologyNeighbor(neighbors, source, target) {
  if (!neighbors.has(source)) {
    neighbors.set(source, /* @__PURE__ */ new Set());
  }
  neighbors.get(source).add(target);
}
function resolveHumanLineId(transportType, lineId) {
  return resolveKnownLineAlias(transportType, lineId);
}
function createPatternViewCacheKey(resolvedLineId, params) {
  var _a;
  return JSON.stringify({
    lineId: resolvedLineId,
    netexCache: createNetexCacheEnvironmentKey(params.runtimeEnv),
    presentation: getRuntimeIdfmApiKey(params.runtimeEnv) ? "idfm" : "fallback",
    schemaVersion: LINE_PATTERN_VIEW_SCHEMA_VERSION,
    citySource: "netex-town-v1",
    transportType: normalizeId(params.transportType),
    directionId: normalizeId(params.directionId),
    startStationId: normalizeId(params.startStationId),
    startStationCandidates: ((_a = params.startStationCandidates) != null ? _a : []).map(normalizeId)
  });
}
function trimPatternViewCache() {
  while (patternViewCache.size > MAX_PATTERN_VIEW_CACHE_ENTRIES) {
    const oldestKey = patternViewCache.keys().next().value;
    if (!oldestKey) {
      return;
    }
    patternViewCache.delete(oldestKey);
  }
}
function resolveOrientedPattern(topology, directionId) {
  var _a;
  const stations = new Map(topology.stations.map((station) => [station.id, station]));
  const normalizedDirection = normalizeId(directionId);
  const candidates = topology.patterns.flatMap((pattern) => {
    const first = stations.get(pattern.stops[0]);
    const last = stations.get(pattern.stops[pattern.stops.length - 1]);
    if (!first || !last) {
      return [];
    }
    return [
      {
        pattern,
        destination: last,
        stops: pattern.stops,
        score: scoreDirectionMatch(pattern, last, normalizedDirection)
      },
      {
        pattern,
        destination: first,
        stops: [...pattern.stops].reverse(),
        score: scoreDirectionMatch(pattern, first, normalizedDirection)
      }
    ];
  }).filter((candidate) => !normalizedDirection || candidate.score > 0).sort(
    (left, right) => right.score - left.score || right.pattern.tripCount - left.pattern.tripCount
  );
  const selected = (_a = candidates[0]) != null ? _a : topology.patterns.flatMap((pattern) => {
    const stops2 = pattern.stops.flatMap((stationId) => {
      const station = stations.get(stationId);
      return station ? [station] : [];
    });
    const destination = stops2[stops2.length - 1];
    return destination ? [
      {
        pattern,
        destination,
        stops: pattern.stops,
        score: 0
      }
    ] : [];
  })[0];
  if (!selected) {
    throw new Error(`No displayable pattern for ${topology.line.name}`);
  }
  const stops = selected.stops.flatMap((stationId) => {
    const station = stations.get(stationId);
    return station ? [station] : [];
  });
  return {
    directionId: selected.destination.id,
    destination: selected.destination,
    sourcePattern: selected.pattern,
    stops
  };
}
function scoreDirectionMatch(pattern, destination, normalizedDirection) {
  if (!normalizedDirection) {
    return pattern.tripCount;
  }
  const destinationValues = [destination.id, destination.name].map(normalizeId);
  if (destinationValues.some((value) => value === normalizedDirection)) {
    return 200;
  }
  if (destinationValues.some(
    (value) => value.includes(normalizedDirection) || normalizedDirection.includes(value)
  )) {
    return 150;
  }
  return normalizeId(pattern.id) === normalizedDirection ? 90 : 0;
}
function findStationInPattern(stations, stationCandidates) {
  const normalizedStations = stationCandidates.map(normalizeId).filter(Boolean);
  if (normalizedStations.length === 0) {
    return void 0;
  }
  const stationEntries = stations.map((station) => {
    var _a;
    return {
      station,
      candidates: [station.id, station.name, ...(_a = station.aliases) != null ? _a : []].map(
        normalizeId
      )
    };
  });
  for (const normalizedStation of normalizedStations) {
    const exactMatch = stationEntries.find(
      ({ candidates }) => candidates.some((candidate) => candidate === normalizedStation)
    );
    if (exactMatch) {
      return exactMatch.station;
    }
  }
  for (const normalizedStation of normalizedStations) {
    const fuzzyMatch = stationEntries.find(
      ({ candidates }) => candidates.some(
        (candidate) => candidate.includes(normalizedStation) || normalizedStation.includes(candidate)
      )
    );
    if (fuzzyMatch) {
      return fuzzyMatch.station;
    }
  }
  return void 0;
}
function createStationStatus(station, activeIds, currentId, activeStops) {
  const activeIndex = activeStops.findIndex((activeStop) => activeStop.id === station.id);
  const status = station.id === currentId ? "current" : activeIds.has(station.id) ? "served" : "not_served";
  return {
    id: station.id,
    label: station.name,
    status,
    current: status === "current",
    served: status === "current" || status === "served",
    order: activeIndex >= 0 ? activeIndex : void 0
  };
}
function createPatternCalls(stations, activeStops, stationStatuses) {
  const stationsById = new Map(stations.map((station) => [station.id, station]));
  const statusesById = new Map(stationStatuses.map((status) => [status.id, status]));
  const emitted = /* @__PURE__ */ new Set();
  const orderedStations = [
    ...activeStops,
    ...stations.filter((station) => !activeStops.some((active) => active.id === station.id))
  ];
  return orderedStations.flatMap((station) => {
    var _a, _b;
    if (emitted.has(station.id)) {
      return [];
    }
    emitted.add(station.id);
    const resolvedStation = (_a = stationsById.get(station.id)) != null ? _a : station;
    const status = statusesById.get(station.id);
    return [
      {
        id: `call:${resolvedStation.id}`,
        label: resolvedStation.name,
        city: resolvedStation.city,
        current: Boolean(status == null ? void 0 : status.current),
        served: Boolean(status == null ? void 0 : status.served),
        status: (_b = status == null ? void 0 : status.status) != null ? _b : "unknown",
        stopAreaRef: resolvedStation.id
      }
    ];
  });
}
function createActiveSegmentIds(activeStops) {
  return activeStops.slice(0, -1).map(
    (station, index) => segmentId(station.id, activeStops[index + 1].id)
  );
}
function convertTopologyToLineRouteSequences(topology) {
  const stations = new Map(topology.stations.map((station) => [station.id, station]));
  const segmentSequences = topology.segments.map((segment) => {
    const from = stations.get(segment.from);
    const to = stations.get(segment.to);
    if (!from || !to) {
      return void 0;
    }
    return {
      id: segment.id,
      label: `${from.name} - ${to.name}`,
      direction: to.name,
      topologySource: "server",
      stops: [from, to].map((station) => createLineRouteStop(station))
    };
  }).filter((sequence) => Boolean(sequence));
  const branchSequences = topology.branches.map((branch) => {
    const stops = branch.stops.flatMap((stationId) => {
      const station = stations.get(stationId);
      return station ? [createLineRouteStop(station)] : [];
    });
    const from = stations.get(branch.from);
    const to = stations.get(branch.to);
    if (!from || !to || stops.length < 2) {
      return void 0;
    }
    return {
      id: branch.id,
      label: `${from.name} - ${to.name}`,
      direction: to.name,
      branchLayout: branch.layout,
      topologySource: "server",
      stops
    };
  }).filter((sequence) => Boolean(sequence));
  if (segmentSequences.length > 0) {
    return [...segmentSequences, ...branchSequences];
  }
  return topology.patterns.map((pattern) => {
    const stops = pattern.stops.flatMap((stationId) => {
      const station = stations.get(stationId);
      if (!station) {
        return [];
      }
      return [createLineRouteStop(station)];
    });
    return {
      id: pattern.id,
      label: `${pattern.terminalFrom} - ${pattern.terminalTo}`,
      direction: pattern.terminalTo,
      topologySource: "server",
      stops
    };
  }).filter((sequence) => sequence.stops.length > 1);
}
function createLineRouteStop(station) {
  const searchStation = {
    id: station.id,
    label: station.name,
    city: station.city,
    monitoringRef: "",
    scheduleStopAreaRef: station.id
  };
  return {
    id: station.id,
    label: station.name,
    city: station.city,
    lat: station.lat,
    lon: station.lon,
    projectedX: station.projectedX,
    projectedY: station.projectedY,
    station: searchStation
  };
}
function createLineConfig(topology, transportType) {
  var _a, _b;
  const mode = (_b = (_a = toTransitMode(transportType)) != null ? _a : toTransitMode(topology.line.mode)) != null ? _b : "train";
  const presentation = createLinePresentation({
    code: topology.line.shortName,
    id: topology.line.id,
    mode,
    ref: topology.line.id,
    shortName: topology.line.shortName
  });
  return {
    ref: topology.line.id,
    shortName: topology.line.shortName,
    longName: createDisplayLineName(mode, topology.line.shortName, topology.line.name),
    mode,
    color: presentation.color,
    textColor: presentation.textColor,
    iconUrl: presentation.iconUrl,
    iconUrls: presentation.iconUrls
  };
}
async function applyNavitiaLinePresentation(response, topology, params) {
  const presentation = await fetchNavitiaLinePresentation$1(
    topology.line.id,
    params
  ).catch(() => void 0);
  if (!presentation) {
    return response;
  }
  return {
    ...response,
    board: {
      ...response.board,
      line: {
        ...response.board.line,
        ...presentation
      }
    }
  };
}
async function fetchNavitiaLinePresentation$1(lineId, params) {
  const apiKey = getRuntimeIdfmApiKey(params.runtimeEnv);
  if (!apiKey) {
    return void 0;
  }
  const cacheKey = `${lineId}:${normalizeId(params.transportType)}`;
  const cached = navitiaLinePresentationCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const request = fetchNavitiaLine(lineId, apiKey).then((line) => {
    var _a, _b, _c, _d, _e, _f, _g;
    if (!line) {
      return void 0;
    }
    return createLinePresentation({
      code: (_a = line.code) != null ? _a : line.name,
      color: line.color,
      id: line.id,
      mode: (_f = (_c = toTransitMode(params.transportType)) != null ? _c : toTransitMode((_b = line.commercial_mode) == null ? void 0 : _b.name)) != null ? _f : toTransitMode((_e = (_d = line.physical_modes) == null ? void 0 : _d[0]) == null ? void 0 : _e.name),
      ref: line.id,
      shortName: (_g = line.code) != null ? _g : line.name,
      textColor: line.text_color
    });
  });
  navitiaLinePresentationCache.set(cacheKey, request);
  request.catch(() => {
    navitiaLinePresentationCache.delete(cacheKey);
  });
  return request;
}
async function fetchNavitiaLine(lineId, apiKey) {
  var _a;
  const url = new URL(
    `${IDFM_MARKETPLACE_BASE}/v2/navitia/lines/${encodeURIComponent(lineId)}`
  );
  url.searchParams.set("disable_disruption", "true");
  url.searchParams.set("disable_geojson", "true");
  const response = await fetch(url, {
    headers: {
      apikey: apiKey
    }
  });
  if (!response.ok) {
    return void 0;
  }
  const payload = await response.json();
  return (_a = payload.lines) == null ? void 0 : _a[0];
}
function getRuntimeIdfmApiKey(runtimeEnv) {
  var _a, _b;
  return ((_b = (_a = runtimeEnv == null ? void 0 : runtimeEnv.NUXT_IDFM_API_KEY) != null ? _a : runtimeEnv == null ? void 0 : runtimeEnv.IDFM_API_KEY) != null ? _b : "").trim();
}
function createDisplayLineName(mode, shortName, fallback) {
  if (mode === "metro") {
    return `Metro ${shortName}`;
  }
  if (mode === "rer") {
    return `RER ${shortName}`;
  }
  if (mode === "tram") {
    return `Tram ${shortName}`;
  }
  if (mode === "train") {
    return `Transilien ${shortName}`;
  }
  return fallback;
}
function createBoard(topology, line, startStation) {
  var _a;
  return {
    id: `line-pattern:${topology.line.id}:${startStation.id}`,
    title: startStation.name,
    city: (_a = startStation.city) != null ? _a : startStation.name,
    line,
    monitoringPoints: [
      {
        ref: startStation.id,
        label: startStation.name
      }
    ],
    directionGroups: [],
    schedule: {
      lineRef: topology.line.id,
      stopAreaRef: startStation.id
    },
    maxDepartures: 1
  };
}
function createDeparture(topology, board, destination, startStation) {
  return {
    id: `line-pattern:${topology.line.id}:${startStation.id}:${destination.id}`,
    lineRef: topology.line.id,
    monitoringRef: startStation.id,
    stopName: startStation.name,
    destination: destination.name,
    monitoringLabel: startStation.name,
    vehicleAtStop: false
  };
}
function toTransitMode(mode) {
  const normalized = normalizeId(mode);
  if (normalized.includes("metro")) {
    return "metro";
  }
  if (normalized.includes("tram")) {
    return "tram";
  }
  if (normalized.includes("rer")) {
    return "rer";
  }
  if (normalized.includes("bus")) {
    return "bus";
  }
  if (normalized.includes("rail") || normalized.includes("train") || normalized.includes("transilien")) {
    return "train";
  }
  return void 0;
}
function normalizeId(value) {
  return (value != null ? value : "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " et ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const pattern_get = defineEventHandler(async (event) => {
  const transportType = getRouterParam(event, "transportType");
  const lineId = getRouterParam(event, "lineId");
  const query = getQuery$1(event);
  if (!transportType || !lineId) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing transport type or line id."
    });
  }
  try {
    const startStation = firstQueryValue(query.startStation);
    const request = {
      transportType,
      lineId,
      directionId: firstQueryValue(query.direction),
      runtimeEnv: getNetexRuntimeEnv(event),
      startStationId: startStation,
      startStationCandidates: startStation ? [startStation] : []
    };
    const response = await buildLinePatternView(request);
    setHeader(
      event,
      "Cache-Control",
      "public, max-age=21600, stale-while-revalidate=86400"
    );
    return response;
  } catch (error) {
    throw createError({
      cause: error,
      statusCode: 404,
      statusMessage: `No pattern view found for ${transportType}/${lineId}.`
    });
  }
});
function firstQueryValue(value) {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : void 0;
  }
  return typeof value === "string" ? value : void 0;
}

const pattern_get$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: pattern_get
}, Symbol.toStringTag, { value: 'Module' }));

const MOBILE_RELEASES_PREFIX = "mobile-releases/android";
const MAX_ANDROID_APK_BYTES = 25 * 1024 * 1024;
function getMobileReleasesBucket(event) {
  var _a, _b;
  const context = event.context;
  return (_b = (_a = context.cloudflare) == null ? void 0 : _a.env) == null ? void 0 : _b.MOBILE_RELEASES_BUCKET;
}
function isSourceRevision(value) {
  return /^[a-f0-9]{40}$/iu.test(value);
}
function getAndroidManifestKey(sourceRevision) {
  return `${MOBILE_RELEASES_PREFIX}/${sourceRevision.toLowerCase()}/manifest.json`;
}
async function findAndroidRelease(bucket, requestedRevision) {
  if (!bucket) return { available: false, reason: "not-configured" };
  if (!isSourceRevision(requestedRevision)) {
    return { available: false, reason: "not-found" };
  }
  const sourceRevision = requestedRevision.toLowerCase();
  const object = await bucket.get(getAndroidManifestKey(sourceRevision));
  if (!object) return { available: false, reason: "not-found" };
  let payload;
  try {
    payload = JSON.parse(await object.text());
  } catch {
    return { available: false, reason: "invalid-release" };
  }
  const manifest = parseAndroidReleaseManifest(payload, sourceRevision);
  if (!manifest) return { available: false, reason: "invalid-release" };
  if (manifest.sourceRevision !== sourceRevision) {
    return { available: false, reason: "source-revision-mismatch" };
  }
  return { available: true, manifest };
}
async function findLatestAndroidRelease(bucket) {
  if (!bucket) return { available: false, reason: "not-configured" };
  if (!bucket.list) return { available: false, reason: "not-found" };
  const objects = await bucket.list({ prefix: `${MOBILE_RELEASES_PREFIX}/` });
  const manifestKeys = objects.objects.map((object) => object.key).filter((key) => /^mobile-releases\/android\/([a-f0-9]{40})\/manifest\.json$/iu.test(key));
  const releases = await Promise.all(
    manifestKeys.map(async (key) => {
      var _a, _b;
      const revision = (_b = (_a = key.match(/([a-f0-9]{40})\/manifest\.json$/iu)) == null ? void 0 : _a[1]) == null ? void 0 : _b.toLowerCase();
      if (!revision) return void 0;
      const object = await bucket.get(key);
      if (!object) return void 0;
      try {
        return parseAndroidReleaseManifest(JSON.parse(await object.text()), revision);
      } catch {
        return void 0;
      }
    })
  );
  const validReleases = releases.filter(
    (release) => Boolean(release)
  );
  if (!validReleases.length) {
    return { available: false, reason: manifestKeys.length ? "invalid-release" : "not-found" };
  }
  validReleases.sort(
    (left, right) => Date.parse(right.builtAt) - Date.parse(left.builtAt) || right.versionCode - left.versionCode
  );
  return { available: true, manifest: validReleases[0] };
}
async function getAndroidReleaseStatus(event, requestedRevision) {
  const bucket = getMobileReleasesBucket(event);
  const exactMatch = isSourceRevision(requestedRevision) ? await findAndroidRelease(bucket, requestedRevision) : void 0;
  const result = (exactMatch == null ? void 0 : exactMatch.available) ? exactMatch : await findLatestAndroidRelease(bucket);
  if (!result.available) return result;
  const { manifest } = result;
  return {
    available: true,
    sourceRevision: manifest.sourceRevision,
    versionName: manifest.versionName,
    versionCode: manifest.versionCode,
    builtAt: manifest.builtAt,
    sizeBytes: manifest.sizeBytes,
    sha256: manifest.sha256,
    minSdk: manifest.minSdk,
    selection: (exactMatch == null ? void 0 : exactMatch.available) ? "matching-source" : "latest",
    downloadUrl: `/api/mobile/android/release/download?revision=${encodeURIComponent(manifest.sourceRevision)}`
  };
}
function getAndroidDownloadHeaders(manifest, size) {
  return {
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Type": "application/vnd.android.package-archive",
    "Content-Length": size,
    "Content-Disposition": `attachment; filename="${manifest.fileName}"`,
    "X-Content-Type-Options": "nosniff"
  };
}
function parseAndroidReleaseManifest(value, expectedRevision) {
  if (!value || typeof value !== "object") return void 0;
  const candidate = value;
  const expectedPrefix = `${MOBILE_RELEASES_PREFIX}/${expectedRevision}/`;
  if (candidate.schemaVersion !== 1 || candidate.platform !== "android" || typeof candidate.sourceRevision !== "string" || !isSourceRevision(candidate.sourceRevision) || typeof candidate.versionName !== "string" || !candidate.versionName.trim() || !isPositiveInteger(candidate.versionCode) || !isPositiveInteger(candidate.sizeBytes) || candidate.sizeBytes > MAX_ANDROID_APK_BYTES && candidate.oversizeApproved !== true || !isPositiveInteger(candidate.minSdk) || !isIsoDate(candidate.builtAt) || !isSha256(candidate.sha256) || !isSha256(candidate.signingCertificateSha256) || typeof candidate.oversizeApproved !== "boolean" || typeof candidate.fileName !== "string" || !/^[a-zA-Z0-9._-]+\.apk$/u.test(candidate.fileName) || candidate.objectKey !== `${expectedPrefix}${candidate.fileName}`) {
    return void 0;
  }
  return {
    schemaVersion: 1,
    platform: "android",
    sourceRevision: candidate.sourceRevision.toLowerCase(),
    versionName: candidate.versionName.trim(),
    versionCode: candidate.versionCode,
    builtAt: candidate.builtAt,
    sizeBytes: candidate.sizeBytes,
    sha256: candidate.sha256.toLowerCase(),
    minSdk: candidate.minSdk,
    objectKey: candidate.objectKey,
    fileName: candidate.fileName,
    signingCertificateSha256: candidate.signingCertificateSha256.toLowerCase(),
    oversizeApproved: candidate.oversizeApproved
  };
}
function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/iu.test(value);
}
function isPositiveInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function isIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

const release_get = defineEventHandler(async (event) => {
  var _a;
  setHeader(event, "Cache-Control", "no-store");
  const revision = String((_a = getQuery$1(event).revision) != null ? _a : "");
  return getAndroidReleaseStatus(event, revision);
});

const release_get$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: release_get
}, Symbol.toStringTag, { value: 'Module' }));

const download_get = defineEventHandler(async (event) => {
  var _a;
  const revision = String((_a = getQuery$1(event).revision) != null ? _a : "");
  const bucket = getMobileReleasesBucket(event);
  const release = await findAndroidRelease(bucket, revision);
  if (!release.available || !bucket) {
    throw createError({ statusCode: 404, statusMessage: "APK Android indisponible." });
  }
  const apk = await bucket.get(release.manifest.objectKey);
  if (!apk || apk.size !== release.manifest.sizeBytes) {
    throw createError({ statusCode: 404, statusMessage: "APK Android introuvable." });
  }
  for (const [name, value] of Object.entries(
    getAndroidDownloadHeaders(release.manifest, apk.size)
  )) {
    setHeader(event, name, value);
  }
  return apk.body;
});

const download_get$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: download_get
}, Symbol.toStringTag, { value: 'Module' }));

const status_get$4 = defineEventHandler(
  async (event) => getNetexCacheStatus(getNetexRuntimeEnv(event))
);

const status_get$5 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: status_get$4
}, Symbol.toStringTag, { value: 'Module' }));

const ARRETS_LIGNES_RECORDS_URL = "https://data.iledefrance.fr/api/explore/v2.1/catalog/datasets/arrets-lignes/records";
const ARRETS_LIGNES_SELECT_FIELDS = "id,shortname,route_long_name,mode,stop_name,stop_id";

const MAX_WHERE_LENGTH = 500;
const records_get = defineEventHandler(async (event) => {
  const upstreamUrl = buildArretsLignesUpstreamUrl(event);
  const response = await fetch(upstreamUrl, {
    headers: {
      accept: "application/json",
      "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
    }
  });
  if (!response.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: `IDFM Open Data arrets-lignes failed: ${response.status} ${response.statusText}`
    });
  }
  return response.json();
});
function buildArretsLignesUpstreamUrl(event) {
  const query = getQuery$1(event);
  const where = getSingleQueryValue(query.where).trim();
  if (!where || where.length > MAX_WHERE_LENGTH) {
    throw createError({
      statusCode: 400,
      statusMessage: "A valid where query is required."
    });
  }
  const searchParams = new URLSearchParams({
    where,
    select: getSingleQueryValue(query.select).trim() || ARRETS_LIGNES_SELECT_FIELDS,
    limit: normalizeLimit(query.limit)
  });
  return `${ARRETS_LIGNES_RECORDS_URL}?${searchParams}`;
}
function getSingleQueryValue(value) {
  var _a;
  return Array.isArray(value) ? String((_a = value[0]) != null ? _a : "") : String(value != null ? value : "");
}
function normalizeLimit(value) {
  const numericValue = Number(getSingleQueryValue(value));
  if (!Number.isFinite(numericValue)) {
    return "100";
  }
  return String(Math.min(100, Math.max(1, Math.floor(numericValue))));
}

const records_get$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  buildArretsLignesUpstreamUrl: buildArretsLignesUpstreamUrl,
  default: records_get
}, Symbol.toStringTag, { value: 'Module' }));

const _lineId__get = defineEventHandler(async (event) => {
  const lineId = getRouterParam(event, "lineId");
  if (!lineId) {
    throw createError({ statusCode: 400, statusMessage: "Missing line id." });
  }
  try {
    const line = await getRidershipLine(lineId, getNetexRuntimeEnv(event));
    setHeader(event, "Cache-Control", "no-store");
    return line;
  } catch (error) {
    throw createError({
      cause: error,
      statusCode: 404,
      statusMessage: `No annual ridership data found for line ${lineId}.`
    });
  }
});

const _lineId__get$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: _lineId__get
}, Symbol.toStringTag, { value: 'Module' }));

const _stationId__get = defineEventHandler(async (event) => {
  const stationId = getRouterParam(event, "stationId");
  if (!stationId) {
    throw createError({ statusCode: 400, statusMessage: "Missing station id." });
  }
  const query = getQuery$1(event);
  const lineId = typeof query.lineId === "string" ? query.lineId : void 0;
  try {
    const station = await getRidershipStation(
      stationId,
      lineId,
      getNetexRuntimeEnv(event)
    );
    setHeader(event, "Cache-Control", "no-store");
    return station;
  } catch (error) {
    throw createError({
      cause: error,
      statusCode: 404,
      statusMessage: `No annual ridership data found for station ${stationId}.`
    });
  }
});

const _stationId__get$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: _stationId__get
}, Symbol.toStringTag, { value: 'Module' }));

const status_get$2 = defineEventHandler(async (event) => {
  setHeader(event, "Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
  return getRidershipStatus(getNetexRuntimeEnv(event));
});

const status_get$3 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: status_get$2
}, Symbol.toStringTag, { value: 'Module' }));

const traffic_get = defineEventHandler(async (event) => {
  var _a, _b, _c, _d;
  const query = getQuery$1(event);
  const lineRefs = parseLineRefs(query.lineRefs);
  const detail = isEnabled(query.detail) && lineRefs.length === 1;
  const locale = resolveTrafficLocale(query.locale);
  let snapshot = (await getTrafficSnapshot(event, { locale })).response;
  if (detail && ((_b = (_a = snapshot.cache) == null ? void 0 : _a.ageMs) != null ? _b : 0) > ((_d = (_c = snapshot.cache) == null ? void 0 : _c.detailRefreshAfterMs) != null ? _d : 6e4)) {
    await refreshTrafficLineDetail(event, lineRefs[0], locale);
    snapshot = (await getTrafficSnapshot(event, { locale })).response;
  }
  const response = {
    ...snapshot,
    lines: lineRefs.length ? snapshot.lines.filter(
      (line) => lineRefs.includes(normalizeTrafficLineRef(line.lineRef))
    ) : snapshot.lines
  };
  setTrafficDiagnostics(event, response, detail ? "detail" : "global", locale);
  return response;
});
function parseLineRefs(value) {
  const rawValue = Array.isArray(value) ? value.join(",") : String(value != null ? value : "");
  return Array.from(
    new Set(
      rawValue.split(",").map((lineRef) => {
        try {
          return normalizeTrafficLineRef(decodeURIComponent(lineRef));
        } catch {
          return normalizeTrafficLineRef(lineRef);
        }
      }).filter(Boolean)
    )
  );
}
function isEnabled(value) {
  return value === "1" || value === "true" || value === "yes";
}
function setTrafficDiagnostics(event, response, requestKind, locale) {
  var _a, _b, _c;
  setHeader(event, "Cache-Control", "private, max-age=5, stale-while-revalidate=30");
  setHeader(event, "X-Traffic-Cache-State", (_b = (_a = response.cache) == null ? void 0 : _a.state) != null ? _b : "miss");
  setHeader(event, "X-Traffic-Source", response.source);
  setHeader(event, "X-Traffic-Request", requestKind);
  if (locale) setHeader(event, "X-Traffic-Locale", locale);
  if ((_c = response.cache) == null ? void 0 : _c.refreshedAt) {
    setHeader(event, "X-Traffic-Refreshed-At", response.cache.refreshedAt);
  }
}

const traffic_get$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: traffic_get,
  setTrafficDiagnostics: setTrafficDiagnostics
}, Symbol.toStringTag, { value: 'Module' }));

const refresh_post = defineEventHandler(async (event) => {
  const locale = resolveTrafficLocale(getQuery$1(event).locale);
  const result = await refreshTrafficSnapshot(event, locale);
  setTrafficDiagnostics(event, result.response, "global", locale);
  setHeader(event, "X-Traffic-Refresh", "manual");
  return result.response;
});

const refresh_post$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: refresh_post
}, Symbol.toStringTag, { value: 'Module' }));

const status_get = defineEventHandler(async (event) => {
  const locale = resolveTrafficLocale(getQuery$1(event).locale);
  const response = await getTrafficCacheStatus(
    event,
    locale
  );
  setHeader(event, "Cache-Control", "private, no-store");
  setHeader(event, "X-Traffic-Cache-State", response.cache.state);
  setHeader(event, "X-Traffic-Request", "status");
  setHeader(event, "X-Traffic-Locale", locale);
  return response;
});

const status_get$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: status_get
}, Symbol.toStringTag, { value: 'Module' }));

const MARKETPLACE_NAVITIA_BASE = "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia";
const MAX_TRANSFER_TARGETS = 96;
const MAX_SERVER_TRANSFER_TARGETS_PER_INVOCATION = 4;
const DEFAULT_SERVER_TARGET_CONCURRENCY = 1;
const DEFAULT_SERVER_REQUEST_SPACING_MS = 0;
const MAX_SERVER_REQUEST_SPACING_MS = 2e3;
const DEFAULT_INTERNAL_NAVITIA_SPACING_MS = 120;
const STOP_POINT_LINE_BATCH_SIZE = 4;
const NEARBY_STOP_AREA_LINE_BATCH_SIZE = 4;
const LINE_PRESENTATION_CONCURRENCY = 2;
const DEFAULT_TRANSFER_BUNDLE_NEARBY_DISTANCE_METERS = 300;
const MIN_TRANSFER_BUNDLE_NEARBY_DISTANCE_METERS = 50;
const MAX_TRANSFER_BUNDLE_NEARBY_DISTANCE_METERS = 1200;
const MAX_TRANSFER_BUNDLE_NEARBY_STOP_AREAS = 100;
const MAX_LINE_STOP_AREAS = 500;
const MAX_STOP_AREA_LINES = 160;
const COMPATIBLE_STOP_AREA_NEARBY_DISTANCE_METERS = 650;
const MAX_COMPATIBLE_NEARBY_STOP_AREAS = 24;
const MAX_COMPATIBLE_CONNECTIONS = 1e3;
const STRUCTURAL_LINE_CACHE_VERSION = "v3";
const TRANSFER_BUNDLE_RESOLVER_VERSION = "v5";
const DEFAULT_RETENTION_DAYS = 30;
const MAX_SERVER_RETRY_AFTER_DELAY_MS = 5e3;
const DAY_MS = 24 * 60 * 60 * 1e3;
const TRANSFER_BUNDLE_STORAGE_BASE = "transfer-bundles";
const transferCache = /* @__PURE__ */ new Map();
const serverTransferBundles = /* @__PURE__ */ new Map();
const serverTransferBundleWriteQueues = /* @__PURE__ */ new Map();
const lineStopAreasCache = /* @__PURE__ */ new Map();
const nearbyStopAreasCache = /* @__PURE__ */ new Map();
const stopAreaLinesCache = /* @__PURE__ */ new Map();
const stopPointStructuralCache = /* @__PURE__ */ new Map();
const linePresentationCache = /* @__PURE__ */ new Map();
const fallbackTransferBundleStorage = /* @__PURE__ */ new Map();
const bundleTransferFamilyPriority = {
  METRO: 0,
  RER: 1,
  TRANSILIEN: 2,
  TRAM: 3,
  CABLE: 4,
  BUS: 5,
  NOCTILIEN: 6
};
const transferBundles_post = defineEventHandler(async (event) => {
  const apiKey = getServerIdfmApiKey(event);
  const fetcher = apiKey ? createServerNavitiaFetcher(apiKey) : void 0;
  return createTransferBundleResponse(await readBody(event), {
    fetcher
  });
});
async function createTransferBundleResponse(rawBody, options = {}) {
  const logger = createTransferBundleDebugLogger();
  try {
    const body = normalizeRequestBody(rawBody);
    const fetcher = options.fetcher;
    const bundleId = createServerTransferBundleId(
      body.lineId,
      body.transferResolverMode,
      body.nearbyDistanceMeters
    );
    logTransferBundleDebug(logger, "info", "request:start", {
      backendCacheEnabled: body.backendCacheEnabled,
      bundleId,
      hasFetcher: Boolean(fetcher),
      lineId: body.lineId,
      lineLabel: body.lineLabel,
      nearbyDistanceMeters: body.nearbyDistanceMeters,
      requestConcurrency: body.requestConcurrency,
      requestSpacingMs: body.requestSpacingMs,
      retentionDays: body.retentionDays,
      resolverMode: body.transferResolverMode,
      targetCount: body.targets.length,
      targets: body.targets.map((target) => summarizeTransferTarget(target))
    });
    if (body.backendCacheEnabled) {
      trimTransferCache();
    } else {
      clearTransferResolutionRuntimeCaches();
    }
    const existingBundle = body.backendCacheEnabled ? await readServerTransferBundle(bundleId, logger) : void 0;
    const reusableTransfersByStopAreaRef = getReusableTransferBundleEntries(
      existingBundle,
      body.targets
    );
    const missingTargets = body.targets.filter(
      (target) => !Object.prototype.hasOwnProperty.call(reusableTransfersByStopAreaRef, target.stopAreaRef)
    );
    if (existingBundle && missingTargets.length === 0) {
      logTransferBundleDebug(logger, "info", "bundle:hit-complete", {
        bundleId,
        durationMs: Date.now() - logger.startedAt,
        targetCount: body.targets.length,
        transferCount: countTransferLines(reusableTransfersByStopAreaRef)
      });
      return createTransferBundleResponseFromStoredBundle(
        body,
        existingBundle,
        reusableTransfersByStopAreaRef
      );
    }
    logTransferBundleDebug(
      logger,
      existingBundle ? "info" : "debug",
      existingBundle ? "bundle:hit-partial" : "bundle:miss",
      {
        bundleId,
        missingTargetCount: missingTargets.length,
        reusableTargetCount: Object.keys(reusableTransfersByStopAreaRef).length,
        targetCount: body.targets.length
      }
    );
    if (!fetcher) {
      logTransferBundleDebug(logger, "error", "request:missing-api-key", {
        missingTargetCount: missingTargets.length,
        resolverMode: body.transferResolverMode
      });
      throw createError({
        statusCode: 500,
        statusMessage: "IDFM_API_KEY is not configured on this deployment."
      });
    }
    const invocationTargets = missingTargets.slice(0, MAX_SERVER_TRANSFER_TARGETS_PER_INVOCATION);
    let savedBundle = existingBundle;
    const uncachedTransfersByStopAreaRef = {};
    logTransferBundleDebug(logger, "info", "bundle:batch", {
      batchTargetCount: invocationTargets.length,
      bundleId,
      deferredTargetCount: Math.max(0, missingTargets.length - invocationTargets.length),
      missingTargetCount: missingTargets.length
    });
    for (const [index, target] of invocationTargets.entries()) {
      if (index > 0 && body.requestSpacingMs > 0) {
        await waitForTransferBundleRetry(body.requestSpacingMs);
      }
      logTransferBundleDebug(logger, "info", "target:queued", {
        index,
        target: summarizeTransferTarget(target)
      });
      const transfers = await getCachedTransfers(
        target,
        body.lineId,
        body.lineLabel,
        body.nearbyDistanceMeters,
        body.requestConcurrency,
        body.requestSpacingMs,
        body.retentionDays,
        bundleId,
        fetcher,
        logger
      );
      logTransferBundleDebug(logger, transfers === void 0 ? "warn" : "info", "target:resolved", {
        index,
        target: summarizeTransferTarget(target),
        transfers: summarizeTransferLines(transfers)
      });
      if (transfers !== void 0) {
        if (body.backendCacheEnabled) {
          savedBundle = await saveServerTransferBundle(body, body.transferResolverMode, bundleId, {
            [target.stopAreaRef]: transfers
          });
          logTransferBundleDebug(logger, "info", "target:persisted", {
            bundleId,
            persistedTargetCount: savedBundle.stopAreaCount,
            target: summarizeTransferTarget(target)
          });
        } else {
          uncachedTransfersByStopAreaRef[target.stopAreaRef] = transfers;
        }
      }
    }
    if (!body.backendCacheEnabled) {
      clearTransferResolutionRuntimeCaches();
      logTransferBundleDebug(logger, "info", "request:done-uncached", {
        durationMs: Date.now() - logger.startedAt,
        bundleId,
        resolvedTargetCount: Object.keys(uncachedTransfersByStopAreaRef).length,
        targetCount: body.targets.length,
        transferCount: countTransferLines(uncachedTransfersByStopAreaRef)
      });
      return {
        version: 1,
        generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        lineId: body.lineId,
        lineLabel: body.lineLabel,
        nearbyDistanceMeters: body.nearbyDistanceMeters,
        requestConcurrency: body.requestConcurrency,
        transferResolverMode: body.transferResolverMode,
        transfersByStopAreaRef: uncachedTransfersByStopAreaRef
      };
    }
    savedBundle != null ? savedBundle : savedBundle = await saveServerTransferBundle(body, body.transferResolverMode, bundleId, {});
    trimTransferCache();
    logTransferBundleDebug(logger, "info", "request:done", {
      durationMs: Date.now() - logger.startedAt,
      bundleId,
      deferredTargetCount: Math.max(0, missingTargets.length - invocationTargets.length),
      missingTargetCount: missingTargets.length,
      resolvedTargetCount: savedBundle.stopAreaCount,
      targetCount: body.targets.length,
      transferCount: savedBundle.transferCount
    });
    return createTransferBundleResponseFromStoredBundle(
      body,
      savedBundle,
      getReusableTransferBundleEntries(savedBundle, body.targets)
    );
  } catch (error) {
    logTransferBundleDebug(logger, "error", "request:error", {
      durationMs: Date.now() - logger.startedAt,
      error: formatTransferBundleError(error)
    });
    throw error;
  }
}
function normalizeRequestBody(body) {
  const lineId = typeof body.lineId === "string" ? body.lineId.trim() : "";
  const lineLabel = typeof body.lineLabel === "string" && body.lineLabel.trim() ? body.lineLabel.trim() : lineId;
  const retentionDays = normalizeRetentionDays(body.retentionDays);
  const requestConcurrency = normalizeRequestConcurrency(body.requestConcurrency);
  const requestSpacingMs = normalizeRequestSpacingMs(body.requestSpacingMs);
  const backendCacheEnabled = body.backendCacheEnabled !== false;
  const nearbyDistanceMeters = normalizeNearbyDistanceMeters(body.nearbyDistanceMeters);
  const transferResolverMode = "nearby";
  const targets = (Array.isArray(body.targets) ? body.targets : []).map(normalizeTarget).filter((target) => Boolean(target)).slice(0, MAX_TRANSFER_TARGETS);
  if (!lineId || targets.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "lineId and targets are required."
    });
  }
  return {
    backendCacheEnabled,
    lineId,
    lineLabel,
    nearbyDistanceMeters,
    requestConcurrency,
    requestSpacingMs,
    retentionDays,
    targets,
    transferResolverMode
  };
}
function normalizeTarget(target) {
  if (!target || typeof target !== "object") {
    return void 0;
  }
  const value = target;
  const stopAreaRef = typeof value.stopAreaRef === "string" ? value.stopAreaRef.trim() : "";
  const label = typeof value.label === "string" ? value.label.trim() : stopAreaRef;
  if (!isSupportedTransferTargetRef(stopAreaRef)) {
    return void 0;
  }
  return {
    stopAreaRef,
    label,
    city: typeof value.city === "string" ? value.city : void 0
  };
}
function normalizeRetentionDays(value) {
  const numericValue = typeof value === "number" ? value : Number(value);
  return [1, 3, 7, 15, 30, 60].includes(numericValue) ? numericValue : DEFAULT_RETENTION_DAYS;
}
function normalizeRequestConcurrency(value) {
  const numericValue = typeof value === "number" ? value : Number(value);
  return [1, 2, 3, 4].includes(numericValue) ? numericValue : DEFAULT_SERVER_TARGET_CONCURRENCY;
}
function normalizeRequestSpacingMs(value) {
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? Math.min(
    MAX_SERVER_REQUEST_SPACING_MS,
    Math.max(DEFAULT_SERVER_REQUEST_SPACING_MS, Math.trunc(numericValue))
  ) : DEFAULT_SERVER_REQUEST_SPACING_MS;
}
function normalizeNearbyDistanceMeters(value) {
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? Math.min(
    MAX_TRANSFER_BUNDLE_NEARBY_DISTANCE_METERS,
    Math.max(MIN_TRANSFER_BUNDLE_NEARBY_DISTANCE_METERS, Math.trunc(numericValue))
  ) : DEFAULT_TRANSFER_BUNDLE_NEARBY_DISTANCE_METERS;
}
async function getCachedTransfers(target, currentLineId, currentLineLabel, nearbyDistanceMeters, requestConcurrency, requestSpacingMs, retentionDays, bundleId, fetcher, logger) {
  const now = Date.now();
  const targetStartedAt = Date.now();
  const cacheKey = [
    "nearby",
    currentLineId,
    target.stopAreaRef,
    target.label,
    `concurrency:${requestConcurrency}`,
    `distance:${nearbyDistanceMeters}`
  ].join(":");
  const cached = transferCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    const transfers = await cached.promise;
    if (transfers !== void 0) {
      logTransferBundleDebug(logger, "info", "cache:hit", {
        bundleId: cached.bundleId,
        expiresInMs: cached.expiresAt - now,
        resolverMode: "nearby",
        target: summarizeTransferTarget(target)
      });
      return transfers;
    }
    logTransferBundleDebug(logger, "warn", "cache:hit-undefined-evicted", {
      bundleId: cached.bundleId,
      expiresInMs: cached.expiresAt - now,
      resolverMode: "nearby",
      target: summarizeTransferTarget(target)
    });
    if (transferCache.get(cacheKey) === cached) {
      transferCache.delete(cacheKey);
    }
  }
  logTransferBundleDebug(logger, "info", "cache:miss", {
    bundleId,
    resolverMode: "nearby",
    target: summarizeTransferTarget(target)
  });
  const request = resolveNearbyTransfersForTarget(
    target,
    currentLineId,
    currentLineLabel,
    nearbyDistanceMeters,
    requestConcurrency,
    requestSpacingMs,
    retentionDays,
    fetcher,
    logger
  ).then(async (transfers) => {
    var _a;
    logTransferBundleDebug(logger, transfers === void 0 ? "warn" : "info", "resolver:done", {
      durationMs: Date.now() - targetStartedAt,
      resolverMode: "nearby",
      target: summarizeTransferTarget(target),
      transfers: summarizeTransferLines(transfers)
    });
    if (transfers === void 0) {
      if (((_a = transferCache.get(cacheKey)) == null ? void 0 : _a.promise) === request) {
        transferCache.delete(cacheKey);
      }
    }
    return transfers;
  }).catch((error) => {
    var _a;
    logTransferBundleDebug(logger, "error", "target:error", {
      durationMs: Date.now() - targetStartedAt,
      error: formatTransferBundleError(error),
      resolverMode: "nearby",
      target: summarizeTransferTarget(target)
    });
    if (((_a = transferCache.get(cacheKey)) == null ? void 0 : _a.promise) === request) {
      transferCache.delete(cacheKey);
    }
    return void 0;
  });
  logTransferBundleDebug(logger, "debug", "cache:store-promise", {
    bundleId,
    expiresInMs: retentionDays * DAY_MS,
    resolverMode: "nearby",
    target: summarizeTransferTarget(target)
  });
  transferCache.set(cacheKey, {
    bundleId,
    expiresAt: now + retentionDays * DAY_MS,
    promise: request
  });
  return request;
}
async function enrichTransferLineOptionsWithNavitia(transfers, fetcher, retentionDays = DEFAULT_RETENTION_DAYS, requestSpacingMs = 0, logger) {
  const startedAt = Date.now();
  let requestedPresentationCount = 0;
  let resolvedPresentationCount = 0;
  const presentationSpacingMs = Math.max(
    normalizeRequestSpacingMs(requestSpacingMs),
    DEFAULT_INTERNAL_NAVITIA_SPACING_MS
  );
  const enrichedTransfers = await mapBundleItemsWithConcurrency(
    transfers,
    LINE_PRESENTATION_CONCURRENCY,
    presentationSpacingMs,
    async (transfer) => {
      var _a, _b, _c, _d, _e, _f, _g;
      const lineId = getTransferLineId(transfer);
      if (!lineId || !shouldEnrichTransferLineOption(transfer)) {
        return transfer;
      }
      requestedPresentationCount += 1;
      const line = await getCachedNavitiaLinePresentation(lineId, retentionDays, fetcher, logger);
      if (!line) {
        return transfer;
      }
      resolvedPresentationCount += 1;
      return mergeTransferLineOptionPresentation(transfer, {
        code: line.code,
        color: line.color,
        family: (_a = inferTransitFamilyFromNavitiaLine(line)) != null ? _a : transfer.family,
        id: (_b = line.id) != null ? _b : lineId,
        mode: (_f = (_c = line.commercial_mode) == null ? void 0 : _c.name) != null ? _f : (_e = (_d = line.physical_modes) == null ? void 0 : _d[0]) == null ? void 0 : _e.name,
        name: line.name,
        ref: (_g = line.id) != null ? _g : lineId,
        textColor: line.text_color
      });
    }
  );
  const result = dedupeTransferLineOptions(enrichedTransfers).sort(compareBundleTransfers);
  if (logger) {
    logTransferBundleDebug(logger, "debug", "enrichment:line-presentations", {
      durationMs: Date.now() - startedAt,
      inputTransferCount: transfers.length,
      outputTransferCount: result.length,
      requestedPresentationCount,
      resolvedPresentationCount
    });
  }
  return result;
}
function shouldEnrichTransferLineOption(transfer) {
  const lineId = getTransferLineId(transfer);
  if (!lineId) {
    return false;
  }
  return !transfer.family || !transfer.color || !transfer.textColor || normalizeBundleStationName(transfer.label) === "ter" || normalizeBundleColor(transfer.color) === "#0064ff";
}
async function getCachedNavitiaLinePresentation(lineId, retentionDays, fetcher, logger) {
  var _a;
  const now = Date.now();
  const normalizedLineId = (_a = normalizeIdfmLineId(lineId)) != null ? _a : lineId;
  const cacheKey = `line-presentation:${normalizedLineId}`;
  const cached = linePresentationCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    if (logger) {
      logTransferBundleDebug(logger, "debug", "line-presentation:cache-hit", {
        lineId: normalizedLineId
      });
    }
    return cached.promise;
  }
  if (logger) {
    logTransferBundleDebug(logger, "debug", "line-presentation:fetch", {
      lineId: normalizedLineId
    });
  }
  const request = fetchNavitiaLinePresentation(normalizedLineId, fetcher, logger).catch((error) => {
    if (logger) {
      logTransferBundleDebug(logger, "warn", "line-presentation:error", {
        error: formatTransferBundleError(error),
        lineId: normalizedLineId
      });
    }
    return void 0;
  });
  linePresentationCache.set(cacheKey, {
    expiresAt: now + retentionDays * DAY_MS,
    promise: request
  });
  return request;
}
async function fetchNavitiaLinePresentation(lineId, fetcher, logger) {
  var _a;
  const searchParams = new URLSearchParams({
    disable_disruption: "true",
    disable_geojson: "true"
  });
  const response = await fetcher(
    `${MARKETPLACE_NAVITIA_BASE}/lines/${encodeURIComponent(lineId)}?${searchParams}`
  );
  if (!response.ok) {
    if (logger) {
      logTransferBundleDebug(logger, "warn", "line-presentation:non-ok", {
        lineId,
        status: response.status,
        statusText: response.statusText
      });
    }
    return void 0;
  }
  const payload = await response.json().catch(() => ({}));
  return (_a = payload.lines) == null ? void 0 : _a[0];
}
async function resolveNearbyTransfersForTarget(target, currentLineId, currentLineLabel, nearbyDistanceMeters, requestConcurrency, requestSpacingMs, retentionDays, fetcher, logger) {
  var _a, _b, _c;
  logTransferBundleDebug(logger, "info", "resolver:nearby:start", {
    target: summarizeTransferTarget(target)
  });
  if (!fetcher) {
    logTransferBundleDebug(logger, "warn", "resolver:nearby:no-fetcher", {
      target: summarizeTransferTarget(target)
    });
    return void 0;
  }
  const lineStopAreas = await getCachedLineStopAreas(
    currentLineId,
    currentLineLabel,
    retentionDays,
    fetcher,
    logger
  );
  const station = (_b = (_a = resolveTargetStopAreaFromLine(target, lineStopAreas, "exact")) != null ? _a : resolveTargetStopAreaFromLine(target, lineStopAreas)) != null ? _b : await searchStopAreaForTarget(target, fetcher, logger);
  const stopAreaRef = (_c = station == null ? void 0 : station.scheduleStopAreaRef) != null ? _c : station == null ? void 0 : station.id;
  if (!station || !(stopAreaRef == null ? void 0 : stopAreaRef.startsWith("stop_area:"))) {
    logTransferBundleDebug(logger, "warn", "resolver:nearby:no-station", {
      lineStopAreaCount: lineStopAreas.length,
      target: summarizeTransferTarget(target)
    });
    return void 0;
  }
  logTransferBundleDebug(logger, "info", "resolver:nearby:station", {
    station: summarizeStationOption(station),
    target: summarizeTransferTarget(target)
  });
  const nearbyStopAreas = await getCachedNearbyStopAreas(
    stopAreaRef,
    nearbyDistanceMeters,
    retentionDays,
    fetcher,
    logger
  );
  const candidateStopAreas = [
    createCurrentStopAreaCandidate(station, stopAreaRef),
    ...nearbyStopAreas
  ];
  const transfers = await resolveTransferLinesForNearbyStopAreas(
    candidateStopAreas,
    currentLineId,
    requestConcurrency,
    requestSpacingMs,
    retentionDays,
    fetcher,
    logger
  );
  logTransferBundleDebug(logger, "info", "resolver:nearby:transfers", {
    nearbyStopAreaCount: nearbyStopAreas.length,
    stopAreaLookupCount: candidateStopAreas.length,
    station: summarizeStationOption(station),
    target: summarizeTransferTarget(target),
    transfers: summarizeTransferLines(transfers)
  });
  return transfers;
}
function createCurrentStopAreaCandidate(station, stopAreaRef) {
  return {
    distance: 0,
    stopArea: {
      id: stopAreaRef,
      label: station.label,
      name: station.label,
      administrative_regions: station.city ? [{ name: station.city }] : void 0
    }
  };
}
function resolveTargetStopAreaFromLine(target, stations, matchMode = "fuzzy") {
  var _a;
  const directStopAreaRef = (_a = convertNetexStopPlaceRefToNavitiaStopAreaRef(target.stopAreaRef)) != null ? _a : target.stopAreaRef.startsWith("stop_area:") ? target.stopAreaRef : void 0;
  if (directStopAreaRef) {
    const directStation = stations.find(
      (station) => station.id === directStopAreaRef || station.scheduleStopAreaRef === directStopAreaRef
    );
    if (directStation) {
      return directStation;
    }
  }
  const targetNumericId = extractNetexNumericId(target.stopAreaRef);
  if (targetNumericId) {
    const stationByNumericId = stations.find(
      (station) => [station.id, station.scheduleStopAreaRef].filter((value) => typeof value === "string").some((value) => value.includes(targetNumericId))
    );
    if (stationByNumericId) {
      return stationByNumericId;
    }
  }
  return matchMode === "exact" ? findExactMatchingLineStation(target, stations) : findMatchingLineStation(target, stations);
}
function extractNetexNumericId(value) {
  const match = value.trim().match(/^FR::[^:]+:(\d+):FR1$/u);
  return match == null ? void 0 : match[1];
}
async function resolveTransferLinesForNearbyStopAreas(nearbyStopAreas, currentLineId, requestConcurrency, requestSpacingMs, retentionDays, fetcher, logger) {
  const linesByStopArea = await mapBundleItemsWithConcurrency(
    nearbyStopAreas,
    Math.min(NEARBY_STOP_AREA_LINE_BATCH_SIZE, normalizeRequestConcurrency(requestConcurrency)),
    Math.max(normalizeRequestSpacingMs(requestSpacingMs), DEFAULT_INTERNAL_NAVITIA_SPACING_MS),
    async ({ stopArea }) => {
      var _a;
      return getCachedStopAreaLines((_a = stopArea.id) != null ? _a : "", retentionDays, fetcher, logger);
    }
  );
  if (linesByStopArea.some((lines) => lines === void 0)) {
    logTransferBundleDebug(logger, "warn", "nearby-lines:incomplete", {
      currentLineId,
      stopAreaLookupCount: nearbyStopAreas.length
    });
    return void 0;
  }
  const currentLineKey = normalizeBundleLineId(currentLineId);
  const transfers = linesByStopArea.flatMap((lines) => lines != null ? lines : []).filter((line) => normalizeBundleLineId(line.id) !== currentLineKey).map(mapNavitiaLineToTransferOption);
  return dedupeTransferLineOptions(transfers).sort(compareBundleTransfers);
}
async function resolveStationForTarget(target, currentLineId, currentLineLabel, retentionDays, fetcher, logger) {
  logTransferBundleDebug(logger, "debug", "station-resolve:start", {
    lineId: currentLineId,
    lineLabel: currentLineLabel,
    target: summarizeTransferTarget(target)
  });
  const directStopAreaRef = convertNetexStopPlaceRefToNavitiaStopAreaRef(target.stopAreaRef);
  if (directStopAreaRef) {
    logTransferBundleDebug(logger, "info", "station-resolve:netex-direct", {
      stopAreaRef: directStopAreaRef,
      target: summarizeTransferTarget(target)
    });
    return createStationOptionForTarget(target, directStopAreaRef);
  }
  if (target.stopAreaRef.startsWith("stop_area:")) {
    logTransferBundleDebug(logger, "info", "station-resolve:already-navitia", {
      stopAreaRef: target.stopAreaRef,
      target: summarizeTransferTarget(target)
    });
    return createStationOptionForTarget(target, target.stopAreaRef);
  }
  const stations = await getCachedLineStations(
    currentLineId,
    currentLineLabel,
    retentionDays,
    fetcher,
    logger
  );
  const exactLineStation = findExactMatchingLineStation(target, stations);
  if (exactLineStation) {
    logTransferBundleDebug(logger, "info", "station-resolve:line-station-match", {
      station: summarizeStationOption(exactLineStation),
      target: summarizeTransferTarget(target)
    });
    return exactLineStation;
  }
  const compatibleLineStation = findMatchingLineStation(target, stations);
  if (compatibleLineStation) {
    logTransferBundleDebug(logger, "info", "station-resolve:compatible-line-station-match", {
      station: summarizeStationOption(compatibleLineStation),
      target: summarizeTransferTarget(target)
    });
    return compatibleLineStation;
  }
  const searchedStation = await searchStopAreaForTarget(target, fetcher, logger);
  logTransferBundleDebug(
    logger,
    searchedStation ? "info" : "warn",
    "station-resolve:search-fallback",
    {
      station: searchedStation ? summarizeStationOption(searchedStation) : void 0,
      target: summarizeTransferTarget(target)
    }
  );
  return searchedStation;
}
function createStationOptionForTarget(target, scheduleStopAreaRef) {
  return {
    id: scheduleStopAreaRef,
    label: target.label,
    city: target.city,
    monitoringRef: "",
    scheduleStopAreaRef
  };
}
function convertNetexStopPlaceRefToNavitiaStopAreaRef(stopAreaRef) {
  const normalized = stopAreaRef.trim();
  const match = normalized.match(
    /^FR::(?:(?:mono|multi)(?:modal)?StopPlace|StopPlace):(\d+):FR1$/u
  );
  return (match == null ? void 0 : match[1]) ? `stop_area:IDFM:${match[1]}` : void 0;
}
async function getCachedLineStopAreas(currentLineId, currentLineLabel, retentionDays, fetcher, logger) {
  const now = Date.now();
  const cacheKey = `line-stop-areas:${currentLineId}`;
  const cached = lineStopAreasCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    logTransferBundleDebug(logger, "debug", "line-stop-areas:cache-hit", {
      lineId: currentLineId
    });
    const stations = await cached.promise;
    if (stations.length > 0) {
      logTransferBundleDebug(logger, "debug", "line-stop-areas:cache-hit-result", {
        lineId: currentLineId,
        stationCount: stations.length
      });
      return stations;
    }
    logTransferBundleDebug(logger, "warn", "line-stop-areas:cache-empty-evicted", {
      lineId: currentLineId
    });
    lineStopAreasCache.delete(cacheKey);
  }
  logTransferBundleDebug(logger, "info", "line-stop-areas:fetch", {
    lineId: currentLineId,
    lineLabel: currentLineLabel
  });
  const request = fetchLineStopAreas(currentLineId, currentLineLabel, fetcher, logger).then((stations) => {
    if (stations.length === 0) {
      logTransferBundleDebug(logger, "error", "line-stop-areas:empty", {
        lineId: currentLineId,
        lineLabel: currentLineLabel
      });
      lineStopAreasCache.delete(cacheKey);
      throw new Error(`No Navitia stations found for ${currentLineId}`);
    }
    logTransferBundleDebug(logger, "info", "line-stop-areas:done", {
      lineId: currentLineId,
      sample: stations.slice(0, 6).map((station) => summarizeStationOption(station)),
      stationCount: stations.length
    });
    return stations;
  }).catch((error) => {
    logTransferBundleDebug(logger, "error", "line-stop-areas:error", {
      error: formatTransferBundleError(error),
      lineId: currentLineId,
      lineLabel: currentLineLabel
    });
    lineStopAreasCache.delete(cacheKey);
    throw error;
  });
  lineStopAreasCache.set(cacheKey, {
    expiresAt: now + retentionDays * DAY_MS,
    promise: request
  });
  return request;
}
async function getCachedLineStations(currentLineId, currentLineLabel, retentionDays, fetcher, logger) {
  return getCachedLineStopAreas(currentLineId, currentLineLabel, retentionDays, fetcher, logger);
}
async function fetchLineStopAreas(currentLineId, currentLineLabel, fetcher, logger) {
  const navitiaLineId = await resolveNavitiaLineId(
    currentLineId,
    currentLineLabel,
    fetcher,
    logger
  );
  const searchParams = new URLSearchParams({
    count: "200",
    depth: "2",
    disable_disruption: "true",
    disable_geojson: "true"
  });
  const stopAreas = await fetchPaginatedNavitiaCollection(
    `${MARKETPLACE_NAVITIA_BASE}/lines/${encodeURIComponent(navitiaLineId)}/stop_areas`,
    searchParams,
    "stop_areas",
    MAX_LINE_STOP_AREAS,
    fetcher,
    logger
  );
  return dedupeStations(stopAreas.map(mapSearchedStopAreaToStation));
}
async function resolveNavitiaLineId(currentLineId, currentLineLabel, fetcher, logger) {
  var _a, _b, _c;
  const trimmedLineId = currentLineId.trim();
  const normalizedLineId = normalizeIdfmLineId(trimmedLineId);
  if (normalizedLineId) {
    return normalizedLineId;
  }
  if (trimmedLineId.startsWith("line:")) {
    return trimmedLineId;
  }
  const query = currentLineLabel || currentLineId;
  const searchParams = new URLSearchParams({
    count: "10",
    disable_disruption: "true",
    disable_geojson: "true",
    q: query
  });
  searchParams.append("type[]", "line");
  logTransferBundleDebug(logger, "info", "line-resolve:search", {
    lineId: currentLineId,
    query
  });
  const response = await fetcher(`${MARKETPLACE_NAVITIA_BASE}/pt_objects?${searchParams}`);
  if (!response.ok) {
    logTransferBundleDebug(logger, "warn", "line-resolve:non-ok", {
      lineId: currentLineId,
      status: response.status,
      statusText: response.statusText
    });
    return currentLineId;
  }
  const payload = await response.json().catch(() => ({}));
  const line = (_b = ((_a = payload.pt_objects) != null ? _a : []).find(
    (object) => {
      var _a2;
      return object.embedded_type === "line" && ((_a2 = object.line) == null ? void 0 : _a2.id);
    }
  )) == null ? void 0 : _b.line;
  return (_c = line == null ? void 0 : line.id) != null ? _c : currentLineId;
}
async function getCachedNearbyStopAreas(stopAreaRef, nearbyDistanceMeters, retentionDays, fetcher, logger) {
  const now = Date.now();
  const cacheKey = `nearby:${stopAreaRef}:d${nearbyDistanceMeters}`;
  const cached = nearbyStopAreasCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    logTransferBundleDebug(logger, "debug", "nearby:cache-hit", {
      distanceMeters: nearbyDistanceMeters,
      stopAreaRef
    });
    return cached.promise;
  }
  logTransferBundleDebug(logger, "info", "nearby:fetch", {
    distanceMeters: nearbyDistanceMeters,
    stopAreaRef
  });
  const request = fetchNearbyStopAreas(stopAreaRef, nearbyDistanceMeters, fetcher, logger).catch(
    (error) => {
      logTransferBundleDebug(logger, "warn", "nearby:error", {
        error: formatTransferBundleError(error),
        stopAreaRef
      });
      nearbyStopAreasCache.delete(cacheKey);
      return [];
    }
  );
  nearbyStopAreasCache.set(cacheKey, {
    expiresAt: now + retentionDays * DAY_MS,
    promise: request
  });
  return request;
}
async function fetchNearbyStopAreas(stopAreaRef, nearbyDistanceMeters, fetcher, logger) {
  const searchParams = new URLSearchParams({
    count: String(MAX_TRANSFER_BUNDLE_NEARBY_STOP_AREAS),
    depth: "2",
    disable_disruption: "true",
    disable_geojson: "true",
    distance: String(nearbyDistanceMeters)
  });
  searchParams.append("type[]", "stop_area");
  const places = await fetchPaginatedNavitiaCollection(
    `${MARKETPLACE_NAVITIA_BASE}/stop_areas/${encodeURIComponent(stopAreaRef)}/places_nearby`,
    searchParams,
    "places_nearby",
    MAX_TRANSFER_BUNDLE_NEARBY_STOP_AREAS,
    fetcher,
    logger
  );
  const normalizedCurrentStopArea = normalizeBundleStationName(stopAreaRef);
  const deduped = /* @__PURE__ */ new Map();
  places.filter((place) => place.embedded_type === "stop_area").map((place) => ({
    distance: parseBundleDistance(place.distance),
    stopArea: place.stop_area
  })).filter(
    (place) => {
      var _a, _b;
      return Boolean((_a = place.stopArea) == null ? void 0 : _a.id) && normalizeBundleStationName((_b = place.stopArea) == null ? void 0 : _b.id) !== normalizedCurrentStopArea;
    }
  ).sort((left, right) => left.distance - right.distance).forEach((place) => {
    var _a;
    const stopAreaId = (_a = place.stopArea.id) != null ? _a : "";
    const existing = deduped.get(stopAreaId);
    if (!existing || place.distance < existing.distance) {
      deduped.set(stopAreaId, place);
    }
  });
  const result = Array.from(deduped.values());
  logTransferBundleDebug(logger, "info", "nearby:done", {
    nearbyStopAreaCount: result.length,
    sample: result.slice(0, 8).map((place) => {
      var _a, _b;
      return {
        distance: place.distance,
        id: place.stopArea.id,
        name: cleanBundleStopAreaLabel((_b = (_a = place.stopArea.name) != null ? _a : place.stopArea.label) != null ? _b : "")
      };
    }),
    stopAreaRef
  });
  return result;
}
async function getCachedStopAreaLines(stopAreaRef, retentionDays, fetcher, logger) {
  if (!stopAreaRef) {
    return [];
  }
  const now = Date.now();
  const cacheKey = `stop-area-lines:${stopAreaRef}`;
  const cached = stopAreaLinesCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    logTransferBundleDebug(logger, "debug", "stop-area-lines:cache-hit", {
      stopAreaRef
    });
    return cached.promise;
  }
  logTransferBundleDebug(logger, "debug", "stop-area-lines:fetch", {
    stopAreaRef
  });
  const request = fetchStopAreaLines(stopAreaRef, fetcher, logger).catch(
    (error) => {
      logTransferBundleDebug(logger, "warn", "stop-area-lines:error", {
        error: formatTransferBundleError(error),
        stopAreaRef
      });
      stopAreaLinesCache.delete(cacheKey);
      return isTransferBundleHttpStatus(error, 404) ? [] : void 0;
    }
  );
  stopAreaLinesCache.set(cacheKey, {
    expiresAt: now + retentionDays * DAY_MS,
    promise: request
  });
  return request;
}
async function fetchStopAreaLines(stopAreaRef, fetcher, logger) {
  const searchParams = new URLSearchParams({
    count: "100",
    depth: "2",
    disable_disruption: "true",
    disable_geojson: "true"
  });
  return fetchPaginatedNavitiaCollection(
    `${MARKETPLACE_NAVITIA_BASE}/stop_areas/${encodeURIComponent(stopAreaRef)}/lines`,
    searchParams,
    "lines",
    MAX_STOP_AREA_LINES,
    fetcher,
    logger
  );
}
function mapNavitiaLineToTransferOption(line) {
  var _a, _b, _c, _d;
  return createTransferLineOption({
    code: line.code,
    color: line.color,
    family: inferTransitFamilyFromNavitiaLine(line),
    id: line.id,
    mode: (_d = (_a = line.commercial_mode) == null ? void 0 : _a.name) != null ? _d : (_c = (_b = line.physical_modes) == null ? void 0 : _b[0]) == null ? void 0 : _c.name,
    name: line.name,
    ref: line.id,
    textColor: line.text_color
  });
}
function dedupeStations(stations) {
  const deduped = /* @__PURE__ */ new Map();
  stations.forEach((station) => deduped.set(station.id, station));
  return Array.from(deduped.values());
}
function findMatchingLineStation(target, stations) {
  var _a, _b, _c;
  const normalizedTarget = normalizeBundleStationName(target.label);
  const targetTokens = createBundleStationTokens(normalizedTarget);
  const targetCity = normalizeBundleStationName((_a = target.city) != null ? _a : "");
  const compatibleStations = stations.filter((station) => {
    var _a2;
    const stationCity = normalizeBundleStationName((_a2 = station.city) != null ? _a2 : "");
    return !targetCity || !stationCity || areCompatibleBundleCities(stationCity, targetCity);
  });
  return (_c = compatibleStations.find(
    (station) => normalizeBundleStationName(station.label) === normalizedTarget
  )) != null ? _c : (_b = compatibleStations.map((station) => ({
    score: Math.max(
      ...createLineStationNameKeys(station.label).map(
        (stationNameKey) => scoreStationNameMatch(normalizedTarget, targetTokens, stationNameKey)
      )
    ),
    station
  })).filter(({ score }) => score > 0).sort((left, right) => right.score - left.score)[0]) == null ? void 0 : _b.station;
}
function findExactMatchingLineStation(target, stations) {
  var _a;
  const normalizedTarget = normalizeBundleStationName(target.label);
  const targetCity = normalizeBundleStationName((_a = target.city) != null ? _a : "");
  return stations.find((station) => {
    var _a2;
    const stationCity = normalizeBundleStationName((_a2 = station.city) != null ? _a2 : "");
    return normalizeBundleStationName(station.label) === normalizedTarget && (!targetCity || !stationCity || areCompatibleBundleCities(stationCity, targetCity));
  });
}
function areCompatibleBundleCities(left, right) {
  return normalizeBundleCityIdentity(left) === normalizeBundleCityIdentity(right);
}
function createLineStationNameKeys(value) {
  const normalized = normalizeBundleStationName(value);
  const withoutGarePrefix = normalized.replace(
    /^gare\s+(?:(?:de|du|des)\s+)?/u,
    ""
  );
  return Array.from(new Set([normalized, withoutGarePrefix].filter(Boolean)));
}
function normalizeBundleCityIdentity(value) {
  return value.replace(/\s+\d{1,2}(?:er|e|eme)?(?:\s+arrondissement)?$/u, "").trim();
}
async function searchStopAreaForTarget(target, fetcher, logger) {
  var _a;
  const query = target.label.trim();
  if (!query) {
    logTransferBundleDebug(logger, "warn", "station-search:empty-query", {
      target: summarizeTransferTarget(target)
    });
    return void 0;
  }
  const searchParams = new URLSearchParams({
    count: "12",
    disable_disruption: "true",
    disable_geojson: "true",
    q: query
  });
  searchParams.append("type[]", "stop_area");
  const response = await fetcher(`${MARKETPLACE_NAVITIA_BASE}/pt_objects?${searchParams}`).catch(
    () => void 0
  );
  if (!(response == null ? void 0 : response.ok)) {
    logTransferBundleDebug(logger, "warn", "station-search:non-ok", {
      status: response == null ? void 0 : response.status,
      statusText: response == null ? void 0 : response.statusText,
      target: summarizeTransferTarget(target)
    });
    return void 0;
  }
  const payload = await response.json().catch(() => ({}));
  const stations = ((_a = payload.pt_objects) != null ? _a : []).filter((object) => object.embedded_type === "stop_area").map((object) => object.stop_area).filter(
    (stopArea) => Boolean(stopArea == null ? void 0 : stopArea.id)
  ).map(mapSearchedStopAreaToStation);
  const matchedStation = findMatchingLineStation(target, stations);
  logTransferBundleDebug(logger, matchedStation ? "info" : "warn", "station-search:done", {
    candidateCount: stations.length,
    matchedStation: matchedStation ? summarizeStationOption(matchedStation) : void 0,
    sample: stations.slice(0, 6).map((station) => summarizeStationOption(station)),
    target: summarizeTransferTarget(target)
  });
  return matchedStation;
}
async function resolveOfficialConnectionStopNames(target, context) {
  var _a;
  if (!context.fetcher) {
    logTransferBundleDebug(context.logger, "warn", "official-connections:no-fetcher", {
      target: summarizeTransferTarget(target)
    });
    return [];
  }
  logTransferBundleDebug(context.logger, "info", "official-connections:start", {
    target: summarizeTransferTarget(target)
  });
  const station = await resolveStationForTarget(
    target,
    context.currentLineId,
    context.currentLineLabel,
    context.retentionDays,
    context.fetcher,
    context.logger
  );
  const stopAreaRef = (_a = station == null ? void 0 : station.scheduleStopAreaRef) != null ? _a : station == null ? void 0 : station.id;
  if (!(stopAreaRef == null ? void 0 : stopAreaRef.startsWith("stop_area:"))) {
    logTransferBundleDebug(context.logger, "warn", "official-connections:no-stop-area", {
      station: station ? summarizeStationOption(station) : void 0,
      target: summarizeTransferTarget(target)
    });
    return [];
  }
  let names = await fetchOfficialConnectionStopNamesWithSearchFallback(
    target,
    stopAreaRef,
    context
  );
  logTransferBundleDebug(context.logger, "info", "official-connections:done", {
    names: summarizeStringList(names),
    station: station ? summarizeStationOption(station) : void 0,
    stopAreaRef,
    target: summarizeTransferTarget(target)
  });
  return names;
}
async function fetchOfficialConnectionStopNamesWithSearchFallback(target, stopAreaRef, context) {
  var _a;
  try {
    return await fetchOfficialConnectionStopNames(
      stopAreaRef,
      context.currentLineId,
      context.fetcher,
      context.logger,
      context.requestSpacingMs
    );
  } catch (error) {
    if (!isTransferBundleHttpStatus(error, 404)) {
      throw error;
    }
    logTransferBundleDebug(
      context.logger,
      "warn",
      "official-connections:direct-stop-area-not-found",
      {
        error: formatTransferBundleError(error),
        stopAreaRef,
        target: summarizeTransferTarget(target)
      }
    );
  }
  const searchedStation = await searchStopAreaForTarget(target, context.fetcher, context.logger);
  const fallbackStopAreaRef = (_a = searchedStation == null ? void 0 : searchedStation.scheduleStopAreaRef) != null ? _a : searchedStation == null ? void 0 : searchedStation.id;
  if (!(fallbackStopAreaRef == null ? void 0 : fallbackStopAreaRef.startsWith("stop_area:"))) {
    logTransferBundleDebug(context.logger, "warn", "official-connections:fallback-search-empty", {
      target: summarizeTransferTarget(target)
    });
    return [];
  }
  if (fallbackStopAreaRef === stopAreaRef) {
    logTransferBundleDebug(context.logger, "warn", "official-connections:fallback-same-stop-area", {
      fallbackStopAreaRef,
      target: summarizeTransferTarget(target)
    });
    return [];
  }
  logTransferBundleDebug(context.logger, "info", "official-connections:fallback-search-match", {
    fallbackStation: searchedStation ? summarizeStationOption(searchedStation) : void 0,
    originalStopAreaRef: stopAreaRef,
    target: summarizeTransferTarget(target)
  });
  try {
    return await fetchOfficialConnectionStopNames(
      fallbackStopAreaRef,
      context.currentLineId,
      context.fetcher,
      context.logger,
      context.requestSpacingMs
    );
  } catch (error) {
    if (!isTransferBundleHttpStatus(error, 404)) {
      throw error;
    }
    logTransferBundleDebug(
      context.logger,
      "warn",
      "official-connections:fallback-stop-area-not-found",
      {
        error: formatTransferBundleError(error),
        fallbackStopAreaRef,
        target: summarizeTransferTarget(target)
      }
    );
    return [];
  }
}
async function fetchOfficialConnectionStopNames(stopAreaRef, currentLineId, fetcher, logger, requestSpacingMs = 0) {
  const startedAt = Date.now();
  const searchParams = new URLSearchParams({
    count: "80",
    disable_disruption: "true",
    disable_geojson: "true"
  });
  logTransferBundleDebug(logger, "info", "official-connections:fetch-navitia", {
    currentLineId,
    stopAreaRef
  });
  const connections = await fetchPaginatedNavitiaCollection(
    `${MARKETPLACE_NAVITIA_BASE}/stop_areas/${encodeURIComponent(stopAreaRef)}/connections`,
    searchParams,
    "connections",
    MAX_COMPATIBLE_CONNECTIONS,
    fetcher,
    logger
  );
  const candidates = collectOfficialConnectionStopNameCandidates(connections);
  const officialConnectionNames = candidates.map((candidate) => candidate.name);
  const names = /* @__PURE__ */ new Set();
  logTransferBundleDebug(logger, "info", "official-connections:navitia-candidates", {
    candidateCount: candidates.length,
    connectionCount: connections.length,
    currentLineId,
    durationMs: Date.now() - startedAt,
    sample: candidates.slice(0, 8).map((candidate) => ({
      name: candidate.name,
      stopPointId: candidate.stopPointId
    })),
    stopAreaRef
  });
  const nearbyNames = await fetchNearbyStructuralStopAreaNames(
    stopAreaRef,
    currentLineId,
    fetcher,
    officialConnectionNames,
    logger,
    requestSpacingMs
  );
  nearbyNames.forEach((name) => names.add(name));
  const unresolvedCandidates = candidates.filter(
    (candidate) => !bundleStationNameMatchesNameSet(candidate.name, names)
  );
  const shouldResolveStopPoints = nearbyNames.length < 2;
  const stopPointNames = shouldResolveStopPoints ? await fetchStructuralConnectionStopPointNames(
    unresolvedCandidates,
    currentLineId,
    fetcher,
    logger,
    requestSpacingMs
  ) : [];
  if (!shouldResolveStopPoints) {
    logTransferBundleDebug(logger, "info", "official-connections:skip-stop-point-structural", {
      nearbyNameCount: nearbyNames.length,
      skippedCandidateCount: unresolvedCandidates.length,
      stopAreaRef
    });
  }
  stopPointNames.forEach((name) => names.add(name));
  const result = Array.from(names);
  logTransferBundleDebug(logger, "info", "official-connections:structural-names", {
    nearbyNameCount: nearbyNames.length,
    resultNames: summarizeStringList(result),
    stopAreaRef,
    stopPointNameCount: stopPointNames.length,
    unresolvedCandidateCount: unresolvedCandidates.length
  });
  return result;
}
async function fetchStructuralConnectionStopPointNames(candidates, currentLineId, fetcher, logger, requestSpacingMs = 0) {
  logTransferBundleDebug(logger, "debug", "structural-stop-points:start", {
    candidateCount: candidates.length,
    currentLineId
  });
  const accepted = await mapBundleItemsWithConcurrency(
    candidates,
    STOP_POINT_LINE_BATCH_SIZE,
    Math.max(normalizeRequestSpacingMs(requestSpacingMs), DEFAULT_INTERNAL_NAVITIA_SPACING_MS),
    async (candidate) => [
      candidate.name,
      await stopPointHasNonCurrentStructuralLine(
        candidate.stopPointId,
        currentLineId,
        fetcher,
        logger
      )
    ]
  );
  const result = accepted.filter(([, hasStructuralLine]) => hasStructuralLine).map(([name]) => name);
  logTransferBundleDebug(logger, "debug", "structural-stop-points:done", {
    acceptedCount: result.length,
    currentLineId,
    names: summarizeStringList(result),
    rejectedCount: Math.max(0, candidates.length - result.length)
  });
  return result;
}
async function fetchPaginatedNavitiaCollection(endpoint, baseSearchParams, collectionKey, maxResults, fetcher, logger) {
  var _a, _b, _c, _d, _e;
  const items = [];
  let page = 0;
  let totalResult;
  while (items.length < maxResults) {
    const searchParams = new URLSearchParams(baseSearchParams);
    searchParams.set("start_page", String(page));
    const url = `${endpoint}?${searchParams}`;
    logTransferBundleDebug(logger, "debug", "navitia-page:fetch", {
      collectionKey: String(collectionKey),
      page,
      url: sanitizeTransferBundleUrl(url)
    });
    const response = await fetcher(url);
    if (!response.ok) {
      logTransferBundleDebug(logger, "error", "navitia-page:non-ok", {
        collectionKey: String(collectionKey),
        page,
        status: response.status,
        statusText: response.statusText,
        url: sanitizeTransferBundleUrl(url)
      });
      throw createTransferBundleHttpStatusError(response.status, response.statusText);
    }
    const payload = await response.json().catch(() => ({}));
    const pageItems = (_a = payload[collectionKey]) != null ? _a : [];
    const pagination = payload.pagination;
    items.push(...pageItems);
    totalResult = (_b = pagination == null ? void 0 : pagination.total_result) != null ? _b : totalResult;
    logTransferBundleDebug(logger, "debug", "navitia-page:done", {
      collectionKey: String(collectionKey),
      itemCount: pageItems.length,
      loadedCount: items.length,
      page,
      totalResult
    });
    if (!pagination) {
      break;
    }
    const loadedCount = ((_c = pagination == null ? void 0 : pagination.start_page) != null ? _c : page) * ((_d = pagination == null ? void 0 : pagination.items_per_page) != null ? _d : pageItems.length) + ((_e = pagination == null ? void 0 : pagination.items_on_page) != null ? _e : pageItems.length);
    if (pageItems.length === 0 || typeof totalResult === "number" && loadedCount >= totalResult) {
      break;
    }
    page += 1;
  }
  return items.slice(0, maxResults);
}
async function mapBundleItemsWithConcurrency(items, concurrency, spacingMs, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  let nextStartAt = Date.now();
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const normalizedSpacingMs = normalizeRequestSpacingMs(spacingMs);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        await waitForBundleLaunchSlot(
          normalizedSpacingMs,
          () => nextStartAt,
          (value) => {
            nextStartAt = value;
          }
        );
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    })
  );
  return results;
}
async function waitForBundleLaunchSlot(spacingMs, getNextStartAt, setNextStartAt) {
  if (spacingMs <= 0) {
    return;
  }
  const now = Date.now();
  const scheduledAt = Math.max(now, getNextStartAt());
  const delayMs = Math.max(0, scheduledAt - now);
  setNextStartAt(scheduledAt + spacingMs);
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
async function fetchNearbyStructuralStopAreaNames(stopAreaRef, currentLineId, fetcher, officialConnectionNames = [], logger, requestSpacingMs = 0) {
  var _a;
  const officialConnectionKeys = new Set(
    officialConnectionNames.flatMap(createCompatibleBundleStationNameKeys)
  );
  const searchParams = new URLSearchParams({
    count: String(MAX_COMPATIBLE_NEARBY_STOP_AREAS),
    disable_disruption: "true",
    disable_geojson: "true",
    distance: String(COMPATIBLE_STOP_AREA_NEARBY_DISTANCE_METERS)
  });
  searchParams.append("type[]", "stop_area");
  const url = `${MARKETPLACE_NAVITIA_BASE}/stop_areas/${encodeURIComponent(
    stopAreaRef
  )}/places_nearby?${searchParams}`;
  logTransferBundleDebug(logger, "info", "nearby-structural:fetch", {
    officialConnectionNameCount: officialConnectionNames.length,
    stopAreaRef,
    url: sanitizeTransferBundleUrl(url)
  });
  const response = await fetcher(url).catch((error) => {
    logTransferBundleDebug(logger, "warn", "nearby-structural:fetch-error", {
      error: formatTransferBundleError(error),
      stopAreaRef
    });
    return void 0;
  });
  if (!(response == null ? void 0 : response.ok)) {
    logTransferBundleDebug(logger, "warn", "nearby-structural:non-ok", {
      status: response == null ? void 0 : response.status,
      statusText: response == null ? void 0 : response.statusText,
      stopAreaRef
    });
    return [];
  }
  const payload = await response.json().catch(() => ({}));
  const nearbyStopAreas = ((_a = payload.places_nearby) != null ? _a : []).filter((place) => place.embedded_type === "stop_area").map((place) => ({
    distance: parseBundleDistance(place.distance),
    stopArea: place.stop_area
  })).filter(
    (place) => {
      var _a2;
      return Boolean((_a2 = place.stopArea) == null ? void 0 : _a2.id);
    }
  ).filter(
    (place) => normalizeBundleStationName(place.stopArea.id) !== normalizeBundleStationName(stopAreaRef)
  ).filter(
    (place) => {
      var _a2, _b;
      return officialConnectionNames.length === 0 || bundleStopAreaNameMatchesOfficialConnection(
        cleanBundleStopAreaLabel((_b = (_a2 = place.stopArea.name) != null ? _a2 : place.stopArea.label) != null ? _b : ""),
        officialConnectionNames,
        officialConnectionKeys
      );
    }
  ).sort((left, right) => left.distance - right.distance);
  const names = /* @__PURE__ */ new Set();
  logTransferBundleDebug(logger, "info", "nearby-structural:candidates", {
    candidateCount: nearbyStopAreas.length,
    sample: nearbyStopAreas.slice(0, 8).map((place) => {
      var _a2, _b;
      return {
        distance: place.distance,
        id: place.stopArea.id,
        name: cleanBundleStopAreaLabel((_b = (_a2 = place.stopArea.name) != null ? _a2 : place.stopArea.label) != null ? _b : "")
      };
    }),
    stopAreaRef
  });
  const accepted = await mapBundleItemsWithConcurrency(
    nearbyStopAreas,
    STOP_POINT_LINE_BATCH_SIZE,
    Math.max(normalizeRequestSpacingMs(requestSpacingMs), DEFAULT_INTERNAL_NAVITIA_SPACING_MS),
    async ({ stopArea }) => {
      var _a2, _b, _c;
      return [
        cleanBundleStopAreaLabel((_b = (_a2 = stopArea.name) != null ? _a2 : stopArea.label) != null ? _b : ""),
        await stopAreaHasNonCurrentStructuralLine(
          (_c = stopArea.id) != null ? _c : "",
          currentLineId,
          fetcher,
          logger
        )
      ];
    }
  );
  accepted.forEach(([name, hasStructuralLine]) => {
    if (name && hasStructuralLine) {
      names.add(name);
    }
  });
  logTransferBundleDebug(logger, "debug", "nearby-structural:validated", {
    accepted: accepted.filter(([, hasStructuralLine]) => hasStructuralLine).map(([name]) => name),
    candidateCount: nearbyStopAreas.length,
    rejectedCount: accepted.filter(([, hasStructuralLine]) => !hasStructuralLine).length,
    stopAreaRef
  });
  const result = Array.from(names);
  logTransferBundleDebug(logger, "info", "nearby-structural:done", {
    names: summarizeStringList(result),
    stopAreaRef
  });
  return result;
}
function collectOfficialConnectionStopNameCandidates(connections) {
  const candidates = /* @__PURE__ */ new Map();
  connections.forEach((connection) => {
    [connection.origin, connection.destination].forEach((stopPoint) => {
      var _a, _b, _c;
      const name = cleanBundleConnectionStopName((_a = stopPoint == null ? void 0 : stopPoint.name) != null ? _a : "");
      const stopPointId = (_c = (_b = stopPoint == null ? void 0 : stopPoint.id) == null ? void 0 : _b.trim()) != null ? _c : "";
      if (!name || !stopPointId.startsWith("stop_point:")) {
        return;
      }
      candidates.set(`${stopPointId}:${normalizeBundleStationName(name)}`, {
        name,
        stopPointId
      });
    });
  });
  return Array.from(candidates.values());
}
function bundleStationNameMatchesKeySet(name, acceptedKeys) {
  return createCompatibleBundleStationNameKeys(name).some((key) => acceptedKeys.has(key));
}
function bundleStopAreaNameMatchesOfficialConnection(name, officialNames, officialKeys) {
  if (bundleStationNameMatchesKeySet(name, officialKeys)) {
    return true;
  }
  const nameTokens = createBundleStationTokens(normalizeBundleStationName(name));
  if (nameTokens.length < 2) {
    return false;
  }
  return officialNames.some((officialName) => {
    const officialTokens = createBundleStationTokens(normalizeBundleStationName(officialName));
    const sharedTokenCount = nameTokens.filter((token) => officialTokens.includes(token)).length;
    return sharedTokenCount >= Math.min(nameTokens.length, officialTokens.length, 2);
  });
}
function bundleStationNameMatchesNameSet(name, acceptedNames) {
  const acceptedKeys = new Set(
    Array.from(acceptedNames).flatMap(createCompatibleBundleStationNameKeys)
  );
  return bundleStationNameMatchesKeySet(name, acceptedKeys);
}
function createCompatibleBundleStationNameKeys(value) {
  const normalized = normalizeBundleStationName(value);
  const withoutParentheses = normalizeBundleStationName(value.replace(/\([^)]*\)/gu, " "));
  const withoutGarePrefix = normalized.replace(/^gare\s+(?!d(?:e|u|es)?\b)(.+)$/u, "$1");
  const hyphenCompacted = normalized.replace(/\s*-\s*/gu, "-");
  const hyphenSpaced = normalized.replace(/\s*-\s*/gu, " - ");
  const safeComponents = createSafeBundleStationNameComponents(value);
  return Array.from(
    new Set(
      [
        normalized,
        withoutParentheses,
        withoutGarePrefix,
        hyphenCompacted,
        hyphenSpaced,
        ...safeComponents
      ].map(normalizeBundleStationName).filter((key) => key.length > 0)
    )
  );
}
function createSafeBundleStationNameComponents(value) {
  const trimmed = value.trim();
  if (!trimmed || !/\s[-/]\s/u.test(trimmed)) {
    return [];
  }
  const parts = trimmed.split(/\s[-/]\s/u).map((part) => part.trim()).filter(Boolean);
  const candidates = [];
  parts.forEach((part) => {
    pushSafeBundleStationComponent(candidates, part);
  });
  for (let index = 1; index < parts.length; index += 1) {
    pushSafeBundleStationComponent(candidates, parts.slice(0, index + 1).join(" - "));
  }
  return candidates;
}
function pushSafeBundleStationComponent(target, value) {
  const normalized = normalizeBundleStationName(value);
  const tokens = createBundleStationTokens(normalized);
  if (tokens.length >= 2) {
    target.push(value);
  }
  const withoutNonGenericGarePrefix = normalized.replace(/^gare\s+(?!d(?:e|u|es)?\b)(.+)$/u, "$1");
  if (withoutNonGenericGarePrefix !== normalized && createBundleStationTokens(withoutNonGenericGarePrefix).length >= 2) {
    target.push(withoutNonGenericGarePrefix);
  }
}
async function stopPointHasNonCurrentStructuralLine(stopPointId, currentLineId, fetcher, logger) {
  const now = Date.now();
  const cacheKey = `${STRUCTURAL_LINE_CACHE_VERSION}:stop-point-structural:${currentLineId}:${stopPointId}`;
  const cached = stopPointStructuralCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    logTransferBundleDebug(logger, "debug", "structural-stop-point:cache-hit", {
      currentLineId,
      stopPointId
    });
    return cached.promise;
  }
  logTransferBundleDebug(logger, "debug", "structural-stop-point:fetch", {
    currentLineId,
    stopPointId
  });
  const request = fetchStopPointHasNonCurrentStructuralLine(
    stopPointId,
    currentLineId,
    fetcher,
    logger
  ).then((hasStructuralLine) => {
    if (!hasStructuralLine) {
      logTransferBundleDebug(logger, "debug", "structural-stop-point:rejected", {
        currentLineId,
        stopPointId
      });
      stopPointStructuralCache.delete(cacheKey);
    } else {
      logTransferBundleDebug(logger, "debug", "structural-stop-point:accepted", {
        currentLineId,
        stopPointId
      });
    }
    return hasStructuralLine;
  }).catch((error) => {
    logTransferBundleDebug(logger, "warn", "structural-stop-point:error", {
      currentLineId,
      error: formatTransferBundleError(error),
      stopPointId
    });
    stopPointStructuralCache.delete(cacheKey);
    return false;
  });
  stopPointStructuralCache.set(cacheKey, {
    expiresAt: now + DEFAULT_RETENTION_DAYS * DAY_MS,
    promise: request
  });
  return request;
}
async function stopAreaHasNonCurrentStructuralLine(stopAreaId, currentLineId, fetcher, logger) {
  const now = Date.now();
  const cacheKey = `${STRUCTURAL_LINE_CACHE_VERSION}:stop-area-structural:${currentLineId}:${stopAreaId}`;
  const cached = stopPointStructuralCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    logTransferBundleDebug(logger, "debug", "structural-stop-area:cache-hit", {
      currentLineId,
      stopAreaId
    });
    return cached.promise;
  }
  logTransferBundleDebug(logger, "debug", "structural-stop-area:fetch", {
    currentLineId,
    stopAreaId
  });
  const request = fetchStopAreaHasNonCurrentStructuralLine(
    stopAreaId,
    currentLineId,
    fetcher,
    logger
  ).then((hasStructuralLine) => {
    if (!hasStructuralLine) {
      logTransferBundleDebug(logger, "debug", "structural-stop-area:rejected", {
        currentLineId,
        stopAreaId
      });
      stopPointStructuralCache.delete(cacheKey);
    } else {
      logTransferBundleDebug(logger, "debug", "structural-stop-area:accepted", {
        currentLineId,
        stopAreaId
      });
    }
    return hasStructuralLine;
  }).catch((error) => {
    logTransferBundleDebug(logger, "warn", "structural-stop-area:error", {
      currentLineId,
      error: formatTransferBundleError(error),
      stopAreaId
    });
    stopPointStructuralCache.delete(cacheKey);
    return false;
  });
  stopPointStructuralCache.set(cacheKey, {
    expiresAt: now + DEFAULT_RETENTION_DAYS * DAY_MS,
    promise: request
  });
  return request;
}
async function fetchStopPointHasNonCurrentStructuralLine(stopPointId, currentLineId, fetcher, logger) {
  var _a, _b, _c, _d;
  const searchParams = new URLSearchParams({
    count: "100",
    disable_disruption: "true",
    disable_geojson: "true"
  });
  const response = await fetcher(
    `${MARKETPLACE_NAVITIA_BASE}/stop_points/${encodeURIComponent(
      stopPointId
    )}/lines?${searchParams}`
  ).catch(() => void 0);
  if (!(response == null ? void 0 : response.ok)) {
    logTransferBundleDebug(logger, "warn", "structural-stop-point:non-ok", {
      currentLineId,
      status: response == null ? void 0 : response.status,
      statusText: response == null ? void 0 : response.statusText,
      stopPointId
    });
    return false;
  }
  const payload = await response.json().catch(() => ({}));
  const hasStructuralLine = ((_a = payload.lines) != null ? _a : []).some(
    (line) => normalizeBundleLineId(line.id) !== normalizeBundleLineId(currentLineId) && navitiaLineHasStructuralMode(line)
  );
  logTransferBundleDebug(logger, "debug", "structural-stop-point:lines", {
    currentLineId,
    hasStructuralLine,
    lineCount: (_c = (_b = payload.lines) == null ? void 0 : _b.length) != null ? _c : 0,
    lines: ((_d = payload.lines) != null ? _d : []).slice(0, 8).map(summarizeNavitiaLine),
    stopPointId
  });
  return hasStructuralLine;
}
async function fetchStopAreaHasNonCurrentStructuralLine(stopAreaId, currentLineId, fetcher, logger) {
  var _a, _b, _c, _d;
  if (!stopAreaId) {
    return false;
  }
  const searchParams = new URLSearchParams({
    count: "100",
    disable_disruption: "true",
    disable_geojson: "true"
  });
  const response = await fetcher(
    `${MARKETPLACE_NAVITIA_BASE}/stop_areas/${encodeURIComponent(
      stopAreaId
    )}/lines?${searchParams}`
  ).catch(() => void 0);
  if (!(response == null ? void 0 : response.ok)) {
    logTransferBundleDebug(logger, "warn", "structural-stop-area:non-ok", {
      currentLineId,
      status: response == null ? void 0 : response.status,
      statusText: response == null ? void 0 : response.statusText,
      stopAreaId
    });
    return false;
  }
  const payload = await response.json().catch(() => ({}));
  const hasStructuralLine = ((_a = payload.lines) != null ? _a : []).some(
    (line) => normalizeBundleLineId(line.id) !== normalizeBundleLineId(currentLineId) && navitiaLineHasStructuralMode(line)
  );
  logTransferBundleDebug(logger, "debug", "structural-stop-area:lines", {
    currentLineId,
    hasStructuralLine,
    lineCount: (_c = (_b = payload.lines) == null ? void 0 : _b.length) != null ? _c : 0,
    lines: ((_d = payload.lines) != null ? _d : []).slice(0, 8).map(summarizeNavitiaLine),
    stopAreaId
  });
  return hasStructuralLine;
}
function navitiaLineHasStructuralMode(line) {
  var _a, _b, _c;
  const modeText = [
    (_a = line.commercial_mode) == null ? void 0 : _a.id,
    (_b = line.commercial_mode) == null ? void 0 : _b.name,
    ...((_c = line.physical_modes) != null ? _c : []).flatMap((mode) => [mode.id, mode.name])
  ].map(normalizeBundleStationName).filter(Boolean).join(" ");
  return /\bmetro\b/u.test(modeText) || /\btram\b/u.test(modeText) || /\btramway\b/u.test(modeText) || /\brapidtransit\b/u.test(modeText) || /\blocaltrain\b/u.test(modeText) || /\btrain\b/u.test(modeText) || /\brail\b/u.test(modeText) || /\bcable\b/u.test(modeText) || /\bfunicular\b/u.test(modeText);
}
function inferTransitFamilyFromNavitiaLine(line) {
  var _a, _b, _c;
  const modeText = [
    (_a = line.commercial_mode) == null ? void 0 : _a.id,
    (_b = line.commercial_mode) == null ? void 0 : _b.name,
    ...((_c = line.physical_modes) != null ? _c : []).flatMap((mode) => [mode.id, mode.name]),
    line.name,
    line.code
  ].map(normalizeBundleStationName).filter(Boolean).join(" ");
  if (/\bmetro\b/u.test(modeText)) return "METRO";
  if (/\brer\b/u.test(modeText) || /\brapidtransit\b/u.test(modeText)) {
    return "RER";
  }
  if (/\btram\b/u.test(modeText) || /\btramway\b/u.test(modeText)) return "TRAM";
  if (/\bnoctilien\b/u.test(modeText)) return "NOCTILIEN";
  if (/\bbus\b/u.test(modeText)) return "BUS";
  if (/\blocaltrain\b/u.test(modeText) || /\btrain\b/u.test(modeText) || /\brail\b/u.test(modeText)) {
    return "TRANSILIEN";
  }
  if (/\bcable\b/u.test(modeText) || /\bfunicular\b/u.test(modeText)) {
    return "CABLE";
  }
  return void 0;
}
function normalizeBundleLineId(value) {
  var _a, _b;
  return ((_b = (_a = normalizeIdfmLineId(value)) != null ? _a : value) != null ? _b : "").trim().toLowerCase();
}
function normalizeIdfmLineId(value) {
  var _a, _b;
  const trimmed = value == null ? void 0 : value.trim();
  if (!trimmed) {
    return void 0;
  }
  if (/^line:IDFM:C\d{5}$/iu.test(trimmed)) {
    const idfmMatch2 = (_a = trimmed.match(/C\d{5}/iu)) == null ? void 0 : _a[0];
    return idfmMatch2 ? `line:IDFM:${idfmMatch2.toUpperCase()}` : void 0;
  }
  const idfmMatch = (_b = trimmed.match(/C\d{5}/iu)) == null ? void 0 : _b[0];
  return idfmMatch ? `line:IDFM:${idfmMatch.toUpperCase()}` : void 0;
}
function mapSearchedStopAreaToStation(stopArea) {
  var _a, _b, _c, _d, _e, _f;
  const id = ((_a = stopArea.id) == null ? void 0 : _a.startsWith("stop_area:")) ? stopArea.id : `stop_area:IDFM:${stopArea.id}`;
  return {
    id,
    label: cleanBundleStopAreaLabel((_c = (_b = stopArea.name) != null ? _b : stopArea.label) != null ? _c : id),
    city: (_f = (_e = (_d = stopArea.administrative_regions) == null ? void 0 : _d[0]) == null ? void 0 : _e.name) != null ? _f : extractBundleStopAreaCity(stopArea.label),
    monitoringRef: "",
    scheduleStopAreaRef: id
  };
}
function cleanBundleStopAreaLabel(value) {
  return value.replace(/\s+\([^)]*\)$/u, "").trim();
}
function cleanBundleConnectionStopName(value) {
  return value.trim();
}
function extractBundleStopAreaCity(value) {
  var _a;
  return (_a = value == null ? void 0 : value.match(/\(([^)]+)\)\s*$/u)) == null ? void 0 : _a[1];
}
function parseBundleDistance(value) {
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : Number.POSITIVE_INFINITY;
}
function scoreStationNameMatch(normalizedTarget, targetTokens, normalizedStation) {
  if (!normalizedTarget || !normalizedStation) {
    return 0;
  }
  if (normalizedStation.includes(normalizedTarget) || normalizedTarget.includes(normalizedStation)) {
    return Math.min(normalizedTarget.length, normalizedStation.length) >= 6 ? 80 : 0;
  }
  const stationTokens = new Set(createBundleStationTokens(normalizedStation));
  const sharedTokenCount = targetTokens.filter((token) => stationTokens.has(token)).length;
  if (sharedTokenCount === 0) {
    return 0;
  }
  return sharedTokenCount >= 2 ? 40 + sharedTokenCount : 0;
}
function createBundleStationTokens(value) {
  return value.split(/\s+/u).filter((token) => token.length >= 3).filter(
    (token) => ![
      "gare",
      "station",
      "metro",
      "rer",
      "tram",
      "bus",
      "hotel",
      "ville",
      "sur",
      "sous",
      "les",
      "des",
      "aux"
    ].includes(token)
  );
}
function normalizeBundleStationName(value) {
  return (value != null ? value : "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[\u2019']/gu, " ").replace(/[^a-z0-9]+/gu, " ").replace(/\s+/gu, " ").trim();
}
function normalizeBundleColor(value) {
  const trimmed = value == null ? void 0 : value.trim();
  if (!trimmed) {
    return void 0;
  }
  return trimmed.startsWith("#") ? trimmed.toLowerCase() : `#${trimmed.toLowerCase()}`;
}
function compareBundleTransfers(left, right) {
  var _a, _b;
  const familyDelta = bundleTransferFamilyPriority[(_a = left.family) != null ? _a : "BUS"] - bundleTransferFamilyPriority[(_b = right.family) != null ? _b : "BUS"];
  if (familyDelta !== 0) {
    return familyDelta;
  }
  return left.label.localeCompare(right.label, "fr", {
    numeric: true,
    sensitivity: "base"
  });
}
function isSupportedTransferTargetRef(value) {
  return isDirectTransferTargetRef(value) || isResolvableTransferTargetRef(value);
}
function isDirectTransferTargetRef(value) {
  return /^stop_area:/u.test(value.trim());
}
function isResolvableTransferTargetRef(value) {
  return /^FR::(?:Quay|StopPlace|mono(?:modal)?StopPlace|multi(?:modal)?StopPlace):/u.test(
    value.trim()
  );
}
function createEmptyTransferBundleMap(targets) {
  return Object.fromEntries(
    targets.map((target) => [target.stopAreaRef, []])
  );
}
async function listServerTransferBundles() {
  trimTransferCache();
  await hydrateServerTransferBundlesFromStorage();
  return Array.from(serverTransferBundles.values()).map((bundle) => ({
    id: bundle.id,
    lineId: bundle.lineId,
    lineLabel: bundle.lineLabel,
    updatedAt: bundle.updatedAt,
    expiresAt: bundle.expiresAt,
    retentionDays: bundle.retentionDays,
    requestConcurrency: bundle.requestConcurrency,
    nearbyDistanceMeters: bundle.nearbyDistanceMeters,
    stopAreaCount: bundle.stopAreaCount,
    transferCount: bundle.transferCount,
    transferResolverMode: bundle.transferResolverMode
  })).sort((left, right) => left.lineLabel.localeCompare(right.lineLabel, "fr"));
}
async function clearServerTransferBundles() {
  transferCache.clear();
  serverTransferBundles.clear();
  lineStopAreasCache.clear();
  nearbyStopAreasCache.clear();
  stopAreaLinesCache.clear();
  stopPointStructuralCache.clear();
  linePresentationCache.clear();
  const storage = getTransferBundleStorage();
  await storage.clear().catch(() => void 0);
}
async function deleteServerTransferBundle(id) {
  serverTransferBundles.delete(id);
  await getTransferBundleStorage().removeItem(createStoredTransferBundleKey(id)).catch(() => void 0);
  Array.from(transferCache.entries()).forEach(([key, cached]) => {
    if (cached.bundleId === id) {
      transferCache.delete(key);
    }
  });
}
async function deleteServerTransferBundlesForLine(lineId) {
  const normalizedLineId = lineId.trim().toLowerCase();
  const deletedBundleIds = /* @__PURE__ */ new Set();
  await hydrateServerTransferBundlesFromStorage();
  Array.from(serverTransferBundles.entries()).forEach(([id, bundle]) => {
    if (bundle.lineId.trim().toLowerCase() === normalizedLineId) {
      deletedBundleIds.add(id);
      serverTransferBundles.delete(id);
    }
  });
  await Promise.all(
    Array.from(deletedBundleIds).map(
      (id) => getTransferBundleStorage().removeItem(createStoredTransferBundleKey(id)).catch(() => void 0)
    )
  );
  Array.from(transferCache.entries()).forEach(([key, cached]) => {
    if (deletedBundleIds.has(cached.bundleId)) {
      transferCache.delete(key);
    }
  });
}
async function saveServerTransferBundle(body, transferResolverMode, bundleId, transfersByStopAreaRef) {
  return queueServerTransferBundleWrite(bundleId, async () => {
    var _a, _b, _c;
    const existing = await readServerTransferBundle(bundleId);
    const mergedTransfers = {
      ...(_a = existing == null ? void 0 : existing.transfersByStopAreaRef) != null ? _a : {},
      ...transfersByStopAreaRef
    };
    const now = Date.now();
    const updatedAt = new Date(now).toISOString();
    const bundle = {
      id: bundleId,
      lineId: body.lineId,
      lineLabel: body.lineLabel,
      generatedAt: (_b = existing == null ? void 0 : existing.generatedAt) != null ? _b : updatedAt,
      createdAt: (_c = existing == null ? void 0 : existing.createdAt) != null ? _c : updatedAt,
      updatedAt,
      expiresAt: new Date(now + body.retentionDays * DAY_MS).toISOString(),
      retentionDays: body.retentionDays,
      requestConcurrency: body.requestConcurrency,
      nearbyDistanceMeters: body.nearbyDistanceMeters,
      stopAreaCount: Object.keys(mergedTransfers).length,
      transferCount: countTransferLines(mergedTransfers),
      transferResolverMode,
      transfersByStopAreaRef: mergedTransfers
    };
    serverTransferBundles.set(bundleId, bundle);
    await writeServerTransferBundle(bundle);
    return bundle;
  });
}
async function queueServerTransferBundleWrite(bundleId, write) {
  var _a;
  const previousWrite = (_a = serverTransferBundleWriteQueues.get(bundleId)) != null ? _a : Promise.resolve();
  let result;
  const currentWrite = previousWrite.catch(() => void 0).then(async () => {
    result = await write();
  });
  serverTransferBundleWriteQueues.set(bundleId, currentWrite);
  try {
    await currentWrite;
    return result;
  } finally {
    if (serverTransferBundleWriteQueues.get(bundleId) === currentWrite) {
      serverTransferBundleWriteQueues.delete(bundleId);
    }
  }
}
function createServerTransferBundleId(lineId, transferResolverMode, nearbyDistanceMeters) {
  return `${TRANSFER_BUNDLE_RESOLVER_VERSION}::${lineId.trim().toLowerCase()}::${transferResolverMode}::d${nearbyDistanceMeters}`;
}
function createTransferBundleResponseFromStoredBundle(body, bundle, transfersByStopAreaRef) {
  return {
    version: 1,
    generatedAt: bundle.generatedAt,
    lineId: body.lineId,
    lineLabel: body.lineLabel,
    nearbyDistanceMeters: body.nearbyDistanceMeters,
    requestConcurrency: body.requestConcurrency,
    transferResolverMode: body.transferResolverMode,
    transfersByStopAreaRef
  };
}
function getReusableTransferBundleEntries(bundle, targets) {
  if (!bundle) {
    return {};
  }
  return Object.fromEntries(
    targets.flatMap(
      (target) => {
        var _a;
        return Object.prototype.hasOwnProperty.call(bundle.transfersByStopAreaRef, target.stopAreaRef) ? [[target.stopAreaRef, (_a = bundle.transfersByStopAreaRef[target.stopAreaRef]) != null ? _a : []]] : [];
      }
    )
  );
}
async function readServerTransferBundle(bundleId, logger) {
  const memoryBundle = serverTransferBundles.get(bundleId);
  if (memoryBundle && !serverTransferBundleIsExpired(memoryBundle)) {
    return memoryBundle;
  }
  if (memoryBundle) {
    serverTransferBundles.delete(bundleId);
  }
  const storage = getTransferBundleStorage();
  const storedBundle = await storage.getItem(createStoredTransferBundleKey(bundleId)).catch((error) => {
    logTransferBundleDebug(logger, "warn", "storage:read-error", {
      bundleId,
      error: formatTransferBundleError(error)
    });
    return null;
  });
  if (!storedBundle) {
    return void 0;
  }
  if (serverTransferBundleIsExpired(storedBundle)) {
    await storage.removeItem(createStoredTransferBundleKey(bundleId)).catch(() => void 0);
    return void 0;
  }
  serverTransferBundles.set(bundleId, storedBundle);
  return storedBundle;
}
async function writeServerTransferBundle(bundle) {
  await getTransferBundleStorage().setItem(createStoredTransferBundleKey(bundle.id), bundle).catch((error) => {
    console.warn("[transfer-bundles] storage:write-error", {
      bundleId: bundle.id,
      error: formatTransferBundleError(error)
    });
  });
}
async function hydrateServerTransferBundlesFromStorage() {
  const storage = getTransferBundleStorage();
  const keys = await storage.getKeys().catch(() => []);
  await Promise.all(
    keys.map(async (key) => {
      const bundle = await storage.getItem(key).catch(() => null);
      if (!bundle) {
        return;
      }
      if (serverTransferBundleIsExpired(bundle)) {
        await storage.removeItem(key).catch(() => void 0);
        return;
      }
      serverTransferBundles.set(bundle.id, bundle);
    })
  );
}
function getTransferBundleStorage() {
  if (typeof useStorage === "function") {
    return useStorage(
      TRANSFER_BUNDLE_STORAGE_BASE
    );
  }
  return {
    async clear() {
      fallbackTransferBundleStorage.clear();
    },
    async getItem(key) {
      var _a;
      return (_a = fallbackTransferBundleStorage.get(key)) != null ? _a : null;
    },
    async getKeys() {
      return Array.from(fallbackTransferBundleStorage.keys());
    },
    async removeItem(key) {
      fallbackTransferBundleStorage.delete(key);
    },
    async setItem(key, value) {
      fallbackTransferBundleStorage.set(key, value);
    }
  };
}
function createStoredTransferBundleKey(bundleId) {
  return encodeURIComponent(bundleId);
}
function serverTransferBundleIsExpired(bundle) {
  return Date.parse(bundle.expiresAt) <= Date.now();
}
function createTransferBundleDebugLogger() {
  return {
    requestId: `tb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: Date.now()
  };
}
function logTransferBundleDebug(logger, level, step, details = {}) {
  if (!logger) {
    return;
  }
  const payload = {
    elapsedMs: Date.now() - logger.startedAt,
    requestId: logger.requestId,
    step,
    ...details
  };
  const message = `[transfer-bundles] ${logger.requestId} ${step}`;
  if (level === "error") {
    console.error(message, payload);
    return;
  }
  if (level === "warn") {
    console.warn(message, payload);
    return;
  }
  if (level === "debug") {
    console.debug(message, payload);
    return;
  }
  console.info(message, payload);
}
function summarizeTransferTarget(target) {
  return {
    city: target.city,
    label: target.label,
    stopAreaRef: target.stopAreaRef
  };
}
function summarizeStationOption(station) {
  return {
    city: station.city,
    id: station.id,
    label: station.label,
    scheduleStopAreaRef: station.scheduleStopAreaRef
  };
}
function summarizeTransferLines(transfers) {
  if (!transfers) {
    return {
      count: "undefined",
      labels: []
    };
  }
  const families = transfers.reduce((counts, transfer) => {
    var _a, _b;
    const family = (_a = transfer.family) != null ? _a : "UNKNOWN";
    counts[family] = ((_b = counts[family]) != null ? _b : 0) + 1;
    return counts;
  }, {});
  return {
    count: transfers.length,
    families,
    labels: transfers.map((transfer) => transfer.label)
  };
}
function summarizeNavitiaLine(line) {
  var _a, _b, _c, _d;
  return {
    code: line.code,
    commercialMode: (_c = (_a = line.commercial_mode) == null ? void 0 : _a.name) != null ? _c : (_b = line.commercial_mode) == null ? void 0 : _b.id,
    id: line.id,
    name: line.name,
    physicalModes: ((_d = line.physical_modes) != null ? _d : []).map((mode) => {
      var _a2;
      return (_a2 = mode.name) != null ? _a2 : mode.id;
    })
  };
}
function summarizeStringList(values, limit = 16) {
  return {
    count: values.length,
    omittedCount: Math.max(0, values.length - limit),
    sample: values.slice(0, limit)
  };
}
function countTransferLines(transfersByStopAreaRef) {
  return Object.values(transfersByStopAreaRef).reduce(
    (count, transfers) => count + transfers.length,
    0
  );
}
function formatTransferBundleError(error) {
  var _a;
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      status: "status" in error && typeof error.status === "number" ? error.status : void 0,
      stack: (_a = error.stack) == null ? void 0 : _a.split("\n").slice(0, 4)
    };
  }
  return {
    message: String(error)
  };
}
function createTransferBundleHttpStatusError(status, statusText) {
  return Object.assign(new Error(`HTTP ${status}`), {
    status,
    statusText
  });
}
function isTransferBundleHttpStatus(error, status) {
  return error instanceof Error && "status" in error && typeof error.status === "number" && error.status === status;
}
function sanitizeTransferBundleUrl(value) {
  try {
    const url = new URL(value);
    url.searchParams.delete("apikey");
    return url.toString();
  } catch {
    return value.replace(/apikey=[^&]+/giu, "apikey=<redacted>");
  }
}
function createServerNavitiaFetcher(apiKey) {
  return async (input, init) => {
    var _a;
    const headers = new Headers(init == null ? void 0 : init.headers);
    headers.set("accept", "application/json");
    headers.set("apikey", apiKey);
    const delays = [220, 680, 1500];
    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
      const response = await fetch(input, {
        ...init,
        headers
      });
      if (!responseShouldRetry(response) || attempt === delays.length) {
        return response;
      }
      const retryDelayMs = (_a = getRetryAfterDelayMs(response)) != null ? _a : delays[attempt];
      console.warn("[transfer-bundles] navitia-fetch:retry", {
        attempt: attempt + 1,
        delayMs: retryDelayMs,
        status: response.status,
        statusText: response.statusText,
        url: sanitizeTransferBundleUrl(String(input))
      });
      await waitForTransferBundleRetry(retryDelayMs);
    }
    return fetch(input, {
      ...init,
      headers
    });
  };
}
function responseShouldRetry(response) {
  return response.status === 429 || response.status >= 500;
}
function getRetryAfterDelayMs(response) {
  var _a;
  const value = (_a = response.headers.get("retry-after")) == null ? void 0 : _a.trim();
  if (!value) {
    return void 0;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.min(MAX_SERVER_RETRY_AFTER_DELAY_MS, Math.max(0, seconds * 1e3));
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.min(MAX_SERVER_RETRY_AFTER_DELAY_MS, Math.max(0, timestamp - Date.now())) : void 0;
}
function waitForTransferBundleRetry(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
function trimTransferCache() {
  const now = Date.now();
  Array.from(serverTransferBundles.entries()).forEach(([key, bundle]) => {
    if (Date.parse(bundle.expiresAt) <= now) {
      serverTransferBundles.delete(key);
    }
  });
  Array.from(transferCache.entries()).forEach(([key, cached]) => {
    if (cached.expiresAt <= now || !serverTransferBundles.has(cached.bundleId)) {
      transferCache.delete(key);
    }
  });
  Array.from(lineStopAreasCache.entries()).forEach(([key, cached]) => {
    if (cached.expiresAt <= now) {
      lineStopAreasCache.delete(key);
    }
  });
  Array.from(nearbyStopAreasCache.entries()).forEach(([key, cached]) => {
    if (cached.expiresAt <= now) {
      nearbyStopAreasCache.delete(key);
    }
  });
  Array.from(stopAreaLinesCache.entries()).forEach(([key, cached]) => {
    if (cached.expiresAt <= now) {
      stopAreaLinesCache.delete(key);
    }
  });
  Array.from(stopPointStructuralCache.entries()).forEach(([key, cached]) => {
    if (cached.expiresAt <= now) {
      stopPointStructuralCache.delete(key);
    }
  });
  Array.from(linePresentationCache.entries()).forEach(([key, cached]) => {
    if (cached.expiresAt <= now) {
      linePresentationCache.delete(key);
    }
  });
}
function clearTransferResolutionRuntimeCaches() {
  transferCache.clear();
  lineStopAreasCache.clear();
  nearbyStopAreasCache.clear();
  stopAreaLinesCache.clear();
  stopPointStructuralCache.clear();
  linePresentationCache.clear();
}

const transferBundles_post$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  clearServerTransferBundles: clearServerTransferBundles,
  createEmptyTransferBundleMap: createEmptyTransferBundleMap,
  createTransferBundleResponse: createTransferBundleResponse,
  default: transferBundles_post,
  deleteServerTransferBundle: deleteServerTransferBundle,
  deleteServerTransferBundlesForLine: deleteServerTransferBundlesForLine,
  enrichTransferLineOptionsWithNavitia: enrichTransferLineOptionsWithNavitia,
  fetchOfficialConnectionStopNames: fetchOfficialConnectionStopNames,
  findMatchingLineStation: findMatchingLineStation,
  isSupportedTransferTargetRef: isSupportedTransferTargetRef,
  listServerTransferBundles: listServerTransferBundles,
  resolveOfficialConnectionStopNames: resolveOfficialConnectionStopNames
}, Symbol.toStringTag, { value: 'Module' }));

const transferBundles_delete = defineEventHandler(async (event) => {
  const body = await readBody(event).catch(
    () => void 0
  );
  const id = typeof (body == null ? void 0 : body.id) === "string" ? body.id.trim() : "";
  const lineId = typeof (body == null ? void 0 : body.lineId) === "string" ? body.lineId.trim() : "";
  if (id) {
    await deleteServerTransferBundle(id);
  } else if (lineId) {
    await deleteServerTransferBundlesForLine(lineId);
  } else {
    await clearServerTransferBundles();
  }
  return {
    bundles: await listServerTransferBundles()
  };
});

const transferBundles_delete$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: transferBundles_delete
}, Symbol.toStringTag, { value: 'Module' }));

const transferBundles_get = defineEventHandler(async () => ({
  bundles: await listServerTransferBundles()
}));

const transferBundles_get$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: transferBundles_get
}, Symbol.toStringTag, { value: 'Module' }));

const WEATHER_PRIORITY = {
  normal: 0,
  rain: 1,
  heat: 2,
  snow: 3,
  storm: 4
};
function normalizeOpenMeteoWeather(payload, options) {
  var _a;
  const now = (_a = options.now) != null ? _a : /* @__PURE__ */ new Date();
  const generatedAt = now.toISOString();
  const samples = collectForecastSamples(payload);
  const currentCondition = getCurrentCondition(payload.current, samples, now);
  const alert = findPriorityAlert(samples, payload, now, options.lookaheadMinutes);
  const condition = alert ? weatherAlertToCondition(alert) : currentCondition != null ? currentCondition : createNormalCondition(payload.current);
  return {
    generatedAt,
    source: "open-meteo",
    location: options.location,
    condition,
    alert,
    forecast: createWeatherForecast(payload, now)
  };
}
function createWeatherForecast(payload, now) {
  return {
    current: createCurrentForecast(payload.current, payload.hourly, now),
    hourly: createHourlyForecast(payload.hourly, now),
    daily: createDailyForecast(payload.daily)
  };
}
function createCurrentForecast(current, hourly, now) {
  var _a, _b;
  if (current) {
    const weatherCode = readNumberAt([(_a = current.weather_code) != null ? _a : Number.NaN], 0);
    return {
      time: (_b = parseOpenMeteoTime(current.time)) == null ? void 0 : _b.toISOString(),
      label: getWeatherCodeLabel(weatherCode),
      weatherCode,
      temperatureC: current.temperature_2m,
      apparentTemperatureC: current.apparent_temperature,
      humidityPercent: current.relative_humidity_2m,
      precipitationMm: current.precipitation,
      precipitationProbabilityPercent: findNearestHourlyValue(
        hourly,
        now,
        "precipitation_probability"
      ),
      windSpeedKmh: current.wind_speed_10m,
      windGustKmh: current.wind_gusts_10m
    };
  }
  const nearestHour = createHourlyForecast(hourly, now)[0];
  return nearestHour ? {
    time: nearestHour.time,
    label: nearestHour.label,
    weatherCode: nearestHour.weatherCode,
    temperatureC: nearestHour.temperatureC,
    apparentTemperatureC: nearestHour.apparentTemperatureC,
    humidityPercent: nearestHour.humidityPercent,
    precipitationMm: nearestHour.precipitationMm,
    precipitationProbabilityPercent: nearestHour.precipitationProbabilityPercent,
    windSpeedKmh: nearestHour.windSpeedKmh,
    windGustKmh: nearestHour.windGustKmh
  } : void 0;
}
function createHourlyForecast(hourly, now) {
  var _a;
  if (!((_a = hourly == null ? void 0 : hourly.time) == null ? void 0 : _a.length)) {
    return [];
  }
  return hourly.time.map((timeValue, index) => {
    const time = parseOpenMeteoTime(timeValue);
    if (!time || time.getTime() < now.getTime() - 90 * 6e4) {
      return void 0;
    }
    const weatherCode = readNumberAt(hourly.weather_code, index);
    return {
      time: time.toISOString(),
      label: getWeatherCodeLabel(weatherCode),
      weatherCode,
      temperatureC: readNumberAt(hourly.temperature_2m, index),
      apparentTemperatureC: readNumberAt(hourly.apparent_temperature, index),
      humidityPercent: readNumberAt(hourly.relative_humidity_2m, index),
      precipitationMm: readNumberAt(hourly.precipitation, index),
      precipitationProbabilityPercent: readNumberAt(
        hourly.precipitation_probability,
        index
      ),
      windSpeedKmh: readNumberAt(hourly.wind_speed_10m, index),
      windGustKmh: readNumberAt(hourly.wind_gusts_10m, index)
    };
  }).filter((hour) => Boolean(hour)).slice(0, 24 * 8);
}
function createDailyForecast(daily) {
  var _a;
  if (!((_a = daily == null ? void 0 : daily.time) == null ? void 0 : _a.length)) {
    return [];
  }
  return daily.time.map((timeValue, index) => {
    var _a2, _b, _c;
    const time = parseOpenMeteoTime(timeValue);
    if (!time) {
      return void 0;
    }
    const weatherCode = readNumberAt(daily.weather_code, index);
    return {
      date: time.toISOString(),
      label: getWeatherCodeLabel(weatherCode),
      weatherCode,
      temperatureMaxC: readNumberAt(daily.temperature_2m_max, index),
      temperatureMinC: readNumberAt(daily.temperature_2m_min, index),
      apparentTemperatureMaxC: readNumberAt(
        daily.apparent_temperature_max,
        index
      ),
      precipitationMm: Math.max(
        0,
        (_a2 = readNumberAt(daily.precipitation_sum, index)) != null ? _a2 : 0,
        (_b = readNumberAt(daily.rain_sum, index)) != null ? _b : 0,
        (_c = readNumberAt(daily.snowfall_sum, index)) != null ? _c : 0
      ),
      precipitationProbabilityPercent: readNumberAt(
        daily.precipitation_probability_max,
        index
      ),
      windSpeedMaxKmh: readNumberAt(daily.wind_speed_10m_max, index),
      windGustMaxKmh: readNumberAt(daily.wind_gusts_10m_max, index)
    };
  }).filter((day) => Boolean(day)).slice(0, 8);
}
function findNearestHourlyValue(hourly, now, key) {
  var _a;
  if (!((_a = hourly == null ? void 0 : hourly.time) == null ? void 0 : _a.length)) {
    return void 0;
  }
  let nearest;
  hourly.time.forEach((timeValue, index) => {
    const time = parseOpenMeteoTime(timeValue);
    const value = readNumberAt(hourly[key], index);
    if (!time || typeof value !== "number") {
      return;
    }
    const distance = Math.abs(time.getTime() - now.getTime());
    if (!nearest || distance < nearest.distance) {
      nearest = { distance, value };
    }
  });
  return nearest == null ? void 0 : nearest.value;
}
function collectForecastSamples(payload) {
  var _a;
  const minutelyForecast = (_a = payload.minutely_15) != null ? _a : payload.forecast_minutely_15;
  return [
    ...readSeriesSamples(minutelyForecast),
    ...readSeriesSamples(payload.hourly)
  ].sort((left, right) => left.time.getTime() - right.time.getTime());
}
function readSeriesSamples(series) {
  var _a;
  if (!((_a = series == null ? void 0 : series.time) == null ? void 0 : _a.length)) {
    return [];
  }
  return series.time.map((timeValue, index) => {
    const time = parseOpenMeteoTime(timeValue);
    if (!time) {
      return void 0;
    }
    return createSample({
      time,
      temperatureC: readNumberAt(series.temperature_2m, index),
      apparentTemperatureC: readNumberAt(series.apparent_temperature, index),
      precipitation: readNumberAt(series.precipitation, index),
      rain: readNumberAt(series.rain, index),
      showers: readNumberAt(series.showers, index),
      snowfall: readNumberAt(series.snowfall, index),
      weatherCode: readNumberAt(series.weather_code, index),
      windGustKmh: readNumberAt(series.wind_gusts_10m, index)
    });
  }).filter((sample) => Boolean(sample));
}
function getCurrentCondition(current, samples, now) {
  var _a;
  if (current) {
    const currentSample = createSample({
      time: (_a = parseOpenMeteoTime(current.time)) != null ? _a : now,
      temperatureC: current.temperature_2m,
      apparentTemperatureC: current.apparent_temperature,
      precipitation: current.precipitation,
      rain: current.rain,
      showers: current.showers,
      snowfall: current.snowfall,
      weatherCode: current.weather_code,
      windGustKmh: current.wind_gusts_10m
    });
    return sampleToCondition(currentSample);
  }
  const nearestSample = samples.find(
    (sample) => Math.abs(sample.time.getTime() - now.getTime()) <= 60 * 6e4
  );
  return nearestSample ? sampleToCondition(nearestSample) : void 0;
}
function findPriorityAlert(samples, payload, now, lookaheadMinutes) {
  var _a;
  const windowEnd = new Date(now.getTime() + lookaheadMinutes * 6e4);
  const candidates = samples.filter(
    (sample) => sample.kind !== "normal" && sample.time.getTime() >= now.getTime() - 20 * 6e4 && sample.time.getTime() <= windowEnd.getTime()
  );
  const heatAlert = findDailyHeatAlert(payload, now, windowEnd);
  if (heatAlert) {
    candidates.push(heatAlert);
  }
  if (candidates.length === 0) {
    return void 0;
  }
  const selected = candidates.sort(
    (left, right) => WEATHER_PRIORITY[right.kind] - WEATHER_PRIORITY[left.kind] || left.time.getTime() - right.time.getTime()
  )[0];
  const eventStart = (_a = findEventBoundary(samples, selected, -1)) != null ? _a : selected.time;
  const effectiveStart = eventStart.getTime() < now.getTime() ? now : eventStart;
  const eventEnd = findEventBoundary(samples, selected, 1);
  const endsInMinutes = eventEnd ? Math.max(0, Math.round((eventEnd.getTime() - now.getTime()) / 6e4)) : void 0;
  return {
    kind: selected.kind,
    label: getWeatherLabel(selected.kind),
    startsAt: effectiveStart.toISOString(),
    startsInMinutes: Math.max(
      0,
      Math.round((effectiveStart.getTime() - now.getTime()) / 6e4)
    ),
    umbrellaAfter: selected.kind === "rain" || selected.kind === "storm" ? effectiveStart.toISOString() : void 0,
    endsAt: eventEnd == null ? void 0 : eventEnd.toISOString(),
    endsInMinutes: typeof endsInMinutes === "number" && endsInMinutes <= 120 ? endsInMinutes : void 0,
    intensity: selected.intensity,
    temperatureC: selected.temperatureC,
    apparentTemperatureC: selected.apparentTemperatureC
  };
}
function findDailyHeatAlert(payload, now, windowEnd) {
  var _a, _b, _c, _d, _e, _f;
  const maxTemperatures = (_b = (_a = payload.daily) == null ? void 0 : _a.temperature_2m_max) != null ? _b : [];
  const maxApparentTemperatures = (_d = (_c = payload.daily) == null ? void 0 : _c.apparent_temperature_max) != null ? _d : [];
  const timeValues = (_f = (_e = payload.daily) == null ? void 0 : _e.time) != null ? _f : [];
  for (let index = 0; index < timeValues.length; index += 1) {
    const time = parseOpenMeteoTime(timeValues[index]);
    const temperatureC = readNumberAt(maxTemperatures, index);
    const apparentTemperatureC = readNumberAt(maxApparentTemperatures, index);
    const strongestTemperature = Math.max(
      temperatureC != null ? temperatureC : Number.NEGATIVE_INFINITY,
      apparentTemperatureC != null ? apparentTemperatureC : Number.NEGATIVE_INFINITY
    );
    if (!time || strongestTemperature < 32) {
      continue;
    }
    const sample = {
      time: time.getTime() < now.getTime() ? now : new Date(time.getTime() + 14 * 60 * 6e4),
      kind: "heat",
      intensity: getHeatIntensity(strongestTemperature),
      temperatureC,
      apparentTemperatureC
    };
    if (sample.time <= windowEnd) {
      return sample;
    }
  }
  return void 0;
}
function findEventBoundary(samples, selected, direction) {
  var _a;
  const selectedIndex = samples.findIndex(
    (sample) => sample.time.getTime() === selected.time.getTime()
  );
  if (selectedIndex < 0) {
    return void 0;
  }
  let cursor = selectedIndex;
  while (samples[cursor + direction] && samples[cursor + direction].kind === selected.kind) {
    cursor += direction;
  }
  return direction === -1 ? samples[cursor].time : (_a = samples[cursor + 1]) == null ? void 0 : _a.time;
}
function createSample(input) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const code = Math.round((_a = input.weatherCode) != null ? _a : 0);
  const precipitation = Math.max(
    0,
    (_b = input.precipitation) != null ? _b : 0,
    (_c = input.rain) != null ? _c : 0,
    (_d = input.showers) != null ? _d : 0
  );
  const snowfall = Math.max(0, (_e = input.snowfall) != null ? _e : 0);
  const apparentOrAir = Math.max(
    (_f = input.temperatureC) != null ? _f : Number.NEGATIVE_INFINITY,
    (_g = input.apparentTemperatureC) != null ? _g : Number.NEGATIVE_INFINITY
  );
  if (isStormCode(code) || ((_h = input.windGustKmh) != null ? _h : 0) >= 70) {
    return {
      ...input,
      kind: "storm",
      intensity: getPrecipitationIntensity(Math.max(precipitation, 1.5))
    };
  }
  if (isSnowCode(code) || snowfall > 0) {
    return {
      ...input,
      kind: "snow",
      intensity: getSnowIntensity(snowfall)
    };
  }
  if (apparentOrAir >= 32) {
    return {
      ...input,
      kind: "heat",
      intensity: getHeatIntensity(apparentOrAir)
    };
  }
  if (isRainCode(code) || precipitation > 0) {
    return {
      ...input,
      kind: "rain",
      intensity: getPrecipitationIntensity(precipitation)
    };
  }
  return {
    ...input,
    kind: "normal",
    intensity: 1
  };
}
function sampleToCondition(sample) {
  return {
    kind: sample.kind,
    label: getWeatherLabel(sample.kind),
    intensity: sample.intensity,
    temperatureC: sample.temperatureC,
    apparentTemperatureC: sample.apparentTemperatureC
  };
}
function weatherAlertToCondition(alert) {
  return {
    kind: alert.kind,
    label: alert.label,
    intensity: alert.intensity,
    temperatureC: alert.temperatureC,
    apparentTemperatureC: alert.apparentTemperatureC
  };
}
function createNormalCondition(current) {
  return {
    kind: "normal",
    label: getWeatherLabel("normal"),
    intensity: 1,
    temperatureC: current == null ? void 0 : current.temperature_2m,
    apparentTemperatureC: current == null ? void 0 : current.apparent_temperature
  };
}
function parseOpenMeteoTime(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1e3);
  }
  if (typeof value !== "string" || value.trim() === "") {
    return void 0;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? void 0 : date;
}
function readNumberAt(values, index) {
  const value = values == null ? void 0 : values[index];
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function isRainCode(code) {
  return [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code);
}
function isSnowCode(code) {
  return [71, 73, 75, 77, 85, 86].includes(code);
}
function isStormCode(code) {
  return [95, 96, 99].includes(code);
}
function getPrecipitationIntensity(amountMm) {
  if (amountMm >= 4) {
    return 3;
  }
  if (amountMm >= 1.2) {
    return 2;
  }
  return 1;
}
function getSnowIntensity(amountMm) {
  if (amountMm >= 2.5) {
    return 3;
  }
  if (amountMm >= 0.7) {
    return 2;
  }
  return 1;
}
function getHeatIntensity(temperatureC) {
  if (temperatureC >= 38) {
    return 3;
  }
  if (temperatureC >= 35) {
    return 2;
  }
  return 1;
}
function getWeatherLabel(kind) {
  return {
    normal: "Calm weather",
    rain: "Rain",
    storm: "Storm",
    snow: "Snow",
    heat: "Heatwave"
  }[kind];
}
function getWeatherCodeLabel(code) {
  if (typeof code !== "number") {
    return "Weather unavailable";
  }
  if (code === 0) {
    return "Clear sky";
  }
  if ([1, 2, 3].includes(code)) {
    return "Mostly cloudy";
  }
  if ([45, 48].includes(code)) {
    return "Fog";
  }
  if ([51, 53, 55, 56, 57].includes(code)) {
    return "Drizzle";
  }
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return "Rain";
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return "Snow";
  }
  if ([95, 96, 99].includes(code)) {
    return "Storm";
  }
  return "Variable weather";
}

const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const WEATHER_CACHE_TTL_MS = 10 * 6e4;
const WEATHER_TIMEOUT_MS = 3500;
const weatherCache = /* @__PURE__ */ new Map();
const weather_get = defineEventHandler(async (event) => {
  const location = readWeatherLocation(event);
  const lookaheadMinutes = readLookaheadMinutes(event);
  const payload = await fetchCachedOpenMeteoForecast(location);
  setHeader(event, "cache-control", "s-maxage=300, stale-while-revalidate=600");
  return normalizeOpenMeteoWeather(payload, {
    location,
    lookaheadMinutes
  });
});
function readWeatherLocation(event) {
  const query = getQuery$1(event);
  return {
    label: typeof query.locationLabel === "string" && query.locationLabel.trim() ? query.locationLabel.trim() : "Paris",
    latitude: readCoordinate(query.latitude, 48.8566, -90, 90),
    longitude: readCoordinate(query.longitude, 2.3522, -180, 180)
  };
}
function readLookaheadMinutes(event) {
  var _a;
  const value = Number.parseInt(String((_a = getQuery$1(event).lookaheadMinutes) != null ? _a : ""), 10);
  return [60, 120, 240, 480, 720, 1440].includes(value) ? value : 1440;
}
function readCoordinate(value, fallback, min, max) {
  const numericValue = Number.parseFloat(String(value != null ? value : ""));
  return Number.isFinite(numericValue) ? Math.min(max, Math.max(min, numericValue)) : fallback;
}
async function fetchCachedOpenMeteoForecast(location) {
  const cacheKey = `${location.latitude.toFixed(4)}:${location.longitude.toFixed(4)}`;
  const cached = weatherCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }
  const promise = fetchOpenMeteoForecast(location);
  weatherCache.set(cacheKey, {
    expiresAt: now + WEATHER_CACHE_TTL_MS,
    promise
  });
  return promise.catch((error) => {
    weatherCache.delete(cacheKey);
    throw error;
  });
}
async function fetchOpenMeteoForecast(location) {
  const url = new URL(OPEN_METEO_FORECAST_URL);
  url.searchParams.set("latitude", String(location.latitude));
  url.searchParams.set("longitude", String(location.longitude));
  url.searchParams.set(
    "current",
    [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "precipitation",
      "rain",
      "showers",
      "snowfall",
      "weather_code",
      "wind_speed_10m",
      "wind_gusts_10m"
    ].join(",")
  );
  url.searchParams.set(
    "minutely_15",
    [
      "temperature_2m",
      "apparent_temperature",
      "precipitation",
      "rain",
      "snowfall",
      "weather_code",
      "wind_gusts_10m"
    ].join(",")
  );
  url.searchParams.set(
    "hourly",
    [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "precipitation_probability",
      "precipitation",
      "rain",
      "snowfall",
      "weather_code",
      "wind_speed_10m",
      "wind_gusts_10m"
    ].join(",")
  );
  url.searchParams.set(
    "daily",
    [
      "temperature_2m_max",
      "temperature_2m_min",
      "apparent_temperature_max",
      "precipitation_probability_max",
      "precipitation_sum",
      "rain_sum",
      "snowfall_sum",
      "weather_code",
      "wind_speed_10m_max",
      "wind_gusts_10m_max"
    ].join(",")
  );
  url.searchParams.set("forecast_days", "8");
  url.searchParams.set("timezone", "Europe/Paris");
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: `Open-Meteo request failed: ${response.status} ${response.statusText}`
    });
  }
  return await response.json();
}
async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: {
        accept: "application/json"
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

const weather_get$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: weather_get
}, Symbol.toStringTag, { value: 'Module' }));

function renderPayloadJsonScript(opts) {
  const contents = opts.data ? stringify(opts.data, opts.ssrContext._payloadReducers) : "";
  const payload = {
    "type": "application/json",
    "innerHTML": contents,
    "data-nuxt-data": appId,
    "data-ssr": false
  };
  {
    payload.id = "__NUXT_DATA__";
  }
  if (opts.src) {
    payload["data-src"] = opts.src;
  }
  const config = uneval(opts.ssrContext.config);
  return [
    payload,
    {
      innerHTML: `window.__NUXT__={};window.__NUXT__.config=${config}`
    }
  ];
}

const renderSSRHeadOptions = {"omitLineBreaks":false};

globalThis.__buildAssetsURL = buildAssetsURL;
globalThis.__publicAssetsURL = publicAssetsURL;
const HAS_APP_TELEPORTS = !!(appTeleportAttrs.id);
const APP_TELEPORT_OPEN_TAG = HAS_APP_TELEPORTS ? `<${appTeleportTag}${propsToString(appTeleportAttrs)}>` : "";
const APP_TELEPORT_CLOSE_TAG = HAS_APP_TELEPORTS ? `</${appTeleportTag}>` : "";
const renderer = defineRenderHandler(async (event) => {
  const nitroApp = useNitroApp();
  const ssrError = event.path.startsWith("/__nuxt_error") ? getQuery$1(event) : null;
  if (ssrError && !("__unenv__" in event.node.req)) {
    throw createError({
      statusCode: 404,
      statusMessage: "Page Not Found: /__nuxt_error"
    });
  }
  const ssrContext = createSSRContext(event);
  const headEntryOptions = { mode: "server" };
  ssrContext.head.push(appHead, headEntryOptions);
  if (ssrError) {
    ssrError.statusCode &&= Number.parseInt(ssrError.statusCode);
    setSSRError(ssrContext, ssrError);
  }
  const routeOptions = getRouteRules(event);
  if (routeOptions.ssr === false) {
    ssrContext.noSSR = true;
  }
  const renderer = await getRenderer();
  const _rendered = await renderer.renderToString(ssrContext).catch(async (error) => {
    if (ssrContext._renderResponse && error.message === "skipping render") {
      return {};
    }
    const _err = !ssrError && ssrContext.payload?.error || error;
    await ssrContext.nuxt?.hooks.callHook("app:error", _err);
    throw _err;
  });
  const inlinedStyles = [];
  await ssrContext.nuxt?.hooks.callHook("app:rendered", { ssrContext, renderResult: _rendered });
  if (ssrContext._renderResponse) {
    return ssrContext._renderResponse;
  }
  if (ssrContext.payload?.error && !ssrError) {
    throw ssrContext.payload.error;
  }
  const NO_SCRIPTS = routeOptions.noScripts;
  const { styles, scripts } = getRequestDependencies(ssrContext, renderer.rendererContext);
  if (inlinedStyles.length) {
    ssrContext.head.push({ style: inlinedStyles });
  }
  const link = [];
  for (const resource of Object.values(styles)) {
    if ("inline" in getQuery(resource.file)) {
      continue;
    }
    link.push({ rel: "stylesheet", href: renderer.rendererContext.buildAssetsURL(resource.file), crossorigin: "" });
  }
  if (link.length) {
    ssrContext.head.push({ link }, headEntryOptions);
  }
  if (!NO_SCRIPTS) {
    ssrContext.head.push({
      link: getPreloadLinks(ssrContext, renderer.rendererContext)
    }, headEntryOptions);
    ssrContext.head.push({
      link: getPrefetchLinks(ssrContext, renderer.rendererContext)
    }, headEntryOptions);
    ssrContext.head.push({
      script: renderPayloadJsonScript({ ssrContext, data: ssrContext.payload }) 
    }, {
      ...headEntryOptions,
      // this should come before another end of body scripts
      tagPosition: "bodyClose",
      tagPriority: "high"
    });
  }
  if (!routeOptions.noScripts) {
    const tagPosition = "head";
    ssrContext.head.push({
      script: Object.values(scripts).map((resource) => ({
        type: resource.module ? "module" : null,
        src: renderer.rendererContext.buildAssetsURL(resource.file),
        defer: resource.module ? null : true,
        // if we are rendering script tag payloads that import an async payload
        // we need to ensure this resolves before executing the Nuxt entry
        tagPosition,
        crossorigin: ""
      }))
    }, headEntryOptions);
  }
  const { headTags, bodyTags, bodyTagsOpen, htmlAttrs, bodyAttrs } = await renderSSRHead(ssrContext.head, renderSSRHeadOptions);
  const htmlContext = {
    htmlAttrs: htmlAttrs ? [htmlAttrs] : [],
    head: normalizeChunks([headTags]),
    bodyAttrs: bodyAttrs ? [bodyAttrs] : [],
    bodyPrepend: normalizeChunks([bodyTagsOpen, ssrContext.teleports?.body]),
    body: [
      replaceIslandTeleports(ssrContext, _rendered.html) ,
      APP_TELEPORT_OPEN_TAG + (HAS_APP_TELEPORTS ? joinTags([ssrContext.teleports?.[`#${appTeleportAttrs.id}`]]) : "") + APP_TELEPORT_CLOSE_TAG
    ],
    bodyAppend: [bodyTags]
  };
  await nitroApp.hooks.callHook("render:html", htmlContext, { event });
  return {
    body: renderHTMLDocument(htmlContext),
    statusCode: getResponseStatus(event),
    statusMessage: getResponseStatusText(event),
    headers: {
      "content-type": "text/html;charset=utf-8",
      "x-powered-by": "Nuxt"
    }
  };
});
function normalizeChunks(chunks) {
  const result = [];
  for (const _chunk of chunks) {
    const chunk = _chunk?.trim();
    if (chunk) {
      result.push(chunk);
    }
  }
  return result;
}
function joinTags(tags) {
  return tags.join("");
}
function joinAttrs(chunks) {
  if (chunks.length === 0) {
    return "";
  }
  return " " + chunks.join(" ");
}
function renderHTMLDocument(html) {
  return `<!DOCTYPE html><html${joinAttrs(html.htmlAttrs)}><head>${joinTags(html.head)}</head><body${joinAttrs(html.bodyAttrs)}>${joinTags(html.bodyPrepend)}${joinTags(html.body)}${joinTags(html.bodyAppend)}</body></html>`;
}

const renderer$1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: renderer
}, Symbol.toStringTag, { value: 'Module' }));
//# sourceMappingURL=index.mjs.map
