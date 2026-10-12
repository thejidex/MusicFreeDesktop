import axios from "axios";
import http from "http";
import https from "https";
import tls from "tls";
import { isIP, Socket } from "net";
import { HttpsProxyAgent } from "https-proxy-agent";

type ConnectOptions = Parameters<HttpsProxyAgent<string>["connect"]>[1];

function connectDirect(options: ConnectOptions, timeout: number): Promise<Socket> {
    return new Promise((resolve, reject) => {
        const socket = tls.connect({ ...options, servername: "api.bilibili.com" });
        const timer = setTimeout(() => socket.destroy(new Error("Bilibili direct connection timeout")), timeout);
        const cleanup = () => {
            clearTimeout(timer);
            socket.removeListener("error", failed);
            socket.removeListener("secureConnect", connected);
        };
        const failed = (error: Error) => {
            cleanup(); socket.destroy(); reject(error); 
        };
        const connected = () => {
            cleanup(); resolve(socket); 
        };
        socket.once("error", failed);
        socket.once("secureConnect", connected);
    });
}

/** Direct API requests avoid proxy-region HTTP 412; retry only transport failures. */
export default class BilibiliAgent extends HttpsProxyAgent<string> {
    private addresses: string[] = [];
    private expiresAt = 0;
    private pendingAddresses?: Promise<string[]>;

    private getAddresses(): Promise<string[]> {
        if (Date.now() < this.expiresAt) return Promise.resolve(this.addresses);
        if (this.pendingAddresses) return this.pendingAddresses;
        this.pendingAddresses = (async () => {
            const agent = new HttpsProxyAgent(this.proxy);
            for (const host of ["cloudflare-dns.com", "dns.google"]) {
                try {
                    const result = await axios.get(`https://${host}/${host === "dns.google" ? "resolve" : "dns-query"}?name=api.bilibili.com&type=A`, {
                        httpsAgent: agent, proxy: false, timeout: 4000,
                        headers: { accept: "application/dns-json" }, maxContentLength: 65536,
                    });
                    if (result.data?.Status !== 0) continue;
                    const addresses = result.data?.Answer?.filter((record: { type: number; data: string }) => record.type === 1 && isIP(record.data) === 4)
                        .map((record: { data: string }) => record.data);
                    if (addresses?.length) {
                        this.addresses = [...new Set<string>(addresses)];
                        this.expiresAt = Date.now() + 60000;
                        return this.addresses;
                    }
                } catch {
                    // Try the next DNS provider through the same configured proxy.
                }
            }
            throw new Error("Cannot resolve Bilibili through the configured proxy");
        })().finally(() => {
            this.pendingAddresses = undefined; 
        });
        return this.pendingAddresses;
    }

    private tunnel(address: string, options: ConnectOptions, timeout: number): Promise<Socket> {
        return new Promise((resolve, reject) => {
            const headers: Record<string, string> = { Host: `${address}:${options.port}` };
            if (this.proxy.username || this.proxy.password) {
                headers["Proxy-Authorization"] = "Basic " + Buffer.from(`${decodeURIComponent(this.proxy.username)}:${decodeURIComponent(this.proxy.password)}`).toString("base64");
            }
            const protocol = this.proxy.protocol === "https:" ? https : http;
            const request = protocol.request({
                hostname: this.proxy.hostname,
                port: this.proxy.port || (this.proxy.protocol === "https:" ? 443 : 80),
                method: "CONNECT", path: `${address}:${options.port}`, headers,
            });
            let raw: Socket;
            let secure: tls.TLSSocket;
            let settled = false;
            const finish = (error?: Error, socket?: Socket) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (error) {
                    request.destroy();
                    secure?.destroy();
                    raw?.destroy();
                    reject(error);
                } else resolve(socket);
            };
            const timer = setTimeout(() => finish(new Error("Bilibili proxy connection timeout")), timeout);
            request.once("error", finish);
            request.once("connect", (response, socket, head) => {
                raw = socket;
                if (response.statusCode !== 200) {
                    finish(new Error(`Proxy CONNECT failed: ${response.statusCode}`));
                    return;
                }
                if (head.length) socket.unshift(head);
                // Keep the API hostname for SNI and normal certificate verification.
                secure = tls.connect({ ...options, socket, servername: "api.bilibili.com", rejectUnauthorized: true });
                secure.once("error", finish);
                secure.once("secureConnect", () => finish(undefined, secure));
            });
            request.end();
        });
    }

    async connect(request: http.ClientRequest, options: ConnectOptions): Promise<Socket> {
        if (options.host !== "api.bilibili.com") return super.connect(request, options);
        try {
            return await connectDirect(options, 2500);
        } catch {
            // HTTP error responses never reach this transport fallback.
        }
        const addresses = await this.getAddresses();
        let lastError: Error;
        for (const address of addresses.slice(0, 3)) {
            if (request.destroyed) throw new Error("Bilibili request was cancelled");
            try {
                return await this.tunnel(address, options, 3500);
            } catch (error) {
                lastError = error;
            }
        }
        this.expiresAt = 0;
        throw lastError || new Error("No reachable Bilibili endpoint");
    }
}
