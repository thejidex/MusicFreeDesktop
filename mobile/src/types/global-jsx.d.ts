import type { JSX as ReactJSX } from "react";

/** React 19 keeps JSX types under React.JSX; preserve the project's existing JSX.Element annotations. */
declare global {
    namespace JSX {
        type Element = ReactJSX.Element;
    }
}

export {};
