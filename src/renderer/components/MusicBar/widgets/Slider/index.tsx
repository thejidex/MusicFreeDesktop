import { useEffect, useRef, useState } from "react";
import "./index.scss";
import trackPlayer from "@renderer/core/track-player";
import { usePlayerState, useProgress } from "@renderer/core/track-player/hooks";
import { PlayerState } from "@/common/constant";

export default function Slider() {
    const [seekPercent, _setSeekPercent] = useState<number | null>(null);
    const seekPercentRef = useRef<number | null>(null);
    const { currentTime, duration } = useProgress();
    const isPressedRef = useRef(false);
    const playerState = usePlayerState();
    const hasDuration = Number.isFinite(duration) && duration > 0;
    const playbackState = !hasDuration || playerState === PlayerState.None
        ? "idle"
        : playerState === PlayerState.Playing
            ? "playing"
            : playerState === PlayerState.Buffering
                ? "buffering"
                : "paused";

    function setSeekPercent(value: number | null) {
        _setSeekPercent(value);
        seekPercentRef.current = value;
    }

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            if (isPressedRef.current) {
                setSeekPercent(Math.max(0, Math.min(1, e.clientX / window.innerWidth)));
            }
        };
        const onMouseUp = () => {
            if (isPressedRef.current) {
                isPressedRef.current = false;
                const realProgress = trackPlayer.progress;
                if (Number.isFinite(realProgress.duration) && realProgress.duration > 0
                    && seekPercentRef.current !== null) {
                    trackPlayer.seekTo(realProgress.duration * seekPercentRef.current);
                }
                setSeekPercent(null);
            }
        };
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, []);
    return (
        <div
            className="music-bar--slider-container"
            data-playback-state={playbackState}
            data-dragging={seekPercent !== null}
            onMouseDown={(e) => {
                if (e.button === 0 && hasDuration) {
                    setSeekPercent(Math.max(0, Math.min(1, e.clientX / window.innerWidth)));
                    isPressedRef.current = true;
                }
            }}
        >
            <div className="bar"></div>
            <div
                className="active-bar"
                style={{
                    transform: `translateX(${
                        seekPercent !== null
                            ? seekPercent * 100
                            : duration === 0
                                ? 0
                                : !isFinite(duration) || isNaN(duration)
                                    ? 0
                                    : (currentTime / duration) * 100
                    }%)`,
                }}
            ></div>
        </div>
    );
}
