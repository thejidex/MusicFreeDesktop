declare module "qrcode" {
    interface QRCodeOptions {
        width?: number;
        margin?: number;
        errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    }
    const QRCode: {
        toDataURL(text: string, options?: QRCodeOptions): Promise<string>;
    };
    export default QRCode;
}
