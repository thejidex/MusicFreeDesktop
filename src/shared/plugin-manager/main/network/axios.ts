import axios, { InternalAxiosRequestConfig } from "axios";
import { app, session } from "electron";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import AppConfig from "@shared/app-config/main";
import BilibiliAgent from "./bilibili-agent";

const httpAdapter = axios.getAdapter("http");
const agents = new Map<string, { http: HttpProxyAgent<string>; https: HttpsProxyAgent<string>; bilibili: BilibiliAgent }>();

function getAgents(proxy: URL) {
    const key = proxy.href;
    if (!agents.has(key)) {
        if (agents.size >= 16) agents.delete(agents.keys().next().value);
        agents.set(key, {
            http: new HttpProxyAgent(proxy),
            https: new HttpsProxyAgent(proxy),
            bilibili: new BilibiliAgent(proxy),
        });
    }
    return agents.get(key);
}

function getManualProxy(): URL | undefined {
    const config = AppConfig.getAllConfig();
    if (!config?.["network.proxy.enabled"]) return;
    const host = config["network.proxy.host"];
    if (!host) throw new Error("Network proxy host is empty");
    const proxy = new URL(host.includes("://") ? host : `http://${host}`);
    if (config["network.proxy.port"]) proxy.port = config["network.proxy.port"];
    if (config["network.proxy.username"]) proxy.username = config["network.proxy.username"];
    if (config["network.proxy.password"]) proxy.password = config["network.proxy.password"];
    if (!["http:", "https:"].includes(proxy.protocol)) throw new Error("Unsupported network proxy protocol");
    return proxy;
}

async function routeRequest(config: InternalAxiosRequestConfig) {
    // Plugin-supplied proxy/agent settings remain authoritative.
    if (config.proxy !== undefined || config.httpAgent || config.httpsAgent) return config;
    const url = new URL(axios.getUri(config));
    if (!["http:", "https:"].includes(url.protocol)) return config;
    const manual = getManualProxy();
    if (!manual && !app.isReady()) return config;
    let proxy = manual;
    if (!proxy && app.isReady()) {
        const result = await session.defaultSession.resolveProxy(url.href);
        // Chromium's first route also honors PAC rules and system bypass lists.
        const first = result.split(";")[0].trim();
        const match = /^(PROXY|HTTPS)\s+(.+)$/i.exec(first);
        if (match) proxy = new URL(`${match[1].toUpperCase() === "HTTPS" ? "https" : "http"}://${match[2]}`);
    }
    // Avoid applying a second, environment-derived proxy over a chosen agent.
    const routed = { ...config, proxy: false as const };
    if (!proxy) return routed;
    const cached = getAgents(proxy);
    routed.httpAgent = cached.http;
    routed.httpsAgent = !manual && url.hostname === "api.bilibili.com" ? cached.bilibili : cached.https;
    return routed;
}

// A default adapter is inherited by axios.create(), which many plugins use.
export default axios.create({
    timeout: 15000,
    adapter: async config => httpAdapter(await routeRequest(config)),
});
