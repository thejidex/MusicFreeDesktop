
let canvas: HTMLCanvasElement;

interface IConfig {
    fontSize?: string | number;
    fontFamily?: string;
}

export default function(text: string, config: IConfig){
    let { fontSize = "1rem", fontFamily = "sans-serif" } = config;

    if(typeof fontSize === "number") {
        fontSize = `${fontSize}px`;
    }
    if(!canvas) {
        canvas = document.createElement("canvas");
    }
    const ctx = canvas.getContext("2d");
    ctx.font = `${fontSize} ${fontFamily ?? ""}`;
    return Math.max(...String(text).split(/\r\n?|\n/).map(line => ctx.measureText(line).width));
}