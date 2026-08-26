import { useGlobalStore } from "@/store/global";
import { motion } from "motion/react";
import { useEffect, useState } from "react";

export const GainMeter = () => {
  const getCurrentGainValue = useGlobalStore((state) => state.getCurrentGainValue);
  const isEnabled = useGlobalStore((state) => state.isSpatialAudioEnabled);

  const [gainValue, setGainValue] = useState(1);

  // getCurrentGainValue reads off a live Web Audio node, not store state —
  // there's nothing reactive to subscribe to, so this has to poll.
  useEffect(() => {
    const intervalId = setInterval(() => {
      setGainValue(getCurrentGainValue());
    }, 50);
    return () => clearInterval(intervalId);
  }, [getCurrentGainValue]);

  const barWidthPercent = Math.min(94, Math.max(0, gainValue * 94));
  const gainPercentage = Math.round(gainValue * 100);

  return (
    <div className="flex w-full items-center gap-2.5">
      <div className="font-mono text-xs text-muted-foreground">{gainPercentage}%</div>
      <div className="relative flex h-3 w-full items-center overflow-hidden rounded-full bg-muted px-0.5">
        <motion.div
          className="absolute h-1.5 rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{
            width: `${barWidthPercent}%`,
            opacity: isEnabled ? 1 : 0.5,
          }}
          transition={{ duration: 0.05, type: "tween" }}
        />
      </div>
    </div>
  );
};
